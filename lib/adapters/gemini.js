/**
 * Google Gemini adapter. Free tier (2.5-flash 1500 req/den).
 * Gemini native API (ne OpenAI-compatible) — převedeme tam i zpátky.
 */
const { ProviderError, resolveCfg, fetchWithTimeout } = require('./base');

const TIMEOUT_MS = parseInt(process.env.REQUEST_TIMEOUT_MS || '45000', 10);

function openAiToGemini(messages) {
    // Gemini má system instructions zvlášť + jen 'user'/'model' role
    const system = messages.filter(m => m.role === 'system').map(m => m.content).join('\n\n');
    const contents = messages
        .filter(m => m.role !== 'system')
        .map(m => ({
            role: m.role === 'assistant' ? 'model' : 'user',
            parts: [{ text: String(m.content || '') }]
        }));
    return { system, contents };
}

function geminiToOpenAi(json, modelId) {
    const cand = json.candidates?.[0];
    const text = cand?.content?.parts?.map(p => p.text).join('') || '';
    const usage = json.usageMetadata || {};
    return {
        content: text,
        toolCalls: null,
        model: modelId,
        usage: {
            prompt_tokens: usage.promptTokenCount || 0,
            completion_tokens: usage.candidatesTokenCount || 0,
            total_tokens: usage.totalTokenCount || 0
        },
        raw: json
    };
}

async function chat(messages, opts, providerCfg) {
    const cfg = resolveCfg(providerCfg.config);
    const apiKey = process.env[cfg.apiKeyEnv || 'GEMINI_API_KEY'];
    if (!apiKey) throw new ProviderError('Gemini API key chybí', { provider: 'gemini' });
    const model = opts.model || 'gemini-2.5-flash';
    const url = `${cfg.baseUrl}/v1beta/models/${model}:generateContent?key=${apiKey}`;
    const { system, contents } = openAiToGemini(messages);
    const body = {
        contents,
        ...(system && { systemInstruction: { parts: [{ text: system }] } }),
        generationConfig: {
            ...(opts.temperature !== undefined && { temperature: opts.temperature }),
            ...(opts.max_tokens !== undefined && { maxOutputTokens: opts.max_tokens })
        }
    };
    let res;
    try {
        res = await fetchWithTimeout(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        }, TIMEOUT_MS);
    } catch (e) {
        throw new ProviderError(`Gemini fetch ${e.message}`, { timeout: e.name === 'AbortError', provider: 'gemini' });
    }
    if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new ProviderError(`Gemini ${res.status}: ${text.slice(0, 200)}`, { status: res.status, provider: 'gemini' });
    }
    const json = await res.json();
    return geminiToOpenAi(json, model);
}

async function probe(providerCfg) {
    // Pasivní — minimální dotaz by spotřeboval kvótu (1500/den)
    return { ok: true, detail: { note: 'pasivní (free tier 1500 req/den)' } };
}

module.exports = { name: 'gemini', chat, probe };
