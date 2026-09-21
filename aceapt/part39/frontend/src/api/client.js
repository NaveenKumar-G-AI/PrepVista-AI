// Fixed demo student id, matching backend DEMO_STUDENT_ID. Swap this for a
// real session/JWT value once real auth replaces the stub in the backend.
const STUDENT_ID = 'student_demo_001';

async function request(path, { method = 'GET', body } = {}) {
  const res = await fetch(`/api${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', 'x-student-id': STUDENT_ID },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  let data = null;
  try { data = await res.json(); } catch { /* no body */ }

  if (!res.ok) {
    const error = new Error(data?.error || `Request failed (${res.status})`);
    error.status = res.status;
    error.data = data;
    throw error;
  }
  return data;
}

export const api = {
  getMe: () => request('/students/me'),
  updateMe: (patch) => request('/students/me', { method: 'PATCH', body: patch }),

  listOpportunities: (tab) => request(`/opportunities?tab=${tab}`),
  addOpportunity: (payload) => request('/opportunities', { method: 'POST', body: payload }),
  getOpportunity: (id) => request(`/opportunities/${id}`),
  updateOpportunity: (id, patch) => request(`/opportunities/${id}`, { method: 'PATCH', body: patch }),
  reanalyzeOpportunity: (id) => request(`/opportunities/${id}/analyze`, { method: 'POST' }),
  shouldIApply: (id) => request(`/opportunities/${id}/should-i-apply`),

  listApplications: (stage) => request(`/applications${stage ? `?stage=${stage}` : ''}`),
  startApplication: (opportunity_id) => request('/applications', { method: 'POST', body: { opportunity_id } }),
  getApplication: (id) => request(`/applications/${id}`),
  updateApplication: (id, patch) => request(`/applications/${id}`, { method: 'PATCH', body: patch }),
  setStage: (id, stage, note) => request(`/applications/${id}/stage`, { method: 'PATCH', body: { stage, note } }),
  recordOutcome: (id, outcome, notes) => request(`/applications/${id}/outcome`, { method: 'POST', body: { outcome, notes } }),
  getStrategy: (id) => request(`/applications/${id}/strategy`),
  generateDocument: (id, doc_type, question_type) => request(`/applications/${id}/documents`, { method: 'POST', body: { doc_type, question_type } }),

  listFollowUps: (status) => request(`/followups${status ? `?status=${status}` : ''}`),
  generateFollowUps: () => request('/followups/generate', { method: 'POST' }),
  markFollowUpSent: (id) => request(`/followups/${id}/mark-sent`, { method: 'POST' }),
  dismissFollowUp: (id) => request(`/followups/${id}/dismiss`, { method: 'POST' }),

  getFunnel: () => request('/insights/funnel'),
  getWeekly: () => request('/insights/weekly'),
  getGaps: () => request('/insights/gaps'),
  getPortfolio: () => request('/insights/portfolio'),
  getToday: () => request('/insights/today'),
};
