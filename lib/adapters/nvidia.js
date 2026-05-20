/**
 * NVIDIA NIM bridge adapter.
 * Místní bridge na portu 3025 — proxy nad NVIDIA NIM cloudem s vlastní routing logikou.
 */
const { ProviderError, resolveCfg, fetchWithTimeout } = require('./base');

const TIMEOUT_MS = parseInt(process.env.REQUEST_TIMEOUT_MS || '45000', 10);

async function chat(messages, opts, providerCfg) {
    const cfg = resolveCfg(providerCfg.config);
    const url = `${cfg.baseUrl}${cfg.chatPath}`;
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
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        }, TIMEOUT_MS);
    } catch (e) {
        throw new ProviderError(`NVIDIA fetch ${e.message}`, { timeout: e.name === 'AbortError', provider: 'nvidia' });
    }
    if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new ProviderError(`NVIDIA ${res.status}: ${text.slice(0, 200)}`, { status: res.status, provider: 'nvidia' });
    }
    const json = await res.json();
    const choice = json.choices?.[0]?.message;
    if (!choice) throw new ProviderError('NVIDIA prázdná odpověď', { provider: 'nvidia' });
    return {
        content: choice.content || '',
        toolCalls: choice.tool_calls || null,
        model: json.model || opts.model,
        usage: json.usage || null,
        raw: json
    };
}

async function probe(providerCfg) {
    const cfg = resolveCfg(providerCfg.config);
    try {
        const res = await fetchWithTimeout(`${cfg.baseUrl}${cfg.healthPath}`, {}, 3000);
        if (!res.ok) return { ok: false, error: `health ${res.status}` };
        const j = await res.json();
        return { ok: j.status === 'ok', detail: j };
    } catch (e) {
        return { ok: false, error: e.message };
    }
}

module.exports = { name: 'nvidia', chat, probe };
