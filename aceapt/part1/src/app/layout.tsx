import type { Metadata, Viewport } from "next";
import "./globals.css";

// NOTE ON FONTS
// We deliberately load fonts via classic <link> tags rather than `next/font/google`.
// `next/font/google` fetches font files at *build time*, which requires outbound access to
// fonts.googleapis.com. That's a reasonable requirement for a real deployment, but it means the
// build cannot be verified in network-restricted environments. If your build environment has
// normal internet access, feel free to switch to `next/font/google` for the self-hosted,
// zero-runtime-request version — the CSS variable names (--font-display/--font-body/--font-mono)
// are already wired through tailwind.config.ts, so the swap is a drop-in change in this file only.

export const metadata: Metadata = {
  title: "ACEAPT AI — Let's build your aptitude journey",
  description:
    "ACEAPT understands where you are, where you want to go, and how much time you have before creating your preparation path.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#0b1220",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Newsreader:ital,wght@0,400;0,500;0,600;1,400;1,500;1,600&family=IBM+Plex+Sans:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;500&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="font-body">{children}</body>
    </html>
  );
}
