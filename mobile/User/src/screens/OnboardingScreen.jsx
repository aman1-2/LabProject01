import React, { useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { colors, type } from '../theme.js';
import { GhostButton, PrimaryButton } from '../components/ui.jsx';
import BlobHero from '../components/BlobHero.jsx';

/**
 * Three-screen onboarding, transcribed from the prototype's #screen-onboard1..3.
 *
 * Copy is the prototype's, verbatim — it makes only claims true on day one
 * (CONTEXT §3.1: no fabricated counts, no "50,000+ samples collected").
 */
const SLIDES = [
  {
    key: 'collection',
    // Prototype gradient: #7C93EE -> #3E63DD 60% -> #1B2C6B
    colors: ['#7C93EE', colors.blue600, colors.blueGradientEnd],
    title: 'Diagnostics, delivered to your door',
    body: 'Book a certified phlebotomist for home sample collection — no clinic queue required.',
  },
  {
    key: 'tracking',
    // Prototype onboard2 gradient: #86E0C4 -> #16A34A 60% -> #0B4B2C
    colors: ['#86E0C4', colors.green, '#0B4B2C'],
    title: 'Track your rider, live',
    body: 'Watch every step — booked, en route, collected — right from your phone.',
  },
  {
    key: 'welcome',
    // Prototype onboard3 gradient: #F0A8E0 -> #EF4444 60% -> #7A1B1B
    colors: ['#F0A8E0', colors.red, '#7A1B1B'],
    title: 'Welcome to PathCare',
    body: "Book tests, consult partner doctors, and manage your family's health in one place.",
  },
];

export default function OnboardingScreen({ onCreateAccount, onSignIn }) {
  const [index, setIndex] = useState(0);
  const slide = SLIDES[index];
  const isLast = index === SLIDES.length - 1;

  return (
    <View style={styles.screen} testID="screen-onboarding">
      <ScrollView contentContainerStyle={styles.body}>
        <BlobHero colors={slide.colors} testID={`blob-${slide.key}`} />

        <View style={styles.copy}>
          <Text style={styles.title}>{slide.title}</Text>
          <Text style={styles.text}>{slide.body}</Text>
        </View>

        {/* Prototype dot indicator: active pill 20x5, inactive dot 5x5. */}
        <View style={styles.dots}>
          {SLIDES.map((item, i) => (
            <View key={item.key} style={[styles.dot, i === index && styles.dotActive]} />
          ))}
        </View>

        {isLast ? (
          <>
            <PrimaryButton
              testID="btn-create-account"
              label="Create an Account"
              onPress={onCreateAccount}
              style={styles.primary}
            />
            <GhostButton testID="btn-have-account" label="I already have an account" onPress={onSignIn} />
          </>
        ) : (
          <PrimaryButton testID="btn-onboard-next" label="Next" onPress={() => setIndex(index + 1)} />
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  // Prototype onboarding padding: 20px.
  body: { padding: 20, paddingTop: 32, flexGrow: 1, justifyContent: 'center' },
  copy: { alignItems: 'center', marginTop: 34, paddingHorizontal: 10 },
  // Prototype h2: 24px / 800.
  title: { fontSize: 24, fontWeight: '800', letterSpacing: -0.5, color: colors.ink, textAlign: 'center' },
  text: { ...type.bodyMuted, fontSize: 14.5, textAlign: 'center', marginTop: 12, lineHeight: 23 },
  dots: { flexDirection: 'row', gap: 6, justifyContent: 'center', marginVertical: 26 },
  dot: { width: 5, height: 5, borderRadius: 99, backgroundColor: colors.border },
  dotActive: { width: 20, backgroundColor: colors.blue600 },
  primary: { marginBottom: 10 },
});
