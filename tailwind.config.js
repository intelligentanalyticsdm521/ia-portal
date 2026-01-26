/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        iadm: {
          orange: '#ef6c33',
          darkBlue: '#0c4a60',
          lightBlue: '#abdff1',
          lightGray: '#e1dddb',
          background: '#ffffff'
        }
      },
      boxShadow: {
        // Subtle platform-style elevation for panels/cards
        panel: '0 1px 2px rgba(0,0,0,0.06), 0 8px 24px rgba(0,0,0,0.06)'
      }
    }
  },
  plugins: []
};
