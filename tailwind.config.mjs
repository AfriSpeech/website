/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src/**/*.{astro,html,js,jsx,md,mdx,svelte,ts,tsx,vue}'],
  theme: {
    extend: {
      colors: {
        // Accent — greens from the AfriSpeech emblem.
        forest: {
          DEFAULT: '#52B788',
          50: '#EDF7F1',
          100: '#DBF0E1',
          200: '#BDE7CC',
          300: '#95D5B2',
          400: '#74C69D',
          500: '#52B788',
          600: '#37845F',
          700: '#2D6A4F',
          800: '#1B4332',
          900: '#081C15',
        },
        // Text scale — near-black with a green cast.
        neutral: {
          900: '#343B36',
        },
        ink: {
          DEFAULT: '#101813',
          50: '#FAFAFA',
          100: '#EEF0EF',
          200: '#D4DAD6',
          300: '#A8B3AC',
          400: '#717E76',
          500: '#525D56',
          600: '#3B4540',
          700: '#1D2420',
          800: '#121714',
          900: '#050706',
        },
        // Muted body text.
        sage: {
          DEFAULT: '#5F6F66',
          50: '#F2F5F3',
          100: '#E2E8E4',
          200: '#C6D1CA',
          300: '#A5B4AB',
          400: '#82958A',
          500: '#5B6B62',
          600: '#4A584F',
          700: '#3A463E',
          800: '#2B342E',
          900: '#1D231F',
        },
        // Surfaces — white / warm paper, neutral-50 scale (light mode).
        paper: {
          DEFAULT: '#FAFAFA',
          50: '#FFFFFF',
          100: '#FEFEFE',
          200: '#F1F1F3',
          300: '#E4E4E7',
        },
        // The language dot on project cards.
        'kente-green': {
          DEFAULT: '#40916C',
        },
        // Alternating section bands and hairline borders.
        mist: {
          DEFAULT: '#F4F4F5',
          50: '#FAFAFA',
          100: '#F8F8F9',
          200: '#E4E4E7',
          300: '#D4D4D8',
        },
      },
      fontFamily: {
        sans: ['Geist Variable', 'Geist', 'ui-sans-serif', 'system-ui', '-apple-system', 'sans-serif'],
        mono: ['Geist Mono Variable', 'Geist Mono', 'ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
      },
      borderRadius: {
        'card': '6px',
      },
      boxShadow: {
        'card': '0 1px 2px rgba(16, 24, 40, 0.05)',
        'card-hover': '0 8px 24px rgba(16, 24, 40, 0.10)',
      },
      backgroundImage: {
        'mudcloth': "url('/images/patterns/mudcloth.svg')",
        'kente-fade': 'linear-gradient(180deg, rgba(82, 183, 136, 0.08) 0%, rgba(250, 250, 250, 0) 100%)',
      },
    },
  },
  plugins: [],
};