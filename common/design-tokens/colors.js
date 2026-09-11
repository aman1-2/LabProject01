// common/design-tokens/colors.js
export const colors = {
  // Brand blue ramp
  blue900: "#101635", // darkest — hero gradients, deep surfaces
  blue700: "#2C4BC7", // hover state for primary
  blue600: "#3E63DD", // PRIMARY — buttons, links, active states
  blue500: "#4F72E8", // gradient mid-tone
  blue100: "#E8EDFC", // chip backgrounds, focus rings
  blue50: "#F4F7FE", // tinted surfaces, selected cards, table headers

  // Neutrals
  ink: "#14161A", // primary text
  muted: "#6B7280", // secondary text
  muted2: "#9CA3AF", // tertiary text, placeholders, disabled
  bg: "#F7F8FC", // page background
  border: "#E7E9F0", // all borders and dividers
  dark: "#101114", // footer, admin sidebar
  white: "#FFFFFF", // card surfaces

  // Semantic
  green: "#16A34A",
  greenBg: "#DCFCE7", // success, verified, paid
  amber: "#F59E0B",
  amberBg: "#FEF3C7", // warning, pending, fasting
  amberDark: "#92640A", // amber chip text
  red: "#EF4444",
  redBg: "#FEE2E2",
  redDark: "#DC2626", // destructive text/actions

  // Component specific tokens from DESIGN_SPEC §2
  chipGreyBg: "#F1F2F5",
  disabledBg: "#EDEFF3",
  blueGradientEnd: "#1B2C6B", // Auth panel gradient end
};

export default colors;
