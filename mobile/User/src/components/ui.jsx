import React from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, type, card, button, chip, layout, emptyState, iconButtonHitSlop } from '../theme.js';
import Icon from './Icon.jsx';

/**
 * Shared primitives, transcribed from pathcare_mobile_prototype.html via
 * src/theme.js. Nothing here invents visual design: every value traces to the
 * prototype's CSS or to @pathcare/design-tokens. No colour is written literally
 * (CONTEXT §7.1).
 */

const PRESSED_OPACITY = { opacity: 0.85 };

export function Card({ children, style, ...rest }) {
  return (
    <View style={[card.base, style]} {...rest}>
      {children}
    </View>
  );
}

export function PrimaryButton({ label, onPress, disabled, loading, testID, style }) {
  const inactive = disabled || loading;
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityState={{ disabled: Boolean(inactive), busy: Boolean(loading) }}
      onPress={inactive ? undefined : onPress}
      style={({ pressed }) => [
        button.base,
        inactive ? button.disabled : button.primary,
        pressed && !inactive && PRESSED_OPACITY,
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={colors.white} />
      ) : (
        <Text style={[button.labelBase, inactive ? button.labelDisabled : button.labelPrimary]}>{label}</Text>
      )}
    </Pressable>
  );
}

export function GhostButton({ label, onPress, disabled, testID, style }) {
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityState={{ disabled: Boolean(disabled) }}
      onPress={disabled ? undefined : onPress}
      style={({ pressed }) => [button.base, button.ghost, pressed && !disabled && PRESSED_OPACITY, style]}
    >
      <Text style={[button.labelBase, disabled ? button.labelDisabled : button.labelGhost]}>{label}</Text>
    </Pressable>
  );
}

export function DangerButton({ label, onPress, disabled, testID, style }) {
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      onPress={disabled ? undefined : onPress}
      style={({ pressed }) => [button.base, button.danger, pressed && !disabled && PRESSED_OPACITY, style]}
    >
      <Text style={[button.labelBase, button.labelPrimary]}>{label}</Text>
    </Pressable>
  );
}

const CHIP_TONES = {
  blue: [chip.blue, chip.labelBlue],
  grey: [chip.grey, chip.labelGrey],
  green: [chip.green, chip.labelGreen],
  amber: [chip.amber, chip.labelAmber],
  red: [chip.red, chip.labelRed],
};

export function Chip({ label, tone = 'grey', testID }) {
  const [toneStyle, labelStyle] = CHIP_TONES[tone] ?? CHIP_TONES.grey;
  return (
    <View testID={testID} style={[chip.base, toneStyle]}>
      <Text style={[chip.label, labelStyle]}>{label}</Text>
    </View>
  );
}

/** Prototype `.topnav`: back affordance, centred title, balancing spacer. */
export function ScreenHeader({ title, onBack, right = null, testID }) {
  return (
    <View style={layout.topnav} testID={testID}>
      {onBack ? (
        <Pressable
          testID="header-back"
          accessibilityRole="button"
          accessibilityLabel="Go back"
          hitSlop={iconButtonHitSlop}
          onPress={onBack}
          style={layout.iconButton}
        >
          <Icon name="arrowLeft" size={17} color={colors.ink} strokeWidth={2.2} />
        </Pressable>
      ) : (
        <View style={layout.iconButtonSpacer} />
      )}
      <Text style={type.navTitle} numberOfLines={1}>
        {title}
      </Text>
      {right ?? <View style={layout.iconButtonSpacer} />}
    </View>
  );
}

/**
 * CONTEXT §9.4: every data view has loading, error and empty states. All three.
 */
export function LoadingState({ label = 'Loading…', testID = 'state-loading' }) {
  return (
    <View style={states.wrap} testID={testID}>
      <ActivityIndicator color={colors.blue600} />
      <Text style={[type.bodyMuted, states.text]}>{label}</Text>
    </View>
  );
}

export function ErrorState({ message, onRetry, testID = 'state-error' }) {
  return (
    <View style={states.wrap} testID={testID}>
      <Icon name="alert" size={26} color={colors.amberDark} strokeWidth={2} />
      <Text style={[type.body, states.title]}>Something went wrong</Text>
      <Text style={[type.bodyMuted, states.text]}>{message || 'Please try again.'}</Text>
      {onRetry ? <GhostButton testID="state-retry" label="Try again" onPress={onRetry} style={states.action} /> : null}
    </View>
  );
}

/**
 * DESIGN_SPEC §2.5. Every list gets one — never a blank area, never seeded
 * sample data. The body says what WILL appear here, not merely that nothing is
 * there, and a small primary CTA is preferred.
 */
export function EmptyState({ title, message, icon = 'inbox', ctaLabel, onCta, testID = 'state-empty' }) {
  return (
    <View style={emptyState.card} testID={testID}>
      <View style={emptyState.iconTile}>
        <Icon name={icon} size={21} color={colors.blue700} strokeWidth={2} />
      </View>
      <Text style={emptyState.title}>{title}</Text>
      {message ? <Text style={emptyState.body}>{message}</Text> : null}
      {ctaLabel && onCta ? (
        <PrimaryButton
          testID={`${testID}-cta`}
          label={ctaLabel}
          onPress={onCta}
          style={states.emptyCta}
        />
      ) : null}
    </View>
  );
}

/** A persistent, non-blocking banner. Used for offline and pending-sync state. */
const BANNER_TONES = {
  amber: { backgroundColor: colors.amberBg, borderColor: colors.amber },
  red: { backgroundColor: colors.redBg, borderColor: colors.red },
  blue: { backgroundColor: colors.blue100, borderColor: colors.blue600 },
};

export function Banner({ tone = 'amber', text, testID }) {
  return (
    <View style={[banners.base, BANNER_TONES[tone] ?? BANNER_TONES.amber]} testID={testID}>
      <Text style={banners.text}>{text}</Text>
    </View>
  );
}

export function FieldLabel({ children }) {
  return <Text style={[type.label, states.fieldLabel]}>{children}</Text>;
}

export function KeyValue({ label, value, testID }) {
  return (
    <View style={states.keyValue} testID={testID}>
      <Text style={type.meta}>{label}</Text>
      <Text style={[type.body, states.keyValueText]}>{value}</Text>
    </View>
  );
}

const states = StyleSheet.create({
  wrap: { alignItems: 'center', justifyContent: 'center', paddingVertical: 48, paddingHorizontal: 24, gap: 8 },
  glyph: {
    fontSize: 20,
    fontWeight: '800',
    color: colors.amberDark,
    width: 34,
    height: 34,
    borderRadius: 999,
    backgroundColor: colors.amberBg,
    textAlign: 'center',
    lineHeight: 34,
    overflow: 'hidden',
  },
  title: { fontWeight: '800', textAlign: 'center' },
  text: { textAlign: 'center' },
  action: { marginTop: 12, alignSelf: 'stretch' },
  fieldLabel: { marginBottom: 6 },
  emptyCta: { marginTop: 16, alignSelf: 'stretch', paddingVertical: 9, paddingHorizontal: 18 },
  keyValue: { gap: 3, marginBottom: 14 },
  keyValueText: { fontWeight: '700' },
});

const banners = StyleSheet.create({
  base: {
    marginHorizontal: 20,
    marginBottom: 12,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 12,
    borderWidth: 1,
  },
  text: { fontSize: 12.5, fontWeight: '700', color: colors.ink },
});
