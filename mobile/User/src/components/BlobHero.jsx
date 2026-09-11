import React from 'react';
import { StyleSheet, View } from 'react-native';
import { colors } from '../theme.js';

/**
 * The gradient hero blob (DESIGN_SPEC §2.6), used for onboarding illustrations
 * and as the ImageSlot fallback until real photography exists. It should look
 * deliberate, never like a missing image.
 *
 * The prototype builds it from a CSS radial-gradient plus two pseudo-elements:
 * a blurred white highlight top-left and an amber→red organic blob bottom-right.
 * React Native has no radial-gradient, so this composes the same three layers
 * out of views — the concentric rings approximate the radial falloff, and the
 * organic blob uses per-corner radii exactly as the CSS does
 * (38% 62% 60% 40% / 50% 45% 55% 50%).
 */
export default function BlobHero({
  colors: stops = ['#7C93EE', colors.blue600, colors.blueGradientEnd],
  height = 230,
  style,
  testID,
}) {
  const [inner, mid, outer] = stops;

  return (
    <View style={[styles.wrap, { height, backgroundColor: outer }, style]} testID={testID}>
      {/* Radial falloff, outer → inner, centred at 30%/30% as in the CSS. */}
      <View style={[styles.ring, styles.ringMid, { backgroundColor: mid }]} />
      <View style={[styles.ring, styles.ringInner, { backgroundColor: inner }]} />

      {/* Blurred white highlight, top-left. */}
      <View style={styles.highlight} />

      {/* Organic amber→red blob, bottom-right. */}
      <View style={styles.organic} />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    width: '100%',
    // DESIGN_SPEC §2.6 / prototype `.blob-hero`: radius 28.
    borderRadius: 28,
    overflow: 'hidden',
  },
  ring: { position: 'absolute', borderRadius: 999 },
  ringMid: { width: '150%', height: '190%', left: '-32%', top: '-52%', opacity: 0.95 },
  ringInner: { width: '78%', height: '96%', left: '-10%', top: '-22%', opacity: 0.9 },
  highlight: {
    position: 'absolute',
    width: 160,
    height: 160,
    borderRadius: 999,
    top: 20,
    left: 30,
    backgroundColor: colors.white,
    opacity: 0.3,
  },
  organic: {
    position: 'absolute',
    width: 110,
    height: 110,
    bottom: -20,
    right: 10,
    opacity: 0.85,
    backgroundColor: colors.amber,
    // CSS: border-radius: 38% 62% 60% 40% / 50% 45% 55% 50%
    borderTopLeftRadius: 42,
    borderTopRightRadius: 68,
    borderBottomRightRadius: 66,
    borderBottomLeftRadius: 44,
  },
});
