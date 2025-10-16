/**
 * Cloudflare Worker that proxies requests from the Nastia Calendar frontend to the OpenAI API.
 * This hides the OpenAI API key from the browser and adds the necessary CORS headers.
 *
 * Usage:
 *   wrangler deploy cloudflare/openai-proxy.ts --name nastia-openai-proxy
 * Environment variables:
 *   OPENAI_API_KEY (required): OpenAI API key
 *   ALLOWED_ORIGINS (optional): comma-separated list of allowed origins. Defaults to "*".
 */

const OPENAI_ENDPOINT = 'https://api.openai.com/v1/chat/completions';

export interface Env {
  OPENAI_API_KEY: string;
  ALLOWED_ORIGINS?: string;
}

const defaultAllowedOrigins = ['*'];

function getAllowedOrigins(env: Env): string[] {
  if (!env.ALLOWED_ORIGINS) {
    return defaultAllowedOrigins;
  }
  return env.ALLOWED_ORIGINS.split(',').map(origin => origin.trim()).filter(Boolean);
}

function buildCorsHeaders(request: Request, env: Env): Headers {
  const requestOrigin = request.headers.get('Origin') ?? '';
  const allowedOrigins = getAllowedOrigins(env);

  const headers = new Headers();
  headers.set('Access-Control-Allow-Methods', 'GET,HEAD,POST,OPTIONS');
  headers.set('Access-Control-Allow-Headers', 'Content-Type,Authorization');
  headers.set('Access-Control-Max-Age', '86400');

  if (allowedOrigins.includes('*')) {
    headers.set('Access-Control-Allow-Origin', '*');
  } else if (allowedOrigins.includes(requestOrigin)) {
    headers.set('Access-Control-Allow-Origin', requestOrigin);
    headers.set('Vary', 'Origin');
  }

  return headers;
}

async function handleOptions(request: Request, env: Env): Promise<Response> {
  const headers = buildCorsHeaders(request, env);
  return new Response(null, { status: 204, headers });
}

async function handleProxy(request: Request, env: Env): Promise<Response> {
  if (!env.OPENAI_API_KEY) {
    return new Response(JSON.stringify({ error: 'Missing OPENAI_API_KEY env var' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const headers = buildCorsHeaders(request, env);

  let payload: unknown;
  try {
    payload = await request.json();
  } catch (error) {
    console.error('Failed to parse request body', error);
    return new Response(JSON.stringify({ error: 'Invalid JSON payload' }), {
      status: 400,
      headers,
    });
  }

  const upstreamResponse = await fetch(OPENAI_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${env.OPENAI_API_KEY}`,
    },
    body: JSON.stringify(payload),
  });

  const responseBody = await upstreamResponse.text();

  headers.set('Content-Type', upstreamResponse.headers.get('Content-Type') ?? 'application/json');

  return new Response(responseBody, {
    status: upstreamResponse.status,
    headers,
  });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (request.method === 'OPTIONS') {
      return handleOptions(request, env);
    }

    if (request.method !== 'POST') {
      const headers = buildCorsHeaders(request, env);
      return new Response(JSON.stringify({ error: 'Method not allowed' }), {
        status: 405,
        headers,
      });
    }

    try {
      return await handleProxy(request, env);
    } catch (error) {
      console.error('Unexpected worker error', error);
      const headers = buildCorsHeaders(request, env);
      return new Response(JSON.stringify({ error: 'Proxy error' }), {
        status: 500,
        headers,
      });
    }
  },
};
