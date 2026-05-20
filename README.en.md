# ai-router

*[Česká verze](README.md)*

Smart LLM router with a per-provider circuit breaker, health monitoring and cost tracking. Exposes an OpenAI-compatible API and routes requests to the best available provider.

## Running

```bash
npm install
cp .env.example .env   # fill in API keys
npm start              # or: pm2 start ecosystem.config.js
```

The router listens on port `3030` (configurable via `PORT`).

## Endpoints

| Method | Path | Description |
|--------|------|-------------|
| POST | `/v1/chat/completions` | OpenAI-compatible chat completions |
| GET | `/health` | Liveness (200 while the router is running) |
| GET | `/status` | Full state: providers, circuit breakers, metrics, last routing |
| POST | `/admin/reset/:provider` | Manually reset a provider's circuit breaker |

## Providers

Defined in `config/providers.json` (lower priority number = tried first):

| Provider | Priority | Models |
|----------|----------|--------|
| `nvidia` | 10 | Kimi K2.6, Qwen3 Coder, DeepSeek V4 Flash (via local NVIDIA bridge) |
| `opencode-zen` | 30 | big-pickle |
| `gemini` | 50 | Gemini 2.5 Flash / Pro |

The router picks a provider by priority, availability (circuit breaker) and model tags (`chat`, `code`, `cs`, `tools`, `reason`, `fast`, …).

## Layout

```
server.js              Express server, endpoint routing
config/providers.json  Provider, model and tag definitions
lib/router.js          Provider/model selection
lib/circuitBreaker.js  Per-provider circuit breaker
lib/health.js          Periodic health probing
lib/metrics.js         Metrics and cost tracking
lib/adapters/          Per-provider adapters
routes/                Endpoint handlers
```

## Configuration

See `.env.example`. Circuit breaker behavior and timeouts are tuned via the `CIRCUIT_BREAKER_*`, `REQUEST_TIMEOUT_MS` and `HEALTH_PROBE_INTERVAL_MS` environment variables.
