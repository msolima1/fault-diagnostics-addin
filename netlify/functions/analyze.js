/**
 * Netlify Function - AI Fault Diagnostics Proxy
 *
 * Proxies requests to an LLM gateway for Claude API access.
 *
 * Environment Variables (set in Netlify dashboard):
 *   LLM_GATEWAY_TOKEN - Your LLM gateway JWT token (required)
 *   LLM_GATEWAY_URL - LLM gateway URL (default: https://your-llm-gateway.example.com/api/v2)
 */

const https = require('https');

const LLM_GATEWAY_URL = process.env.LLM_GATEWAY_URL || 'https://your-llm-gateway.example.com/api/v2';
const LLM_GATEWAY_TOKEN = process.env.LLM_GATEWAY_TOKEN;

exports.handler = async (event, context) => {
    // CORS headers
    const headers = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Content-Type': 'application/json'
    };

    // Handle preflight OPTIONS request
    if (event.httpMethod === 'OPTIONS') {
        return { statusCode: 204, headers, body: '' };
    }

    // Only allow POST
    if (event.httpMethod !== 'POST') {
        return {
            statusCode: 405,
            headers,
            body: JSON.stringify({ error: 'Method not allowed' })
        };
    }

    // Check for token configuration
    if (!LLM_GATEWAY_TOKEN) {
        return {
            statusCode: 500,
            headers,
            body: JSON.stringify({ error: 'LLM_GATEWAY_TOKEN environment variable not configured' })
        };
    }

    // Parse and validate request body
    let body;
    try {
        body = JSON.parse(event.body || '{}');
    } catch (e) {
        return {
            statusCode: 400,
            headers,
            body: JSON.stringify({ error: 'Invalid JSON in request body' })
        };
    }

    const { prompt } = body;
    if (!prompt) {
        return {
            statusCode: 400,
            headers,
            body: JSON.stringify({ error: 'prompt is required in request body' })
        };
    }

    try {
        // Build request to LLM gateway
        const postData = JSON.stringify({
            model: 'claude-haiku-4.5',
            max_tokens: 500,
            messages: [{
                role: 'user',
                content: prompt
            }]
        });

        const gatewayUrl = new URL(LLM_GATEWAY_URL + '/chat/completions');

        const options = {
            hostname: gatewayUrl.hostname,
            port: 443,
            path: gatewayUrl.pathname,
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': 'Bearer ' + LLM_GATEWAY_TOKEN,
                'Content-Length': Buffer.byteLength(postData)
            }
        };

        // Make request to LLM gateway
        const response = await new Promise((resolve, reject) => {
            const proxyReq = https.request(options, (proxyRes) => {
                let data = '';
                proxyRes.on('data', chunk => { data += chunk; });
                proxyRes.on('end', () => {
                    try {
                        const parsed = JSON.parse(data);
                        resolve({ statusCode: proxyRes.statusCode, body: parsed });
                    } catch (e) {
                        reject(new Error('Invalid JSON response from LLM gateway'));
                    }
                });
            });

            proxyReq.on('error', reject);
            proxyReq.setTimeout(25000, () => {
                proxyReq.destroy();
                reject(new Error('Request timeout'));
            });

            proxyReq.write(postData);
            proxyReq.end();
        });

        return {
            statusCode: response.statusCode,
            headers,
            body: JSON.stringify(response.body)
        };

    } catch (error) {
        console.error('Error calling LLM gateway:', error);
        return {
            statusCode: 500,
            headers,
            body: JSON.stringify({ error: error.message || 'Internal server error' })
        };
    }
};
