import { notFound } from 'next/navigation';
import { challenges } from '@/modules/coding/lib/challenges';
import { CodingWorkspace } from '@/modules/coding/workspace';

export default async function CodingProblem({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const challenge = challenges.find(item => item.challengeId === id);
  if (!challenge) notFound();
  return <CodingWorkspace key={id} challenge={challenge} />;
}
