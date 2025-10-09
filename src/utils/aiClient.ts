/**
 * Unified AI API client with automatic fallback from Claude to OpenAI
 */

export interface AIMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export interface AIRequestOptions {
  system?: string;
  messages: AIMessage[];
  temperature?: number;
  maxTokens?: number;
  signal?: AbortSignal;
  claudeApiKey?: string;
  claudeProxyUrl?: string;
  openAIApiKey?: string;
}

interface AIResponse {
  text: string;
  provider: 'claude' | 'openai';
}

async function callClaudeAPI(
  options: AIRequestOptions
): Promise<string> {
  const {
    system,
    messages,
    temperature = 0.8,
    maxTokens = 500,
    signal,
    claudeApiKey,
    claudeProxyUrl,
  } = options;

  const proxyUrl = (claudeProxyUrl || process.env.REACT_APP_CLAUDE_PROXY_URL || '').trim();

  const payload = {
    model: 'claude-sonnet-4-5-20250929',
    max_tokens: maxTokens,
    temperature,
    system,
    messages: messages.filter(m => m.role !== 'system'),
  };

  if (proxyUrl) {
    const response = await fetch(proxyUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
      signal,
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Claude proxy error: ${response.status} - ${errorText}`);
    }

    const data = await response.json();
    const text = data.content?.[0]?.text;

    if (!text) {
      throw new Error('Claude proxy returned empty response');
    }

    return text;
  }

  const key = (claudeApiKey || '').trim() || process.env.REACT_APP_CLAUDE_API_KEY;
  if (!key) {
    throw new Error('Claude API key not available');
  }

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': key,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify(payload),
    signal,
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Claude API error: ${response.status} - ${errorText}`);
  }

  const data = await response.json();
  const text = data.content?.[0]?.text;

  if (!text) {
    throw new Error('Claude returned empty response');
  }

  return text;
}

async function callOpenAIAPI(
  options: AIRequestOptions
): Promise<string> {
  const { system, messages, temperature = 0.8, maxTokens = 500, signal, openAIApiKey } = options;

  const key = (openAIApiKey || '').trim() || process.env.REACT_APP_OPENAI_API_KEY;
  if (!key) {
    throw new Error('OpenAI API key not available');
  }

  const allMessages: AIMessage[] = [];
  if (system) {
    allMessages.push({ role: 'system', content: system });
  }
  allMessages.push(...messages);

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${key}`,
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      messages: allMessages,
      temperature,
      max_tokens: maxTokens,
    }),
    signal,
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`OpenAI API error: ${response.status} - ${errorText}`);
  }

  const data = await response.json();
  const text = data.choices?.[0]?.message?.content;

  if (!text) {
    throw new Error('OpenAI returned empty response');
  }

  return text;
}

/**
 * Calls AI API with automatic fallback from Claude to OpenAI.
 * Tries Claude first (primary provider), falls back to OpenAI on failure.
 */
export async function callAI(options: AIRequestOptions): Promise<AIResponse> {
  console.log('[AI Client] Attempting to call AI with options:', {
    hasClaudeKey: Boolean(options.claudeApiKey || process.env.REACT_APP_CLAUDE_API_KEY),
    hasClaudeProxy: Boolean(options.claudeProxyUrl || process.env.REACT_APP_CLAUDE_PROXY_URL),
    hasOpenAIKey: Boolean(options.openAIApiKey || process.env.REACT_APP_OPENAI_API_KEY),
  });

  // Try Claude first (primary provider)
  try {
    const text = await callClaudeAPI(options);
    console.log('[AI Client] ✅ Claude API succeeded (primary)');
    return { text, provider: 'claude' };
  } catch (claudeError) {
    console.warn('[AI Client] ❌ Claude API failed, falling back to OpenAI:', claudeError);

    // Fallback to OpenAI
    try {
      const text = await callOpenAIAPI(options);
      console.log('[AI Client] ✅ OpenAI API succeeded (fallback)');
      return { text, provider: 'openai' };
    } catch (openAIError) {
      console.error('[AI Client] ❌ OpenAI API also failed:', openAIError);
      throw new Error(`Both AI providers failed. Claude: ${claudeError instanceof Error ? claudeError.message : 'Unknown error'}. OpenAI: ${openAIError instanceof Error ? openAIError.message : 'Unknown error'}`);
    }
  }
}
