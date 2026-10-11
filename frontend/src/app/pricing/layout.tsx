import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Pricing | PrepVista AI',
  description:
    'Explore PrepVista AI pricing plans for AI-powered interview practice, coding, aptitude preparation, and placement readiness.',
  alternates: {
    canonical: 'https://prepvistaai.com/pricing',
  },
};

export default function PricingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
