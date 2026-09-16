import React, { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { fetchTestDetail, fetchLabsForTest, patientKeys } from '@pathcare/api';
import { getBundledTestBySlug } from '../catalogue/bundledCatalogue.js';
import { colors, type, card, chip, layout } from '../theme.js';
import { Banner, Chip, ErrorState, LoadingState, PrimaryButton, ScreenHeader } from '../components/ui.jsx';
import Icon from '../components/Icon.jsx';
import { formatCurrency, homeCollectionNote } from '../lib/format.js';
import { CITY_CENTRE as DEHRADUN } from '../config/locale.js';

/**
 * Test details, transcribed from the prototype's #screen-testdetails: gradient
 * header, chips, description, amber prep callout, lab selector, and a FIXED
 * BOTTOM BAR with price + Book (DESIGN_SPEC §4, §5).
 *
 * The mode selector follows the web rule (§3.5): home collection is shown but
 * VISIBLY DISABLED AND EXPLAINED for tests that need lab equipment, rather than
 * hidden. Hiding it leaves the patient wondering; §6 says explain why.
 */
export default function TestDetailScreen({ navigation, route }) {
  const { slug } = route.params ?? {};
  const [mode, setMode] = useState('home');
  const [selectedLabId, setSelectedLabId] = useState(null);

  // Bundled copy paints instantly; the query replaces it. Marked stale, so it
  // can never reach checkout.
  const bundled = getBundledTestBySlug(slug);

  const testQuery = useQuery({
    queryKey: patientKeys.test(slug),
    queryFn: () => fetchTestDetail(slug),
    enabled: Boolean(slug),
  });

  const test = testQuery.data ?? bundled;
  const isStale = !testQuery.data && Boolean(bundled);

  const labsQuery = useQuery({
    queryKey: patientKeys.labs({ slug, lat: DEHRADUN.lat, lng: DEHRADUN.lng }),
    queryFn: () =>
      fetchLabsForTest({
        lat: DEHRADUN.lat,
        lng: DEHRADUN.lng,
        testId: testQuery.data?._id ?? testQuery.data?.id ?? slug,
      }),
    enabled: Boolean(testQuery.data),
  });

  const labs = labsQuery.data?.labs ?? [];
  const selectedLab = labs.find((lab) => String(lab.id) === String(selectedLabId)) ?? labs[0] ?? null;

  const homeUnavailableNote = homeCollectionNote(test);
  const effectiveMode = homeUnavailableNote ? 'visit' : mode;

  if (testQuery.isLoading && !bundled) {
    return (
      <View style={layout.screen} testID="screen-test-detail">
        <ScreenHeader title="Test" onBack={navigation.goBack} />
        <LoadingState label="Loading test…" />
      </View>
    );
  }

  if (!test) {
    return (
      <View style={layout.screen} testID="screen-test-detail">
        <ScreenHeader title="Test" onBack={navigation.goBack} />
        <ErrorState message={testQuery.error?.message || 'That test could not be found.'} onRetry={testQuery.refetch} />
      </View>
    );
  }

  const displayPrice = selectedLab?.price ?? test.basePrice;
  const canBook = Boolean(testQuery.data) && Boolean(selectedLab);

  return (
    <View style={layout.screen} testID="screen-test-detail">
      <ScreenHeader title="" onBack={navigation.goBack} />

      {isStale ? (
        <Banner
          testID="banner-stale-test"
          tone="amber"
          text="Showing bundled details while we refresh. The price is confirmed before you pay."
        />
      ) : null}

      <ScrollView contentContainerStyle={styles.body}>
        {/* Prototype: 150px gradient header block. */}
        <View style={styles.hero} />

        <View style={styles.chipRow}>
          <Chip label={sectionLabel(test.category)} tone="blue" />
          {test.strikePrice && test.strikePrice > test.basePrice ? (
            <Chip
              label={`${Math.round(((test.strikePrice - test.basePrice) / test.strikePrice) * 100)}% OFF`}
              tone="red"
            />
          ) : null}
          <Chip label={test.sampleType} tone="grey" />
        </View>

        <Text style={styles.title}>{test.name}</Text>
        <Text style={styles.description}>{test.description}</Text>

        {/* Prototype amber prep callout. */}
        {test.prepInstructions ? (
          <View style={styles.prep} testID="prep-callout">
            <Icon name="alert" size={15} color={colors.amberDark} strokeWidth={2.2} />
            <Text style={styles.prepText}>{test.prepInstructions}</Text>
          </View>
        ) : null}

        {/* Mode selector — §3.5 rule */}
        <Text style={styles.sectionLabel}>Collection mode</Text>
        <View style={styles.modeRow}>
          <ModeOption
            testID="mode-home"
            label="Home collection"
            sublabel={homeUnavailableNote ? 'Not available' : 'Free · at your address'}
            selected={effectiveMode === 'home'}
            disabled={Boolean(homeUnavailableNote)}
            onPress={() => setMode('home')}
          />
          <ModeOption
            testID="mode-visit"
            label="Lab visit"
            sublabel="At the centre"
            selected={effectiveMode === 'visit'}
            onPress={() => setMode('visit')}
          />
        </View>
        {homeUnavailableNote ? (
          <Text style={styles.modeNote} testID="home-unavailable-note">
            {homeUnavailableNote}
          </Text>
        ) : null}

        {/* Lab selector */}
        <Text style={styles.sectionLabel}>Choose lab centre</Text>
        {labsQuery.isLoading ? (
          <LoadingState label="Comparing labs near you…" />
        ) : labsQuery.isError ? (
          <ErrorState message={labsQuery.error?.message} onRetry={labsQuery.refetch} />
        ) : labs.length === 0 ? (
          <Text style={type.bodyMuted}>No partner lab near you offers this test yet.</Text>
        ) : (
          labs.map((lab) => {
            const selected = String(lab.id) === String(selectedLab?.id);
            return (
              <Pressable
                key={lab.id}
                testID={`lab-${lab.id}`}
                accessibilityRole="button"
                accessibilityState={{ selected }}
                onPress={() => setSelectedLabId(lab.id)}
                style={[card.base, styles.labCard, selected && card.selected]}
              >
                <View style={styles.labText}>
                  <Text style={styles.labName}>{lab.name}</Text>
                  <Text style={styles.labMeta}>
                    {lab.distanceKm} km
                    {lab.accreditation?.nabl ? ' · NABL accredited' : ''}
                  </Text>
                </View>
                <View style={styles.labRight}>
                  <Text style={styles.labPrice}>{formatCurrency(lab.price)}</Text>
                  <View style={[chip.base, chip.green, styles.labChip]}>
                    <Text style={[chip.label, chip.labelGreen]}>{lab.turnaroundHrs} hrs</Text>
                  </View>
                </View>
              </Pressable>
            );
          })
        )}
      </ScrollView>

      {/* §5: fixed bottom bar replaces the web sticky sidebar. */}
      <View style={styles.bottomBar}>
        <View>
          <Text style={styles.barPrice}>{formatCurrency(displayPrice)}</Text>
          {selectedLab ? (
            <Text style={styles.barMeta} numberOfLines={1}>
              at {selectedLab.name}
            </Text>
          ) : (
            <Text style={styles.barMeta}>Select a lab</Text>
          )}
        </View>
        <PrimaryButton
          testID="btn-book-slot"
          label="Book Slot"
          disabled={!canBook}
          onPress={() =>
            navigation.navigate('Booking', {
              slug: test.slug,
              testId: testQuery.data?._id ?? testQuery.data?.id,
              labCenterId: selectedLab.id,
              mode: effectiveMode,
            })
          }
          style={styles.barButton}
        />
      </View>
    </View>
  );
}

function ModeOption({ label, sublabel, selected, disabled, onPress, testID }) {
  return (
    <Pressable
      testID={testID}
      accessibilityRole="radio"
      accessibilityState={{ selected, disabled: Boolean(disabled) }}
      onPress={disabled ? undefined : onPress}
      style={[card.base, styles.modeCard, selected && card.selected, disabled && styles.modeDisabled]}
    >
      <Text style={[styles.modeLabel, disabled && styles.modeLabelDisabled]}>{label}</Text>
      <Text style={[styles.modeSub, disabled && styles.modeLabelDisabled]}>{sublabel}</Text>
    </Pressable>
  );
}

function sectionLabel(category) {
  return (
    { package: 'Full Body Checkup', plan: 'Care Plan', imaging: 'Imaging', single: 'Single Test' }[category] ??
    'Test'
  );
}

const styles = StyleSheet.create({
  body: { paddingHorizontal: 20, paddingBottom: 120 },
  hero: { width: '100%', height: 150, borderRadius: 16, backgroundColor: colors.blue600, marginBottom: 16 },
  chipRow: { flexDirection: 'row', gap: 6, marginBottom: 12, flexWrap: 'wrap' },
  title: { fontSize: 20, fontWeight: '800', letterSpacing: -0.4, color: colors.ink, marginBottom: 8 },
  description: { ...type.bodyMuted, fontSize: 13.5, marginBottom: 18 },
  prep: { backgroundColor: colors.amberBg, borderRadius: 20, padding: 14, marginBottom: 18, flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  prepText: { fontWeight: '700', fontSize: 13, color: colors.amberDark, flex: 1, lineHeight: 19 },
  sectionLabel: { fontWeight: '700', fontSize: 13.5, marginBottom: 10, marginTop: 6, color: colors.ink },
  modeRow: { flexDirection: 'row', gap: 10 },
  modeCard: { flex: 1, padding: 14, minHeight: 44 },
  modeDisabled: { backgroundColor: colors.disabledBg, borderColor: colors.border },
  modeLabel: { fontWeight: '800', fontSize: 13.5, color: colors.ink },
  modeLabelDisabled: { color: colors.muted2 },
  modeSub: { fontSize: 11.5, color: colors.muted, marginTop: 3 },
  modeNote: { marginTop: 10, fontSize: 12.5, fontWeight: '700', color: colors.amberDark, lineHeight: 18 },
  labCard: { padding: 14, marginBottom: 10, flexDirection: 'row', justifyContent: 'space-between', gap: 12 },
  labText: { flex: 1 },
  labName: { fontWeight: '700', fontSize: 13, color: colors.ink },
  labMeta: { color: colors.muted, fontSize: 11.5, marginTop: 2 },
  labRight: { alignItems: 'flex-end', gap: 6 },
  labPrice: { fontWeight: '800', fontSize: 15, color: colors.ink },
  labChip: { paddingVertical: 4, paddingHorizontal: 10 },
  bottomBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: colors.white,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: 14,
    paddingBottom: 28,
    paddingHorizontal: 20,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
  },
  barPrice: { fontWeight: '800', fontSize: 17, color: colors.blue600 },
  barMeta: { fontSize: 11.5, color: colors.muted, marginTop: 2, maxWidth: 150 },
  barButton: { paddingVertical: 11, paddingHorizontal: 22 },
});
