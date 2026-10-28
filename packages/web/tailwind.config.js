/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
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
