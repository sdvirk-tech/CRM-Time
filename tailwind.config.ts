import type { Config } from "tailwindcss";

const calibri = ["Calibri", "Carlito", "Segoe UI", "sans-serif"];

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        paper: "#12151a",
        ink: "#e8edf2",
        muted: "#8b949e",
        line: "#2a313a",
        slot: "#1a1f26",
        pine: "#6ea0ff",
        urgent: "#be123c",
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
