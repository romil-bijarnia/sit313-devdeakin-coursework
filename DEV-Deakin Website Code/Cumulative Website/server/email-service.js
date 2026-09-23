const { randomUUID } = require('crypto');

function providerError(provider, status) {
  const error = new Error(`${provider} rejected the request with status ${status}.`);
  error.emailProvider = provider;
  error.status = status;
  return error;
}

function createEmailService(environment = process.env, fetchImplementation = global.fetch) {
  const resendApiKey = String(environment.RESEND_API_KEY || '').trim();
  const resendFrom =
    String(environment.RESEND_FROM || '').trim() || 'DEV@Deakin <onboarding@resend.dev>';
  const sendGridApiKey = String(environment.SENDGRID_API_KEY || '').trim();
  const sendGridFrom = String(environment.SENDGRID_FROM || '').trim();

  if (resendApiKey) {
    return {
      mode: 'resend',
      async sendWelcomeEmail(email, idempotencyKey) {
        const response = await fetchImplementation('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${resendApiKey}`,
            'Content-Type': 'application/json',
            'Idempotency-Key': `dev-deakin-welcome-${idempotencyKey || randomUUID()}`
          },
          body: JSON.stringify({
            from: resendFrom,
            to: [email],
            subject: 'Welcome to DEV@Deakin',
            text: 'Thanks for subscribing to DEV@Deakin. You are now on the daily insider list.'
          })
        });

        if (!response.ok) throw providerError('Resend', response.status);

        const body = await response.json();
        return {
          mode: 'resend',
          state: 'completed',
          provider: 'Resend',
          configured: true,
          accepted: true,
          // API acceptance is not proof that the recipient's server delivered the message.
          delivered: null,
          providerStatus: response.status,
          messageId: body.id || null
        };
      }
    };
  }

  if (!sendGridApiKey || !sendGridFrom) {
    return {
      mode: 'demo',
      async sendWelcomeEmail() {
        return {
          mode: 'demo',
          state: 'completed',
          provider: null,
          configured: false,
          accepted: false,
          delivered: false,
          providerStatus: null,
          messageId: null
        };
      }
    };
  }

  return {
    mode: 'sendgrid',
    async sendWelcomeEmail(email) {
      const response = await fetchImplementation('https://api.sendgrid.com/v3/mail/send', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${sendGridApiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          personalizations: [{ to: [{ email }] }],
          from: { email: sendGridFrom },
          subject: 'Welcome to DEV@Deakin',
          content: [
            {
              type: 'text/plain',
              value: 'Thanks for subscribing to DEV@Deakin. You are now on the daily insider list.'
            }
          ]
        })
      });

      if (!response.ok) throw providerError('SendGrid', response.status);

      return {
        mode: 'sendgrid',
        state: 'completed',
        provider: 'SendGrid',
        configured: true,
        accepted: true,
        // A 202 response means SendGrid accepted the message; it is not proof of final delivery.
        delivered: null,
        providerStatus: response.status,
        messageId: response.headers.get('x-message-id') || null
      };
    }
  };
}

module.exports = {
  createEmailService
};
