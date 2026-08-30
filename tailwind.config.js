/** @type {import('tailwindcss').Config} */
export default {
  darkMode: ['class'],
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    container: {
      center: true,
      padding: '1.5rem',
      screens: { '2xl': '1400px' },
    },
    extend: {
      colors: {
        border: 'hsl(var(--border))',
        input: 'hsl(var(--input))',
        ring: 'hsl(var(--ring))',
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',

        /* Muted olive / moss — the house accent. Used for primary action,
           the sidebar's active state, and the "still needs attention" ring
           around a figure — a limestone quarry's own colour, not a factory
           ledger's maroon. */
        primary: {
          DEFAULT: 'hsl(var(--primary))',
          foreground: 'hsl(var(--primary-foreground))',
          50: 'hsl(88 25% 96%)',
          100: 'hsl(88 22% 91%)',
          200: 'hsl(87 20% 82%)',
          300: 'hsl(87 18% 68%)',
          400: 'hsl(88 17% 50%)',
          500: 'hsl(88 18% 38%)',
          600: 'hsl(88 17% 33%)',
          700: 'hsl(88 16% 30%)',
          800: 'hsl(88 18% 24%)',
          900: 'hsl(88 20% 18%)',
          950: 'hsl(88 22% 10%)',
        },

        /* A clearer green than the olive brand colour — income, stock on
           hand, a paid invoice, anything going the right way. */
        success: {
          DEFAULT: 'hsl(var(--success))',
          foreground: 'hsl(var(--success-foreground))',
          50: 'hsl(132 24% 96%)',
          100: 'hsl(132 22% 90%)',
          200: 'hsl(132 20% 79%)',
          300: 'hsl(132 19% 63%)',
          400: 'hsl(132 20% 45%)',
          500: 'hsl(132 21% 34%)',
          600: 'hsl(132 20% 30%)',
          700: 'hsl(132 20% 28%)',
          800: 'hsl(132 22% 22%)',
          900: 'hsl(132 24% 17%)',
        },

        /* Warm clay / brass — secondary information, never a primary action. */
        brass: {
          DEFAULT: 'hsl(var(--brass))',
          50: 'hsl(38 48% 96%)',
          100: 'hsl(38 45% 88%)',
          200: 'hsl(38 44% 76%)',
          300: 'hsl(38 45% 62%)',
          400: 'hsl(38 45% 52%)',
          500: 'hsl(38 45% 45%)',
          600: 'hsl(38 44% 38%)',
          700: 'hsl(38 42% 31%)',
          800: 'hsl(38 40% 26%)',
          900: 'hsl(38 38% 21%)',
        },

        /* Warm limestone — the paper the whole system is printed on. */
        cream: {
          50: 'hsl(40 30% 99%)',
          100: 'hsl(40 28% 97%)',
          200: 'hsl(40 25% 93%)',
          300: 'hsl(40 22% 87%)',
          400: 'hsl(40 18% 78%)',
          500: 'hsl(40 16% 68%)',
        },

        secondary: {
          DEFAULT: 'hsl(var(--secondary))',
          foreground: 'hsl(var(--secondary-foreground))',
        },
        muted: {
          DEFAULT: 'hsl(var(--muted))',
          foreground: 'hsl(var(--muted-foreground))',
        },
        accent: {
          DEFAULT: 'hsl(var(--accent))',
          foreground: 'hsl(var(--accent-foreground))',
        },
        destructive: {
          DEFAULT: 'hsl(var(--destructive))',
          foreground: 'hsl(var(--destructive-foreground))',
        },
        card: {
          DEFAULT: 'hsl(var(--card))',
          foreground: 'hsl(var(--card-foreground))',
        },
        popover: {
          DEFAULT: 'hsl(var(--popover))',
          foreground: 'hsl(var(--popover-foreground))',
        },
        sidebar: {
          DEFAULT: 'hsl(var(--sidebar))',
          foreground: 'hsl(var(--sidebar-foreground))',
          muted: 'hsl(var(--sidebar-muted))',
          accent: 'hsl(var(--sidebar-accent))',
          border: 'hsl(var(--sidebar-border))',
        },
      },
      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'Segoe UI', 'sans-serif'],
        display: ['"Instrument Serif"', 'Georgia', 'serif'],
        /* Every figure in the system is set in this. Tabular numerals mean a
           column of money lines up by decimal point instead of drifting. */
        mono: ['"JetBrains Mono"', 'ui-monospace', 'SFMono-Regular', 'monospace'],
      },
      fontSize: {
        '2xs': ['0.6875rem', { lineHeight: '1rem' }],
      },
      boxShadow: {
        card: '0 1px 2px 0 rgb(46 32 19 / 0.04), 0 1px 3px 0 rgb(46 32 19 / 0.06)',
        raised: '0 4px 12px -2px rgb(46 32 19 / 0.10), 0 2px 6px -2px rgb(46 32 19 / 0.06)',
        pop: '0 12px 32px -8px rgb(46 32 19 / 0.22)',
      },
      keyframes: {
        'accordion-down': {
          from: { height: '0' },
          to: { height: 'var(--radix-accordion-content-height)' },
        },
        'accordion-up': {
          from: { height: 'var(--radix-accordion-content-height)' },
          to: { height: '0' },
        },
        shimmer: {
          '100%': { transform: 'translateX(100%)' },
        },
      },
      animation: {
        'accordion-down': 'accordion-down 0.2s ease-out',
        'accordion-up': 'accordion-up 0.2s ease-out',
      },
    },
  },
  plugins: [require('tailwindcss-animate')],
}
