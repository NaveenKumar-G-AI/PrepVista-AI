import type { Metadata } from 'next';
import { LegalDocumentPage } from '@/components/legal-document-page';
import { PRIVACY_POLICY_TEXT } from '@/lib/legal-content';

export const metadata: Metadata = {
  title: 'Privacy Policy | PrepVista AI',
  description:
    'Privacy Policy for PrepVista AI. Learn how we collect, handle, protect, and process user data in accordance with applicable laws.',
  alternates: {
    canonical: 'https://prepvistaai.com/privacy',
  },
};

export default function PrivacyPage() {
  return <LegalDocumentPage title="Privacy Policy" content={PRIVACY_POLICY_TEXT} />;
}
