import type { Config } from "tailwindcss";
import { createPreset } from "fumadocs-ui/tailwind-plugin";

const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./content/**/*.{ts,tsx,mdx}",
    "./node_modules/fumadocs-ui/dist/**/*.js",
  ],
  presets: [createPreset()],
  theme: {
    extend: {},
  },
  plugins: [],
};

export default config;
