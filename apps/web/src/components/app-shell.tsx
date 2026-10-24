// The single shell every page lives inside.
//
// Layout: <header /><main>{children}</main><footer />
//
// body locks itself to exactly viewport height (h-screen + overflow-hidden in
// root layout). This component composes header + main + footer in that order.
// main is the single scroll region — non-sidebar pages scroll vertically
// inside it; sidebar layouts (Wiki, Chats) use a flex row that takes main's
// full height, sidebar stretches to fill, content has its own overflow.

import { AppHeader } from "@/components/app-header";
import { Footer } from "@/components/footer";
import { isDemoMode } from "@/lib/demo-policy";

// Only shown when the server runs in read-only public demo mode (EVIDENCEGRAPH_DEMO=1).
function DemoBanner() {
  return (
    <div role="note" className="shrink-0 border-b border-border bg-secondary/60 px-4 py-1.5 text-center text-[12px] text-muted-foreground">
      <strong className="font-medium text-foreground">Public demo.</strong> Read-only, synthetic data. Questions are answered by a
      deterministic stand-in that quotes passages. It is <strong className="font-medium text-foreground">not a language model</strong>.
      Nothing you do here is saved.
    </div>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <>
      {isDemoMode() ? <DemoBanner /> : null}
      <AppHeader demo={isDemoMode()} />
      <main id="main" className="flex flex-1 flex-col overflow-y-auto">{children}</main>
      <Footer />
    </>
  );
}
