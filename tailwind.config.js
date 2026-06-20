/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      fontFamily: {
        mono: ['var(--font-mono)', 'Courier New', 'monospace'],
      },
      colors: {
        ink: '#0d0d1a',
        accent: '#e94560',
        teal: '#4ecca3',
        gold: '#f5a623',
        purple: '#7F77DD',
        dim: '#54577a',
        soft: '#a8a9b4',
      }
    },
  },
  plugins: [],
}
