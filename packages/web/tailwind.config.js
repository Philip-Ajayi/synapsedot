const path = require('path');

/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    path.join(__dirname, "./src/**/*.{js,ts,jsx,tsx,mdx}"),
  ],
  theme: {
    extend: {
      colors: {
        portaldot: {
          dark: '#0a0b10',
          card: '#12141f',
          border: '#232738',
          evm: '#627eea',
          wasm: '#e6007a',
          cyan: '#00f2fe',
          green: '#10b981'
        }
      },
      fontFamily: {
        mono: ['Courier New', 'Courier', 'monospace']
      }
    },
  },
  plugins: [],
};