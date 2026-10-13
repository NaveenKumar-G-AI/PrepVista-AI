import type { Metadata } from 'next';

import Home from './home-client';

export const metadata: Metadata = {
  description:
    'PrepVista AI is an AI-powered placement-readiness platform for interviews, coding, aptitude, communication, assessments, and career readiness.',
};

export default function HomePage() {
  return <Home />;
}
