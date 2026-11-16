/**
 * Design tokens — the one place colours, layout widths and motion are
 * defined. Tailwind reads them (tailwind.config.ts) and so does code that
 * can't use a class: SVG charts, the logo, the browser theme colour.
 *
 * Rules (docs/design-system.md):
 * - Text colours must reach 4.5:1 on white, ink-50 and ink-100. A test
 *   (__tests__/design-tokens.test.ts) checks every *Text and ink text token.
 * - `ink-300`, the bright brand fills and chart marks are for shapes, never
 *   for text.
 * - No hex values or 9–11 px text in app/ or components/ — add a token here.
 */

export const palette = {
  brand: {
    // Fills, borders and focus rings. As TEXT it is 4.27:1 on the ink-50
    // page — under WCAG AA — so text uses blueText.
    blue: "#1A73E8",
    blueHover: "#1967D2",
    blueText: "#1967D2",
    blueBg: "#E8F0FE",
    red: "#EA4335",
    redText: "#C5221F",
    // Hover for danger buttons, which fill with redText.
    redHover: "#A50E0E",
    redBg: "#FCE8E6",
    yellow: "#F9AB00",
    // Darkened from #B06000 (4.34:1 on yellowBg) to pass AA.
    yellowText: "#9A5300",
    yellowBg: "#FEF7E0",
    yellowBorder: "#FDD663",
    green: "#34A853",
    greenText: "#137333",
    greenBg: "#E6F4EA",
  },
  ink: {
    900: "#202124",
    // 800 and 600 were used in 64 places before they existed, so those
    // classes silently fell back to the inherited colour. Defined now,
    // between their neighbours.
    800: "#2E3134",
    700: "#3C4043",
    600: "#4D5156",
    500: "#5F6368",
    // The lightest grey allowed for text: 4.5:1+ on white, ink-50, ink-100
    // and every tinted background.
    400: "#676C71",
    // Decorative only (status dots, rules, de-emphasised bars) — 2.6:1, so
    // never text. This was ink-400 before ink-400 was darkened for text.
    300: "#9AA0A6",
    200: "#DADCE0",
    100: "#F1F3F4",
    50: "#F8F9FA",
  },
  /** The company navy of the Inventive site header, and its slate. */
  navy: { 900: "#001E3C", 800: "#0F172A" },
  white: "#FFFFFF",
} as const;

/** SVG chart colours, all drawn from the palette. Text roles (ink*, muted)
 *  pass AA; marks (accent, track, deemph, status) are shapes only. */
export const chart = {
  accent: palette.brand.blue,
  track: "#D2E3FC",
  deemph: palette.ink[300],
  good: palette.brand.green,
  warning: palette.brand.yellow,
  critical: palette.brand.red,
  /** Status as TEXT (e.g. "12d late"): the AA-safe shade. */
  criticalText: palette.brand.redText,
  /** An empty cell in a heat-map style grid. */
  empty: palette.ink[100],
  grid: "#ECEDEF",
  axis: "#C4C7CC",
  ink: palette.ink[900],
  ink2: palette.ink[700],
  ink3: palette.ink[500],
  // Axis labels and captions. Was #80868B (3.7:1 — under AA for text).
  muted: palette.ink[400],
  surface: palette.white,
  /** Ordered categories (e.g. overdue age), light → dark; colour-blind safe. */
  ordinal: ["#86B6EF", "#5598E7", "#2A78D6", "#1C5CAB", "#104281"],
} as const;

/** Page content widths. Wide = boards and tables, default = dashboards and
 *  lists, narrow = settings and forms. */
export const layout = {
  container: { wide: "1400px", DEFAULT: "1200px", narrow: "1100px" },
  /** Minimum width a data table keeps before it scrolls sideways. */
  table: "760px",
} as const;

/** Motion. Colour/hover changes use Tailwind's default 150 ms; things that
 *  appear use `enter`. Everything is switched off under
 *  prefers-reduced-motion (app/globals.css). */
export const motion = {
  duration: { fast: "150ms", enter: "200ms", panel: "250ms" },
  easing: { standard: "cubic-bezier(0.2, 0, 0, 1)" },
} as const;

/** The brand header gradient (login band, Inventive mark). */
export const brandNavyGradient = `linear-gradient(135deg, ${palette.navy[900]} 0%, ${palette.navy[800]} 100%)`;
