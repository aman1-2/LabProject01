import React, { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { submitSampleAtLab } from '@pathcare/api';
import { useInvalidateJobs } from '../api/riderHooks.js';
import { useOutbox } from '../offline/OutboxContext.jsx';
import { colors, type, layout, card, input } from '../theme.js';
import { Banner, Card, FieldLabel, GhostButton, PrimaryButton, ScreenHeader } from '../components/ui.jsx';
import { BigAction } from '../components/bigAction.jsx';
import BarcodeScanner from '../components/BarcodeScanner.jsx';
import { coldChainAdvice, COLD_CHAIN_ADVISORY } from '../lib/format.js';

/**
 * Handoff at the lab: scan the vial, take the closing cold-chain reading, submit.
 *
 * The scan is a verification gate. The barcode was issued by the server at
 * collection, so scanning proves the tube being handed over is the tube on the
 * record — the failure this catches is a rider carrying two collections and
 * handing over the wrong one, which silently attaches one patient's blood to
 * another patient's report.
 */
export default function HandoffScreen({ navigation, route }) {
  const { bookingId, barcode } = route.params ?? {};
  const invalidateJobs = useInvalidateJobs();
  const { enqueue, isOnline } = useOutbox();

  const [scanned, setScanned] = useState(null);
  const [temperature, setTemperature] = useState('');
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [done, setDone] = useState(null);

  const advice = coldChainAdvice(temperature);
  const parsedTemperature = temperature === '' ? undefined : Number(temperature);
  const temperatureInvalid =
    temperature !== '' && (Number.isNaN(parsedTemperature) || parsedTemperature < -30 || parsedTemperature > 60);

  /**
   * When the booking has no barcode yet the collection is still sitting in the
   * outbox. Submitting now would arrive before it and be rejected as an invalid
   * transition, so the handoff is blocked until the queue drains.
   */
  const awaitingCollectionSync = !barcode;
  const verified = Boolean(scanned) || awaitingCollectionSync;

  async function submit() {
    setBusy(true);
    setError(null);

    const payload = {
      ...(parsedTemperature === undefined ? {} : { temperature: parsedTemperature }),
      ...(notes.trim() ? { notes: notes.trim() } : {}),
    };

    try {
      await submitSampleAtLab(bookingId, payload);
      await invalidateJobs();
      setDone({ queued: false });
    } catch (err) {
      if (err?.isNetworkError) {
        await enqueue({ kind: 'submitted', bookingId, payload, label: 'Handed off at lab' });
        setDone({ queued: true });
      } else {
        setError(err?.message || 'Could not record the handoff.');
      }
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <View style={layout.screen} testID="screen-handoff-done">
        <ScreenHeader title="Handed off" onBack={() => navigation.navigate('JobsTab')} />
        <ScrollView contentContainerStyle={layout.scrollBody}>
          <Card style={[card.padded, styles.card]}>
            <Text style={type.sectionTitle}>{done.queued ? 'Saved on this device' : 'Handoff recorded'}</Text>
            <Text style={type.bodyMuted}>
              {done.queued
                ? 'You are offline. The handoff is saved and will be sent when you reconnect.'
                : 'The lab has the sample. This collection is complete.'}
            </Text>
          </Card>
          <PrimaryButton testID="btn-handoff-done" label="Back to jobs" onPress={() => navigation.navigate('JobsTab')} />
        </ScrollView>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={layout.screen}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      testID="screen-handoff"
    >
      <ScreenHeader title="Hand off at lab" onBack={navigation.goBack} />
      {!isOnline ? <Banner tone="amber" text="Offline — this will be saved and sent when you reconnect." /> : null}
      {error ? <Banner tone="red" text={error} testID="handoff-error" /> : null}
      {awaitingCollectionSync ? (
        <Banner
          testID="banner-awaiting-collection"
          tone="amber"
          text="The collection has not synced yet, so there is no barcode to scan. Reconnect to finish this handoff."
        />
      ) : null}

      <ScrollView contentContainerStyle={layout.scrollBody} keyboardShouldPersistTaps="handled">
        {!awaitingCollectionSync ? (
          <Card style={[card.padded, styles.card]} testID="card-scan">
            <Text style={styles.heading}>1 · Scan the vial</Text>
            <Text style={type.bodyMuted}>Point the camera at the barcode on the tube.</Text>
            {scanned ? (
              <View testID="scan-confirmed" style={styles.confirmed}>
                <Text style={styles.confirmedText}>Verified · {scanned}</Text>
                <GhostButton testID="btn-scan-again" label="Scan a different tube" onPress={() => setScanned(null)} />
              </View>
            ) : (
              <BarcodeScanner expected={barcode} onScan={setScanned} />
            )}
          </Card>
        ) : null}

        <Card style={[card.padded, styles.card]}>
          <Text style={styles.heading}>{awaitingCollectionSync ? '1' : '2'} · Temperature at handoff (°C)</Text>
          <FieldLabel>Transport box temperature</FieldLabel>
          <TextInput
            testID="input-handoff-temperature"
            style={[input.base, temperatureInvalid && input.invalid]}
            value={temperature}
            onChangeText={setTemperature}
            placeholder={`${COLD_CHAIN_ADVISORY.min}–${COLD_CHAIN_ADVISORY.max}`}
            placeholderTextColor={colors.muted2}
            keyboardType="numbers-and-punctuation"
            returnKeyType="done"
          />
          {temperatureInvalid ? (
            <Text style={styles.invalid}>Enter a reading between -30 and 60°C.</Text>
          ) : null}
          {advice ? <Text style={styles.advice}>{advice}</Text> : null}

          <FieldLabel>Notes (optional)</FieldLabel>
          <TextInput
            testID="input-handoff-notes"
            style={[input.base, styles.notes]}
            value={notes}
            onChangeText={setNotes}
            placeholder="Anything the lab should know"
            placeholderTextColor={colors.muted2}
            multiline
            maxLength={300}
          />
        </Card>

        {/* Disabled until the tube is scanned. The hint below says why, in
            one short line — a greyed-out button with no reason is the single
            most confusing thing an app can show someone. */}
        <BigAction
          testID="btn-submit-handoff"
          icon="hospital"
          label="Hand in"
          hint="Give the tube to the lab"
          tone="go"
          onPress={submit}
          loading={busy}
          disabled={!verified || temperatureInvalid || awaitingCollectionSync}
        />
        {!verified && !awaitingCollectionSync ? (
          <Text style={styles.hint} testID="handoff-hint">
            Scan the vial barcode to enable submission.
          </Text>
        ) : null}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  card: { marginBottom: 14, gap: 8 },
  heading: { ...type.cardTitle, marginBottom: 2 },
  notes: { minHeight: 80, textAlignVertical: 'top' },
  advice: { fontSize: 12.5, fontWeight: '700', color: colors.amberDark },
  invalid: { fontSize: 12.5, fontWeight: '700', color: colors.redDark },
  confirmed: { gap: 10 },
  confirmedText: {
    fontSize: 13.5,
    fontWeight: '800',
    color: colors.green,
    backgroundColor: colors.greenBg,
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
    overflow: 'hidden',
  },
  hint: { ...type.meta, textAlign: 'center', marginTop: 10 },
});
