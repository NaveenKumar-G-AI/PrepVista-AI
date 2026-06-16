import { LegalDocumentPage } from '@/components/legal-document-page';
import { TERMS_TEXT } from '@/lib/legal-content';

export const metadata = { title: 'Terms & Conditions - PrepVista' };

export default function TermsPage() {
  return <LegalDocumentPage content={TERMS_TEXT} />;
}
