// Netlify serves the API from the same origin. Local Vite development keeps the
// Express URL as its default unless VITE_API_BASE explicitly overrides it.
const configuredApiBase = String(import.meta.env.VITE_API_BASE || '').replace(/\/$/, '');
const apiBase = configuredApiBase || (import.meta.env.PROD ? '' : 'http://127.0.0.1:5050');

async function requestJson(path, options = {}) {
  let response;
  try {
    response = await fetch(`${apiBase}${path}`, options);
  } catch {
    return {
      ok: false,
      status: 0,
      body: { message: 'The DEV@Deakin API did not respond. Try again.' }
    };
  }

  try {
    const contentType = response.headers.get('content-type') || '';
    if (!contentType.includes('application/json')) {
      return {
        ok: false,
        status: response.status,
        body: { message: `The DEV@Deakin API returned a non-JSON response (status ${response.status}).` }
      };
    }
    const body = await response.json();

    return {
      ok: response.ok,
      status: response.status,
      body
    };
  } catch {
    return {
      ok: false,
      status: response.status,
      body: {
        message: `The DEV@Deakin API returned an unreadable response (status ${response.status}).`
      }
    };
  }
}

function postJson(path, payload) {
  return requestJson(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
}

export function subscribeToNewsletter(email) {
  return postJson('/api/subscribe', { email });
}

export function createSubscription(subscription) {
  return postJson('/api/subscriptions', subscription);
}

export function listSubscriptions(subscriptions) {
  const credentials = Array.isArray(subscriptions)
    ? subscriptions
        .filter((subscription) => subscription?.id && subscription?.managementToken)
        .map(({ id, managementToken }) => ({ id, managementToken }))
    : [];
  return postJson('/api/subscriptions/list', { subscriptions: credentials });
}

export function cancelSubscriptionOnServer(id, managementToken) {
  return postJson(`/api/subscriptions/${encodeURIComponent(id)}/cancel`, { managementToken });
}

export function getBackendHealth() {
  return requestJson('/api/health');
}
