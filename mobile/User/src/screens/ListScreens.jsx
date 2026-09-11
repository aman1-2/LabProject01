import React, { useState } from 'react';
import { ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  fetchAddresses,
  createAddress,
  fetchFamilyMembers,
  createFamilyMember,
  fetchPatientBookings,
  patientKeys,
} from '@pathcare/api';
import { colors, type, input, layout } from '../theme.js';
import {
  Card,
  Chip,
  EmptyState,
  ErrorState,
  FieldLabel,
  LoadingState,
  PrimaryButton,
  ScreenHeader,
} from '../components/ui.jsx';
import { formatCurrency, formatSlot, testNamesOf, STATUS_LABELS, STATUS_TONES } from '../lib/format.js';
import { DEHRADUN } from '../config/city.js';

/**
 * The Profile sub-screens: addresses, family members, bookings, reports.
 *
 * Every one starts empty and fills only from real user action (CONTEXT §3.1),
 * and every one has all three of loading, error and empty (§9.4). The empty
 * states say what WILL appear, per DESIGN_SPEC §2.5.
 */

// ── Addresses ──────────────────────────────────────────────────────────────

export function AddressesScreen({ navigation }) {
  const queryClient = useQueryClient();
  const [label, setLabel] = useState('Home');
  const [line, setLine] = useState('');
  const [pincode, setPincode] = useState('');
  const [error, setError] = useState(null);

  const query = useQuery({ queryKey: patientKeys.addresses(), queryFn: () => fetchAddresses() });
  const addresses = query.data?.items ?? query.data ?? [];

  const mutation = useMutation({
    mutationFn: (payload) => createAddress(payload),
    onSuccess: async () => {
      setLine('');
      setPincode('');
      setError(null);
      await queryClient.invalidateQueries({ queryKey: patientKeys.addresses() });
    },
    onError: (err) => setError(err?.message || 'Could not save that address.'),
  });

  return (
    <View style={layout.screen} testID="screen-addresses">
      <ScreenHeader title="Address Book" onBack={navigation.goBack} />
      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        {query.isLoading ? <LoadingState label="Loading addresses…" /> : null}
        {query.isError ? <ErrorState message={query.error?.message} onRetry={query.refetch} /> : null}

        {!query.isLoading && !query.isError && addresses.length === 0 ? (
          <EmptyState
            testID="empty-addresses"
            icon="mapPin"
            title="No addresses yet"
            message="Add the address where a phlebotomist should collect your sample. It appears here and at checkout."
          />
        ) : null}

        {addresses.map((address) => (
          <Card key={address._id} style={styles.itemCard} testID={`address-${address._id}`}>
            <View style={styles.itemHeader}>
              <Text style={styles.itemTitle}>{address.label}</Text>
              {address.isDefault ? <Chip label="Default" tone="blue" /> : null}
            </View>
            <Text style={styles.itemMeta}>
              {address.line} · {address.pincode}
            </Text>
          </Card>
        ))}

        <Text style={styles.formHeading}>Add an address</Text>
        {error ? <Text style={styles.error}>{error}</Text> : null}

        <FieldLabel>Label</FieldLabel>
        <TextInput
          testID="input-address-label"
          style={[input.base, styles.field]}
          value={label}
          onChangeText={setLabel}
          placeholder="Home"
          placeholderTextColor={colors.muted2}
        />
        <FieldLabel>Address</FieldLabel>
        <TextInput
          testID="input-address-line"
          style={[input.base, styles.field]}
          value={line}
          onChangeText={setLine}
          placeholder="House / street / area, Dehradun"
          placeholderTextColor={colors.muted2}
          multiline
        />
        <FieldLabel>Pincode</FieldLabel>
        <TextInput
          testID="input-address-pincode"
          style={[input.base, styles.field]}
          value={pincode}
          onChangeText={setPincode}
          placeholder="248001"
          placeholderTextColor={colors.muted2}
          keyboardType="number-pad"
          maxLength={6}
        />

        <PrimaryButton
          testID="btn-save-address"
          label="Save address"
          loading={mutation.isPending}
          disabled={!line.trim() || pincode.trim().length !== 6}
          onPress={() =>
            mutation.mutate({
              label: label.trim() || 'Home',
              line: line.trim(),
              pincode: pincode.trim(),
              // Dehradun city coordinates until the patient pins a precise spot.
              lat: DEHRADUN.lat,
              lng: DEHRADUN.lng,
            })
          }
        />
      </ScrollView>
    </View>
  );
}

