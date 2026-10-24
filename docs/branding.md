# Branding

EvidenceGraph AI — *Research You Can Verify.* The identity is intentionally quiet so that evidence status (valid / unavailable / invalid) is the loudest thing on screen.

## Files

| File | Use |
|---|---|
| [`apps/web/public/logo.svg`](../apps/web/public/logo.svg) | Horizontal logo (mark + wordmark) |
| [`apps/web/public/logo-hero.svg`](../apps/web/public/logo-hero.svg) | Stacked logo with tagline — README header, social preview |
| [`apps/web/public/favicon.svg`](../apps/web/public/favicon.svg) | The mark alone — tab icon |
| [`apps/web/src/components/brand-mark.tsx`](../apps/web/src/components/brand-mark.tsx) | The mark as an inline component that follows theme colors |

All four are original artwork for this project. The mark is a small graph of three linked nodes with a check on the top node — a claim that resolves to evidence. It replaces the inherited `[[` wordmark.

## Color

One brand hue (indigo) on cool slate neutrals. Status colors are reserved for evidence state so the brand color never competes with a verdict.

| Token | Light | Dark | Use |
|---|---|---|---|
| `--primary` | `#4338ca` | `#818cf8` | Links, primary actions, active nav |
| `--background` | `#f8fafc` | `#0b1020` | Page |
| `--foreground` | `#0f172a` | `#f1f5f9` | Text |
| `--ok` / `--ok-soft` | emerald | emerald | Valid citation, processed |
| `--warn` / `--warn-soft` | amber | amber | Evidence unavailable, unreviewed, caution |
| `--bad` / `--bad-soft` | red | red | Invalid citation, no evidence |

Contrast was computed for the text/background pairs the UI uses (foreground, muted text, primary, button, and each status badge, in both themes): the lowest ratio is 5.9:1, against the 4.5:1 WCAG AA threshold for body text. Status is never conveyed by color alone: every status carries a text label, and the citation and claim badges add an icon.

## Type

| Role | Family |
|---|---|
| Headings, wordmark | Fraunces |
| Reading text (answers, passages) | Crimson Pro |
| UI | Inter |
| Code | JetBrains Mono |

Tokens live in [`apps/web/src/app/globals.css`](../apps/web/src/app/globals.css) and `tailwind.config.ts`.
