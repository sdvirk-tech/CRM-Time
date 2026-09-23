import type { Config } from "tailwindcss";

const calibri = ["Calibri", "Carlito", "Segoe UI", "sans-serif"];

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        paper: "#F2F2F2",
        accent: "#99CCFF",
        mist: "#C5E2FF",
        ok: "#DAF2D0",
        ink: "#1a1a1a",
        urgent: "#be123c",
        muted: "color-mix(in srgb, #1a1a1a 58%, #F2F2F2)",
        line: "color-mix(in srgb, #1a1a1a 16%, #F2F2F2)",
        slot: "#F2F2F2",
        pine: "#99CCFF",
      },
      fontFamily: {
        sans: calibri,
        serif: calibri,
      },
      borderRadius: {
        xl: "6px",
        "2xl": "8px",
      },
    },
  },
  plugins: [],
};

export default config;
