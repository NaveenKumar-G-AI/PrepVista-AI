import type { Metadata } from 'next';
import Link from 'next/link';
import { LegalDocumentPage } from '@/components/legal-document-page';

export const metadata: Metadata = {
  title: 'About PrepVista AI | AI-Powered Placement Readiness',
  description:
    'About PrepVista AI, an AI-powered placement-readiness platform founded by Naveen Kumar G on March 3, 2026 in India.',
  alternates: {
    canonical: 'https://prepvistaai.com/about',
  },
};

export default function AboutPage() {
  return (
    <LegalDocumentPage title="About PrepVista AI">
      <p>
        PrepVista AI is an AI-powered placement-readiness platform founded on
        March 3, 2026 in India. PrepVista AI is an Udyam-registered MSME in
        India.
      </p>

      <p>
        We help college students, freshers, and early-career candidates prepare
        for placements through personalized interview practice, coding guidance,
        aptitude preparation, communication development, assessment feedback,
        and career-readiness workflows.
      </p>

      <p>
        Our goal is to help candidates identify skill gaps, practice
        effectively, and improve job readiness through practical AI-assisted
        learning and feedback.
      </p>

      <section>
        <dl>
          <div>
            <dt>Founder</dt>
            <dd>
              <a
                href="https://www.linkedin.com/in/naveenkumar-ai/"
                target="_blank"
                rel="noopener noreferrer"
              >
                Naveen Kumar G
              </a>
            </dd>
          </div>

          <div>
            <dt>Founded</dt>
            <dd>March 3, 2026</dd>
          </div>

          <div>
            <dt>Entity</dt>
            <dd>Udyam-registered MSME in India</dd>
          </div>

          <div>
            <dt>Location</dt>
            <dd>Dindigul, Tamil Nadu, India</dd>
          </div>

          <div>
            <dt>Website</dt>
            <dd>
              <a href="https://prepvistaai.com">https://prepvistaai.com</a>
            </dd>
          </div>

          <div>
            <dt>Contact</dt>
            <dd>
              <a href="mailto:founder@prepvistaai.com">
                founder@prepvistaai.com
              </a>
            </dd>
          </div>

          <div>
            <dt>Official Company Information</dt>
            <dd>
              <Link href="/company">Company Information</Link>
            </dd>
          </div>
        </dl>
      </section>
    </LegalDocumentPage>
  );
}
