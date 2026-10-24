import type { Metadata } from "next";
import { Crimson_Pro, Fraunces, Inter, JetBrains_Mono } from "next/font/google";

import { AppShell } from "@/components/app-shell";
import { CommandPalette } from "@/components/command-palette";
import { THEME_INIT_SCRIPT, ThemeProvider } from "@/components/theme-provider";

import "./globals.css";

// Loaded via next/font so they're hashed, preloaded, and CLS-free. The CSS
// vars below get bound to Tailwind's font-sans / font-serif / font-display /
// font-mono in tailwind.config.ts.
const fontSans = Inter({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
});
const fontSerif = Crimson_Pro({
  subsets: ["latin"],
  variable: "--font-serif",
  display: "swap",
  weight: ["400", "500", "600"],
});
const fontDisplay = Fraunces({
  subsets: ["latin"],
  variable: "--font-display",
  display: "swap",
  weight: ["500", "600", "700"],
});
const fontMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "EvidenceGraph AI — Research You Can Verify",
    template: "%s · EvidenceGraph AI",
  },
  description:
    "Evidence-first AI research workspace: ask questions of your sources, inspect the evidence behind every claim, and review where sources disagree.",
  applicationName: "EvidenceGraph AI",
  authors: [{ name: "Shivam Jani", url: "https://github.com/Chico2118" }],
  icons: { icon: "/favicon.svg" },
  openGraph: {
    title: "EvidenceGraph AI — Research You Can Verify",
    description:
      "Evidence-first AI research workspace with claim-level citations, citation-integrity checks, and a contradiction explorer.",
    type: "website",
  },
};

// The shell reads server state on every request (active wiki, and whether this is the read-only public demo),
// so no page may be frozen at build time: a statically built page would bake in the build machine's settings.
export const dynamic = "force-dynamic";

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${fontSans.variable} ${fontSerif.variable} ${fontDisplay.variable} ${fontMono.variable}`}
    >
      <head>
        {/* Runs before hydration to avoid a light->dark flash on first paint. */}
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body className="flex h-screen flex-col overflow-hidden">
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-50 focus:rounded-md focus:bg-primary focus:px-3 focus:py-2 focus:text-primary-foreground"
        >
          Skip to content
        </a>
        <ThemeProvider>
          <AppShell>{children}</AppShell>
          <CommandPalette />
        </ThemeProvider>
      </body>
    </html>
  );
}
