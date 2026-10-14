// The AI inhabitant's model call, made by the server with the server's own key.
import { callProvider } from '../validation.mjs';
import { AGENT } from './sim.mjs';

export function createProposer(key, fetcher = fetch) {
  if (!key) return null;
  return async input => {
    const controller = new AbortController(), t = setTimeout(() => controller.abort(), 120000);
    try { return await callProvider({ provider: AGENT.provider, key, model: AGENT.model, input }, fetcher, controller.signal); }
    catch (e) { throw new Error(e.name === 'AbortError' ? 'The model did not answer in time.' : e.message); }
    finally { clearTimeout(t); }
  };
}
