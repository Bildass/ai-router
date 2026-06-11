/**
 * Status endpoints:
 *   GET /health  - liveness (always 200 dokud router běží)
 *   GET /status  - plný stav: providery, circuit breakers, metriky, last routing
 *   POST /admin/reset/:provider - reset circuit breaker pro daného providera
 */
const router = require('../lib/router');
const cb = require('../lib/circuitBreaker');
const metrics = require('../lib/metrics');
const health = require('../lib/health');

function handleHealth(req, res) {
    res.json({ status: 'ok', uptime_s: Math.floor(process.uptime()) });
}

function handleStatus(req, res) {
    const providers = router.listProviders();
    const m = metrics.snapshot();
    const h = health.snapshot();
    res.json({
        ts: Date.now(),
        lastRouting: metrics.globalLastRouting(),
        providers: providers.map(p => ({
            name: p.name,
            label: p.label,
            priority: p.priority,
            adapter: p.adapter,
            models: p.models,
            breaker: {
                state: p.breaker.state,
                consecutiveFailures: p.breaker.consecutiveFailures,
                totalFailures: p.breaker.totalFailures,
                totalSuccess: p.breaker.totalSuccess,
                lastFailureMessage: p.breaker.lastFailureMessage,
                msUntilHalfOpen: p.breaker.state === 'open' && p.breaker.openedAt
                    ? Math.max(0, (parseInt(process.env.CIRCUIT_BREAKER_OPEN_MS || '300000', 10)) - (Date.now() - p.breaker.openedAt))
                    : null
            },
            metrics: m[p.name] || null,
            health: h[p.name] || null
        }))
    });
}

function handleReset(req, res) {
    const name = req.params.provider;
    cb.reset(name);
    res.json({ ok: true, reset: name });
}

// GET /stats?days=N - aggregated historical metrics from the durable log
function handleStats(req, res) {
    const days = Math.max(1, Math.min(90, parseInt(req.query.days, 10) || 7));
    const since = Date.now() - days * 86400000;
    const recs = metrics.history(since);

    const byModel = {};
    const byProvider = {};
    const bySource = {};
    const byDay = {};
    let total = 0, ok = 0, tokensIn = 0, tokensOut = 0;

    for (const r of recs) {
        total++; if (r.ok) ok++;
        tokensIn += r.tokensIn || 0; tokensOut += r.tokensOut || 0;

        const mKey = r.model || '(žádný)';
        const m = byModel[mKey] || (byModel[mKey] = { model: mKey, total: 0, ok: 0, fail: 0, latSum: 0, lat: [], tokensIn: 0, tokensOut: 0, lastErr: null });
        m.total++;
        if (r.ok) { m.ok++; m.latSum += r.latencyMs || 0; m.lat.push(r.latencyMs || 0); }
        else { m.fail++; if (r.err) m.lastErr = r.err; }
        m.tokensIn += r.tokensIn || 0; m.tokensOut += r.tokensOut || 0;

        const pKey = r.provider || '(žádný)';
        const p = byProvider[pKey] || (byProvider[pKey] = { provider: pKey, total: 0, ok: 0, fail: 0 });
        p.total++; r.ok ? p.ok++ : p.fail++;

        const sKey = r.source || '(neoznačeno)';
        const s = bySource[sKey] || (bySource[sKey] = { source: sKey, total: 0, ok: 0, fail: 0, tokensIn: 0, tokensOut: 0 });
        s.total++; r.ok ? s.ok++ : s.fail++;
        s.tokensIn += r.tokensIn || 0; s.tokensOut += r.tokensOut || 0;

        const day = new Date(r.ts).toISOString().slice(0, 10);
        const d = byDay[day] || (byDay[day] = { date: day, total: 0, ok: 0, fail: 0 });
        d.total++; r.ok ? d.ok++ : d.fail++;
    }

    const models = Object.values(byModel).map(m => {
        const lat = m.lat.sort((a, b) => a - b);
        return {
            model: m.model, total: m.total, ok: m.ok, fail: m.fail,
            successRate: m.total ? +(m.ok / m.total * 100).toFixed(1) : 0,
            avgLatencyMs: m.ok ? Math.round(m.latSum / m.ok) : null,
            p50LatencyMs: lat.length ? lat[Math.floor(lat.length * 0.5)] : null,
            p95LatencyMs: lat.length ? lat[Math.floor(lat.length * 0.95)] : null,
            tokensIn: m.tokensIn, tokensOut: m.tokensOut, lastErr: m.lastErr
        };
    }).sort((a, b) => b.total - a.total);

    res.json({
        days, since, generatedAt: Date.now(),
        overall: { total, ok, fail: total - ok, successRate: total ? +(ok / total * 100).toFixed(1) : 0, tokensIn, tokensOut },
        models,
        providers: Object.values(byProvider)
            .map(p => ({ ...p, successRate: p.total ? +(p.ok / p.total * 100).toFixed(1) : 0 }))
            .sort((a, b) => b.total - a.total),
        sources: Object.values(bySource)
            .map(s => ({ ...s, successRate: s.total ? +(s.ok / s.total * 100).toFixed(1) : 0 }))
            .sort((a, b) => b.total - a.total),
        timeseries: Object.values(byDay).sort((a, b) => a.date.localeCompare(b.date))
    });
}

module.exports = { handleHealth, handleStatus, handleReset, handleStats };
