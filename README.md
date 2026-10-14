# Fault Diagnostics Add-In

An AI-powered add-in for a fleet management platform that turns a raw vehicle fault code into a plain-language diagnosis: what it means, how severe it is, and what to do about it.

## Problem

Fault codes (OBD-II DTCs, J1939 SPN/FMI) are cryptic by design. A fleet manager or technician sees a code like `P0234` or `SPN 190 / FMI 0` and has no immediate way to know how urgent it is, what commonly causes it, or whether the vehicle is safe to keep driving. Looking that up usually means leaving the fleet platform entirely to search forums and videos.

## What it does

- Fetches active fault codes for a selected vehicle (OBD-II and J1939) over a chosen date range, directly from the host platform's API
- Classifies each fault's severity from the vehicle's own warning lamp state (critical / warning / medium / low)
- Sends the fault code plus context (occurrences, lamp state, existing recommendation text) to an LLM, which returns a structured diagnosis: likely causes, recommended actions, and a severity rating
- Runs a parallel web-search style query against the same LLM to surface community-style insights (typical DIY fixes, mechanic tips, rough repair cost range) with links to search YouTube/Reddit directly
- Displays the two results side by side so a user can compare the model's reasoning against crowd-sourced experience

## How it works

```
┌─────────────────────────────────────────────────────────┐
│                  Fleet Management Portal                 │
│  ┌─────────────────────────────────────────────────┐    │
│  │           Fault Diagnostics Add-In               │    │
│  │  - Calls host platform API for devices/faults    │    │
│  │  - Calls a backend function for AI analysis      │    │
│  └───────────────────────────┬─────────────────────┘    │
└──────────────────────────────┼──────────────────────────┘
                               │
                               ▼
              ┌────────────────────────────────┐
              │   Serverless Function           │
              │   /analyze and /web-search       │
              │   Proxies to an LLM gateway      │
              └────────────────┬───────────────┘
                               │
                               ▼
              ┌────────────────────────────────┐
              │   LLM Gateway                   │
              │   Claude (claude-haiku-4.5)      │
              └────────────────────────────────┘
```

Prompt flow:
1. The add-in builds a structured prompt from the fault code, fault name, occurrence count, and any active warning lamp.
2. It calls the `/analyze` endpoint, which proxies to the LLM and asks for JSON: likely causes, recommended actions, and a severity rating.
3. In parallel, it calls `/web-search`, which asks the same LLM to summarize what mechanics/DIYers typically say about that fault code (grounding the "community insight" column rather than fabricating it from nothing).
4. Both results render side by side with deep links to search YouTube and Reddit for the exact fault code.

## Architecture

Two deployment targets are included for the same add-in:

- `functions/` — a Google Cloud Function version of the proxy (`index.js`)
- `netlify/functions/` — a Netlify Functions version of the same proxy (`analyze.js`, `web-search.js`)

Pick one hosting target; both do the same job (forward a prompt to the LLM gateway and return its response).

```
fault-diagnostics-addin/
├── addin/                      # Add-in front end
│   ├── index.html              # Main HTML
│   ├── main.js                 # App logic (fetch faults, call AI, render results)
│   ├── styles.css              # Styling
│   ├── configuration.json      # Add-in manifest
│   └── icon.svg                # Navigation icon
├── functions/                   # Google Cloud Function proxy
│   ├── index.js
│   └── package.json
├── netlify/functions/            # Netlify Functions proxy (alternative host)
│   ├── analyze.js
│   └── web-search.js
├── dev.html / dev-server.js      # Local dev harness (standalone login + static server)
└── README.md
```

## Running it locally

### Prerequisites

- Node.js 18+
- An LLM gateway endpoint and token (any OpenAI-compatible chat completions endpoint works)
- Access to a fleet management platform account to test against (for live device/fault data)

### 1. Configure the LLM gateway

Create `~/llm-gateway.json`:

```json
{
  "base_url": "https://your-llm-gateway.example.com/api/v2",
  "token": "your-jwt-token"
}
```

### 2. Run the dev server

```bash
node dev-server.js
```

This starts a local server on `http://localhost:8080` that serves the add-in files and proxies `/api/claude` and `/api/web-search` to your configured LLM gateway.

### 3. Open `dev.html`

`dev.html` is a standalone login harness that lets you authenticate against a real fleet platform instance (by session ID or by username/password) and then loads the add-in exactly as it would run embedded. This exists so the add-in can be exercised without needing to install it into a live platform first.

### 4. Deploy for real use

- Deploy `functions/index.js` as a Google Cloud Function, or `netlify/functions/*.js` as Netlify Functions, with `LLM_GATEWAY_TOKEN` and `LLM_GATEWAY_URL` set as environment variables.
- Update `addin/main.js`'s `AI_ENDPOINT` / `WEB_SEARCH_ENDPOINT` (or `API_BASE_URL`) to point at your deployed function.
- Host the `addin/` folder's static files anywhere over HTTPS (object storage bucket, Netlify, GitHub Pages).
- Register `addin/configuration.json`'s URL as a custom add-in in the fleet platform's admin settings.

## Environment variables

| Variable | Description |
|----------|-------------|
| `LLM_GATEWAY_TOKEN` | Auth token for the LLM gateway (required) |
| `LLM_GATEWAY_URL` | Base URL of the LLM gateway's chat completions API |

## License

MIT
