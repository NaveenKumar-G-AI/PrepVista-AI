import Workspace from '@/modules/coding/app/interview/page';
import { ArtifactMission } from '@/modules/coding/artifact-mission';
export default async function Page({ searchParams }: { searchParams: Promise<{ artifact_id?: string }> }) {
  const { artifact_id } = await searchParams;
  return artifact_id ? <ArtifactMission id={artifact_id} mode="explain"/> : <div className="coding-surface"><Workspace /></div>;
}
