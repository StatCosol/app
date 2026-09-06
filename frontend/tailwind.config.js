/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./src/**/*.{html,ts}",
  ],
  theme: {
    extend: {
      colors: {
        /**
         * The brand palette, as actual scales.
         *
         * Before this the product ran on stock Tailwind: 667 blue-*, 378
         * indigo-* and 234 emerald-* utilities against ZERO uses of the brand
         * navy or green. That is why it looked like every other Tailwind
         * application — including the competitor's. Worse, blue and indigo were
         * both used as "primary" in the same portals, so there was no single
         * identity colour to recognise.
         *
         * 900 is the brand-guide navy (#0A1F44) and accent-500 the brand-guide
         * green (#20A15A); the rest of each ramp is built around them so that
         * chips, hovers and borders have on-brand steps to use. Without a full
         * ramp every component reaches back for gray-* or blue-* and the drift
         * starts again.
         *
         * Note this is NOT the old 'statco-blue' DEFAULT (#0a2656) — that was
         * an undocumented drift from the guide's #0A1F44. Close enough to look
         * deliberate, different enough to be wrong.
         */
        brand: {
          50: '#F2F5FA',
          100: '#E1E8F2',
          200: '#C3D0E6',
          300: '#94A9CD',
          400: '#5E7AAC',
          500: '#35548A',
          600: '#1E3C6E',
          700: '#16305A',
          800: '#0F2650',
          900: '#0A1F44',
          950: '#06132B',
          DEFAULT: '#0A1F44',
        },
        accent: {
          50: '#EAF7F0',
          100: '#D0EFE0',
          200: '#A5E0C1',
          300: '#6FCB9C',
          400: '#3FB57B',
          500: '#20A15A',
          600: '#1B8B4E',
          700: '#167340',
          800: '#115A33',
          900: '#0C4126',
          950: '#072819',
          DEFAULT: '#20A15A',
        },
        'statco-blue': {
          light: '#1eb6f7',
          DEFAULT: '#0a2656',
          dark: '#051734',
        },
        'primary': {
          50: '#f0f9ff',
          100: '#e0f2fe',
          200: '#bae6fd',
          300: '#7dd3fc',
          400: '#38bdf8',
          500: '#0ea5e9',
          600: '#0284c7',
          700: '#0a2656',
          800: '#075985',
          900: '#0c4a6e',
          950: '#082f49',
        },
        /* The cyan 'accent' ramp that used to sit here is gone. It duplicated
         * the `accent` key defined above, and last-key-wins meant it silently
         * discarded the brand green ramp on every build — so --statco-accent
         * resolved to green while every accent-* utility still compiled cyan.
         *
         * Green wins because it is the brand's second colour and the 15 call
         * sites are pure chrome (focus rings, a loading spinner), carrying no
         * semantic meaning that a colour change would break. Its 400 step was
         * #1eb6f7, the legacy statco-light-blue, which is still available as
         * statco-blue.light for anything that genuinely wants it. */
        'success': {
          50: '#f0fdf4',
          100: '#dcfce7',
          200: '#bbf7d0',
          300: '#86efac',
          400: '#4ade80',
          500: '#22c55e',
          600: '#16a34a',
          700: '#15803d',
          800: '#166534',
          900: '#14532d',
        },
        'warning': {
          50: '#fffbeb',
          100: '#fef3c7',
          200: '#fde68a',
          300: '#fcd34d',
          400: '#fbbf24',
          500: '#f59e0b',
          600: '#d97706',
          700: '#b45309',
          800: '#92400e',
          900: '#78350f',
        },
        'error': {
          50: '#fef2f2',
          100: '#fee2e2',
          200: '#fecaca',
          300: '#fca5a5',
          400: '#f87171',
          500: '#ef4444',
          600: '#dc2626',
          700: '#b91c1c',
          800: '#991b1b',
          900: '#7f1d1d',
        },
        'info': {
          50: '#eff6ff',
          100: '#dbeafe',
          200: '#bfdbfe',
          300: '#93c5fd',
          400: '#60a5fa',
          500: '#3b82f6',
          600: '#2563eb',
          700: '#1d4ed8',
          800: '#1e40af',
          900: '#1e3a8a',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'Roboto', 'Arial', 'sans-serif'],
        brand: ['"Times New Roman"', 'Georgia', 'serif'],
      },
      borderRadius: {
        'sm': '0.25rem',
        'DEFAULT': '0.5rem',
        'md': '0.5rem',
        'lg': '0.75rem',
        'xl': '1rem',
        '2xl': '1.5rem',
        'full': '9999px',
      },
      boxShadow: {
        'sm': '0 1px 2px 0 rgb(0 0 0 / 0.05)',
        'DEFAULT': '0 1px 3px 0 rgb(0 0 0 / 0.1), 0 1px 2px -1px rgb(0 0 0 / 0.1)',
        'md': '0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)',
        'lg': '0 10px 15px -3px rgb(0 0 0 / 0.1), 0 4px 6px -4px rgb(0 0 0 / 0.1)',
        'xl': '0 20px 25px -5px rgb(0 0 0 / 0.1), 0 8px 10px -6px rgb(0 0 0 / 0.1)',
        'card': '0 1px 3px 0 rgb(0 0 0 / 0.08), 0 1px 2px -1px rgb(0 0 0 / 0.08)',
        'card-hover': '0 8px 24px -4px rgb(0 0 0 / 0.12), 0 4px 8px -2px rgb(0 0 0 / 0.06)',
        'card-lg': '0 4px 16px -2px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.06)',
        'modal': '0 24px 48px -12px rgb(0 0 0 / 0.25), 0 0 0 1px rgb(0 0 0 / 0.05)',
        'inner': 'inset 0 2px 4px 0 rgb(0 0 0 / 0.05)',
      },
      spacing: {
        '18': '4.5rem',
        '88': '22rem',
        '128': '32rem',
      },
      keyframes: {
        fadeUp: {
          '0%': { opacity: '0', transform: 'translateY(12px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        slideIn: {
          '0%': { opacity: '0', transform: 'translateX(-8px)' },
          '100%': { opacity: '1', transform: 'translateX(0)' },
        },
        scaleIn: {
          '0%': { opacity: '0', transform: 'scale(0.95)' },
          '100%': { opacity: '1', transform: 'scale(1)' },
        },
        shimmer: {
          '0%': { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
      },
      animation: {
        'fade-up': 'fadeUp 0.4s ease-out both',
        'fade-up-slow': 'fadeUp 0.6s ease-out both',
        'slide-in': 'slideIn 0.3s ease-out both',
        'scale-in': 'scaleIn 0.25s ease-out both',
        'shimmer': 'shimmer 2s linear infinite',
      },
    },
  },
  plugins: [
    require('@tailwindcss/forms')({
      strategy: 'class',
    }),
    require('@tailwindcss/typography'),
  ],
}
