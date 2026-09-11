// common/design-tokens/typography.js
export const type = {
  heroTitle: { size: 50, weight: 800, lineHeight: 1.08, tracking: "-0.02em" },
  pageTitle: { size: 29, weight: 800, tracking: "-0.02em" },
  sectionTitle: { size: 27, weight: 800, tracking: "-0.02em" },
  cardTitle: { size: 15, weight: 800 },
  body: { size: 15, weight: 400, lineHeight: 1.6 },
  bodySmall: { size: 13.5, weight: 400, lineHeight: 1.55 },
  caption: { size: 12.5, weight: 400 },
  eyebrow: {
    size: 12.5,
    weight: 700,
    transform: "uppercase",
    tracking: "0.06em",
  },
  price: { size: 19, weight: 800 },
};

export const fontFamily = {
  sans: ['"Plus Jakarta Sans"', 'system-ui', '-apple-system', 'sans-serif'],
};

export default { type, fontFamily };
