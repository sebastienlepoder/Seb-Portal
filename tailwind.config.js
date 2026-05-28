/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/**/*.{js,ts,jsx,tsx,mdx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // Driven by CSS variables (space-separated RGB triplets) defined
        // per theme in globals.css. The rgb(... / <alpha-value>) form keeps
        // Tailwind opacity modifiers like bg-portal-accent/10 working.
        portal: {
          bg: 'rgb(var(--portal-bg) / <alpha-value>)',
          card: 'rgb(var(--portal-card) / <alpha-value>)',
          'card-hover': 'rgb(var(--portal-card-hover) / <alpha-value>)',
          border: 'rgb(var(--portal-border) / <alpha-value>)',
          accent: 'rgb(var(--portal-accent) / <alpha-value>)',
          'accent-light': 'rgb(var(--portal-accent-light) / <alpha-value>)',
          'accent-dark': 'rgb(var(--portal-accent-dark) / <alpha-value>)',
          success: 'rgb(var(--portal-success) / <alpha-value>)',
          warning: 'rgb(var(--portal-warning) / <alpha-value>)',
          danger: 'rgb(var(--portal-danger) / <alpha-value>)',
          muted: 'rgb(var(--portal-muted) / <alpha-value>)',
          text: 'rgb(var(--portal-text) / <alpha-value>)',
          'text-dim': 'rgb(var(--portal-text-dim) / <alpha-value>)',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
        mono: ['JetBrains Mono', 'Fira Code', 'monospace'],
      },
      animation: {
        'fade-in': 'fadeIn 0.3s ease-out',
        'slide-up': 'slideUp 0.3s ease-out',
        'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'glow': 'glow 2s ease-in-out infinite alternate',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        slideUp: {
          '0%': { opacity: '0', transform: 'translateY(10px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        glow: {
          '0%': { boxShadow: '0 0 5px rgba(99, 102, 241, 0.2)' },
          '100%': { boxShadow: '0 0 20px rgba(99, 102, 241, 0.4)' },
        },
      },
    },
  },
  plugins: [require('@tailwindcss/typography')],
};
