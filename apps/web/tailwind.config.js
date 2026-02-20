/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './src/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        'bg-primary': 'var(--bg-primary)',
        'bg-panel-glass': 'var(--bg-panel-glass)',
        'accent-green': 'var(--accent-green)',
        'accent-red': 'var(--accent-red)',
        'accent-yellow': 'var(--accent-yellow)',
        'safe-green': '#00C853',
        'safe-red': '#FF1744',
        'safe-yellow': '#FFD600',
        'safe-blue': '#2979FF',
        'safe-dark': 'var(--bg-primary)',
        'safe-card': 'var(--bg-panel-glass)',
      },
    },
  },
  plugins: [],
};
