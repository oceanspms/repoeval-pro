# Design Brief

**Purpose**: Deterministic GitHub repo evaluation for hiring. Precision, clarity, credibility without decoration.

**Aesthetic**: Utilitarian minimalism. High information density. Slate-based neutrals with teal accent. Dark mode optimized.

**Typography**: Space Grotesk (display, geometric/modern), Satoshi (body, approachable), JetBrains Mono (metrics/code).

**Differentiation**: Metric scorecard ribbon. Every pixel earns its place. No gradients or unnecessary shadows.

## Palette

| Token | Light | Dark |
|-------|-------|------|
| background | 0.96 0.01 280 | 0.12 0.02 250 |
| foreground | 0.12 0.02 250 | 0.94 0.01 280 |
| card | 1.0 0 0 | 0.16 0.02 250 |
| primary | 0.48 0.15 262 | 0.72 0.16 185 |
| accent (teal) | 0.58 0.18 185 | 0.68 0.2 185 |
| destructive (red) | 0.56 0.24 25 | 0.64 0.24 25 |
| border | 0.92 0.01 280 | 0.25 0.02 250 |
| muted | 0.88 0.01 280 | 0.2 0.02 250 |

## Structural Zones

| Zone | Treatment | Purpose |
|------|-----------|---------|
| Header | bg-card, border-b-border | Title, mode toggle, navigation |
| Main Form | bg-background, centered container | Input fields, submit button |
| Results | bg-background, metric ribbon | 7-card scorecard display |
| Lists | bg-card, compact bullets | Missing items, red flags |
| Footer | bg-card, border-t-border | Minimal links only |

## Component Patterns

- **Score Cards**: `.score-card` — compact flex container, monospace value, uppercase label
- **Input Fields**: `.input-field` — full-width, teal focus ring, no outline
- **Buttons**: `.btn-primary` — teal accent, hover state, smooth transition
- **Metric Ribbon**: `.metric-ribbon` — horizontal scrollable, gap-2, py-2
- **Red Flags**: `.red-flag` — destructive color, high contrast

## Spacing & Rhythm

- Base unit: 0.5rem (4px)
- Container padding: 2rem (32px)
- Card padding: 0.75rem (12px)
- Gap between cards: 0.5rem (8px)
- Vertical rhythm: 1rem (16px)

## Motion

- Transition default: `transition-smooth` (0.3s cubic-bezier)
- No animations on load; focus ring changes are instant
- Hover states only on interactive elements

## Typography Scale

- Heading (XL): 28px, 600 weight (Space Grotesk)
- Heading (L): 20px, 600 weight (Space Grotesk)
- Body: 14px, 400 weight (Satoshi)
- Label: 12px, 500 weight (Satoshi), uppercase
- Metric: 20px, 700 weight (JetBrains Mono)

## Constraints

- Max color count: 5 (background, foreground, accent, primary, destructive)
- No gradients, no glows, no ambient blur
- Shadows only on hover states (subtle)
- Rounding: 0.5rem max (8px)
- Form fields align to grid, no arbitrary sizes
