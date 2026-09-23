const { createHash } = require('crypto');

let netlifyGetStore;
let netlifyBlobsLoadError;
const mutationQueues = new Map();
try {
  // Keep this as a static require so Netlify's function bundler includes the package.
  ({ getStore: netlifyGetStore } = require('@netlify/blobs'));
} catch (error) {
  // Local Express development does not use Blobs. Deferring this error lets the
  // shared Netlify adapter be smoke-tested with the local file repository.
  netlifyBlobsLoadError = error;
}

function emailKey(email) {
  return createHash('sha256').update(email).digest('hex');
}

function defaultStoreName(environment = process.env) {
  const context = String(environment.CONTEXT || 'dev')
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .slice(0, 32);
  return `dev-deakin-${context || 'dev'}`;
}

function withMutationLock(key, operation) {
  const previous = mutationQueues.get(key) || Promise.resolve();
  const result = previous.then(operation, operation);
  const tail = result.catch(() => undefined);
  mutationQueues.set(key, tail);
  return result.finally(() => {
    if (mutationQueues.get(key) === tail) mutationQueues.delete(key);
  });
}

class NetlifyBlobRepository {
  constructor(options = {}) {
    this.label = 'netlify-blobs';
    this.storeName = options.storeName || defaultStoreName(options.environment);
    this.getStoreImplementation = options.getStoreImplementation || netlifyGetStore;
    this.storePromise = null;
  }

  async getStore() {
    if (!this.storePromise) {
      if (!this.getStoreImplementation) throw netlifyBlobsLoadError;
      this.storePromise = Promise.resolve(
        this.getStoreImplementation({ name: this.storeName })
      );
    }
    return this.storePromise;
  }

  async getJson(key) {
    const store = await this.getStore();
    return store.get(key, { type: 'json' });
  }

  async findNewsletterSubscriber(email) {
    return this.getJson(`newsletter:${emailKey(email)}`);
  }

  async createNewsletterSubscriber(subscriber) {
    return withMutationLock(`newsletter:${emailKey(subscriber.email)}`, async () => {
      const store = await this.getStore();
      const { modified } = await store.setJSON(
        `newsletter:${emailKey(subscriber.email)}`,
        subscriber,
        { onlyIfNew: true }
      );
      return { created: modified };
    });
  }

  async updateNewsletterSubscriber(subscriber) {
    const store = await this.getStore();
    const key = `newsletter:${emailKey(subscriber.email)}`;

    for (let attempt = 0; attempt < 5; attempt += 1) {
      const current = await store.getWithMetadata(key, { type: 'json' });
      if (!current) return false;
      const { modified } = await store.setJSON(key, subscriber, { onlyIfMatch: current.etag });
      if (modified) return true;
    }

    throw new Error('Newsletter record changed too many times while updating delivery state.');
  }

  async createSubscription(subscription) {
    return withMutationLock(`subscription-email:${emailKey(subscription.email)}`, () =>
      this.createSubscriptionUnlocked(subscription)
    );
  }

  async createSubscriptionUnlocked(subscription) {
    const store = await this.getStore();
    const subscriptionKey = `subscription:${subscription.id}`;
    const activeKey = `active:${emailKey(subscription.email)}`;
    const recordWrite = await store.setJSON(subscriptionKey, subscription, { onlyIfNew: true });
    if (!recordWrite.modified) return { created: false };

    for (let attempt = 0; attempt < 8; attempt += 1) {
      const pointer = await store.getWithMetadata(activeKey);

      if (!pointer) {
        const reservation = await store.set(activeKey, subscription.id, { onlyIfNew: true });
        if (reservation.modified) return { created: true };
        continue;
      }

      const active = pointer.data.startsWith('sub_')
        ? await this.getJson(`subscription:${pointer.data}`)
        : null;
      if (active?.status === 'active') {
        await store.delete(subscriptionKey);
        return { created: false };
      }

      const reservation = await store.set(activeKey, subscription.id, {
        onlyIfMatch: pointer.etag
      });
      if (reservation.modified) return { created: true };
    }

    await store.delete(subscriptionKey);
    throw new Error('Could not reserve the active subscription after multiple concurrent updates.');
  }

  async getSubscriptionById(id) {
    return this.getJson(`subscription:${id}`);
  }

  async cancelSubscription(id) {
    const existing = await this.getSubscriptionById(id);
    if (!existing) return { outcome: 'not-found' };
    return withMutationLock(`subscription-email:${emailKey(existing.email)}`, () =>
      this.cancelSubscriptionUnlocked(id)
    );
  }

  async cancelSubscriptionUnlocked(id) {
    const store = await this.getStore();
    const key = `subscription:${id}`;
    let cancelled;

    for (let attempt = 0; attempt < 8; attempt += 1) {
      const current = await store.getWithMetadata(key, { type: 'json' });
      if (!current) return { outcome: 'not-found' };
      if (current.data.status !== 'active') {
        return { outcome: 'already-cancelled', subscription: current.data };
      }

      cancelled = {
        ...current.data,
        status: 'cancelled',
        cancelledAt: new Date().toISOString()
      };
      const update = await store.setJSON(key, cancelled, { onlyIfMatch: current.etag });
      if (update.modified) break;
      cancelled = null;
    }

    if (!cancelled) {
      throw new Error('Could not cancel the subscription after multiple concurrent updates.');
    }

    const activeKey = `active:${emailKey(cancelled.email)}`;
    const pointer = await store.getWithMetadata(activeKey);
    if (pointer?.data === id) {
      await store.set(activeKey, `cancelled:${id}`, { onlyIfMatch: pointer.etag });
    }

    return { outcome: 'cancelled', subscription: cancelled };
  }
}

module.exports = {
  NetlifyBlobRepository,
  defaultStoreName,
  emailKey,
  withMutationLock
};
