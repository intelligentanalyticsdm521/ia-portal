/** @type {import('tailwindcss').Config} */
// SINGLE source of truth. Tailwind resolves tailwind.config.js before .cjs,
// so the old .cjs (which had the OLIVER palette) was being IGNORED — every
// bg-oliver-* / text-oliver-* utility produced no CSS, making active buttons,
// badges, etc. render invisible. This config now contains the full palette.
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // OLIVER brand — locked
        oliver: {
          gold: '#FEC82C',
          'gold-50':  '#FFF8E1',
          'gold-100': '#FFEFC2',
          'gold-200': '#FFDF85',
          'gold-300': '#FFD148',
          'gold-400': '#FEC82C',
          'gold-500': '#E8B11A',
          'gold-600': '#B88B14',
          'gold-700': '#86640E',
          teal:       '#1A3A4A',
          'teal-50':  '#E8EFF2',
          'teal-100': '#C7D5DB',
          'teal-200': '#8FACB7',
          'teal-300': '#5A8392',
          'teal-400': '#2D5C6F',
          'teal-500': '#1A3A4A',
          'teal-600': '#142C39',
          'teal-700': '#0C1A22',
        },
        status: {
          draft:    '#9CA3AF',
          sent:     '#3B82F6',
          paid:     '#10B981',
          refunded: '#A855F7',
          void:     '#EF4444',
          overdue:  '#F59E0B',
          accepted: '#10B981',
          declined: '#EF4444',
          pending:  '#F59E0B',
        },
        role: {
          ops:       '#4F46E5',
          customer:  '#6B7280',
          crew:      '#F59E0B',
          system:    '#3B82F6',
        },
        // Legacy IADM tokens kept so existing iadm-* classes don't break.
        iadm: {
          orange: '#ef6c33',
          darkBlue: '#0c4a60',
          lightBlue: '#abdff1',
          lightGray: '#e1dddb',
          background: '#ffffff',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'sans-serif'],
      },
      boxShadow: {
        'oliver-card': '0 1px 3px 0 rgb(0 0 0 / 0.06), 0 1px 2px -1px rgb(0 0 0 / 0.04)',
        'oliver-drawer': '-8px 0 24px -4px rgb(0 0 0 / 0.12)',
        panel: '0 1px 2px rgba(0,0,0,0.06), 0 8px 24px rgba(0,0,0,0.06)',
      },
    },
  },
  plugins: [],
};
