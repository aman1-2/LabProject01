import React, { useCallback, useEffect, useRef } from 'react';
import { Animated, Easing, Platform, Pressable, StyleSheet, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import { colors } from '../theme.js';

/**
 * Motion and depth.
 *
 * What separates an app that feels native from one that looks like a web page
 * in a phone frame is mostly not colour or shape — the design system already
 * fixes those. It is that touch produces immediate physical feedback, surfaces
 * have depth, and waiting shows the SHAPE of what is coming rather than a
 * spinner. None of that can be expressed in a static HTML prototype, so none of
 * it contradicts one.
 *
 * DESIGN_SPEC §1.3 already specifies the shadows; they were simply never used.
 */

/** §1.3 shadows, translated from CSS box-shadow to RN elevation + shadow props. */
export const elevation = StyleSheet.create({
  // shadow.card — "0 16px 32px -14px rgba(16,20,53,.18)"
  card: {
    shadowColor: '#101435',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.1,
    shadowRadius: 16,
    elevation: 3,
  },
  // shadow.float — "0 20px 40px -12px rgba(16,20,40,.18)"
  float: {
    shadowColor: '#101428',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.16,
    shadowRadius: 24,
    elevation: 8,
  },
  // shadow.fab — green-tinted, for the WhatsApp FAB
  fab: {
    shadowColor: colors.green,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.45,
    shadowRadius: 16,
    elevation: 10,
  },
});

/**
 * A pressable that scales under the finger and fires a haptic tick.
 *
 * The scale is deliberately small (0.97). Anything larger reads as a toy; the
 * point is confirmation that the tap registered, which matters most on the slow
 * mid-range Android devices this audience actually uses.
 */
export function Pressable3D({
  children,
  onPress,
  style,
  disabled,
  haptic = 'light',
  scaleTo = 0.97,
  testID,
  accessibilityLabel,
  accessibilityRole = 'button',
}) {
  const scale = useRef(new Animated.Value(1)).current;

  const animate = useCallback(
    (to) => {
      Animated.spring(scale, {
        toValue: to,
        useNativeDriver: true,
        speed: 40,
        bounciness: 0,
      }).start();
    },
    [scale]
  );

  const handlePress = useCallback(
    (event) => {
      if (disabled) return;
      // iOS and Android both support this; a failure here must never block the
      // action the user actually asked for.
      if (haptic !== 'none') {
        Haptics.impactAsync(
          haptic === 'medium' ? Haptics.ImpactFeedbackStyle.Medium : Haptics.ImpactFeedbackStyle.Light
        ).catch(() => {});
      }
      onPress?.(event);
    },
    [disabled, haptic, onPress]
  );

  return (
    <Pressable
      testID={testID}
      accessibilityRole={accessibilityRole}
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled: Boolean(disabled) }}
      onPressIn={() => animate(scaleTo)}
      onPressOut={() => animate(1)}
      onPress={handlePress}
      disabled={disabled}
    >
      <Animated.View style={[{ transform: [{ scale }] }, style]}>{children}</Animated.View>
    </Pressable>
  );
}

/** Success feedback for things that complete — a booking, a collection. */
export function notifySuccess() {
  Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
}

export function notifyWarning() {
  Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
}

/**
 * A shimmering placeholder block.
 *
 * Replaces spinners on first load. A spinner says "something is happening";
 * a skeleton says "a card of roughly this shape is coming", which makes the
 * wait feel shorter and stops the layout jumping when content lands.
 */
export function Skeleton({ width = '100%', height = 14, radius = 8, style }) {
  const shimmer = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(shimmer, {
          toValue: 1,
          duration: 900,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(shimmer, {
          toValue: 0,
          duration: 900,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [shimmer]);

  const opacity = shimmer.interpolate({ inputRange: [0, 1], outputRange: [0.45, 0.9] });

  return (
    <Animated.View
      style={[{ width, height, borderRadius: radius, backgroundColor: colors.border, opacity }, style]}
    />
  );
}

/** A skeleton shaped like the catalogue/booking cards, so nothing shifts on load. */
export function SkeletonCard({ style }) {
  return (
    <View style={[skeletonStyles.card, style]}>
      <Skeleton width="62%" height={15} />
      <Skeleton width="40%" height={11} style={skeletonStyles.gap} />
      <View style={skeletonStyles.row}>
        <Skeleton width={72} height={20} radius={999} />
        <Skeleton width={54} height={20} radius={999} />
      </View>
    </View>
  );
}

export function SkeletonList({ count = 3 }) {
  return (
    <View testID="state-loading">
      {Array.from({ length: count }, (_, index) => (
        <SkeletonCard key={index} />
      ))}
    </View>
  );
}

/** Fades and lifts children in on mount. Used for screen content. */
export function FadeInView({ children, delay = 0, style }) {
  const progress = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(progress, {
      toValue: 1,
      duration: 260,
      delay,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [progress, delay]);

  return (
    <Animated.View
      style={[
        {
          opacity: progress,
          transform: [{ translateY: progress.interpolate({ inputRange: [0, 1], outputRange: [10, 0] }) }],
        },
        style,
      ]}
    >
      {children}
    </Animated.View>
  );
}

/** Android has no native shadow blur on some OEMs; elevation carries it there. */
export const shadowFor = (level = 'card') =>
  Platform.select({ ios: elevation[level], android: elevation[level], default: elevation[level] });

const skeletonStyles = StyleSheet.create({
  card: {
    backgroundColor: colors.white,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 16,
    marginBottom: 14,
    gap: 10,
  },
  gap: { marginTop: 2 },
  row: { flexDirection: 'row', gap: 8, marginTop: 6 },
});
