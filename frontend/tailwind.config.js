/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        navy: '#17324D',
        teal: '#177E89',
        'pale-blue': '#EAF3F5',
        'page-bg': '#F5F7FA',
        ink: '#263238',
        muted: '#64748B',
        line: '#DCE5E9',
      },
      boxShadow: {
        card: '0 10px 30px rgba(23, 50, 77, 0.06)',
      },
    },
  },
  plugins: [],
};
