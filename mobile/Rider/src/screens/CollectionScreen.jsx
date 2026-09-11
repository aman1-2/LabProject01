import React, { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { collectSample } from '@pathcare/api';
import { useInvalidateJobs } from '../api/riderHooks.js';
import { useOutbox } from '../offline/OutboxContext.jsx';
import { colors, type, layout, card, input } from '../theme.js';
import { Banner, Card, FieldLabel, PrimaryButton, ScreenHeader } from '../components/ui.jsx';
import { BigAction } from '../components/bigAction.jsx';
import { coldChainAdvice, COLD_CHAIN_ADVISORY } from '../lib/format.js';

/**
 * Recording the collection: the cold-chain reading, an optional note, confirm.
 *
 * The barcode is NOT entered here — the server generates it on this call and
 * returns it. The rider scans it afterwards, at handoff, to prove the tube in
 * the box is the tube in the record.
 */
export default function CollectionScreen({ navigation, route }) {
  const { bookingId } = route.params ?? {};
  const invalidateJobs = useInvalidateJobs();
  const { enqueue, isOnline } = useOutbox();

  const [temperature, setTemperature] = useState('');
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [result, setResult] = useState(null);

  const advice = coldChainAdvice(temperature);
  const parsedTemperature = temperature === '' ? undefined : Number(temperature);
  const temperatureInvalid =
    temperature !== '' && (Number.isNaN(parsedTemperature) || parsedTemperature < -30 || parsedTemperature > 60);

  async function confirm() {
    setBusy(true);
    setError(null);

    const payload = {
      ...(parsedTemperature === undefined ? {} : { temperature: parsedTemperature }),
      ...(notes.trim() ? { notes: notes.trim() } : {}),
    };

    try {
      const response = await collectSample(bookingId, payload);
      await invalidateJobs();
      // The barcode comes back from the server; it is what the rider will scan.
      setResult({ barcode: response?.sample?.barcode ?? null, queued: false });
    } catch (err) {
      if (err?.isNetworkError) {
        // The sample is physically in the box. Refusing to record that because
        // the radio dropped would lose the cold-chain reading entirely, so it
        // goes to the outbox and sends in order on reconnect.
        await enqueue({ kind: 'collect', bookingId, payload, label: 'Sample collected' });
        setResult({ barcode: null, queued: true });
      } else if (err?.code === 'SAMPLE_ALREADY_COLLECTED') {
        await invalidateJobs();
        setResult({ barcode: null, queued: false, already: true });
      } else {
        setError(err?.message || 'Could not record the collection.');
      }
    } finally {
      setBusy(false);
    }
  }

  if (result) {
    return (
      <View style={layout.screen} testID="screen-collection-done">
        <ScreenHeader title="Sample collected" onBack={navigation.goBack} />
        <ScrollView contentContainerStyle={layout.scrollBody}>
          <Card style={[card.padded, styles.card]}>
            <Text style={type.sectionTitle}>
              {result.queued ? 'Saved on this device' : result.already ? 'Already recorded' : 'Collection recorded'}
            </Text>
            {result.queued ? (
              <Text style={type.bodyMuted}>
                You are offline. This collection is saved and will be sent automatically when you reconnect. The barcode
                will be issued then.
              </Text>
            ) : result.barcode ? (
              <>
                <Text style={type.bodyMuted}>Label the vial with this barcode:</Text>
                <Text style={styles.barcode} testID="text-barcode">
                  {result.barcode}
                </Text>
              </>
            ) : (
              <Text style={type.bodyMuted}>This collection was already recorded for this booking.</Text>
            )}
          </Card>

          <PrimaryButton
            testID="btn-collection-done"
            label="Back to job"
            onPress={() => navigation.navigate('JobDetail', { bookingId })}
          />
        </ScrollView>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={layout.screen}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      testID="screen-collection"
    >
      <ScreenHeader title="Record collection" onBack={navigation.goBack} />
      {!isOnline ? <Banner tone="amber" text="Offline — this will be saved and sent when you reconnect." /> : null}
      {error ? <Banner tone="red" text={error} testID="collection-error" /> : null}

      <ScrollView contentContainerStyle={layout.scrollBody} keyboardShouldPersistTaps="handled">
        <Card style={[card.padded, styles.card]}>
          <FieldLabel>Transport box temperature (°C)</FieldLabel>
          <TextInput
            testID="input-temperature"
            style={[input.base, temperatureInvalid && input.invalid]}
            value={temperature}
            onChangeText={setTemperature}
            placeholder={`${COLD_CHAIN_ADVISORY.min}–${COLD_CHAIN_ADVISORY.max}`}
            placeholderTextColor={colors.muted2}
            keyboardType="numbers-and-punctuation"
            returnKeyType="done"
          />
          {temperatureInvalid ? (
            <Text style={styles.invalid} testID="temperature-invalid">
              Enter a reading between -30 and 60°C.
            </Text>
          ) : null}
          {/* Advisory, not a block: a real out-of-range reading is evidence and
              must be recordable, or the cold-chain log quietly loses the one
              entry that mattered. */}
          {advice ? (
            <Text style={styles.advice} testID="temperature-advice">
              {advice}
            </Text>
          ) : null}
        </Card>

        <Card style={[card.padded, styles.card]}>
          <FieldLabel>Notes (optional)</FieldLabel>
          <TextInput
            testID="input-notes"
            style={[input.base, styles.notes]}
            value={notes}
            onChangeText={setNotes}
            placeholder="Anything the lab should know"
            placeholderTextColor={colors.muted2}
            multiline
            maxLength={300}
          />
        </Card>

        {/* Green because this is the "done, move on" of the collection. The
            icon says it as well as the words, for a rider who reads little. */}
        <BigAction
          testID="btn-confirm-collection"
          icon="check"
          label="Collected"
          hint="Sample taken and labelled"
          tone="go"
          onPress={confirm}
          loading={busy}
          disabled={temperatureInvalid}
        />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  card: { marginBottom: 14, gap: 8 },
  notes: { minHeight: 92, textAlignVertical: 'top' },
  advice: { fontSize: 12.5, fontWeight: '700', color: colors.amberDark },
  invalid: { fontSize: 12.5, fontWeight: '700', color: colors.redDark },
  barcode: {
    fontSize: 22,
    fontWeight: '800',
    letterSpacing: 1.5,
    color: colors.ink,
    fontVariant: ['tabular-nums'],
    marginTop: 4,
  },
});
