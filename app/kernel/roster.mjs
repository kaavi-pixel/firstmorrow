// Who the authors are. Data only, no imports, because both the world and the
// author loop need it and neither should depend on the other to get it.

export const DEFAULT_ROSTER = Object.freeze([
  { id: 'a0', name: 'Architect', provider: 'perplexity', model: 'openai/gpt-5.6-sol', color: '#5fa8c4', role: 'Shelter, water, and whatever keeps people alive tonight.' },
  { id: 'a1', name: 'Engineer', provider: 'perplexity', model: 'anthropic/claude-sonnet-5-5', color: '#c9a35f', role: 'Machines, materials, and how a thing actually gets built.' },
  { id: 'a2', name: 'Ecologist', provider: 'perplexity', model: 'openai/gpt-6-astra', color: '#7fae86', role: 'Food, soil, water cycles, and what lasts more than a season.' },
]);

/** FM_AUTHOR_MODELS="provider:model,provider:model,provider:model" overrides it. */
export function rosterFromEnv(env = process.env) {
  const spec = env.FM_AUTHOR_MODELS;
  if (!spec) return DEFAULT_ROSTER;
  const parsed = spec.split(',').map(s => s.trim()).filter(Boolean).map((s, i) => {
    const [provider, model] = s.includes(':') ? s.split(':') : ['perplexity', s];
    const base = DEFAULT_ROSTER[i % DEFAULT_ROSTER.length];
    return { ...base, id: `a${i}`, provider, model };
  });
  return parsed.length ? parsed : DEFAULT_ROSTER;
}
