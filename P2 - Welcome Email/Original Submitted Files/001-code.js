const express = require('express');
const cors = require('cors');
const fs = require('fs/promises');
const path = require('path');
require('dotenv').config();

const app = express();
const port = Number(process.env.PORT || 5050);
const frontendOrigin = process.env.FRONTEND_ORIGIN || 'http://127.0.0.1:5173';
const dataDir = path.join(__dirname, 'data');
const mailingListPath = path.join(dataDir, 'mailing-list.json');
const subscriptionListPath = path.join(dataDir, 'subscriptions.json');

app.use(cors({ origin: [frontendOrigin, 'http://localhost:5173', 'http://127.0.0.1:4173'] }));
app.use(express.json({ limit: '1mb' }));

function isValidEmail(email) {
  const value = String(email).trim();
  // 254 characters is the practical upper bound for a deliverable address (RFC 5321).
  return value.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

async function ensureMailingList() {
  await fs.mkdir(dataDir, { recursive: true });
  try {
    const raw = await fs.readFile(mailingListPath, 'utf8');
    return JSON.parse(raw);
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    await fs.writeFile(mailingListPath, '[]\n');
    return [];
  }
}

async function writeMailingList(list) {
  await fs.mkdir(dataDir, { recursive: true });
  await fs.writeFile(mailingListPath, `${JSON.stringify(list, null, 2)}\n`);
}

async function ensureSubscriptionList() {
  await fs.mkdir(dataDir, { recursive: true });
  try {
    const raw = await fs.readFile(subscriptionListPath, 'utf8');
    return JSON.parse(raw);
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    await fs.writeFile(subscriptionListPath, '[]\n');
    return [];
  }
}

async function writeSubscriptionList(list) {
  await fs.mkdir(dataDir, { recursive: true });
  await fs.writeFile(subscriptionListPath, `${JSON.stringify(list, null, 2)}\n`);
}

async function sendWelcomeEmail(email) {
  if (process.env.SENDGRID_API_KEY && process.env.SENDGRID_FROM) {
    const response = await fetch('https://api.sendgrid.com/v3/mail/send', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.SENDGRID_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        personalizations: [{ to: [{ email }] }],
        from: { email: process.env.SENDGRID_FROM },
        subject: 'Welcome to DEV@Deakin',
        content: [
          {
            type: 'text/plain',
            value: 'Thanks for subscribing to DEV@Deakin. You are now on the daily insider list.'
          }
        ]
      })
    });

    if (!response.ok) {
      const body = await response.text();
      const error = new Error(`SendGrid rejected the request with ${response.status}`);
      error.status = response.status;
      error.body = body;
      throw error;
    }

    return {
      provider: 'SendGrid',
      status: response.status,
      id: response.headers.get('x-message-id') || `sendgrid-${Date.now()}`
    };
  }

  await new Promise((resolve) => setTimeout(resolve, 180));
  return {
    provider: 'Local SIT313 email provider',
    status: 200,
    id: `local-${Date.now()}`
  };
}

app.get('/api/health', (req, res) => {
  res.status(200).json({
    ok: true,
    service: 'DEV@Deakin newsletter backend',
    status: 200
  });
});

app.get('/api/subscribers', async (req, res) => {
  try {
    const list = await ensureMailingList();
    res.status(200).json({
      count: list.length,
      subscribers: list
    });
  } catch (error) {
    console.error('Mailing list read error:', error);
    res.status(500).json({
      message: 'Unable to read the mailing list.',
      status: 500
    });
  }
});

app.get('/api/subscriptions', async (req, res) => {
  try {
    const list = await ensureSubscriptionList();
    res.status(200).json({
      count: list.length,
      subscriptions: list
    });
  } catch (error) {
    console.error('Subscription read error:', error);
    res.status(500).json({
      message: 'Unable to read subscriptions.',
      status: 500
    });
  }
});

app.post('/api/subscriptions', async (req, res) => {
  try {
    const name = String(req.body.name || '').trim();
    const email = String(req.body.email || '').trim().toLowerCase();
    const planId = String(req.body.planId || '').trim();
    const planName = String(req.body.planName || '').trim();
    const billingCycle = String(req.body.billingCycle || 'monthly').trim();

    if (!name || name.length > 120) {
      return res.status(400).json({
        message: 'Enter the subscriber name.',
        status: 400
      });
    }

    if (!isValidEmail(email)) {
      return res.status(400).json({
        message: 'Enter a valid subscriber email address.',
        status: 400
      });
    }

    if (!planId || !planName) {
      return res.status(400).json({
        message: 'Choose a subscription plan.',
        status: 400
      });
    }

    const list = await ensureSubscriptionList();
    const existingActive = list.find(
      (subscription) => subscription.email === email && subscription.status === 'active'
    );

    if (existingActive) {
      return res.status(409).json({
        message: 'This email already has an active subscription.',
        status: 409,
        subscription: existingActive
      });
    }

    const subscription = {
      id: `sub-${Date.now()}`,
      receiptId: `receipt-${Date.now()}`,
      name,
      email,
      planId,
      planName,
      billingCycle,
      status: 'active',
      createdAt: new Date().toISOString()
    };

    list.push(subscription);
    await writeSubscriptionList(list);

    res.status(201).json({
      message: 'Subscription created successfully.',
      status: 201,
      subscription
    });
  } catch (error) {
    console.error('Subscription creation error:', error);
    res.status(500).json({
      message: 'The subscription could not be created.',
      status: 500
    });
  }
});

app.post('/api/subscribe', async (req, res) => {
  try {
    const email = String(req.body.email || '').trim().toLowerCase();

    if (!isValidEmail(email)) {
      return res.status(400).json({
        message: 'Enter a valid email address.',
        status: 400
      });
    }

    const list = await ensureMailingList();
    const existing = list.find((subscriber) => subscriber.email === email);

    if (existing) {
      return res.status(409).json({
        message: 'This email is already subscribed.',
        status: 409,
        subscriber: existing
      });
    }

    const mail = await sendWelcomeEmail(email);
    const subscriber = {
      id: `sub-${Date.now()}`,
      email,
      createdAt: new Date().toISOString(),
      emailProvider: mail.provider,
      emailStatus: mail.status,
      emailMessageId: mail.id
    };

    list.push(subscriber);
    await writeMailingList(list);

    console.log(`Status ${mail.status}: welcome email queued for ${email} using ${mail.provider}`);

    res.status(200).json({
      message: 'Subscription successful. Welcome email sent.',
      status: 200,
      subscriber
    });
  } catch (error) {
    console.error('Subscription error:', error);
    res.status(500).json({
      message: 'The subscription could not be completed.',
      status: 500
    });
  }
});

if (require.main === module) {
  app.listen(port, () => {
    console.log(`DEV@Deakin backend running on http://127.0.0.1:${port}`);
  });
}

module.exports = app;
