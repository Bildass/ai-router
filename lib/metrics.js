/**
 * In-memory metrics ring buffer per provider (last 100 requests) for live /status,
 * PLUS durable append-only log (data/requests.jsonl) for long-term evaluation (/stats).
 */
const fs = require('fs');
const path = require('path');

const RING_SIZE = 100;
const data = new Map(); // provider -> { ring: [{ts, ok, latencyMs, model, err}], lastRouting: {...} }

const DATA_DIR = path.join(__dirname, '..', 'data');
const LOG_FILE = path.join(DATA_DIR, 'requests.jsonl');
try { fs.mkdirSync(DATA_DIR, { recursive: true }); } catch (_) { /* ignore */ }

function _persist(rec) {
    // Fire-and-forget append; never let logging break a request.
    fs.appendFile(LOG_FILE, JSON.stringify(rec) + '\n', () => {});
}

function _entry(name) {
    if (!data.has(name)) data.set(name, { ring: [], lastRouting: null });
    return data.get(name);
}

function record(provider, { ok, latencyMs, model, err, tokensIn, tokensOut, source }) {
    const e = _entry(provider);
    e.ring.push({ ts: Date.now(), ok, latencyMs, model, err: err?.slice(0, 120) || null, tokensIn: tokensIn || 0, tokensOut: tokensOut || 0 });
    if (e.ring.length > RING_SIZE) e.ring.shift();
    _persist({
        ts: Date.now(), provider, model: model || null, ok: !!ok,
        latencyMs: latencyMs || 0, tokensIn: tokensIn || 0, tokensOut: tokensOut || 0,
        source: source || null,
        err: err ? String(err).slice(0, 120) : null
    });
}

// Read persisted records since a given timestamp (ms). Tolerant of partial/corrupt lines.
function history(sinceMs = 0) {
    let raw;
    try { raw = fs.readFileSync(LOG_FILE, 'utf8'); } catch (_) { return []; }
    const out = [];
    for (const line of raw.split('\n')) {
        if (!line) continue;
        try {
            const r = JSON.parse(line);
            if (r.ts >= sinceMs) out.push(r);
        } catch (_) { /* skip bad line */ }
    }
    return out;
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

module.exports = { record, recordRouting, snapshot, globalLastRouting, history };
