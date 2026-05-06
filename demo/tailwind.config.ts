import type { Config } from "tailwindcss";

export default {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        brand: {
          blue: "#1A73E8",
          blueHover: "#1967D2",
          blueBg: "#E8F0FE",
          red: "#EA4335",
          redText: "#C5221F",
          redBg: "#FCE8E6",
          yellow: "#F9AB00",
          yellowText: "#B06000",
          yellowBg: "#FEF7E0",
          yellowBorder: "#FDD663",
          green: "#34A853",
          greenText: "#137333",
          greenBg: "#E6F4EA",
        },
        ink: {
          900: "#202124",
          700: "#3C4043",
          500: "#5F6368",
          400: "#9AA0A6",
          200: "#DADCE0",
          100: "#F1F3F4",
          50: "#F8F9FA",
        },
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
