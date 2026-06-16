'use client';

import dynamic from 'next/dynamic';

const SupportChatWidgetLazy = dynamic(
  () => import('@/components/SupportChatWidget').then(mod => ({ default: mod.SupportChatWidget })),
  { ssr: false },
);

export function LazySupportChat() {
  return <SupportChatWidgetLazy />;
}
