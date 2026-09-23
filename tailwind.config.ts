import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        paper: "#f3eee4",
        ink: "#1c1915",
        muted: "#6b6258",
        line: "#d9d0c3",
        slot: "#fffdf8",
        pine: "#1f6f5b",
        urgent: "#c2410c",
      },
      fontFamily: {
        sans: ["var(--font-sans)", "ui-sans-serif", "system-ui"],
        serif: ["var(--font-serif)", "ui-serif", "Georgia"],
      },
    },
  },
  plugins: [],
};

export default config;
