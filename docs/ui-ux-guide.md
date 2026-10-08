# UI/UX Design Guide: Fertilizer MSME Manager

**Date**: 2026-10-07 | **Source of truth**: [`DESIGN.md`](../DESIGN.md) (strict) | **Constitution**: Principle I — DESIGN.md Is Law

This guide translates DESIGN.md into the application chrome. If anything here contradicts
DESIGN.md, DESIGN.md wins. If a surface isn't covered, extend DESIGN.md's token system —
never invent off-token styles, never add a fourth loud accent, never flatten the canvas.

## 1. Theme stance

**Dark-only v1.** The app lives on the deep-indigo canvas (`#0a0d3a`) end to end — the
`ex-*` app-chrome examples (shell rows, tables, auth card, modal, toast) are all defined on
canvas/surface-indigo. A light mode is a future extension via DESIGN.md's polarity-flip note
(`ex-pricing-tier-featured`), not a v1 requirement.

## 2. Tokens → Tailwind 4

All tokens live as CSS variables in `@theme` in `src/app/globals.css` — the single token file.

```css
@import "tailwindcss";

@theme {
  /* Colors (DESIGN.md) */
  --color-primary: #5865f2;         /* Blurple — actions, active indicators, brand */
  --color-on-primary: #ffffff;
  --color-green: #35ed7e;           /* ONE highest-intent action per screen only */
  --color-magenta: #ec48bd;         /* accents, badges, gradient panels */
  --color-link: #00b0f4;            /* inline links on dark */
  --color-canvas: #0a0d3a;          /* page base */
  --color-surface-indigo: #1e2353;  /* raised cards, table headers, ghost buttons */
  --color-surface-onyx: #23272a;    /* dividers, hairlines */
  --color-surface-black: #000000;   /* showcase bands */
  --color-ink: #ffffff;             /* dominant text */
  --color-ink-dark: #000000;        /* text on light fills (green/white buttons) */
  --color-muted: #333333;           /* secondary text on light surfaces only */
  --color-hairline: #23272a;

  /* Radii (DESIGN.md rounded scale) */
  --radius-xs: 6px;   --radius-sm: 12px;  --radius-md: 14px;
  --radius-lg: 16px;  --radius-xl: 40px;  --radius-pill: 50px;
  --radius-jumbo: 120px;               /* --radius-full stays 9999px */

  /* Spacing: Tailwind default scale already matches 8px base;
     DESIGN.md extras as --spacing-* where needed (4/12/20/40px) */

  /* Type families */
  --font-display: "Hanken Grotesk", sans-serif;   /* = ABC Ginto Nord substitute */
  --font-body: "Inter", sans-serif;               /* = ggsans substitute */
}
```

