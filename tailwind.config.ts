import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        // Paleta dark "editor de vídeo" (inspirada em Premiere / DaVinci / CapCut)
        panel: {
          DEFAULT: "#12141a",
          light: "#1a1d26",
          lighter: "#232733",
        },
        edge: "#2c3140",
        brand: {
          DEFAULT: "#6d5efc",
          hover: "#7d70ff",
          soft: "#2a2748",
        },
        accent: "#22d3ee",
      },
      fontFamily: {
        sans: ["var(--font-inter)", "system-ui", "sans-serif"],
      },
      keyframes: {
        "pulse-soft": {
          "0%, 100%": { opacity: "1" },
          "50%": { opacity: "0.5" },
        },
      },
      animation: {
        "pulse-soft": "pulse-soft 1.6s ease-in-out infinite",
      },
    },
  },
  plugins: [],
};

export default config;
