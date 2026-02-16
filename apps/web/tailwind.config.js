/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './src/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        'safe-green': '#00C853',
        'safe-red': '#FF1744',
        'safe-yellow': '#FFD600',
        'safe-blue': '#2979FF',
        'safe-dark': '#0A0E17',
        'safe-card': '#111827',
      },
    },
  },
  plugins: [],
};
