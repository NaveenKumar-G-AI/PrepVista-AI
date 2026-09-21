import type { Metadata } from "next";
import "@fontsource-variable/bricolage-grotesque";
import "@fontsource/ibm-plex-sans/400.css";
import "@fontsource/ibm-plex-sans/500.css";
import "@fontsource/ibm-plex-sans/600.css";
import "@fontsource/ibm-plex-mono/400.css";
import "@fontsource/ibm-plex-mono/500.css";
import "./globals.css";
import { UserProvider } from "@/lib/userContext";
import Header from "@/components/Header";

export const metadata: Metadata = {
  title: "ACEAPT — Career Execution Intelligence",
  description: "The one thing that matters most right now, for your career.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <UserProvider>
          <Header />
          <main className="mx-auto max-w-5xl px-4 pb-24 pt-6 sm:px-6 lg:px-8">{children}</main>
        </UserProvider>
      </body>
    </html>
  );
}