Rules:
- Display headlines: `font-display font-extrabold (800) uppercase tracking-tight`.
- Body/UI: `font-body` 16/400, line-height 1.5. Dramatic weight jumps only (800 → 400) —
  no timid mid-weights on headings (DESIGN.md don't).
- Type scale used in-app: display-md 56 (login brand, big empty-state), heading-lg 48
  (page hero), heading-sm 22 (card/section titles), body-lg 20 (leads), link-lg 18 (big
  buttons), body 16, link-sm 14 (table headers, badges, fine print).
- Depth: **no drop shadows by default** — separation by color field + radius. The one
  permitted lift (modals, toasts): `0 3px 68px rgba(69,42,124,0.1)` (DESIGN.md level 1).
- Gradient mesh: login page + dashboard header band get the signature
  `primary → violet → magenta → canvas` animated gradient (CSS `@keyframes` background-position
  on a radial-composite). Data pages stay on flat canvas for legibility — the gradient never
  sits behind tables (legibility rule extends DESIGN.md's marketing rhythm).

## 3. Component recipes (`@layer components`)

### Buttons (exact DESIGN.md specs)

| Class | Spec |
|---|---|
| `.btn-primary` | bg primary, text on-primary, 18/500, radius-sm, pad 20/24 |
| `.btn-green` | bg green, text ink-dark, 18/500, radius-sm, pad 12/24 — **one per screen, highest-intent only** (e.g., Save batch, Get started) |
| `.btn-white` | bg ink, text ink-dark, 16/500, radius-lg, pad 8/16 — modal confirmations |
| `.btn-ghost` | bg surface-indigo, text ink, 16/500, radius-lg, pad 16 — secondary actions |
| `.btn-ghost-sm` | bg surface-indigo, text ink, 14/500, radius-xs, pad 12/32 — table row actions, filters |

Hover (DESIGN.md documents no hovers → minimal derived rule): primary/ghost hover =
`filter: brightness(1.12)`; pressed = `brightness(0.92)`. Focus-visible: 2px `--color-link`
ring everywhere (accessibility adds, never conflicts).

### App shell (`nav-bar` + `ex-app-shell-row`)

- Sidebar: bg canvas, right hairline border; brand block top (Hanken Grotesk 800, uppercase),
  nav rows below using `ex-app-shell-row`: bg canvas, radius-md, pad 12/16, icon + label
  (16/500); **active state = primary as the indicator** (3px left bar + surface-indigo fill).
  Admin-only groups (Users, Settings) hidden from operators, not just disabled.
- Topbar: bg canvas (`nav-bar`), pad 16/24 — page title (heading-sm), search, user chip +
  sign-out (ghost-sm).
- Responsive: sidebar collapses to hamburger drawer < 1024px; touch targets ≥ 44px on
  tablet (DESIGN.md touch rule). Content column max-width 1200px, pad 24.

### Cards & surfaces

| Surface | Recipe |
|---|---|
| `.panel` (default card) | `feature-card-dark`: bg surface-indigo, text ink, radius-xl, pad 32 |
| `.stat-card` (dashboard KPI) | DESIGN.md `stat-card`: bg primary, text ink, number at display-md, radius-xl, pad 32 — use Blurple for standard KPIs; magenta gradient variant for a single hero KPI; green only for "on-target" semantics in text, not fills |
| `.panel-gradient` | `feature-card-gradient`: magenta gradient, radius-xl, pad 40 — dashboard hero band + login card accent only |
| `.panel-black` | showcase band — not used in v1 app chrome |
| `.badge` | bg magenta, text ink, 14/500, radius-lg, pad 4/12 — status chips (Open, Paid, Hold) |
| Alert/flag states | low-stock: badge with green? **No** — green is CTA-only; use magenta badge + `uppercase` label "LOW"; QC fail: magenta; QC pass: ink on surface-onyx with link-colored check |

### Data table (`ex-data-table-cell`)

- Header row: bg surface-indigo, text 14/500 uppercase tracking-wide, pad 12/16, radius top.
- Body rows: bg canvas, text 16/400, pad 12/16, bottom border hairline; hover row fill
  surface-indigo at 50% (`/50`).
- Numeric columns right-aligned, tabular-nums (`font-variant-numeric: tabular-nums`).
- Wrapper: radius-lg, overflow-hidden, hairline border.
- Row actions: `.btn-ghost-sm`. Pagination: ghost-sm buttons + `link-sm` count text.
- Search/filter bar: inputs on surface-indigo, radius-sm, hairline border.

### Forms (`ex-auth-form-card` inputs)

- Input: bg surface-indigo, text ink, placeholder ink/60, radius-sm, pad 12/16, hairline
  border; focus = primary border + link ring.
- Label: link-sm (14/500) above, ink/80.
- Field error: magenta 14px below field (FR-030) — input border turns magenta.
- Card-based forms (login): `ex-auth-form-card` on canvas, radius-lg, pad 24, over the
  gradient mesh.

### Modal (`ex-modal-card`)

Canvas fill, radius-lg, pad 24, level-1 shadow, backdrop `rgba(10,13,58,0.7)` blur.
Title heading-sm; actions right-aligned: `.btn-ghost` cancel + `.btn-white` confirm
(`.btn-green` only when the confirm is the screen's single highest-intent action).

### Toast (`ex-toast`)

Canvas, radius-lg, pad 12/16, body type, level-1 shadow, bottom-right. Success: link-cyan
icon; error: magenta icon. Auto-dismiss 4s.

### Empty state (`ex-empty-state-card`)

Canvas frame, radius-xl, pad 40, centered: display-md `00` or icon in surface-indigo circle,
body caption explaining the first action, primary button to create the first record.

## 4. Charts (dashboard)

- Plot on canvas/surface-indigo cards (`stat-card` above charts where relevant).
- Series colors, fixed order: **primary → magenta → link → green → surface-onyx**; Blurple
  owns the main series (production, sales); magenta for the comparison/target series; link
  cyan for secondary lines; green only for "achieved/on-target" semantics — never decorative.
- Grid lines: hairline; axis text: ink/60 at 14px; tooltip: surface-indigo, radius-lg,
  hairline border. Bars: radius-sm tops; lines: 2.5px, dots on hover.
- No 3D, no rainbow palettes — the Blurple/green/magenta chord is the full palette.

## 5. Layout & rhythm

- 8px base grid; card pad 32 (xxl–section); section gaps 40.
- Dashboard: KPI row (4× stat-card) → charts 2-col → lists 2-col; max-width 1200.
- List pages: header (title + one primary/green action) → filter bar → table card.
- Density: comfortable (this is an office tool, not a marketing page) — but rounding and
  color keep DESIGN.md's friendliness.

## 6. States (every screen)

1. **Loading**: skeleton blocks on surface-indigo with slow pulse (no spinners).
2. **Empty**: `.panel` empty-state recipe (always names the first action).
3. **Error**: magenta-bordered panel with retry (`.btn-ghost`); never a blank page.
4. **Success**: toast (FR-031) + optimistic list update via revalidate.
5. **Permission denied**: empty-state recipe with lock icon, "Ask the admin for access."

## 7. Accessibility

- Contrast: white on canvas/primary passes AA; ink-dark on green/white passes AA — never
  place ink on green or muted on canvas.
- Focus-visible ring (`link` cyan) on all interactive elements; full keyboard operability;
  modal focus trap; ≥44px touch targets on tablet; labeled inputs; chart tooltips reachable
  via data table fallback (chart data also renders as a visually-hidden table).

## 8. Do / Don't (app edition of DESIGN.md's list)

- **Do**: canvas everywhere; Blurple for actions/active states; one green CTA per screen;
  display type uppercase/bold on empty states + login only; radius-xl on panels; hairline
  dividers; gradient mesh on login + dashboard header.
- **Don't**: grey/white surfaces, square corners, shadows-as-depth, drop-shadow-heavy cards,
  green as decoration, magenta body text, headline mid-weights, dense rainbow charts,
  gradient behind tables, inventing colors or radii outside DESIGN.md.
