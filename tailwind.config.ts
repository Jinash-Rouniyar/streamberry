import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        brand: "#e50914",
        surface: "#141414",
      },
    },
  },
  plugins: [],
};

export default config;
