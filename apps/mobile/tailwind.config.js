/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./app/**/*.{ts,tsx}', './src/**/*.{ts,tsx}'],
  presets: [require('nativewind/preset')],
  theme: {
    extend: {
      colors: {
        brick: {
          red: '#C91A09',
          yellow: '#F2CD37',
          dark: '#1B2A34',
          paper: '#F7F5F0',
        },
      },
    },
  },
  plugins: [],
};
