import { LegalDocumentPage } from '@/components/legal-document-page';
import { PRIVACY_POLICY_TEXT } from '@/lib/legal-content';

export const metadata = { title: 'Privacy Policy - PrepVista' };

export default function PrivacyPage() {
  return <LegalDocumentPage content={PRIVACY_POLICY_TEXT} />;
}
