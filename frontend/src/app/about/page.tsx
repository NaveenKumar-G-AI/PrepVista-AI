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

      <section style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1.5rem' }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/naveen-kumar-g-founder-prepvista-ai.jpg"
          alt="Naveen Kumar G, Founder of PrepVista AI"
          width={80}
          height={80}
          style={{ borderRadius: '1rem', objectFit: 'cover', aspectRatio: '1 / 1' }}
        />
        <div>
          <p style={{ fontWeight: 700, margin: 0 }}>Naveen Kumar G</p>
          <p style={{ margin: '0.25rem 0 0', fontSize: '0.875rem' }}>Founder, PrepVista AI</p>
          <p style={{ margin: '0.5rem 0 0', fontSize: '0.8125rem', lineHeight: 1.5 }}>
            Naveen Kumar G founded PrepVista AI on March 3, 2026, with the goal
            of building practical AI-powered tools for placement readiness,
            interview preparation, coding, aptitude, communication, and career
            development.
          </p>
          <a
            href="https://www.linkedin.com/in/naveenkumar-ai"
            target="_blank"
            rel="noopener noreferrer"
            style={{ fontSize: '0.8125rem', marginTop: '0.5rem', display: 'inline-block' }}
          >
            LinkedIn →
          </a>
        </div>
      </section>

      <section>
        <dl>
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
