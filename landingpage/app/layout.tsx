import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "PrepVista — Find the Weak Link Before the Recruiter Does",
  description:
    "Choose a career direction, enter a role-specific placement route, perform live challenges and see PrepVista turn aptitude, technical, communication and interview evidence into one focused next move.",
  icons: {
    icon: "/prepvista.png",
    shortcut: "/prepvista.png",
  },
  other: {
    "codex-preview": "development",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#05060a",
  colorScheme: "light dark",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
