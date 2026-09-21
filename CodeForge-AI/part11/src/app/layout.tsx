import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "CodeForge — Incident Response",
  description: "Production incident investigation and SRE simulation",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body className="min-h-screen bg-console-bg text-console-text">{children}</body>
    </html>
  );
}
