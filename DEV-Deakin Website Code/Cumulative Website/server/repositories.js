const fs = require('fs/promises');
const path = require('path');

async function readArray(filePath) {
  try {
    const raw = await fs.readFile(filePath, 'utf8');
    const value = JSON.parse(raw);

    if (!Array.isArray(value)) {
      throw new Error(`${path.basename(filePath)} must contain a JSON array.`);
    }

    return value;
  } catch (error) {
    if (error.code === 'ENOENT') return [];
    throw error;
  }
}

async function writeArray(filePath, value) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  const temporaryPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  await fs.writeFile(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
  await fs.rename(temporaryPath, filePath);
}

class FileRepository {
  constructor(dataDir) {
    this.label = 'local-json';
    this.mailingListPath = path.join(dataDir, 'mailing-list.json');
    this.subscriptionListPath = path.join(dataDir, 'subscriptions.json');
    this.writeQueue = Promise.resolve();
  }

  async waitForWrites() {
    await this.writeQueue;
  }

  mutate(operation) {
    const result = this.writeQueue.then(operation, operation);
    this.writeQueue = result.catch(() => undefined);
    return result;
  }

  async findNewsletterSubscriber(email) {
    await this.waitForWrites();
    const subscribers = await readArray(this.mailingListPath);
    return subscribers.find((item) => item.email === email) || null;
  }

  async createNewsletterSubscriber(subscriber) {
    return this.mutate(async () => {
      const subscribers = await readArray(this.mailingListPath);
      const duplicate = subscribers.some((item) => item.email === subscriber.email);

      if (duplicate) return { created: false };

      subscribers.push(subscriber);
      await writeArray(this.mailingListPath, subscribers);
      return { created: true };
    });
  }

  async updateNewsletterSubscriber(subscriber) {
    return this.mutate(async () => {
      const subscribers = await readArray(this.mailingListPath);
      const index = subscribers.findIndex((item) => item.id === subscriber.id);
      if (index === -1) return false;
      subscribers[index] = subscriber;
      await writeArray(this.mailingListPath, subscribers);
      return true;
    });
  }

  async createSubscription(subscription) {
    return this.mutate(async () => {
      const subscriptions = await readArray(this.subscriptionListPath);
      const duplicate = subscriptions.some(
        (item) => item.email === subscription.email && item.status === 'active'
      );

      if (duplicate) return { created: false };

      subscriptions.push(subscription);
      await writeArray(this.subscriptionListPath, subscriptions);
      return { created: true };
    });
  }

  async listSubscriptionsByEmail(email) {
    await this.waitForWrites();
    const subscriptions = await readArray(this.subscriptionListPath);
    return subscriptions.filter((item) => item.email === email);
  }

  async getSubscriptionById(id) {
    await this.waitForWrites();
    const subscriptions = await readArray(this.subscriptionListPath);
    return subscriptions.find((item) => item.id === id) || null;
  }

  async cancelSubscription(id) {
    return this.mutate(async () => {
      const subscriptions = await readArray(this.subscriptionListPath);
      const index = subscriptions.findIndex((item) => item.id === id);

      if (index === -1) return { outcome: 'not-found' };
      if (subscriptions[index].status !== 'active') {
        return { outcome: 'already-cancelled', subscription: subscriptions[index] };
      }

      const subscription = {
        ...subscriptions[index],
        status: 'cancelled',
        cancelledAt: new Date().toISOString()
      };
      subscriptions[index] = subscription;
      await writeArray(this.subscriptionListPath, subscriptions);
      return { outcome: 'cancelled', subscription };
    });
  }
}

module.exports = {
  FileRepository
};
