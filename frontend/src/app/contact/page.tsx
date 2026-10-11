import type { Metadata } from 'next';
import { LegalDocumentPage } from '@/components/legal-document-page';

export const metadata: Metadata = {
  title: 'Contact | PrepVista AI',
  description:
    'Contact PrepVista AI. Official company contact information for inquiries, partnerships, and support.',
  alternates: {
    canonical: 'https://prepvistaai.com/contact',
  },
};

const CONTACT_TEXT = `# Contact PrepVista AI

For all inquiries, please contact us at:

**Email:** [founder@prepvistaai.com](mailto:founder@prepvistaai.com)

**Location:** Dindigul, Tamil Nadu, India

**LinkedIn:** [PrepVista AI](https://www.linkedin.com/company/prepvista-ai)

**Company Information:** [Official Company Details](/company)
`;

export default function ContactPage() {
  return <LegalDocumentPage content={CONTACT_TEXT} />;
}
