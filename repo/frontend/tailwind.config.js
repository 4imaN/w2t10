/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        primary: {
          DEFAULT: 'hsl(240, 5.9%, 10%)',
          foreground: 'hsl(0, 0%, 98%)'
        },
        accent: {
          DEFAULT: 'hsl(262, 83%, 58%)',
          foreground: 'hsl(0, 0%, 98%)'
        },
        success: {
          DEFAULT: 'hsl(142, 71%, 45%)',
          foreground: 'hsl(0, 0%, 98%)'
        },
        warning: {
          DEFAULT: 'hsl(38, 92%, 50%)',
          foreground: 'hsl(0, 0%, 10%)'
        },
        destructive: {
          DEFAULT: 'hsl(0, 72%, 51%)',
          foreground: 'hsl(0, 0%, 98%)'
        },
        muted: {
          DEFAULT: 'hsl(240, 4.8%, 95.9%)',
          foreground: 'hsl(240, 3.8%, 46.1%)'
        },
        card: {
          DEFAULT: 'hsl(0, 0%, 100%)',
          foreground: 'hsl(240, 5.9%, 10%)'
        },
        border: 'hsl(240, 5.9%, 90%)',
        input: 'hsl(240, 5.9%, 90%)',
        ring: 'hsl(262, 83%, 58%)'
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'monospace']
      }
    }
  },
  plugins: []
};
