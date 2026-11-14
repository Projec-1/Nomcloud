/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    container: {
      center: true,
      padding: '1.5rem',
    },
    extend: {
      colors: {
        ink: '#222321',
        mist: '#F7F8F6',
        graphite: '#555954',
        accent: {
          DEFAULT: '#A83B18',
          dark: '#A83B18',
          light: '#A83B18',
        },
        surface: {
          DEFAULT: '#FFFFFF',
          dark: '#171917',
          elevated: '#202320',
        },
        night: {
          DEFAULT: '#17191C',
          elevated: '#202328',
          border: '#343A41',
          muted: '#A7AFB8',
        },
        brand: {
          DEFAULT: '#A83B18',
          50: '#FBEDE7',
          100: '#F4D5C9',
          500: '#C9471B',
          600: '#A83B18',
        },
      },
      fontFamily: {
        sans: [
          '"DM Sans"',
          'Segoe UI',
          'Roboto',
          'Helvetica Neue',
          'Arial',
          'sans-serif',
        ],
        display: ['"Space Grotesk"', '"DM Sans"', 'sans-serif'],
      },
      fontSize: {
        'display-xl': ['clamp(3rem, 6vw, 6.5rem)', { lineHeight: '1.02', letterSpacing: '-0.03em', fontWeight: '600' }],
        'display-lg': ['clamp(2.5rem, 5vw, 4.5rem)', { lineHeight: '1.04', letterSpacing: '-0.03em', fontWeight: '600' }],
        'display-md': ['clamp(2rem, 3.4vw, 3rem)', { lineHeight: '1.08', letterSpacing: '-0.02em', fontWeight: '600' }],
      },
      borderRadius: {
        none: '0',
        sm: '10px',
        DEFAULT: '10px',
        md: '10px',
        lg: '10px',
        xl: '10px',
        '2xl': '10px',
        '3xl': '10px',
        full: '10px',
      },
      boxShadow: {
        DEFAULT: 'none',
        sm: 'none',
        md: 'none',
        lg: 'none',
        xl: 'none',
        '2xl': 'none',
        soft: 'none',
        card: 'none',
        floaty: 'none',
      },
      backgroundImage: {},
      animation: {
        'fade-up': 'none',
        'fade-in': 'none',
        float: 'none',
        marquee: 'none',
        'marquee-slow': 'none',
        'draw-line': 'none',
        'pulse-dot': 'none',
        shimmer: 'none',
        'scan-x': 'none',
      },
      keyframes: {
        fadeUp: {
          '0%': { opacity: '0', transform: 'translateY(24px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        float: {
          '0%, 100%': { transform: 'translateY(0px)' },
          '50%': { transform: 'translateY(-14px)' },
        },
        marquee: {
          '0%': { transform: 'translateX(0)' },
          '100%': { transform: 'translateX(-50%)' },
        },
        drawLine: {
          '0%': { strokeDashoffset: '600' },
          '100%': { strokeDashoffset: '0' },
        },
        pulseDot: {
          '0%, 100%': { transform: 'scale(1)', opacity: '1' },
          '50%': { transform: 'scale(1.6)', opacity: '0.35' },
        },
        shimmer: {
          '0%, 100%': { opacity: '0.5' },
          '50%': { opacity: '1' },
        },
        scanX: {
          '0%': { transform: 'translateX(-10%)', opacity: '0' },
          '10%': { opacity: '1' },
          '90%': { opacity: '1' },
          '100%': { transform: 'translateX(110%)', opacity: '0' },
        },
      },
      transitionTimingFunction: {
        apple: 'cubic-bezier(0.16, 1, 0.3, 1)',
      },
    },
  },
  plugins: [],
}
