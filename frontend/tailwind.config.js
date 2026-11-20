/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/features/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        'brand-navy': {
          DEFAULT: '#181A17',
          hover: '#242722',
        },
        'page-bg': '#F4F1E9',
        surface: {
          DEFAULT: '#FFFFFF',
          muted: '#F0EEE8',
        },
        'text-primary': '#273244',
        'text-secondary': '#5F6977',
        'text-muted': '#747D88',
        'text-on-dark': '#F7F7F4',
        border: {
          DEFAULT: '#D8CEBE',
          beige: '#D8CEBE',
          'beige-subtle': '#E8E2D8',
          'beige-hover': '#C5B6A0',
          subtle: '#E8E2D8',
          dark: '#2C2F2A',
        },
        primary: {
          DEFAULT: '#A67C2E',
          hover: '#8C6621',
          active: '#73521A',
          subtle: '#F5EFE2',
        },
        champagne: '#B49A68',
        success: {
          DEFAULT: '#287653',
          bg: '#E8F2EB',
        },
        warning: {
          DEFAULT: '#966516',
          bg: '#F8F0DF',
        },
        danger: {
          DEFAULT: '#B33E3E',
          bg: '#F8EAEA',
        },
        info: {
          DEFAULT: '#5F6977',
          bg: '#F0EEE8',
        },
      },
    },
  },
  plugins: [],
};
