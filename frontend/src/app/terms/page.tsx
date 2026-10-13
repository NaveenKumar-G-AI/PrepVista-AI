import type { Metadata } from 'next';
import { LegalDocumentPage } from '@/components/legal-document-page';
import { TERMS_TEXT } from '@/lib/legal-content';

export const metadata: Metadata = {
  title: 'Terms & Conditions | PrepVista AI',
  description:
    'Terms and Conditions for the PrepVista AI platform, covering subscriptions, acceptable use, platform boundaries, and service terms.',
  alternates: {
    canonical: 'https://prepvistaai.com/terms',
  },
};

export default function TermsPage() {
  return <LegalDocumentPage title="Terms of Service" content={TERMS_TEXT} />;
}
