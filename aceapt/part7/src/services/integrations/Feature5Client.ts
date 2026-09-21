import { env, usingMockFeature5 } from '../../config/env';
import { StudentAction } from '../../types';

export interface Feature5Session {
  session_ref: string;
  launch_url: string;
}

/**
 * Integration point into Feature 5 (Adaptive Practice) — see PLAN §35, the
 * "Feature 5 / 6" box beneath the orchestration layer. Feature 7 never runs
 * practice sessions itself; it dispatches to Feature 5 and waits for a
 * result.
 *
 * When FEATURE5_API_URL is left blank (see .env.example), a local mock
 * session stands in so the full understand → decide → act loop can still be
 * demoed end-to-end. Point FEATURE5_API_URL / FEATURE5_API_KEY at the real
 * service when it's ready — nothing else in Feature 7 needs to change.
 */
export class Feature5Client {
  static async dispatch(action: StudentAction): Promise<Feature5Session> {
    if (usingMockFeature5) {
      return {
        session_ref: `mock-f5-${action.id}`,
        launch_url: `#feature5-session/${action.action_type.toLowerCase()}/${action.target_skill}`,
      };
    }

    const res = await fetch(`${env.feature5.apiUrl}/sessions`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${env.feature5.apiKey}`,
      },
      body: JSON.stringify({
        student_id: action.student_id,
        action_type: action.action_type,
        target_skill: action.target_skill,
        duration_minutes: action.duration_minutes,
      }),
    });
    if (!res.ok) throw new Error(`Feature 5 dispatch failed: ${res.status}`);
    return (await res.json()) as Feature5Session;
  }
}
