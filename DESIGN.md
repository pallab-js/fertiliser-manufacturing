---
version: 1.0
name: Fertilizer MSME Manager — Design System
description: Dark-only B2B design system for a fertilizer manufacturing MSME unit. Deep-indigo canvas, Blurple primary, a single high-intent green CTA, Hanken Grotsesk (display) + Inter (body), radius-xl panels, hairline dividers, no decorative shadows.
---

# DESIGN.md — Fertilizer MSME Manager Design System

**Source of truth** for the application chrome. `docs/ui-ux-guide.md` translates these tokens into Tailwind 4. If anything here contradicts `docs/ui-ux-guide.md`, this file wins. Never invent off-token styles, never add a fourth loud accent, never flatten the canvas.

## 1. Theme stance

**Dark-only v1.** The app lives on the deep-indigo canvas (`#0a0d3a`) end to end. No light mode in v1 (a light mode is a future extension via polarity-flip, not a v1 requirement).

## 2. Colors

| Token | Hex | Use |
|-------|-----|-----|
| `--color-primary` | `#5865f2` | Blurple — primary actions, active indicators, brand, main chart series |
| `--color-on-primary` | `#ffffff` | Text on primary |
| `--color-green` | `#35ed7e` | **One** highest-intent action per screen only (e.g. Save batch, Issue invoice). Never decorative. |
| `--color-magenta` | `#ec48bd` | Accents, badges, gradient panels, error states, field errors |
| `--color-link` | `#00b0f4` | Inline links on dark, focus ring |
| `--color-canvas` | `#0a0d3a` | Page base |
| `--color-surface-indigo` | `#1e2353` | Raised cards, table headers, ghost buttons, hover rows |
| `--color-surface-onyx` | `#23272a` | Dividers, hairlines, QC-pass chip |
| `--color-surface-black` | `#000000` | Showcase bands (not used in v1 app chrome) |
| `--color-ink` | `#ffffff` | Dominant text |
| `--color-ink-dark` | `#000000` | Text on light fills (green/white buttons) |
| `--color-muted` | `#333333` | Secondary text on light surfaces only (avoid on canvas) |
| `--color-hairline` | `#23272a` | 1px borders |

## 3. Typography

Type families (open-source substitutes, via `next/font`):
- Display: Hanken Grotesk (≈ ABC Ginto Nord) — headlines, 700–800, frequently uppercase, tracked tight.
- Body/UI: Inter (≈ ggsans) — 16/400, line-height 1.5.

| Token | Size | Weight | Line height | Use |
|-------|------|--------|-------------|-----|
| display-xl | 82px | 800 | 1.0 | Login brand headline |
| display-lg | 62px | 800 | 1.05 | — |
| display-md | 56px | 700 | 1.05 | Empty-state big number |
| heading-lg | 48px | 700 | 1.1 | Page hero heading |
| heading-sm | 22px | 700 | 1.2 | Card / section titles |
| body-lg | 20px | 500 | 1.4 | Lead paragraph |
| link-lg | 18px | 500 | 1.4 | Big button labels |
| body | 16px | 400 | 1.5 | Default body copy |
| link-sm | 14px | 500 | 1.4 | Table headers, badges, fine print |

Dramatic weight jumps only (800 → 400) — no timid mid-weights on headings.

## 4. Radii (rounded scale)

| Token | Value | Use |
|-------|-------|-----|
| xs | 6px | Small ghost buttons, compact chips |
| sm | 12px | Primary / green CTA buttons, inputs |
| md | 14px | Mid controls, nav rows |
| lg | 16px | White/ghost buttons, cards, media frames |
| xl | 40px | Panels, stat cards, empty states, modal |
| pill | 50px | Badges, avatar chips |
| full | 9999px | Circular avatars |

Nothing is square. No sharp corners on panels/media.

## 5. Spacing

8px base grid. card padding 32px (xxl); section gaps 40px; button padding sm–lg vertical by xl horizontal.

## 6. Depth & elevation

No drop shadows as depth. Separation by colour field + large radius. One permitted lift (modals, toasts): `0 3px 68px rgba(69,42,124,0.1)` (violet-tinted diffuse). Depth comes from colour, radius, and the signature gradient mesh on login + dashboard header — never behind tables.

## 7. Component recipes

