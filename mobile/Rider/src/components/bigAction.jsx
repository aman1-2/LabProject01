import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { colors } from '../theme.js';
import { Pressable3D, elevation } from './motion.jsx';
import Icon from './Icon.jsx';

/**
 * The rider interface, for someone who may not read comfortably.
 *
 * A phlebotomist uses this on a scooter, in daylight, in a hurry, and may read
 * little English. The patterns below are the ones Uber's driver app and Rapido
 * settled on for the same audience:
 *
 *   - ONE action per screen, and it is the biggest thing on it. Choosing
 *     between several similar buttons is the step that goes wrong.
 *   - An icon carries the meaning; the words confirm it. Not the reverse.
 *   - Colour is a second channel: green means go, red means money or stop,
 *     blue means neutral progress. Never colour alone — the icon and the word
 *     say the same thing, so it still works for a colour-blind rider.
 *   - Numbers get big and bold. Digits are legible to people who read words
 *     slowly, which is why the cash amount is the largest thing on its screen.
 *   - Targets are 64px, well past the 44px minimum, because this is used
 *     one-handed and often while moving.
 */

const TONES = {
  go: { bg: colors.green, fg: colors.white },
  money: { bg: colors.amber, fg: colors.ink },
  neutral: { bg: colors.blue600, fg: colors.white },
  danger: { bg: colors.red, fg: colors.white },
};

/**
 * The single dominant action on a screen.
 *
 * @param {string} icon    from the shared icon set
 * @param {string} label   one or two words, imperative
 * @param {string} [hint]  a short line under it, for anyone who does read
 * @param {'go'|'money'|'neutral'|'danger'} [tone]
 */
export function BigAction({
  icon,
  label,
  hint,
  tone = 'neutral',
  onPress,
  disabled = false,
  loading = false,
  testID,
}) {
  const palette = TONES[tone] ?? TONES.neutral;

  return (
    <Pressable3D
      testID={testID}
      accessibilityRole="button"
      // The hint is part of the label for a screen reader: read aloud, the two
      // belong together.
      accessibilityLabel={hint ? `${label}. ${hint}` : label}
      accessibilityState={{ disabled: disabled || loading }}
      onPress={onPress}
      disabled={disabled || loading}
      scaleTo={0.97}
      style={[
        styles.action,
        { backgroundColor: palette.bg },
        (disabled || loading) && styles.actionDisabled,
        elevation.card,
      ]}
    >
      <Icon name={icon} size={26} color={palette.fg} strokeWidth={2.3} />
      <View style={styles.actionText}>
        <Text style={[styles.actionLabel, { color: palette.fg }]}>
          {loading ? 'Please wait…' : label}
        </Text>
        {hint && !loading ? (
          <Text style={[styles.actionHint, { color: palette.fg }]}>{hint}</Text>
        ) : null}
      </View>
    </Pressable3D>
  );
}

/**
 * Where the rider is in a collection, as dots rather than prose.
 *
 * "Step 2 of 4" is understood by almost everyone; a paragraph explaining what
 * happens next is not. The current step is filled and labelled; the rest are
 * dots.
 */
export function StepTrail({ steps, current, testID }) {
  return (
    <View style={styles.trail} testID={testID} accessibilityRole="progressbar"
      accessibilityLabel={`Step ${current + 1} of ${steps.length}: ${steps[current]?.label ?? ''}`}
    >
      {steps.map((step, index) => {
        const done = index < current;
        const active = index === current;
        return (
          <View key={step.key} style={styles.trailItem}>
            <View
              style={[
                styles.dot,
                done && styles.dotDone,
                active && styles.dotActive,
              ]}
            >
              {done ? (
                <Icon name="check" size={12} color={colors.white} strokeWidth={3} />
              ) : (
                <Text style={[styles.dotNum, active && styles.dotNumActive]}>{index + 1}</Text>
              )}
            </View>
            {index < steps.length - 1 ? (
              <View style={[styles.bar, done && styles.barDone]} />
            ) : null}
          </View>
        );
      })}
    </View>
  );
}

/**
 * A number the rider needs to read at a glance — a cash amount, a distance.
 * Deliberately enormous.
 */
export function BigNumber({ value, caption, tone = 'ink', testID }) {
  return (
    <View style={styles.number} testID={testID}>
      <Text
        style={[styles.numberValue, tone === 'money' && styles.numberMoney]}
        // Never shrink below legibility; wrap instead.
        adjustsFontSizeToFit
        numberOfLines={1}
      >
        {value}
      </Text>
      {caption ? <Text style={styles.numberCaption}>{caption}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  action: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 14,
    minHeight: 64,
    paddingHorizontal: 24,
    paddingVertical: 14,
    borderRadius: 18,
  },
  actionDisabled: { opacity: 0.45 },
  actionText: { alignItems: 'flex-start' },
  actionLabel: { fontSize: 19, fontWeight: '800', letterSpacing: -0.3 },
  actionHint: { fontSize: 12.5, opacity: 0.85, marginTop: 2 },

  trail: { flexDirection: 'row', alignItems: 'center', paddingVertical: 4 },
  trailItem: { flexDirection: 'row', alignItems: 'center', flex: 1 },
  dot: {
    width: 30,
    height: 30,
    borderRadius: 999,
    backgroundColor: colors.chipGreyBg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dotDone: { backgroundColor: colors.green },
  dotActive: { backgroundColor: colors.blue600 },
  dotNum: { fontSize: 13, fontWeight: '800', color: colors.muted },
  dotNumActive: { color: colors.white },
  bar: { flex: 1, height: 3, backgroundColor: colors.border, marginHorizontal: 6, borderRadius: 999 },
  barDone: { backgroundColor: colors.green },

  number: { alignItems: 'center', paddingVertical: 8 },
  numberValue: { fontSize: 44, fontWeight: '800', color: colors.ink, letterSpacing: -1 },
  numberMoney: { color: colors.green },
  numberCaption: { fontSize: 13, color: colors.muted, marginTop: 4 },
});

export default { BigAction, StepTrail, BigNumber };
