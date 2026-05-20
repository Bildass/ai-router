/**
 * Per-provider circuit breaker.
 * States: closed (OK), open (skip provider), half-open (try 1 request).
 * - 3 consecutive failures -> open for 5 min
 * - Po 5 min -> half-open: další request projde, úspěch zavře, neúspěch zase otevře.
 */

const THRESHOLD = parseInt(process.env.CIRCUIT_BREAKER_THRESHOLD || '3', 10);
const OPEN_MS = parseInt(process.env.CIRCUIT_BREAKER_OPEN_MS || '300000', 10);

const breakers = new Map();

function get(name) {
    if (!breakers.has(name)) {
        breakers.set(name, {
            name,
            state: 'closed',
            consecutiveFailures: 0,
            openedAt: 0,
            lastFailureMessage: null,
            totalFailures: 0,
            totalSuccess: 0
        });
    }
    return breakers.get(name);
}

function canTry(name) {
    const b = get(name);
    if (b.state === 'closed') return true;
    if (b.state === 'open') {
        if (Date.now() - b.openedAt >= OPEN_MS) {
            b.state = 'half-open';
            return true;
        }
        return false;
    }
    return true;
}

function markSuccess(name) {
    const b = get(name);
    b.consecutiveFailures = 0;
    b.totalSuccess++;
    b.state = 'closed';
}

function markFailure(name, message) {
    const b = get(name);
    b.consecutiveFailures++;
    b.totalFailures++;
    b.lastFailureMessage = message?.slice(0, 200);
    if (b.consecutiveFailures >= THRESHOLD || b.state === 'half-open') {
        b.state = 'open';
        b.openedAt = Date.now();
    }
}

function reset(name) {
    const b = get(name);
    b.state = 'closed';
    b.consecutiveFailures = 0;
    b.openedAt = 0;
}

function snapshot() {
    return [...breakers.values()].map(b => ({
        ...b,
        msUntilHalfOpen: b.state === 'open' ? Math.max(0, OPEN_MS - (Date.now() - b.openedAt)) : null
    }));
}

module.exports = { canTry, markSuccess, markFailure, reset, snapshot, get };
