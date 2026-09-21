import { notFound } from 'next/navigation';
import { challenges } from '@/lib/challenges';
import { CodingWorkspace } from '@/components/coding-workspace';
export function generateStaticParams() { return challenges.map(c => ({ id: c.challengeId })); }
export default async function ChallengePage({ params }: { params: Promise<{ id: string }> }) { const { id } = await params; const challenge = challenges.find(c => c.challengeId === id); if (!challenge) notFound(); return <CodingWorkspace key={id} challenge={challenge}/>; }
