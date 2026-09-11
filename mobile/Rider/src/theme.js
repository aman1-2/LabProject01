// mobile/Rider/src/theme.js
//
// React Native style primitives transcribed from pathcare_mobile_prototype.html.
//
// DESIGN_SPEC: "When this document and the prototypes disagree, the prototypes
// win." So the numbers here come from the prototype's CSS, not from §2 — where
// the two differ, the prototype value is used and the difference is noted.
//
// Colours are imported from @pathcare/design-tokens rather than re-declared:
// all 18 of the prototype's :root custom properties were verified to match that
// package exactly, so duplicating them here would create a second source of
// truth for something §7.1 says must have one.
import { StyleSheet } from 'react-native';
import { colors } from '@pathcare/design-tokens';

export { colors };

/** Prototype `.device` — the app canvas. */
export const DEVICE_WIDTH = 390;

/**
 * DESIGN_SPEC §5 and §7.3 set a 44x44 minimum touch target. The prototype's
 * icon buttons (`.topnav .back`) are 38x38. Rather than pick one, the visual
 * circle stays 38 to match the prototype and the touchable is expanded to 44
 * with hitSlop — the design is unchanged and the accessibility floor is met.
 */
export const ICON_BUTTON_SIZE = 38;
export const MIN_TOUCH_TARGET = 44;
export const iconButtonHitSlop = (() => {
  const pad = (MIN_TOUCH_TARGET - ICON_BUTTON_SIZE) / 2;
  return { top: pad, bottom: pad, left: pad, right: pad };
})();

/** Prototype h1/h2/h3: weight 800, letter-spacing -0.02em. */
export const type = StyleSheet.create({
  screenTitle: { fontSize: 26, fontWeight: '800', letterSpacing: -0.5, color: colors.ink },
  sectionTitle: { fontSize: 21, fontWeight: '800', letterSpacing: -0.4, color: colors.ink },
  navTitle: { fontSize: 16, fontWeight: '800', letterSpacing: -0.3, color: colors.ink },
  cardTitle: { fontSize: 14.5, fontWeight: '800', color: colors.ink },
  body: { fontSize: 14, color: colors.ink },
  bodyMuted: { fontSize: 13.5, color: colors.muted, lineHeight: 21 },
  meta: { fontSize: 11.5, color: colors.muted },
  label: { fontSize: 12.5, fontWeight: '700', color: colors.ink },
});

// The breathing room between the status bar and the header row. Named because
// TopBar adds it to the device inset and the stylesheet below uses it too;
// two literals would drift apart.
export const TOPNAV_GAP = 8;

export const layout = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  // Prototype `.screen` padding-bottom:86px clears the fixed tab bar.
  scrollBody: { paddingHorizontal: 20, paddingBottom: 86 },
  // Prototype `.topnav`: padding 8px 20px 14px, space-between.
  topnav: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: TOPNAV_GAP,
    paddingHorizontal: 20,
    paddingBottom: 14,
  },
  // Prototype `.topnav .back`
  iconButton: {
    width: ICON_BUTTON_SIZE,
    height: ICON_BUTTON_SIZE,
    borderRadius: 999,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconButtonGlyph: { fontSize: 17, color: colors.ink, lineHeight: 20 },
  // Prototype's trailing `<div style="width:38px">` — keeps the title centred.
  iconButtonSpacer: { width: ICON_BUTTON_SIZE },
  row: { flexDirection: 'row', alignItems: 'center' },
  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
});

/** Prototype `.card`: white, radius 20, 1px border. */
export const card = StyleSheet.create({
  base: {
    backgroundColor: colors.white,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.border,
  },
  // Prototype selected-card treatment (`.card` with blue600 border + blue50 bg).
  selected: { borderColor: colors.blue600, backgroundColor: colors.blue50 },
  padded: { padding: 16 },
});

/** Prototype `.btn` family: fully pill, weight 700. */
export const button = StyleSheet.create({
  base: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderRadius: 999,
    paddingVertical: 14,
    paddingHorizontal: 22,
    minHeight: MIN_TOUCH_TARGET,
  },
  primary: { backgroundColor: colors.blue600 },
  ghost: { backgroundColor: colors.white, borderWidth: 1.5, borderColor: colors.border },
  danger: { backgroundColor: colors.red },
  // Prototype `.btn-sm`
  small: { paddingVertical: 9, paddingHorizontal: 16, minHeight: MIN_TOUCH_TARGET },
  disabled: { backgroundColor: '#EDEFF3' },
  labelBase: { fontSize: 15, fontWeight: '700' },
  labelSmall: { fontSize: 13, fontWeight: '700' },
  labelPrimary: { color: colors.white },
  labelGhost: { color: colors.ink },
  labelDisabled: { color: colors.muted2 },
});

/** Prototype `.chip` family. */
export const chip = StyleSheet.create({
  base: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 999,
    alignSelf: 'flex-start',
  },
  blue: { backgroundColor: colors.blue100 },
  grey: { backgroundColor: '#F1F2F5' },
  green: { backgroundColor: colors.greenBg },
  amber: { backgroundColor: colors.amberBg },
  red: { backgroundColor: colors.redBg },
  label: { fontSize: 12, fontWeight: '700' },
  labelBlue: { color: colors.blue700 },
  labelGrey: { color: colors.muted },
  labelGreen: { color: colors.green },
  labelAmber: { color: '#92640A' },
  labelRed: { color: colors.redDark },
});

/**
 * Prototype input: 1.5px border, radius 14, padding 14/16, font 14.5.
 * (DESIGN_SPEC §2.4 says radius 12 — prototype wins.)
 */
export const input = StyleSheet.create({
  base: {
    width: '100%',
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 16,
    fontSize: 14.5,
    backgroundColor: colors.white,
    color: colors.ink,
    minHeight: MIN_TOUCH_TARGET,
  },
  focused: { borderColor: colors.blue600 },
  invalid: { borderColor: colors.red },
});

/** Prototype `.tabbar` / `.tab-item`. */
export const tabBar = StyleSheet.create({
  bar: {
    backgroundColor: colors.white,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: 10,
    paddingHorizontal: 8,
    height: 74,
  },
  label: { fontSize: 10.5, fontWeight: '700' },
});

/** Prototype `.blob-hero` — the splash/onboarding gradient. Rendered with
 *  expo-linear-gradient; these are the stops from the CSS radial-gradient. */
export const blobHero = {
  height: 230,
  borderRadius: 28,
  colors: ['#7C93EE', colors.blue600, '#1B2C6B'],
};

/** Prototype `.toast2`. */
export const toast = StyleSheet.create({
  base: {
    backgroundColor: colors.ink,
    paddingVertical: 13,
    paddingHorizontal: 18,
    borderRadius: 14,
  },
  label: { color: colors.white, fontSize: 13.5, fontWeight: '600', textAlign: 'center' },
});

/** Prototype status stepper (Track screen): 26px circles. */
export const stepper = StyleSheet.create({
  dot: {
    width: 26,
    height: 26,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dotDone: { backgroundColor: colors.blue600 },
  dotUpcoming: { backgroundColor: '#F1F2F5' },
  dotLabel: { fontSize: 12, fontWeight: '800' },
  dotLabelDone: { color: colors.white },
  dotLabelUpcoming: { color: colors.muted2 },
});

export default {
  colors,
  type,
  TOPNAV_GAP,
  layout,
  card,
  button,
  chip,
  input,
  tabBar,
  blobHero,
  toast,
  stepper,
  iconButtonHitSlop,
  DEVICE_WIDTH,
  MIN_TOUCH_TARGET,
};
