/**
 * Smart dispatcher.
 * Vstup: { messages, opts: {model?, tools?, temperature?, max_tokens?}, hints: {task, lang, needsTools, preferProvider?, preferModel?} }
 * Výstup: { response (unified), provider, model, latencyMs, attempts: [{provider, ok, err, latencyMs}] }
 *
 * Strategie:
 *   1) Pokud hints.preferProvider/preferModel - zkus prioritně.
 *   2) Jinak filtruj providery podle hints (tags na modelu), seřaď podle priority.
 *   3) Skip providery s otevřeným circuit breakerem.
 *   4) Zkoušej v pořadí dokud někdo neodpoví.
 */
const fs = require('fs');
const path = require('path');
const cb = require('./circuitBreaker');
const metrics = require('./metrics');

const adapters = {
    nvidia: require('./adapters/nvidia'),
    opencodeZen: require('./adapters/opencodeZen'),
    gemini: require('./adapters/gemini')
};

const cfg = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'config', 'providers.json'), 'utf8'));
const providers = cfg.providers.filter(p => p.enabled);

function pickCandidates(hints = {}) {
    // Najdi všechny modely co matchnou hints
    const tagFilters = [];
    if (hints.task) tagFilters.push(hints.task);
    if (hints.lang) tagFilters.push(hints.lang);
    if (hints.needsTools) tagFilters.push('tools');

    const list = [];
    for (const p of providers) {
        for (const m of p.models) {
            const matches = tagFilters.every(t => m.tags.includes(t));
            if (matches) {
                list.push({ provider: p, model: m });
            }
        }
    }
    // Pokud nic nematchnulo (žádný hint), vrať všechny modely
    const result = list.length ? list : providers.flatMap(p => p.models.map(m => ({ provider: p, model: m })));
    // Seřaď: priority asc (nižší = lépe), preferProvider/preferModel boost
    result.sort((a, b) => {
        const aPref = (hints.preferProvider === a.provider.name ? -100 : 0)
                    + (hints.preferModel === a.model.id ? -50 : 0);
        const bPref = (hints.preferProvider === b.provider.name ? -100 : 0)
                    + (hints.preferModel === b.model.id ? -50 : 0);
        return (a.provider.priority + aPref) - (b.provider.priority + bPref);
    });
    return result;
}

async function dispatch({ messages, opts = {}, hints = {} }) {
    const candidates = pickCandidates(hints);
    const attempts = [];
    const requestId = `req_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

    for (const { provider, model } of candidates) {
        if (!cb.canTry(provider.name)) {
            attempts.push({ provider: provider.name, model: model.id, ok: false, err: 'circuit_open', skipped: true });
            continue;
        }
        const adapter = adapters[provider.adapter];
        if (!adapter) {
            attempts.push({ provider: provider.name, model: model.id, ok: false, err: 'no_adapter' });
            continue;
        }
        metrics.recordRouting(provider.name, { model: model.id, requestId });
        const start = Date.now();
        try {
            const callOpts = { ...opts, model: model.id };
            const resp = await adapter.chat(messages, callOpts, provider);
            const latencyMs = Date.now() - start;
            cb.markSuccess(provider.name);
            metrics.record(provider.name, {
                ok: true,
                latencyMs,
                model: model.id,
                tokensIn: resp.usage?.prompt_tokens,
                tokensOut: resp.usage?.completion_tokens
            });
            attempts.push({ provider: provider.name, model: model.id, ok: true, latencyMs });
            return { response: resp, provider: provider.name, model: model.id, latencyMs, attempts, requestId };
        } catch (e) {
            const latencyMs = Date.now() - start;
            cb.markFailure(provider.name, e.message);
            metrics.record(provider.name, { ok: false, latencyMs, model: model.id, err: e.message });
            attempts.push({ provider: provider.name, model: model.id, ok: false, err: e.message, latencyMs });
            // pokračuj na další providera
        }
    }
    const err = new Error('Všichni providery selhali');
    err.attempts = attempts;
    err.requestId = requestId;
    throw err;
}

function listProviders() {
    return providers.map(p => ({
        name: p.name,
        label: p.label,
        adapter: p.adapter,
        priority: p.priority,
        models: p.models.map(m => ({ id: m.id, tags: m.tags })),
        breaker: cb.get(p.name)
    }));
}

module.exports = { dispatch, listProviders, providers };
