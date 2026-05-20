require('dotenv').config();
const express = require('express');
const chat = require('./routes/chat');
const status = require('./routes/status');
const health = require('./lib/health');

const app = express();
const PORT = parseInt(process.env.PORT || '3030', 10);

app.use(express.json({ limit: '4mb' }));

// Logging - jednoduchý
app.use((req, res, next) => {
    const start = Date.now();
    res.on('finish', () => {
        console.log(`[${new Date().toISOString()}] ${req.method} ${req.path} ${res.statusCode} ${Date.now() - start}ms`);
    });
    next();
});

// OpenAI-compatible
app.post('/v1/chat/completions', chat.handle);

// Status / admin
app.get('/health', status.handleHealth);
app.get('/status', status.handleStatus);
app.post('/admin/reset/:provider', status.handleReset);

// Root
app.get('/', (req, res) => {
    res.json({
        name: 'ai-router',
        version: '0.1.0',
        endpoints: {
            chat: 'POST /v1/chat/completions',
            health: 'GET /health',
            status: 'GET /status',
            resetBreaker: 'POST /admin/reset/:provider'
        }
    });
});

app.listen(PORT, () => {
    console.log(`[ai-router] listening on :${PORT}`);
    health.start();
});
