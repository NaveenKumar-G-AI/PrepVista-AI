import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "CodeForge AI — Hint Ladder",
  description: "Adaptive, evidence-grounded progressive assistance for coding practice.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body style={{ margin: 0, background: "var(--hl-bg-void)", fontFamily: "var(--hl-font-ui)" }}>{children}</body>
    </html>
  );
}
