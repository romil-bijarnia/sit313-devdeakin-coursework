const express = require('express');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

const { createApiService } = require('./api-service');
const { createEmailService } = require('./email-service');
const { FileRepository } = require('./repositories');

const port = Number(process.env.PORT || 5050);

function allowedOrigins(environment) {
  const configured = String(environment.FRONTEND_ORIGIN || 'http://127.0.0.1:5173')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

  return new Set([
    ...configured,
    'http://localhost:5173',
    'http://127.0.0.1:5173',
    'http://localhost:4173',
    'http://127.0.0.1:4173'
  ]);
}

function createExpressApp(options = {}) {
  const environment = options.environment || process.env;
  const repository =
    options.repository || new FileRepository(environment.DATA_DIR || path.join(__dirname, 'data'));
  const emailService = options.emailService || createEmailService(environment);
  const service =
    options.service ||
    createApiService({ repository, emailService, logger: options.logger || console });
  const origins = allowedOrigins(environment);
  const app = express();

  app.disable('x-powered-by');
  app.use(
    cors({
      origin(origin, callback) {
        // Requests without an Origin header include local scripts and health checks.
        callback(null, !origin || origins.has(origin));
      }
    })
  );
  app.use(express.json({ limit: '64kb' }));

  async function apiHandler(req, res) {
    const result = await service.handle({
      method: req.method,
      path: req.path,
      query: req.query,
      body: req.body
    });

    for (const [name, value] of Object.entries(result.headers || {})) {
      res.set(name, value);
    }
    res.set('Cache-Control', 'no-store');
    res.set('X-Content-Type-Options', 'nosniff');

    if (result.status === 204) return res.status(204).end();
    return res.status(result.status).json(result.body);
  }

  app.all('/api', apiHandler);
  app.all('/api/*', apiHandler);

  app.use((error, req, res, next) => {
    if (error instanceof SyntaxError && error.status === 400 && 'body' in error) {
      return res.status(400).json({ message: 'Request body must be valid JSON.', status: 400 });
    }
    return next(error);
  });

  return app;
}

const app = createExpressApp();

if (require.main === module) {
  app.listen(port, '127.0.0.1', () => {
    console.log(`DEV@Deakin backend running on http://127.0.0.1:${port}`);
  });
}

module.exports = app;
module.exports.createExpressApp = createExpressApp;
