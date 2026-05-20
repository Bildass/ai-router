# ai-router

Chytrý LLM router s per-provider circuit breakerem, health monitoringem a sledováním nákladů. Poskytuje OpenAI-kompatibilní API a směruje requesty na nejvhodnějšího dostupného providera.

## Spuštění

```bash
npm install
cp .env.example .env   # doplň API klíče
npm start              # nebo: pm2 start ecosystem.config.js
```

Router běží na portu `3030` (konfigurovatelné přes `PORT`).

## Endpointy

| Metoda | Cesta | Popis |
|--------|-------|-------|
| POST | `/v1/chat/completions` | OpenAI-kompatibilní chat completions |
| GET | `/health` | Liveness (200 dokud router běží) |
| GET | `/status` | Plný stav: provideri, circuit breakery, metriky, poslední routing |
| POST | `/admin/reset/:provider` | Ruční reset circuit breakeru providera |

## Provideri

Definováni v `config/providers.json` (priorita = nižší číslo dřív):

| Provider | Priorita | Modely |
|----------|----------|--------|
| `nvidia` | 10 | Kimi K2.6, Qwen3 Coder, DeepSeek V4 Flash (přes lokální NVIDIA bridge) |
| `opencode-zen` | 30 | big-pickle |
| `gemini` | 50 | Gemini 2.5 Flash / Pro |

Router vybírá providera podle priority, dostupnosti (circuit breaker) a tagů modelu (`chat`, `code`, `cs`, `tools`, `reason`, `fast`, …).

## Struktura

```
server.js              Express server, routing endpointů
config/providers.json  Definice providerů, modelů, tagů
lib/router.js          Výběr providera/modelu
lib/circuitBreaker.js  Per-provider circuit breaker
lib/health.js          Periodické health probe
lib/metrics.js         Metriky a cost tracking
lib/adapters/          Adaptéry per provider
routes/                Handlery endpointů
```

## Konfigurace

Viz `.env.example`. Chování circuit breakeru a timeoutů se ladí přes env proměnné `CIRCUIT_BREAKER_*`, `REQUEST_TIMEOUT_MS`, `HEALTH_PROBE_INTERVAL_MS`.
