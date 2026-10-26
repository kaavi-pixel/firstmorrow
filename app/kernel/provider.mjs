// The model call. This is the only place the world talks to a language model.
//
// Request and response handling is ported from v1, which ran against this exact
// Vercel project and key — the body shape below is proven against them. No key,
// no upstream error text, and no raw model output is ever written into the world
// or into a log: only the parsed, validated result.

export const PROVIDERS = Object.freeze({
  perplexity: { name: 'Perplexity', endpoint: 'https://api.perplexity.ai/v1/agent' },
  openai: { name: 'OpenAI', endpoint: 'https://api.openai.com/v1/responses' },
  xai: { name: 'xAI', endpoint: 'https://api.x.ai/v1/responses' },
});

export class ProviderError extends Error {}

/**
 * Returns a function that asks one model one question and gives back its text.
 * `fetcher` is injectable so the whole loop can be tested without a network.
 */
export function createCaller({ keys = {}, fetcher = fetch, timeoutMs = 100000 } = {}) {
  return async function call({ provider, model, system, input, maxOutputTokens = 12000 }) {
    const p = PROVIDERS[provider];
    if (!p) throw new ProviderError(`Unknown provider "${provider}".`);
    const key = keys[provider];
    if (!key) throw new ProviderError(`No key for ${p.name}.`);
    if (typeof model !== 'string' || !/^[a-zA-Z0-9/_.:-]{1,140}$/.test(model)) throw new ProviderError('Invalid model id.');

    const body = {
      model,
      input: [
        { role: 'system', content: system },
        { role: 'user', content: JSON.stringify(input) },
      ],
      max_output_tokens: maxOutputTokens,
      store: false,
    };
    // Reasoning models can spend the whole budget thinking before they write anything.
    if (provider === 'openai' && /^(gpt-[5-9]|o[1-9])/.test(model)) body.reasoning = { effort: 'low' };

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const r = await fetcher(p.endpoint, {
        method: 'POST',
        headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: controller.signal,
        redirect: 'error',
      });
      if (!r.ok) {
        // Never surface the upstream body: it can echo the key or the prompt.
        const why = r.status === 401 || r.status === 403 ? 'key rejected or model not permitted'
          : r.status === 429 ? 'rate limit or quota reached'
            : r.status === 404 ? 'model or endpoint not found'
              : 'request rejected';
        throw new ProviderError(`${p.name}: ${why} (HTTP ${r.status}).`);
      }
      const raw = await r.text();
      if (raw.length > 400000) throw new ProviderError('Response exceeded the safety limit.');
      let data;
      try { data = JSON.parse(raw); } catch { throw new ProviderError('Unreadable response.'); }
      const text = data.output_text || (data.output || [])
        .filter(o => o.type === 'message')
        .flatMap(o => o.content || [])
        .filter(c => c.type === 'output_text')
        .map(c => c.text).join('\n');
      if (!text) throw new ProviderError('The model returned no text.');
      return {
        text,
        usage: { input: data.usage?.input_tokens || 0, output: data.usage?.output_tokens || 0 },
        model: data.model || model,
      };
    } catch (e) {
      if (e.name === 'AbortError') throw new ProviderError('The model did not answer in time.');
      throw e;
    } finally { clearTimeout(timer); }
  };
}
