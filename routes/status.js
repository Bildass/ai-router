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

module.exports = { handleHealth, handleStatus, handleReset };
