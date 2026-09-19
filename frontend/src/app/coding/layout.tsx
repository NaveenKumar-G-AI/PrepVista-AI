import type { Metadata } from 'next';
import { AuthHeader } from '@/components/auth-header';
import { CodingGate } from '@/modules/coding/access';
import { WorkspaceProvider } from '@/modules/coding/lib/state';
import { CodingNavigation } from '@/modules/coding/navigation';
import { MissionContext } from '@/modules/coding/mission-context';
import '@/modules/coding/legacy.css';

export const metadata: Metadata = { title: 'Coding practice | PrepVista', robots: { index: false, follow: false } };
export default function CodingLayout({ children }: { children: React.ReactNode }) {
  return <div className="min-h-screen bg-background"><a href="#coding-workspace-content" className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:rounded-lg focus:bg-background focus:p-4 focus:underline">Skip to coding workspace</a><AuthHeader /><main id="coding-workspace-content" tabIndex={-1} className="mx-auto max-w-7xl px-4 py-8 sm:px-6"><CodingGate><CodingNavigation/><WorkspaceProvider><MissionContext/>{children}</WorkspaceProvider></CodingGate></main></div>;
}
