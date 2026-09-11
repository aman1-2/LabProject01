import React from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { colors } from '../theme.js';

/**
 * Shown only while the stored session is being checked (CONTEXT §7.3: the app
 * is auth-first). It never decides anything — AuthContext does — so it cannot
 * flash the Jobs list to a rider whose session has expired.
 *
 * Matches the prototype's `#screen-splash`: centred wordmark on the app ground.
 */
export default function SplashScreen() {
  return (
    <View style={styles.screen} testID="screen-splash">
      <View style={styles.mark}>
        <Text style={styles.wordmark}>
          <Text style={styles.wordmarkAccent}>Path</Text>Care
        </Text>
        <Text style={styles.subtitle}>Diagnostics, delivered</Text>
      </View>
      <ActivityIndicator color={colors.blue600} />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bg, gap: 28 },
  mark: { alignItems: 'center', gap: 6 },
  // Prototype splash wordmark: 26px / 800.
  wordmark: { fontSize: 26, fontWeight: '800', color: colors.ink, letterSpacing: -0.5 },
  wordmarkAccent: { color: colors.blue600 },
  subtitle: { fontSize: 13, fontWeight: '700', color: colors.muted, letterSpacing: 0.4 },
});
