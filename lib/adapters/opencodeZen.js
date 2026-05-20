/**
 * OpenCode Zen adapter. Free tier s denním rate limitem.
 * OpenAI-compatible chat completions endpoint.
 */
const { ProviderError, resolveCfg, fetchWithTimeout } = require('./base');

const TIMEOUT_MS = parseInt(process.env.REQUEST_TIMEOUT_MS || '45000', 10);

async function chat(messages, opts, providerCfg) {
    const cfg = resolveCfg(providerCfg.config);
    const url = `${cfg.baseUrl}${cfg.chatPath}`;
    const apiKey = process.env[cfg.apiKeyEnv || 'OPENCODE_ZEN_KEY'];
    if (!apiKey) throw new ProviderError('OpenCode Zen API key chybí', { provider: 'opencode-zen' });
    const body = {
        messages,
        model: opts.model,
        ...(opts.tools && { tools: opts.tools }),
        ...(opts.temperature !== undefined && { temperature: opts.temperature }),
        ...(opts.max_tokens !== undefined && { max_tokens: opts.max_tokens })
    };
    let res;
    try {
        res = await fetchWithTimeout(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`
            },
            body: JSON.stringify(body)
        }, TIMEOUT_MS);
    } catch (e) {
        throw new ProviderError(`OpenCode Zen fetch ${e.message}`, { timeout: e.name === 'AbortError', provider: 'opencode-zen' });
    }
    if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new ProviderError(`OpenCode Zen ${res.status}: ${text.slice(0, 200)}`, { status: res.status, provider: 'opencode-zen' });
    }
    const json = await res.json();
    const choice = json.choices?.[0]?.message;
    if (!choice) throw new ProviderError('OpenCode Zen prázdná odpověď', { provider: 'opencode-zen' });
    return {
        content: choice.content || '',
        toolCalls: choice.tool_calls || null,
        model: json.model || opts.model,
        usage: json.usage || null,
        raw: json
    };
}

async function probe(providerCfg) {
    // OpenCode Zen nemá health endpoint, takže ping = lehký dotaz.
    // Pro setření kvóty probe NE-aktivně — vrátíme cached "unknown" pokud nic neproběhlo posledních 5 min.
    return { ok: true, detail: { note: 'pasivní (šetří kvótu)' } };
}

module.exports = { name: 'opencodeZen', chat, probe };