// ── Family members ─────────────────────────────────────────────────────────

export function FamilyScreen({ navigation }) {
  const queryClient = useQueryClient();
  const [name, setName] = useState('');
  const [relation, setRelation] = useState('');
  const [age, setAge] = useState('');
  const [gender, setGender] = useState('');
  const [error, setError] = useState(null);

  const query = useQuery({ queryKey: patientKeys.familyMembers(), queryFn: () => fetchFamilyMembers() });
  const members = query.data?.items ?? query.data ?? [];

  const mutation = useMutation({
    mutationFn: (payload) => createFamilyMember(payload),
    onSuccess: async () => {
      setName('');
      setRelation('');
      setAge('');
      setGender('');
      setError(null);
      await queryClient.invalidateQueries({ queryKey: patientKeys.familyMembers() });
    },
    onError: (err) => setError(err?.message || 'Could not add that family member.'),
  });

  return (
    <View style={layout.screen} testID="screen-family">
      <ScreenHeader title="Family Members" onBack={navigation.goBack} />
      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        {query.isLoading ? <LoadingState label="Loading family…" /> : null}
        {query.isError ? <ErrorState message={query.error?.message} onRetry={query.refetch} /> : null}

        {!query.isLoading && !query.isError && members.length === 0 ? (
          <EmptyState
            testID="empty-family"
            icon="users"
            title="No family members yet"
            message="Add a family member to book a test in their name. Their reports stay under your account."
          />
        ) : null}

        {members.map((member) => (
          <Card key={member._id} style={styles.itemCard} testID={`family-${member._id}`}>
            <Text style={styles.itemTitle}>{member.name}</Text>
            <Text style={styles.itemMeta}>
              {[member.relation, member.age ? `${member.age} yrs` : null, member.gender].filter(Boolean).join(' · ')}
            </Text>
          </Card>
        ))}

        <Text style={styles.formHeading}>Add a family member</Text>
        {error ? <Text style={styles.error}>{error}</Text> : null}

        <FieldLabel>Name</FieldLabel>
        <TextInput
          testID="input-family-name"
          style={[input.base, styles.field]}
          value={name}
          onChangeText={setName}
          placeholder="Full name"
          placeholderTextColor={colors.muted2}
        />
        <FieldLabel>Relation</FieldLabel>
        <TextInput
          testID="input-family-relation"
          style={[input.base, styles.field]}
          value={relation}
          onChangeText={setRelation}
          placeholder="Mother, son, spouse…"
          placeholderTextColor={colors.muted2}
        />
        <FieldLabel>Age</FieldLabel>
        <TextInput
          testID="input-family-age"
          style={[input.base, styles.field]}
          value={age}
          onChangeText={setAge}
          placeholder="42"
          placeholderTextColor={colors.muted2}
          keyboardType="number-pad"
          maxLength={3}
        />
        <FieldLabel>Gender</FieldLabel>
        <TextInput
          testID="input-family-gender"
          style={[input.base, styles.field]}
          value={gender}
          onChangeText={setGender}
          placeholder="female / male / other"
          placeholderTextColor={colors.muted2}
          autoCapitalize="none"
        />

        <PrimaryButton
          testID="btn-save-family"
          label="Add member"
          loading={mutation.isPending}
          disabled={!name.trim() || !relation.trim()}
          onPress={() =>
            mutation.mutate({
              name: name.trim(),
              relation: relation.trim(),
              ...(age.trim() ? { age: Number(age) } : {}),
              ...(gender.trim() ? { gender: gender.trim().toLowerCase() } : {}),
            })
          }
        />
      </ScrollView>
    </View>
  );
}

// ── Bookings ───────────────────────────────────────────────────────────────

