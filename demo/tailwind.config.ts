import type { Config } from "tailwindcss";
import { layout, motion, palette } from "./lib/design-tokens";

export default {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      // Every value comes from lib/design-tokens.ts — see
      // docs/design-system.md for what each one is for.
      colors: {
        brand: palette.brand,
        ink: palette.ink,
        navy: palette.navy,
      },
      maxWidth: {
        container: layout.container.DEFAULT,
        "container-wide": layout.container.wide,
        "container-narrow": layout.container.narrow,
      },
      minWidth: {
        table: layout.table,
      },
      letterSpacing: {
        // Small uppercase labels over brand bands.
        eyebrow: "0.18em",
      },
      transitionDuration: {
        enter: motion.duration.enter,
        panel: motion.duration.panel,
      },
      transitionTimingFunction: {
        standard: motion.easing.standard,
      },
      keyframes: {
        "fade-in": { from: { opacity: "0" }, to: { opacity: "1" } },
        "rise-in": {
          from: { opacity: "0", transform: "translateY(8px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        "slide-in-left": {
          from: { transform: "translateX(-100%)" },
          to: { transform: "translateX(0)" },
        },
      },
      animation: {
        "fade-in": `fade-in ${motion.duration.enter} ${motion.easing.standard}`,
        "rise-in": `rise-in ${motion.duration.enter} ${motion.easing.standard}`,
        "slide-in-left": `slide-in-left ${motion.duration.panel} ${motion.easing.standard}`,
      },
      fontFamily: {
        heading: ["var(--font-heading)", "system-ui", "sans-serif"],
        sans: ["var(--font-body)", "system-ui", "sans-serif"],
      },
      borderRadius: {
        card: "8px",
        pill: "20px",
      },
      boxShadow: {
        card: "0 1px 2px rgba(60,64,67,0.06), 0 1px 3px rgba(60,64,67,0.08)",
      },
    },
  },
  plugins: [],
} satisfies Config;
