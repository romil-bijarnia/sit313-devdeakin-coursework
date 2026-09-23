const assert = require('assert/strict');
const fs = require('fs/promises');
const os = require('os');
const path = require('path');
const { randomUUID } = require('crypto');

const { createEmailService } = require('./email-service');
const { FileRepository } = require('./repositories');
const { createExpressApp } = require('./server');
const { createHandler } = require('../netlify/functions/api');

async function jsonRequest(baseUrl, endpoint, options = {}) {
  const response = await fetch(`${baseUrl}${endpoint}`, options);
  const body = await response.json();
  return { response, body };
}

function post(body) {
  return {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  };
}

async function listen(app) {
  return new Promise((resolve, reject) => {
    const server = app.listen(0, '127.0.0.1', () => resolve(server));
    server.on('error', reject);
  });
}

async function close(server) {
  await new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
}

async function testEmailProviders() {
  const calls = [];
  const resend = createEmailService(
    { RESEND_API_KEY: 'test-resend-key' },
    async (url, options) => {
      calls.push({ url, options });
      return new Response(JSON.stringify({ id: 'resend-message-123' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }
  );
  const delivery = await resend.sendWelcomeEmail('reader@example.com', 'newsletter_test_id');
  assert.equal(resend.mode, 'resend');
  assert.equal(delivery.provider, 'Resend');
  assert.equal(delivery.providerStatus, 200);
  assert.equal(delivery.messageId, 'resend-message-123');
  assert.equal(delivery.accepted, true);
  assert.equal(delivery.delivered, null);
  assert.equal(calls[0].url, 'https://api.resend.com/emails');
  assert.equal(
    calls[0].options.headers['Idempotency-Key'],
    'dev-deakin-welcome-newsletter_test_id'
  );
  assert.equal(JSON.parse(calls[0].options.body).from, 'DEV@Deakin <onboarding@resend.dev>');

  const sendGrid = createEmailService(
    { SENDGRID_API_KEY: 'test-sendgrid-key', SENDGRID_FROM: 'verified@example.com' },
    async () =>
      new Response(null, {
        status: 202,
        headers: { 'x-message-id': 'sendgrid-message-123' }
      })
  );
  const sendGridDelivery = await sendGrid.sendWelcomeEmail('reader@example.com');
  assert.equal(sendGrid.mode, 'sendgrid');
  assert.equal(sendGridDelivery.provider, 'SendGrid');
  assert.equal(sendGridDelivery.providerStatus, 202);
  assert.equal(sendGridDelivery.messageId, 'sendgrid-message-123');
  assert.equal(sendGridDelivery.delivered, null);
}

async function testExpressApi() {
  const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'dev-deakin-api-'));
  const repository = new FileRepository(dataDir);
  const emailService = createEmailService({});
  const app = createExpressApp({
    repository,
    emailService,
    environment: {},
    logger: { error() {} }
  });
  const server = await listen(app);
  const address = server.address();
  const baseUrl = `http://127.0.0.1:${address.port}`;
  const unique = randomUUID();
  const newsletterEmail = `newsletter.${unique}@example.com`;
  const subscriptionEmail = `subscription.${unique}@example.com`;

  try {
    const health = await jsonRequest(baseUrl, '/api/health');
    assert.equal(health.response.status, 200);
    assert.equal(health.body.ok, true);
    assert.equal(health.body.emailMode, 'demo');
    assert.equal(health.body.emailReady, false);

    const invalidNewsletter = await jsonRequest(baseUrl, '/api/subscribe', post({ email: 'invalid' }));
    assert.equal(invalidNewsletter.response.status, 400);

    const newsletter = await jsonRequest(
      baseUrl,
      '/api/subscribe',
      post({ email: newsletterEmail })
    );
    assert.equal(newsletter.response.status, 200);
    assert.equal(newsletter.body.subscriber.emailDelivery.accepted, false);
    assert.equal(newsletter.body.subscriber.emailDelivery.delivered, false);
    assert.match(newsletter.body.message, /No welcome email was delivered/i);
    assert.doesNotMatch(newsletter.body.message, /email sent/i);

    const duplicateNewsletter = await jsonRequest(
      baseUrl,
      '/api/subscribe',
      post({ email: newsletterEmail })
    );
    assert.equal(duplicateNewsletter.response.status, 200);
    assert.equal(duplicateNewsletter.body.message, newsletter.body.message);

    const publicSubscriberList = await jsonRequest(baseUrl, '/api/subscribers');
    assert.equal(publicSubscriberList.response.status, 404);
    assert.doesNotMatch(JSON.stringify(publicSubscriberList.body), new RegExp(newsletterEmail, 'i'));

    const invalidPlan = await jsonRequest(
      baseUrl,
      '/api/subscriptions',
      post({
        name: 'Romil Bijarnia',
        email: subscriptionEmail,
        planId: 'unlimited-admin',
        billingCycle: 'monthly'
      })
    );
    assert.equal(invalidPlan.response.status, 400);

    const invalidCycle = await jsonRequest(
      baseUrl,
      '/api/subscriptions',
      post({
        name: 'Romil Bijarnia',
        email: subscriptionEmail,
        planId: 'student-plus',
        billingCycle: 'weekly'
      })
    );
    assert.equal(invalidCycle.response.status, 400);

    const created = await jsonRequest(
      baseUrl,
      '/api/subscriptions',
      post({
        name: 'Romil Bijarnia',
        email: subscriptionEmail,
        planId: 'student-plus',
        planName: 'Attacker-controlled plan name',
        billingCycle: 'annual'
      })
    );
    assert.equal(created.response.status, 201);
    assert.equal(created.body.subscription.planName, 'Student Plus');
    assert.equal(created.body.subscription.billingCycle, 'annual');
    assert.equal('email' in created.body.subscription, false);
    assert.equal('name' in created.body.subscription, false);
    assert.match(created.body.subscription.managementToken, /^[A-Za-z0-9_-]{43}$/);
    assert.equal('managementTokenHash' in created.body.subscription, false);

    const duplicateSubscription = await jsonRequest(
      baseUrl,
      '/api/subscriptions',
      post({
        name: 'Romil Bijarnia',
        email: subscriptionEmail,
        planId: 'mentor',
        billingCycle: 'monthly'
      })
    );
    assert.equal(duplicateSubscription.response.status, 409);

    const unscopedList = await jsonRequest(baseUrl, '/api/subscriptions');
    assert.equal(unscopedList.response.status, 405);

    const listWithoutCredentials = await jsonRequest(
      baseUrl,
      '/api/subscriptions/list',
      post({ subscriptions: [] })
    );
    assert.equal(listWithoutCredentials.response.status, 400);

    const listed = await jsonRequest(
      baseUrl,
      '/api/subscriptions/list',
      post({
        subscriptions: [
          {
            id: created.body.subscription.id,
            managementToken: created.body.subscription.managementToken
          }
        ]
      })
    );
    assert.equal(listed.response.status, 200);
    assert.equal(listed.body.count, 1);
    assert.equal(listed.body.subscriptions[0].status, 'active');
    assert.doesNotMatch(JSON.stringify(listed.body), new RegExp(subscriptionEmail, 'i'));
    assert.equal('name' in listed.body.subscriptions[0], false);
    assert.equal('managementToken' in listed.body.subscriptions[0], false);
    assert.equal('managementTokenHash' in listed.body.subscriptions[0], false);

    const id = created.body.subscription.id;
    const managementToken = created.body.subscription.managementToken;
    const unauthorisedCancellation = await jsonRequest(
      baseUrl,
      `/api/subscriptions/${encodeURIComponent(id)}/cancel`,
      post({ managementToken: 'invalid' })
    );
    assert.equal(unauthorisedCancellation.response.status, 404);

    const cancelled = await jsonRequest(
      baseUrl,
      `/api/subscriptions/${encodeURIComponent(id)}/cancel`,
      post({ managementToken })
    );
    assert.equal(cancelled.response.status, 200);
    assert.equal(cancelled.body.subscription.status, 'cancelled');
    assert.ok(cancelled.body.subscription.cancelledAt);

    const cancelledAgain = await jsonRequest(
      baseUrl,
      `/api/subscriptions/${encodeURIComponent(id)}/cancel`,
      post({ managementToken })
    );
    assert.equal(cancelledAgain.response.status, 409);
  } finally {
    await close(server);
    await fs.rm(dataDir, { recursive: true, force: true });
  }
}

async function testNetlifyAdapter() {
  const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'dev-deakin-netlify-'));
  try {
    const handler = createHandler({
      repository: new FileRepository(dataDir),
      emailService: createEmailService({}),
      logger: { error() {} }
    });
    const response = await handler({
      httpMethod: 'GET',
      path: '/.netlify/functions/api/health',
      queryStringParameters: null,
      body: null
    });
    assert.equal(response.statusCode, 200);
    assert.equal(JSON.parse(response.body).ok, true);
    assert.match(response.headers['Content-Type'], /application\/json/);
  } finally {
    await fs.rm(dataDir, { recursive: true, force: true });
  }
}

async function main() {
  await testEmailProviders();
  await testExpressApi();
  await testNetlifyAdapter();
  console.log('API smoke tests passed: 200, 201, 400, 409, private listing, and server-backed cancellation.');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
