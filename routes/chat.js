/**
 * OpenAI-compatible chat completions endpoint.
 * POST /v1/chat/completions
 * Body: {messages, model?, tools?, temperature?, max_tokens?, x_router_hints?: {task, lang, needsTools, preferProvider, preferModel}}
 */
const router = require('../lib/router');

async function handle(req, res) {
    const { messages, model, tools, temperature, max_tokens, x_router_hints } = req.body || {};
    if (!Array.isArray(messages) || !messages.length) {
        return res.status(400).json({ error: 'messages[] required' });
    }
    const hints = x_router_hints || {};
    if (model && !hints.preferModel) hints.preferModel = model;

    try {
        const result = await router.dispatch({
            messages,
            opts: { tools, temperature, max_tokens },
            hints
        });
        // OpenAI-compatible response shape
        const out = {
            id: result.requestId,
            object: 'chat.completion',
            created: Math.floor(Date.now() / 1000),
            model: result.model,
            choices: [{
                index: 0,
                message: {
                    role: 'assistant',
                    content: result.response.content,
                    ...(result.response.toolCalls && { tool_calls: result.response.toolCalls })
                },
                finish_reason: 'stop'
            }],
            usage: result.response.usage || { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
            // Custom debug info (Router-specific)
            _router: {
                provider: result.provider,
                latencyMs: result.latencyMs,
                attempts: result.attempts
            }
        };
        res.setHeader('X-Router-Provider', result.provider);
        res.setHeader('X-Router-Model', result.model);
        res.setHeader('X-Router-Latency-Ms', String(result.latencyMs));
        res.setHeader('X-Router-Attempts', String(result.attempts.length));
        res.json(out);
    } catch (e) {
        const status = e.attempts ? 502 : 500;
        res.status(status).json({
            error: e.message,
            attempts: e.attempts || [],
            requestId: e.requestId
        });
    }
}

module.exports = { handle };
