/**
 * Periodic health probes - každých 60s lehce ověříme providery (jen active health endpointy).
 * OpenCode Zen / Gemini probe = pasivní (šetří kvótu) → stav vychází z reálných requestů.
 */
const path = require('path');
const fs = require('fs');

const cfg = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'config', 'providers.json'), 'utf8'));
const adapters = {
    nvidia: require('./adapters/nvidia'),
    opencodeZen: require('./adapters/opencodeZen'),
    gemini: require('./adapters/gemini')
};

const INTERVAL_MS = parseInt(process.env.HEALTH_PROBE_INTERVAL_MS || '60000', 10);
const probeResults = new Map();

async function probeAll() {
    for (const p of cfg.providers) {
        if (!p.enabled) continue;
        const adapter = adapters[p.adapter];
        if (!adapter) continue;
        try {
            const r = await adapter.probe(p);
            probeResults.set(p.name, { ts: Date.now(), ...r });
        } catch (e) {
            probeResults.set(p.name, { ts: Date.now(), ok: false, error: e.message });
        }
    }
}

function start() {
    probeAll().catch(() => {});
    setInterval(() => probeAll().catch(() => {}), INTERVAL_MS);
}

function snapshot() {
    const out = {};
    for (const [k, v] of probeResults.entries()) out[k] = v;
    return out;
}

module.exports = { start, snapshot, probeAll };
