/**
 * Common adapter contract.
 * Each adapter exports: { name, chat(messages, opts, providerCfg), probe(providerCfg) }
 * chat() returns unified shape:
 *   { content: string, toolCalls?: [...], model: string, usage?: {prompt_tokens, completion_tokens} }
 * On error throws Error with .upstreamStatus (number|null), .timeout (bool).
 */

class ProviderError extends Error {
    constructor(message, { status = null, timeout = false, provider = null } = {}) {
        super(message);
        this.upstreamStatus = status;
        this.timeout = timeout;
        this.provider = provider;
    }
}

function resolveCfg(cfg) {
    // Resolve ${ENV_VAR} placeholders v config (jen baseUrl pro teď)
    const out = { ...cfg };
    for (const k of Object.keys(out)) {
        if (typeof out[k] === 'string') {
            out[k] = out[k].replace(/\$\{([A-Z0-9_]+)\}/g, (_, v) => process.env[v] || '');
        }
    }
    return out;
}

async function fetchWithTimeout(url, opts = {}, timeoutMs = 45000) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
        return await fetch(url, { ...opts, signal: ctrl.signal });
    } finally {
        clearTimeout(timer);
    }
}

module.exports = { ProviderError, resolveCfg, fetchWithTimeout };
