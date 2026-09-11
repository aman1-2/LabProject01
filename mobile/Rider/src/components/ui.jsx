import React from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, type, card, button, chip, layout, iconButtonHitSlop, TOPNAV_GAP } from '../theme.js';
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
/**
 * The row at the very top of a screen.
 *
 * Android draws this app edge-to-edge, so a header with a fixed top padding
 * lands underneath the clock and the battery icon. The inset has to be read at
 * runtime rather than hard-coded: a notch, a punch-hole and a plain status bar
 * are all different heights, and a rider tapping "back" on a phone where that
 * control sits under the carrier name is a support call.
 */
export function TopBar({ children, style, testID }) {
  const insets = useSafeAreaInsets();
  return (
    // The inset goes last on purpose. A caller passing `paddingTop` in `style`
    // would otherwise slide the header back under the status bar — which is
    // exactly how this bug survived its first fix. Callers wanting more room
    // above the row should use marginTop.
    <View style={[layout.topnav, style, { paddingTop: insets.top + TOPNAV_GAP }]} testID={testID}>
      {children}
    </View>
  );
}

export function ScreenHeader({ title, onBack, right = null, testID }) {
  return (
    <TopBar testID={testID}>
      {onBack ? (
        <Pressable
          testID="header-back"
          accessibilityRole="button"
          accessibilityLabel="Go back"
          hitSlop={iconButtonHitSlop}
          onPress={onBack}
          style={layout.iconButton}
        >
          <Text style={layout.iconButtonGlyph}>←</Text>
        </Pressable>
      ) : (
        <View style={layout.iconButtonSpacer} />
      )}
      <Text style={type.navTitle} numberOfLines={1}>
        {title}
      </Text>
      {right ?? <View style={layout.iconButtonSpacer} />}
    </TopBar>
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

export function EmptyState({ title, message, icon = 'inbox', testID = 'state-empty' }) {
  return (
    <View style={states.wrap} testID={testID}>
      <Icon name={icon} size={26} color={colors.muted2} strokeWidth={1.8} />
      <Text style={[type.body, states.title]}>{title}</Text>
      {message ? <Text style={[type.bodyMuted, states.text]}>{message}</Text> : null}
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
