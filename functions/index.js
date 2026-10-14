/**
 * Google Cloud Function - AI Fault Diagnostics Proxy
 *
 * Proxies requests to an LLM gateway for Claude API access.
 *
 * Environment Variables:
 *   LLM_GATEWAY_TOKEN - Your LLM gateway JWT token (required)
 *   LLM_GATEWAY_URL - LLM gateway URL (default: https://your-llm-gateway.example.com/api/v2)
 */

const https = require('https');

// LLM gateway config
const LLM_GATEWAY_URL = process.env.LLM_GATEWAY_URL || 'https://your-llm-gateway.example.com/api/v2';
const LLM_GATEWAY_TOKEN = process.env.LLM_GATEWAY_TOKEN;

/**
 * Cloud Function entry point
 * @param {Object} req - Cloud Functions request object
 * @param {Object} res - Cloud Functions response object
 */
exports.analyze = async (req, res) => {
    // CORS headers for fleet platform add-in access
    res.set('Access-Control-Allow-Origin', '*');
    res.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.set('Access-Control-Allow-Headers', 'Content-Type');
    res.set('Access-Control-Max-Age', '3600');

    // Handle preflight OPTIONS request
    if (req.method === 'OPTIONS') {
        res.status(204).send('');
        return;
    }

    // Only allow POST
    if (req.method !== 'POST') {
        res.status(405).json({ error: 'Method not allowed' });
        return;
    }

    // Check for token configuration
    if (!LLM_GATEWAY_TOKEN) {
        res.status(500).json({ error: 'LLM_GATEWAY_TOKEN environment variable not configured' });
        return;
    }

    // Validate request body
    const { prompt } = req.body || {};
    if (!prompt) {
        res.status(400).json({ error: 'prompt is required in request body' });
        return;
    }

    try {
        // Build request to LLM gateway
        const postData = JSON.stringify({
            model: 'claude-haiku-4.5',
            max_tokens: 2048,
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

            proxyReq.setTimeout(60000, () => {
                proxyReq.destroy();
                reject(new Error('Request timeout'));
            });

            proxyReq.write(postData);
            proxyReq.end();
        });

        res.status(response.statusCode).json(response.body);

    } catch (error) {
        console.error('Error calling LLM gateway:', error);
        res.status(500).json({ error: error.message || 'Internal server error' });
    }
};
