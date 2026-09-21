import type { Metadata } from "next";
import { WorkspaceProvider } from '@/lib/state';
import { Shell } from '@/components/shell';
import "./globals.css";

export const metadata: Metadata = {
  title: "PrepVista · Coding workspace",
  description: "Learn, practise, debug and grow as a programmer with PrepVista.",
  icons: { icon: '/prepvista.png', apple: '/prepvista.png' },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" data-theme="dark" suppressHydrationWarning>
      <head><script dangerouslySetInnerHTML={{ __html: `try{document.documentElement.dataset.theme=localStorage.getItem("pv_theme")==="light"?"light":"dark"}catch{}` }} /></head>
      <body><WorkspaceProvider><Shell>{children}</Shell></WorkspaceProvider></body>
    </html>
  );
}
