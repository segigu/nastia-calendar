## Cloudflare Worker Proxy for Claude API

This guide walks you through deploying the `cloudflare/anthropic-proxy.ts` Worker so the Nastia Calendar frontend can talk to Claude without exposing the Anthropic API key.

### 1. Prerequisites
- Cloudflare account with Workers enabled (free plan is enough).
- Node.js ≥ 18 and `npm` installed locally.
- Anthropic (Claude) API key.
- `wrangler` CLI (`npm install -g wrangler` or run with `npx`).

### 2. (Optional) Create `wrangler.toml`
If you do not already have a Worker project, copy the template below to `wrangler.toml` in the repo root:

```toml
name = "nastia-claude-proxy"
main = "cloudflare/anthropic-proxy.ts"
compatibility_date = "2025-02-16"

[vars]
# Comma-separated list of allowed Origins for CORS.
ALLOWED_ORIGINS = "http://localhost:3000,http://localhost:3001,https://segigu.github.io"
```

You can adjust the `name` and `ALLOWED_ORIGINS` values whenever needed. If you skip this file, you can still deploy by passing the entry file directly to `wrangler deploy`, but setting vars later is a bit more manual.

### 3. Authenticate Wrangler
```bash
wrangler login
```
This opens the browser so you can connect the CLI to your Cloudflare account.

### 4. Deploy the Worker
```bash
# With wrangler.toml present (recommended):
wrangler deploy

# OR deploy directly without config:
wrangler deploy cloudflare/anthropic-proxy.ts --name nastia-claude-proxy
```
The command prints the Worker URL, e.g. `https://nastia-claude-proxy.your-subdomain.workers.dev`.

### 5. Add Secrets / Vars
Store the Anthropic key as a Worker secret:
```bash
wrangler secret put ANTHROPIC_API_KEY
```
Paste the Claude secret when prompted.  
If you skipped the `[vars]` block earlier, set the allowed origins via:
```bash
wrangler secret put ALLOWED_ORIGINS
```
and supply values such as `http://localhost:3000,https://segigu.github.io`. (Cloudflare treats plain text inputs as encrypted “secrets”; that’s fine for simple CORS values.)

You can also manage both secrets in the Cloudflare dashboard: **Workers & Pages → your Worker → Settings → Variables**.

### 6. Point the Frontend to the Proxy
You have two options—use whichever is already part of your workflow:

1. **Remote config (`nastia-config.json` in `segigu/nastia-data`)**
   ```json
   {
     "claudeProxy": {
       "url": "https://nastia-claude-proxy.your-subdomain.workers.dev"
     }
   }
   ```
   The React app loads this automatically along with API keys.

2. **Environment variable**
   ```bash
   export REACT_APP_CLAUDE_PROXY_URL="https://nastia-claude-proxy.your-subdomain.workers.dev"
   npm start
   ```
   For production builds you can inject the same variable before `npm run build`.

If both values exist, the remote config takes precedence.

### 7. Verify Locally
Run the app (`npm start`). In the browser console you should now see:
- `[AI Client] Attempting to call AI with options: { hasClaudeProxy: true, ... }`
- Successful Claude responses without CORS errors.

### 8. Deploy the Frontend
```bash
npm run build
npm run deploy
```
Once GitHub Pages updates, reload the published site. Claude calls should flow through the Worker on both desktop and mobile browsers.

### 9. (Optional) Lock Down Origins Further
If you want stricter access control, update `ALLOWED_ORIGINS` and re-deploy:
```bash
wrangler secret put ALLOWED_ORIGINS
wrangler deploy
```
Only requests with matching `Origin` headers will see `Access-Control-Allow-Origin` in the response.

---
That’s it—the Worker now handles all Claude traffic, keeps the API key server-side, and provides consistent CORS headers for the Nastia Calendar UI.
