/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#FFF4EC',
          100: '#FFE6D5',
          200: '#FFC9A8',
          300: '#FFA366',
          400: '#FF8A3D',
          500: '#F97316', // primary orange
          600: '#E8630A',
          700: '#C24F06',
          800: '#9A3F08',
          900: '#7C340A',
        },
        ink: {
          900: '#1A1A1A', // near-black text
          700: '#3A3A3A',
          500: '#6B6B6B',
          300: '#A3A3A3',
        },
        surface: {
          DEFAULT: '#FFFFFF',
          muted: '#F7F7F8',
          border: '#EAEAEC',
        },
      },
      fontFamily: {
        sans: ['"Noto Sans Thai"', '"IBM Plex Sans Thai"', 'system-ui', 'sans-serif'],
      },
      borderRadius: {
        xl: '14px',
        '2xl': '20px',
      },
      boxShadow: {
        card: '0 1px 2px rgba(0,0,0,0.04), 0 4px 12px rgba(0,0,0,0.05)',
      },
    },
  },
  plugins: [],
};
