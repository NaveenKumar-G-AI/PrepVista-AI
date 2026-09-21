const BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:4000';
const TOKEN = import.meta.env.VITE_DEMO_TOKEN || '';

async function request(path, options = {}) {
  const headers = { 'content-type': 'application/json', ...(options.headers || {}) };
  if (TOKEN) headers['x-demo-token'] = TOKEN;

  let response;
  try {
    response = await fetch(`${BASE_URL}${path}`, { ...options, headers });
  } catch (err) {
    const e = new Error('Could not reach the career analysis service. Is the backend running?');
    e.network = true;
    throw e;
  }

  if (!response.ok) {
    let message = "We couldn't update your career analysis right now.";
    try {
      const body = await response.json();
      if (body?.error) message = body.error;
    } catch {
      // no JSON body to read - keep the default message
    }
    const e = new Error(message);
    e.status = response.status;
    throw e;
  }
  return response.json();
}

export const api = {
  getState: () => request('/api/career/state'),
  getLimitingFactor: () => request('/api/career/limiting-factor'),
  getRecommendation: () => request('/api/career/recommendation'),
  getPlan: () => request('/api/career/plan'),
  getScenarios: (altTarget) => request(`/api/career/scenarios${altTarget ? `?altTarget=${encodeURIComponent(altTarget)}` : ''}`),
  getTimeline: () => request('/api/career/timeline'),
  getTargets: () => request('/api/career/targets'),
  getExplanation: (topic) => request(`/api/career/explain?topic=${encodeURIComponent(topic)}`),
  changeTarget: (targetId) => request('/api/career/target', { method: 'POST', body: JSON.stringify({ targetId }) }),
  startIntervention: () => request('/api/career/interventions', { method: 'POST' }),
  completeIntervention: (id, resultScore) =>
    request(`/api/career/interventions/${id}/complete`, { method: 'POST', body: JSON.stringify({ resultScore }) }),
};
