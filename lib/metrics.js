/**
 * In-memory metrics ring buffer per provider (last 100 requests).
 * Pro persistent + dlouhodobé statistiky později DB tabulka.
 */

const RING_SIZE = 100;
const data = new Map(); // provider -> { ring: [{ts, ok, latencyMs, model, err}], lastRouting: {...} }

function _entry(name) {
    if (!data.has(name)) data.set(name, { ring: [], lastRouting: null });
    return data.get(name);
}

function record(provider, { ok, latencyMs, model, err, tokensIn, tokensOut }) {
    const e = _entry(provider);
    e.ring.push({ ts: Date.now(), ok, latencyMs, model, err: err?.slice(0, 120) || null, tokensIn: tokensIn || 0, tokensOut: tokensOut || 0 });
    if (e.ring.length > RING_SIZE) e.ring.shift();
}

function recordRouting(provider, { model, requestId }) {
    _entry(provider).lastRouting = { ts: Date.now(), model, requestId };
}

function snapshot() {
    const now = Date.now();
    const summary = {};
    for (const [name, e] of data.entries()) {
        const recent5m = e.ring.filter(r => now - r.ts < 300000);
        const successes = recent5m.filter(r => r.ok);
        const failures = recent5m.filter(r => !r.ok);
        const latencies = successes.map(r => r.latencyMs).sort((a, b) => a - b);
        const p50 = latencies.length ? latencies[Math.floor(latencies.length * 0.5)] : null;
        const p95 = latencies.length ? latencies[Math.floor(latencies.length * 0.95)] : null;
        const tokensIn = recent5m.reduce((s, r) => s + (r.tokensIn || 0), 0);
        const tokensOut = recent5m.reduce((s, r) => s + (r.tokensOut || 0), 0);
        summary[name] = {
            requests5m: recent5m.length,
            successes5m: successes.length,
            failures5m: failures.length,
            errorRate5m: recent5m.length ? failures.length / recent5m.length : 0,
            p50LatencyMs: p50,
            p95LatencyMs: p95,
            tokensIn5m: tokensIn,
            tokensOut5m: tokensOut,
            lastRouting: e.lastRouting,
            lastError: failures.slice(-1)[0]?.err || null
        };
    }
    return summary;
}

function globalLastRouting() {
    let latest = null;
    for (const e of data.values()) {
        if (e.lastRouting && (!latest || e.lastRouting.ts > latest.ts)) latest = e.lastRouting;
    }
    return latest;
}

module.exports = { record, recordRouting, snapshot, globalLastRouting };