### Buttons
| Class | Spec |
|-------|------|
| `.btn-primary` | bg primary, text on-primary, 18/500, radius-sm, pad 20/24 |
| `.btn-green` | bg green, text ink-dark, 18/500, radius-sm, pad 12/24 — **one per screen, highest-intent only** |
| `.btn-white` | bg ink, text ink-dark, 16/500, radius-lg, pad 8/16 — modal confirmations |
| `.btn-ghost` | bg surface-indigo, text ink, 16/500, radius-lg, pad 16 — secondary actions |
| `.btn-ghost-sm` | bg surface-indigo, text ink, 14/500, radius-xs, pad 12/32 — table row actions |

Touch targets ≥ 44px. Hover `filter: brightness(1.12)`, pressed `brightness(0.92)`. Focus-visible: 2px link-cyan ring.

### Surfaces
| Surface | Recipe |
|---------|--------|
| `.panel` | bg surface-indigo, text ink, radius-xl, pad 32 — default card |
| `.panel-flat` | bg canvas, hairline border, radius-lg — table wrapper |
| `.panel-gradient` | magenta→primary→violet gradient, radius-xl, pad 40 — dashboard hero band + login accent |
| `.stat-card` | bg primary, text ink, number at display-md, radius-xl, pad 32 — standard KPI; magenta gradient variant for a single hero KPI |
| `.badge` | bg magenta, text ink, 14/500, radius-lg, pad 4/12 — status chips |

### Forms
- Input: bg surface-indigo, text ink, placeholder ink/45, radius-sm, pad 12/16, hairline border; focus = primary border + link ring.
- Label: link-sm (14/500) above, ink/80.
- Field error: magenta 14px below field; input border turns magenta.

### Data table
- Header: bg surface-indigo, text 14/500 uppercase, pad 12/16.
- Body: bg canvas, text 16/400, pad 12/16, bottom border hairline; hover row surface-indigo/50.
- Numeric columns right-aligned, tabular-nums.

### Modal
Canvas fill, radius-lg, pad 24, level-1 shadow, backdrop `rgba(10,13,58,0.7)` blur. Title heading-sm; actions right-aligned: ghost cancel + white confirm (green only when confirm is the screen's single highest-intent action). Focus-trapped; Esc closes; focus returns to trigger on close.

### Toast
Canvas, radius-lg, pad 12/16, body type, level-1 shadow, bottom-right. Success: link-cyan dot; error: magenta dot. Auto-dismiss 4s.

### Empty state
Canvas frame, radius-xl, pad 40, centered: display-md icon/number in surface-indigo circle, body caption naming the first action, primary button to create the first record.

### Skeleton (loading)
surface-indigo block, radius-sm, slow pulse. Used while data loads; never spinners.

## 8. Charts (dashboard)

- Plot on canvas/surface-indigo cards.
- Series colours, fixed order: primary → magenta → link → green → surface-onyx. Blurple owns the main series; magenta for comparison/target; link cyan for secondary; green only for achieved/on-target semantics.
- Grid lines hairline; axis text ink/60 at 14px; tooltip surface-indigo radius-lg hairline border.
- No 3D, no rainbow palettes. Chart data also available as visually-hidden table fallback.

## 9. Layout & rhythm

- 8px base grid; max-width content column 1200px; pad 24.
- Sidebar: canvas, right hairline border; brand block top (Hanken 800, uppercase); nav rows radius-md pad 12/16; active state = primary 3px left bar + surface-indigo fill. Admin groups hidden from operators (server enforces regardless).
- Topbar: canvas, page title heading-sm, user chip + sign-out.
- Responsive: sidebar → hamburger drawer < 1024px; touch targets ≥ 44px.

## 10. States (every screen)

1. **Loading**: skeleton blocks on surface-indigo (no spinners).
2. **Empty**: empty-state recipe naming the first action.
3. **Error**: magenta-bordered panel with retry (ghost button); never blank.
4. **Success**: toast + optimistic list update via revalidate.
5. **Permission denied**: empty-state with lock icon, "Ask the admin for access."

## 11. Accessibility

- Contrast: white on canvas/primary passes AA; ink-dark on green/white passes AA — never ink on green, never muted on canvas.
- Focus-visible link-cyan ring on all interactive elements; full keyboard operability; modal focus trap; ≥44px touch targets; labelled inputs.
- `html { color-scheme: dark; }`, `@media print` strips `.no-print`, body → white/black.

## 12. Do / Don't

**Do:** canvas everywhere; Blurple for actions/active states; one green CTA per screen; uppercase/bold display on empty states + login; radius-xl on panels; hairline dividers; gradient mesh on login + dashboard header.

**Don't:** grey/white surfaces; square corners; shadows-as-depth; green as decoration; magenta body text; headline mid-weights; rainbow charts; gradient behind tables; inventing colours or radii outside this file.
