import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        hale: { 50: "#f5faf9", 100: "#e8f3f1", 700: "#246d63", 900: "#163b38" },
      },
    },
  },
  plugins: [],
};

export default config;
