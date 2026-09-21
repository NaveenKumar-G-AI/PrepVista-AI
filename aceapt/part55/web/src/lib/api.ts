const API_BASE = import.meta.env.VITE_API_BASE ?? 'http://localhost:4055/api/difficulty';

export interface StudentDifficultyResponse {
  questionVersionId: string;
  category: 'EASY' | 'MEDIUM' | 'HARD' | null;
  recommended: boolean;
  provisional?: boolean;
  personalChallenge?: 'BELOW_LEVEL' | 'AT_LEVEL' | 'STRETCH' | null;
}

export interface AdminSnapshot {
  id: string;
  question_version_id: string;
  mode: string;
  estimate: string | null;
  facility: string | null;
  ci_low: string | null;
  ci_high: string | null;
  sample_size: number;
  confidence: 'LOW' | 'MEDIUM' | 'HIGH';
  category: 'EASY' | 'MEDIUM' | 'HARD' | null;
  status: 'PROVISIONAL' | 'CALIBRATED' | 'STALE' | 'NEEDS_REVIEW';
  source: string;
  median_time_ms: number | null;
  discrimination: string | null;
  label_mismatch: boolean;
  initial_category: 'EASY' | 'MEDIUM' | 'HARD' | null;
  calibrated_at: string | null;
}

export interface HistoryEntry {
  id: string;
  fieldChanged: string;
  oldValue: string | null;
  newValue: string | null;
  reason: string;
  actor: string;
  createdAt: string;
}

export interface Anomaly {
  id: string;
  question_version_id: string;
  type: string;
  severity: 'LOW' | 'MEDIUM' | 'HIGH';
  details: Record<string, unknown>;
  status: 'OPEN' | 'REVIEWING' | 'RESOLVED' | 'DISMISSED';
  detected_at: string;
}

export interface CalibrationCenterSummary {
  total: number;
  calibrated: number;
  provisional: number;
  stale: number;
  needs_review: number;
  insufficient_data: number;
  openAnomalies: number;
}

function authHeaders(token: string): HeadersInit {
  return { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
}

export const api = {
  async getStudentDifficulty(token: string, questionVersionId: string): Promise<StudentDifficultyResponse> {
    const res = await fetch(`${API_BASE}/student/questions/${questionVersionId}/difficulty`, {
      headers: authHeaders(token),
    });
    if (!res.ok) throw new Error(`Failed to load difficulty (${res.status})`);
    return res.json();
  },

  async getAdminDifficulty(token: string, questionVersionId: string): Promise<AdminSnapshot> {
    const res = await fetch(`${API_BASE}/admin/questions/${questionVersionId}/difficulty`, {
      headers: authHeaders(token),
    });
    if (!res.ok) throw new Error(`Failed to load difficulty (${res.status})`);
    return res.json();
  },

  async getHistory(token: string, questionVersionId: string): Promise<{ history: HistoryEntry[] }> {
    const res = await fetch(`${API_BASE}/admin/questions/${questionVersionId}/difficulty/history`, {
      headers: authHeaders(token),
    });
    if (!res.ok) throw new Error(`Failed to load history (${res.status})`);
    return res.json();
  },

  async getSummary(token: string): Promise<CalibrationCenterSummary> {
    const res = await fetch(`${API_BASE}/admin/calibration-center/summary`, { headers: authHeaders(token) });
    if (!res.ok) throw new Error(`Failed to load summary (${res.status})`);
    return res.json();
  },

  async getAnomalies(token: string, status = 'OPEN'): Promise<{ anomalies: Anomaly[] }> {
    const res = await fetch(`${API_BASE}/admin/anomalies?status=${status}`, { headers: authHeaders(token) });
    if (!res.ok) throw new Error(`Failed to load anomalies (${res.status})`);
    return res.json();
  },

  async submitReview(
    token: string,
    body: { questionVersionId: string; anomalyId: string | null; action: string; notes?: string }
  ): Promise<void> {
    const res = await fetch(`${API_BASE}/admin/anomalies/review`, {
      method: 'POST',
      headers: authHeaders(token),
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`Failed to submit review (${res.status})`);
  },

  async recalibrate(token: string, questionVersionId: string): Promise<void> {
    const res = await fetch(`${API_BASE}/admin/questions/${questionVersionId}/difficulty/recalibrate`, {
      method: 'POST',
      headers: authHeaders(token),
    });
    if (!res.ok) throw new Error(`Failed to trigger recalibration (${res.status})`);
  },
};
