import { ArtifactView } from '@/modules/coding/artifact-view';
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <ArtifactView id={id} />;
}
