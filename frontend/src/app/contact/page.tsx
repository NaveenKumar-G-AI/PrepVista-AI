import type { Metadata } from 'next';
import Link from 'next/link';
import { LegalDocumentPage } from '@/components/legal-document-page';

export const metadata: Metadata = {
  title: 'Contact | PrepVista AI',
  description:
    'Contact PrepVista AI. Official company contact information for inquiries, partnerships, and support.',
  alternates: {
    canonical: 'https://prepvistaai.com/contact',
  },
};

export default function ContactPage() {
  return (
    <LegalDocumentPage title="Contact PrepVista AI">
      <p>For all inquiries, please contact us at:</p>

      <section>
        <dl>
          <div>
            <dt>Email</dt>
            <dd>
              <a href="mailto:founder@prepvistaai.com">
                founder@prepvistaai.com
              </a>
            </dd>
          </div>

          <div>
            <dt>Location</dt>
            <dd>Dindigul, Tamil Nadu, India</dd>
          </div>

          <div>
            <dt>LinkedIn</dt>
            <dd>
              <a
                href="https://www.linkedin.com/company/prepvista-ai"
                target="_blank"
                rel="noopener noreferrer"
              >
                PrepVista AI
              </a>
            </dd>
          </div>

          <div>
            <dt>Company Information</dt>
            <dd>
              <Link href="/company">Official Company Details</Link>
            </dd>
          </div>
        </dl>
      </section>
    </LegalDocumentPage>
  );
}
