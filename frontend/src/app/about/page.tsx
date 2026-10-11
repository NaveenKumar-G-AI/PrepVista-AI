import type { Metadata } from 'next';
import { LegalDocumentPage } from '@/components/legal-document-page';

export const metadata: Metadata = {
  title: 'About PrepVista AI | AI-Powered Placement Readiness',
  description:
    'About PrepVista AI, an AI-powered placement-readiness platform founded by Naveen Kumar G on March 3, 2026 in India.',
  alternates: {
    canonical: 'https://prepvistaai.com/about',
  },
};

const ABOUT_TEXT = `# About PrepVista AI

PrepVista AI is an AI-powered placement-readiness platform founded on March 3, 2026 in India. PrepVista AI is an Udyam-registered MSME in India.

We help college students, freshers, and early-career candidates prepare for placements through personalized interview practice, coding guidance, aptitude preparation, communication development, assessment feedback, and career-readiness workflows.

Our goal is to help candidates identify skill gaps, practice effectively, and improve job readiness through practical AI-assisted learning and feedback.

**Founder:** [Naveen Kumar G](https://www.linkedin.com/in/naveenkumar-ai/)
**Founded:** March 3, 2026
**Entity:** Udyam-registered MSME in India
**Location:** Dindigul, Tamil Nadu, India
**Website:** https://prepvistaai.com
**Contact:** founder@prepvistaai.com
**Official Company Information:** [Company Information](/company)`;

export default function AboutPage() {
  return <LegalDocumentPage content={ABOUT_TEXT} />;
}
