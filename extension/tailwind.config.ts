import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./src/**/*.{ts,tsx,html}'],
  theme: {
    extend: {
      colors: {
        'sight-primary': '#6366f1',
        'sight-secondary': '#8b5cf6',
        'sight-accent': '#06b6d4',
        'sight-surface': '#1e1b4b',
        'sight-bg': '#0f0d1a',
      },
      animation: {
        'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
      },
    },
  },
  plugins: [],
};

export default config;