export function BookingsScreen({ navigation }) {
  const query = useQuery({
    queryKey: patientKeys.bookings({ scope: 'all' }),
    queryFn: () => fetchPatientBookings({ limit: 50 }),
  });
  const bookings = query.data?.items ?? query.data ?? [];

  return (
    <View style={layout.screen} testID="screen-bookings">
      <ScreenHeader title="My Bookings" onBack={navigation.goBack} />
      <ScrollView contentContainerStyle={styles.body}>
        {query.isLoading ? <LoadingState label="Loading bookings…" /> : null}
        {query.isError ? (
          <ErrorState
            message={query.error?.isNetworkError ? 'No connection.' : query.error?.message}
            onRetry={query.refetch}
          />
        ) : null}

        {!query.isLoading && !query.isError && bookings.length === 0 ? (
          <EmptyState
            testID="empty-bookings"
            icon="calendar"
            title="No bookings yet"
            message="Your booking history appears here once you book your first test."
            ctaLabel="Browse tests"
            onCta={() => navigation.navigate('TestsTab')}
          />
        ) : null}

        {bookings.map((booking) => (
          <Card key={booking._id} style={styles.itemCard} testID={`booking-${booking._id}`}>
            <View style={styles.itemHeader}>
              <Text style={styles.itemTitle} numberOfLines={1}>
                {testNamesOf(booking)}
              </Text>
              <Chip
                label={STATUS_LABELS[booking.status] ?? booking.status}
                tone={STATUS_TONES[booking.status] ?? 'grey'}
              />
            </View>
            <Text style={styles.itemMeta}>{formatSlot(booking.slotDateTime)}</Text>
            <Text style={styles.itemMeta}>
              {formatCurrency(booking.amount)} ·{' '}
              {booking.paymentStatus === 'paid' ? 'Paid' : booking.paymentMode === 'cash' ? 'Cash on collection' : 'Payment pending'}
            </Text>
          </Card>
        ))}
      </ScrollView>
    </View>
  );
}

// ── Reports ────────────────────────────────────────────────────────────────

export function ReportsScreen({ navigation }) {
  const query = useQuery({
    queryKey: patientKeys.bookings({ scope: 'reports' }),
    queryFn: () => fetchPatientBookings({ limit: 50 }),
  });

  const all = query.data?.items ?? query.data ?? [];
  // A report exists once the lab has published it.
  const withReports = all.filter((booking) => ['report_ready', 'completed'].includes(booking.status));

  return (
    <View style={layout.screen} testID="screen-reports">
      <ScreenHeader title="Lab Reports" onBack={navigation.goBack} />
      <ScrollView contentContainerStyle={styles.body}>
        {query.isLoading ? <LoadingState label="Loading reports…" /> : null}
        {query.isError ? <ErrorState message={query.error?.message} onRetry={query.refetch} /> : null}

        {!query.isLoading && !query.isError && withReports.length === 0 ? (
          <EmptyState
            testID="empty-reports"
            icon="testTube"
            title="No reports yet"
            message="When a lab publishes a report for one of your tests, it appears here with a plain-language summary."
          />
        ) : null}

        {withReports.map((booking) => (
          <Card key={booking._id} style={styles.itemCard} testID={`report-${booking._id}`}>
            <View style={styles.itemHeader}>
              <Text style={styles.itemTitle} numberOfLines={1}>
                {testNamesOf(booking)}
              </Text>
              <Chip label="Ready" tone="green" />
            </View>
            <Text style={styles.itemMeta}>{formatSlot(booking.slotDateTime)}</Text>
          </Card>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  body: { paddingHorizontal: 20, paddingBottom: 60 },
  itemCard: { padding: 16, marginBottom: 12, gap: 4 },
  itemHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 10 },
  itemTitle: { fontWeight: '800', fontSize: 14, color: colors.ink, flex: 1 },
  itemMeta: { ...type.meta, lineHeight: 17 },
  formHeading: { fontWeight: '800', fontSize: 15, color: colors.ink, marginTop: 26, marginBottom: 14 },
  field: { marginBottom: 14 },
  error: { color: colors.redDark, fontWeight: '700', fontSize: 12.5, marginBottom: 12 },
});
