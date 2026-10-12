// Colours come from CSS variables so the active campaign can restyle the site without a rebuild.
const v = (name) => `rgb(var(--${name}) / <alpha-value>)`;
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: { primary: v('primary'), accent: v('accent'), dark: v('dark'), bg: v('bg'), ink: v('text') },
      fontFamily: { display: ['"Playfair Display"', 'Georgia', 'serif'], sans: ['Inter', 'system-ui', 'sans-serif'] },
      borderRadius: { btn: 'var(--radius)' },
    },
  },
  plugins: [],
};
