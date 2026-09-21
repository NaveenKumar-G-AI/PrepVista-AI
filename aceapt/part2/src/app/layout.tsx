import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "ACEAPT — Adaptive Aptitude Diagnostic",
  description: "A short adaptive diagnostic that measures where you actually stand, with evidence — not just a score.",
};

/*
  Fonts are loaded via a runtime <link>, not next/font/google, so the build
  doesn't need network access to fonts.googleapis.com — it's fetched by the
  visitor's browser instead, same as any external stylesheet.
*/
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,500..700&family=IBM+Plex+Sans:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;500&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
