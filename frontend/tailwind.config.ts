import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        'board-light': '#f0d9b5',
        'board-dark': '#b58863',
        'board-highlight': '#cdd26a',
      },
      animation: {
        'pulse-fast': 'pulse 0.5s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'shake': 'shake 0.3s ease-in-out',
        'tubelight-top': 'tubelightTop 1s ease-in-out 2',
      },
      keyframes: {
        shake: {
          '0%, 100%': { transform: 'translateX(0)' },
          '25%': { transform: 'translateX(-4px)' },
          '75%': { transform: 'translateX(4px)' },
        },
        tubelightTop: {
          '0%, 100%': {
            opacity: '0.3', 
            boxShadow: '0 -2px 15px 0px rgba(168, 85, 247, 0.1), inset 0 2px 10px 0px rgba(168, 85, 247, 0.1)'
          },
          '50%': { 
            opacity: '1',
            boxShadow: '0 -8px 25px 6px rgba(168, 85, 247, 0.9), inset 0 3px 12px 1px rgba(168, 85, 247, 0.6)'
          },
        },
      },
    },
  },
  plugins: [],
};
export default config;
