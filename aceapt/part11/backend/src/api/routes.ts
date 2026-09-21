import { Router } from 'express';
import * as behaviorController from './controllers/behaviorController';
import * as eventsController from './controllers/eventsController';
import * as plannerController from './controllers/samplePlannerController';
import { requireStudentAccess } from './middleware/auth';

export const router = Router();

// --- Feature 11 public surface (section 41) ---
router.get('/student/:id/behavior-profile', requireStudentAccess, behaviorController.getBehaviorProfile);
router.get('/student/:id/behavior-signals', requireStudentAccess, behaviorController.getBehaviorSignals);
router.get('/student/:id/behavior-summary', requireStudentAccess, behaviorController.getBehaviorSummary);
router.get('/student/:id/behavior-history', requireStudentAccess, behaviorController.getBehaviorHistory);
router.post('/student/:id/behavior/context', requireStudentAccess, eventsController.postStudentContext);
router.get('/student/:id/adaptive-signals', requireStudentAccess, behaviorController.getAdaptiveSignals);

// --- Event ingestion ---
// Not explicitly listed in section 41's "conceptual" endpoint list, but
// required infrastructure for the API to be usable at all - Feature 11
// has nothing to analyze without a way to receive events. See README.
router.post('/events', eventsController.postEvent);
router.post('/events/batch', eventsController.postEventBatch);

// --- Demo-only reference Feature 7 stand-in ---
// See src/sample-adaptive-planner/planAdapter.ts for why this is kept
// separate from, and outside, Feature 11's own API surface above.
router.get('/student/:id/sample-plan-change-explanation', requireStudentAccess, plannerController.getSamplePlanChange);
