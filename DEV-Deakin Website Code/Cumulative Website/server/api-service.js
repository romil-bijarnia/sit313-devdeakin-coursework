const { createHash, randomBytes, randomUUID, timingSafeEqual } = require('crypto');

const PLANS = Object.freeze({
  free: Object.freeze({ id: 'free', name: 'Free' }),
  'student-plus': Object.freeze({ id: 'student-plus', name: 'Student Plus' }),
  mentor: Object.freeze({ id: 'mentor', name: 'Mentor' })
});
const BILLING_CYCLES = new Set(['monthly', 'annual']);

function response(status, body, headers = {}) {
  return { status, body, headers };
}

function normalizeEmail(value) {
  return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

function isValidEmail(value) {
  const email = normalizeEmail(value);
  return email.length > 3 && email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function publicSubscription(subscription) {
  return {
    id: subscription.id,
    receiptId: subscription.receiptId,
    planId: subscription.planId,
    planName: subscription.planName,
    billingCycle: subscription.billingCycle,
    status: subscription.status,
    createdAt: subscription.createdAt,
    ...(subscription.cancelledAt ? { cancelledAt: subscription.cancelledAt } : {})
  };
}

function tokenHash(token) {
  return createHash('sha256').update(token).digest('hex');
}

function isValidManagementToken(token) {
  return typeof token === 'string' && /^[A-Za-z0-9_-]{43}$/.test(token);
}

function tokenMatches(token, expectedHash) {
  if (!isValidManagementToken(token) || !/^[0-9a-f]{64}$/i.test(expectedHash || '')) return false;
  const actual = Buffer.from(tokenHash(token), 'hex');
  const expected = Buffer.from(expectedHash, 'hex');
  return timingSafeEqual(actual, expected);
}

function normalizePath(value) {
  const rawPath = String(value || '/');
  const withoutQuery = rawPath.split('?')[0];
  if (withoutQuery.length > 1 && withoutQuery.endsWith('/')) return withoutQuery.slice(0, -1);
  return withoutQuery;
}

function methodNotAllowed(allowed) {
  return response(
    405,
    { message: `Method not allowed. Use ${allowed.join(' or ')}.`, status: 405 },
    { Allow: allowed.join(', ') }
  );
}

function createApiService({ repository, emailService, logger = console }) {
  if (!repository) throw new Error('A repository is required.');
  if (!emailService) throw new Error('An email service is required.');

  async function subscribe(body) {
    const email = normalizeEmail(body?.email);
    if (!isValidEmail(email)) {
      return response(400, { message: 'Enter a valid email address.', status: 400 });
    }

    const pendingSubscriber = {
      id: `newsletter_${randomUUID()}`,
      email,
      createdAt: new Date().toISOString(),
      emailDelivery: {
        mode: emailService.mode,
        state: 'pending',
        provider: null,
        configured: emailService.mode !== 'demo',
        accepted: false,
        delivered: false,
        providerStatus: null,
        messageId: null
      }
    };
    const result = await repository.createNewsletterSubscriber(pendingSubscriber);
    let subscriber = result.created
      ? pendingSubscriber
      : await repository.findNewsletterSubscriber(email);

    if (!result.created) {
      if (subscriber?.emailDelivery?.state !== 'completed') {
        return response(202, {
          message: 'The newsletter request is being processed.',
          status: 202
        });
      }
      const delivery = subscriber.emailDelivery;
      const message = delivery.accepted
        ? `Subscription successful. ${delivery.provider} accepted the welcome email for delivery.`
        : 'Subscription saved in demo mode. No welcome email was delivered because no transactional email provider is configured.';
      return response(200, {
        message,
        status: 200,
        subscriber: { id: subscriber.id, emailDelivery: delivery }
      });
    }

    let delivery;
    try {
      delivery = await emailService.sendWelcomeEmail(email, pendingSubscriber.id);
    } catch (error) {
      subscriber = {
        ...pendingSubscriber,
        emailDelivery: {
          mode: emailService.mode,
          state: 'failed',
          provider: error.emailProvider || null,
          configured: emailService.mode !== 'demo',
          accepted: false,
          delivered: false,
          providerStatus: error.status || null,
          messageId: null
        }
      };
      await repository.updateNewsletterSubscriber(subscriber);
      throw error;
    }

    subscriber = { ...pendingSubscriber, emailDelivery: delivery };
    await repository.updateNewsletterSubscriber(subscriber);
    const message = delivery.accepted
      ? `Subscription successful. ${delivery.provider} accepted the welcome email for delivery.`
      : 'Subscription saved in demo mode. No welcome email was delivered because no transactional email provider is configured.';

    return response(200, {
      message,
      status: 200,
      subscriber: {
        id: subscriber.id,
        createdAt: subscriber.createdAt,
        emailDelivery: delivery
      }
    });
  }

  async function createSubscription(body) {
    const name = typeof body?.name === 'string' ? body.name.trim() : '';
    const email = normalizeEmail(body?.email);
    const planId = typeof body?.planId === 'string' ? body.planId.trim() : '';
    const billingCycle = typeof body?.billingCycle === 'string' ? body.billingCycle.trim() : '';
    const promoCode = typeof body?.promoCode === 'string' ? body.promoCode.trim().toUpperCase() : '';

    if (name.length < 2 || name.length > 120) {
      return response(400, { message: 'Enter a subscriber name between 2 and 120 characters.', status: 400 });
    }
    if (!isValidEmail(email)) {
      return response(400, { message: 'Enter a valid subscriber email address.', status: 400 });
    }
    if (!Object.hasOwn(PLANS, planId)) {
      return response(400, {
        message: `Choose a valid subscription plan: ${Object.keys(PLANS).join(', ')}.`,
        status: 400
      });
    }
    if (!BILLING_CYCLES.has(billingCycle)) {
      return response(400, {
        message: 'Choose a valid billing cycle: monthly or annual.',
        status: 400
      });
    }
    if (promoCode.length > 40 || (promoCode && !/^[A-Z0-9_-]+$/.test(promoCode))) {
      return response(400, {
        message: 'Promo codes may contain up to 40 letters, numbers, hyphens, or underscores.',
        status: 400
      });
    }

    const plan = PLANS[planId];
    const managementToken = randomBytes(32).toString('base64url');
    const subscription = {
      id: `sub_${randomUUID()}`,
      receiptId: `receipt_${randomUUID()}`,
      name,
      email,
      planId: plan.id,
      planName: plan.name,
      billingCycle,
      ...(promoCode ? { promoCode } : {}),
      managementTokenHash: tokenHash(managementToken),
      status: 'active',
      createdAt: new Date().toISOString()
    };
    const result = await repository.createSubscription(subscription);

    if (!result.created) {
      return response(409, {
        message: 'This email already has an active subscription.',
        status: 409
      });
    }

    return response(201, {
      message: 'Subscription created successfully.',
      status: 201,
      subscription: {
        ...publicSubscription(subscription),
        managementToken
      }
    });
  }

  async function listSubscriptions(body) {
    const credentials = Array.isArray(body?.subscriptions) ? body.subscriptions.slice(0, 50) : [];
    if (!credentials.length) {
      return response(400, {
        message: 'Provide saved subscription credentials. Public subscriber listing is disabled.',
        status: 400
      });
    }

    const seen = new Set();
    const subscriptions = [];
    for (const credential of credentials) {
      const id = typeof credential?.id === 'string' ? credential.id : '';
      const managementToken = credential?.managementToken;
      if (seen.has(id) || !/^sub_[0-9a-f-]{36}$/i.test(id) || !isValidManagementToken(managementToken)) {
        continue;
      }
      seen.add(id);
      const subscription = await repository.getSubscriptionById(id);
      if (subscription && tokenMatches(managementToken, subscription.managementTokenHash)) {
        // The browser already holds the capability it supplied. Return only
        // public record data so the raw token is disclosed exactly once,
        // when the subscription is created.
        subscriptions.push(publicSubscription(subscription));
      }
    }

    const safeSubscriptions = subscriptions.sort((a, b) => b.createdAt.localeCompare(a.createdAt));

    return response(200, {
      count: safeSubscriptions.length,
      subscriptions: safeSubscriptions,
      status: 200
    });
  }

  async function cancelSubscription(id, body) {
    if (!/^sub_[0-9a-f-]{36}$/i.test(id)) {
      return response(400, { message: 'Provide a valid subscription ID.', status: 400 });
    }

    const managementToken = body?.managementToken;
    const existing = await repository.getSubscriptionById(id);
    if (!existing || !tokenMatches(managementToken, existing.managementTokenHash)) {
      return response(404, { message: 'Subscription credentials were not found.', status: 404 });
    }

    const result = await repository.cancelSubscription(id);
    if (result.outcome === 'not-found') {
      return response(404, { message: 'Subscription not found.', status: 404 });
    }
    if (result.outcome === 'already-cancelled') {
      return response(409, { message: 'This subscription is already cancelled.', status: 409 });
    }

    return response(200, {
      message: 'Subscription cancelled successfully.',
      status: 200,
      subscription: publicSubscription(result.subscription)
    });
  }

  async function handle(request) {
    const method = String(request?.method || 'GET').toUpperCase();
    const path = normalizePath(request?.path);

    if (method === 'OPTIONS') return response(204, null);

    try {
      if (path === '/api/health') {
        if (method !== 'GET') return methodNotAllowed(['GET']);
        return response(200, {
          ok: true,
          service: 'DEV@Deakin API',
          storage: repository.label || 'configured',
          emailMode: emailService.mode,
          emailReady: emailService.mode !== 'demo',
          status: 200
        });
      }

      if (path === '/api/subscribe') {
        if (method !== 'POST') return methodNotAllowed(['POST']);
        return subscribe(request.body);
      }

      if (path === '/api/subscriptions') {
        if (method === 'POST') return createSubscription(request.body);
        return methodNotAllowed(['POST']);
      }

      if (path === '/api/subscriptions/list') {
        if (method !== 'POST') return methodNotAllowed(['POST']);
        return listSubscriptions(request.body);
      }

      const cancellationMatch = path.match(/^\/api\/subscriptions\/([^/]+)\/cancel$/);
      if (cancellationMatch) {
        if (method !== 'POST') return methodNotAllowed(['POST']);
        return cancelSubscription(decodeURIComponent(cancellationMatch[1]), request.body);
      }

      return response(404, { message: 'API endpoint not found.', status: 404 });
    } catch (error) {
      logger.error('DEV@Deakin API error:', error);
      const emailFailure = Boolean(error.emailProvider);
      return response(emailFailure ? 502 : 500, {
        message: emailFailure
          ? `The newsletter signup could not be completed because ${error.emailProvider} did not accept the email.`
          : 'The DEV@Deakin API could not complete the request.',
        status: emailFailure ? 502 : 500
      });
    }
  }

  return { handle };
}

module.exports = {
  BILLING_CYCLES,
  PLANS,
  createApiService,
  isValidEmail,
  normalizeEmail,
  publicSubscription,
  tokenHash,
  tokenMatches
};
