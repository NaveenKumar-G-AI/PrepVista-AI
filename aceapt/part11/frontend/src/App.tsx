import { LearningBehaviorPage } from './components/LearningBehaviorPage';

export function App() {
  // studentId would normally come from your auth/session context - hardcoded
  // to the demo student here since this is a standalone frontend with no
  // login flow of its own. Swap this for your real session's student id.
  return <LearningBehaviorPage studentId="demo-arjun" />;
}
