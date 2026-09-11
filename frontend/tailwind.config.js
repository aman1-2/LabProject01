import { colors } from '@pathcare/design-tokens/colors.js';
import { space } from '@pathcare/design-tokens/spacing.js';
import { radius } from '@pathcare/design-tokens/radius.js';
import { shadow } from '@pathcare/design-tokens/shadow.js';
import { type } from '@pathcare/design-tokens/typography.js';

/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    // Override colors completely with design tokens (delete default Tailwind palette)
    colors: {
      transparent: 'transparent',
      current: 'currentColor',
      ...colors,
    },
    extend: {
      fontFamily: {
        sans: ['"Plus Jakarta Sans"', 'system-ui', '-apple-system', 'sans-serif'],
      },
      spacing: {
        xs: `${space.xs}px`,
        sm: `${space.sm}px`,
        md: `${space.md}px`,
        lg: `${space.lg}px`,
        xl: `${space.xl}px`,
        '2xl': `${space['2xl']}px`,
        '3xl': `${space['3xl']}px`,
        '4xl': `${space['4xl']}px`,
      },
      borderRadius: {
        sm: `${radius.sm}px`,
        md: `${radius.md}px`,
        lg: `${radius.lg}px`,
        xl: `${radius.xl}px`,
        '2xl': `${radius['2xl']}px`,
        pill: `${radius.pill}px`,
        full: '9999px',
      },
      boxShadow: {
        card: shadow.card,
        float: shadow.float,
        fab: shadow.fab,
      },
      fontSize: {
        caption: [`${type.caption.size}px`, { lineHeight: '1.4' }],
        eyebrow: [`${type.eyebrow.size}px`, { lineHeight: '1.4', letterSpacing: type.eyebrow.tracking }],
        bodySmall: [`${type.bodySmall.size}px`, { lineHeight: `${type.bodySmall.lineHeight}` }],
        body: [`${type.body.size}px`, { lineHeight: `${type.body.lineHeight}` }],
        cardTitle: [`${type.cardTitle.size}px`, { fontWeight: `${type.cardTitle.weight}` }],
        price: [`${type.price.size}px`, { fontWeight: `${type.price.weight}` }],
        sectionTitle: [`${type.sectionTitle.size}px`, { fontWeight: `${type.sectionTitle.weight}`, letterSpacing: type.sectionTitle.tracking }],
        pageTitle: [`${type.pageTitle.size}px`, { fontWeight: `${type.pageTitle.weight}`, letterSpacing: type.pageTitle.tracking }],
        heroTitle: [`${type.heroTitle.size}px`, { fontWeight: `${type.heroTitle.weight}`, lineHeight: `${type.heroTitle.lineHeight}`, letterSpacing: type.heroTitle.tracking }],
      },
    },
  },
  plugins: [],
};
