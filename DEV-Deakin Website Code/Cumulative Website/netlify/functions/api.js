const { createApiService } = require('../../server/api-service');
const { createEmailService } = require('../../server/email-service');
const { NetlifyBlobRepository } = require('../../server/netlify-repository');
// Keep the Blobs import in the function entrypoint so Netlify can detect the
// integration and inject its site-scoped runtime context during deployment.
const { connectLambda, getStore } = require('@netlify/blobs');

function apiPath(event) {
  let pathname = String(event.path || '/');

  if (event.rawUrl) {
    try {
      pathname = new URL(event.rawUrl).pathname;
    } catch {
      // The event path remains the source of truth when rawUrl is malformed.
    }
  }

  pathname = pathname.replace(/^\/\.netlify\/functions\/api(?=\/|$)/, '/api');
  if (!pathname.startsWith('/api')) {
    pathname = `/api${pathname.startsWith('/') ? pathname : `/${pathname}`}`;
  }
  return pathname;
}

function parseBody(event) {
  if (!event.body) return undefined;
  const raw = event.isBase64Encoded
    ? Buffer.from(event.body, 'base64').toString('utf8')
    : event.body;
  return JSON.parse(raw);
}

function netlifyResponse(result) {
  return {
    statusCode: result.status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
      ...(result.headers || {})
    },
    body: result.status === 204 ? '' : JSON.stringify(result.body)
  };
}

function createHandler(options = {}) {
  let service = options.service;
  const useNetlifyRuntime = !options.service && !options.repository;

  return async function handler(event) {
    if (useNetlifyRuntime) connectLambda(event);

    if (!service) {
      const repository =
        options.repository || new NetlifyBlobRepository({ getStoreImplementation: getStore });
      const emailService = options.emailService || createEmailService(options.environment || process.env);
      service = createApiService({
        repository,
        emailService,
        logger: options.logger || console
      });
    }

    let body;
    try {
      body = parseBody(event);
    } catch {
      return netlifyResponse({
        status: 400,
        body: { message: 'Request body must be valid JSON.', status: 400 }
      });
    }

    const result = await service.handle({
      method: event.httpMethod,
      path: apiPath(event),
      query: event.queryStringParameters || {},
      body
    });
    return netlifyResponse(result);
  };
}

exports.createHandler = createHandler;
exports.handler = createHandler();
