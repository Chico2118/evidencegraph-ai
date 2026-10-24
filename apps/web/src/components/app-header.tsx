"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";

import { ThemeToggle } from "@/components/theme-toggle";
import { WikiSwitcher } from "@/components/wiki-switcher";
import { BrandMark } from "@/components/brand-mark";
import { cn } from "@/lib/utils";

// Primary destinations follow the research loop: ask → inspect → review →
// measure. Routes keep their inherited paths (/query, /sources) so existing
// bookmarks and the API surface stay stable; only the labels changed.
const PRIMARY_NAV = [
  { label: "Research", href: "/query" },
  { label: "Library", href: "/sources" },
  { label: "Wiki", href: "/wiki" },
  { label: "Graph", href: "/graph" },
  { label: "Contradictions", href: "/contradictions" },
  { label: "Evaluation", href: "/evaluation" },
] as const;

// Less frequent destinations tuck into a "More" menu so the bar stays calm.
const MORE_NAV = [
  { label: "Chats", href: "/chats" },
  { label: "Wiki health", href: "/lint" },
  { label: "Schema", href: "/schema" },
] as const;

const SETTINGS_NAV = { label: "Settings", href: "/settings" } as const;

export function AppHeader() {
  const pathname = usePathname();
  const moreMenu = useRef<HTMLDetailsElement>(null);
  const compactMenu = useRef<HTMLDetailsElement>(null);

  // The header persists across client-side navigations, so an opened <details> menu would otherwise
  // stay open on the next page and cover its content. Close both after every route change.
  useEffect(() => {
    if (moreMenu.current) moreMenu.current.open = false;
    if (compactMenu.current) compactMenu.current.open = false;
  }, [pathname]);

  const isActive = (href: string) =>
    href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);

  return (
    <header className="sticky top-0 z-30 flex h-14 shrink-0 items-center gap-5 border-b border-border/70 bg-background/90 px-4 backdrop-blur supports-[backdrop-filter]:bg-background/70 sm:px-5">
      <Link href="/" className="group flex items-center gap-2.5" aria-label="EvidenceGraph AI home">
        <BrandMark className="h-7 w-7 transition-transform group-hover:scale-105" />
        <span className="whitespace-nowrap font-display text-[17px] font-semibold tracking-tight">
          EvidenceGraph <span className="text-primary">AI</span>
        </span>
      </Link>

      {/* Active workspace chip + switcher. Full CRUD lives in Settings → Wikis. */}
      {/* The full bar needs about 1155px (logo + workspace chip + 6 links + More + Settings + theme).
          It used to switch on at `lg` (1024px) and overflowed the viewport, pushing Settings and the
          theme toggle off-screen. 1160px is the first width where it fits; below it the ≡ menu is used.
          Keep the four `min-[1160px]` classes in this file in sync (see app-header.test.ts). */}
      <div className="hidden min-[1160px]:block">
        <WikiSwitcher />
      </div>

      <nav aria-label="Primary" className="hidden items-center gap-5 text-ui min-[1160px]:flex">
        {PRIMARY_NAV.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            aria-current={isActive(item.href) ? "page" : undefined}
            className={cn("nav-link", isActive(item.href) && "is-active")}
          >
            {item.label}
          </Link>
        ))}
      </nav>

      <div className="flex flex-1 items-center justify-end gap-3">
        <kbd className="hidden h-6 items-center gap-0.5 rounded-md border border-border bg-muted/60 px-1.5 font-sans text-[11px] font-medium leading-none text-muted-foreground xl:inline-flex">
          <span>⌘</span>K
        </kbd>

        <nav aria-label="Secondary" className="hidden items-center gap-4 text-ui min-[1160px]:flex">
          <details ref={moreMenu} className="relative">
            <summary className="nav-link cursor-pointer list-none whitespace-nowrap">More ▾</summary>
            <div className="absolute right-0 z-40 mt-2 w-44 overflow-hidden rounded-md border border-border bg-popover py-1 text-ui shadow-md">
              {MORE_NAV.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "block px-3 py-1.5 hover:bg-accent",
                    isActive(item.href) && "text-primary",
                  )}
                >
                  {item.label}
                </Link>
              ))}
            </div>
          </details>
          <Link
            href={SETTINGS_NAV.href}
            aria-current={isActive(SETTINGS_NAV.href) ? "page" : undefined}
            className={cn("nav-link", isActive(SETTINGS_NAV.href) && "is-active")}
          >
            {SETTINGS_NAV.label}
          </Link>
        </nav>

        <ThemeToggle />

        {/* Compact nav for tablet/phone widths. */}
        <details ref={compactMenu} className="relative min-[1160px]:hidden">
          <summary
            className="cursor-pointer list-none rounded p-1.5 text-muted-foreground hover:text-foreground"
            aria-label="Open navigation menu"
          >
            <span aria-hidden className="font-mono text-base">≡</span>
          </summary>
          <div className="absolute right-0 z-40 mt-2 w-56 overflow-hidden rounded-md border border-border bg-popover py-1 text-ui shadow-md">
            <Link
              href="/settings?tab=wikis"
              className="block border-b border-border/60 px-3 py-1.5 text-caption uppercase tracking-wider text-muted-foreground hover:bg-accent hover:text-foreground"
            >
              Manage workspaces →
            </Link>
            {[...PRIMARY_NAV, ...MORE_NAV, SETTINGS_NAV].map((item) => (
              <Link
                key={item.href}
                href={item.href}
                aria-current={isActive(item.href) ? "page" : undefined}
                className={cn(
                  "block px-3 py-2 hover:bg-accent",
                  isActive(item.href) && "text-primary",
                )}
              >
                {item.label}
              </Link>
            ))}
          </div>
        </details>
      </div>
    </header>
  );
}
