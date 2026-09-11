import React, { useEffect, useMemo, useState } from 'react';
import { Linking, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import MapView, { Marker, PROVIDER_GOOGLE } from 'react-native-maps';
import { fetchPatientBookings, patientKeys } from '@pathcare/api';
import { useBookingSocket } from '../lib/useBookingSocket.js';
import { GOOGLE_MAPS_ANDROID_KEY } from '../config/env.js';
import { colors, type, stepper, layout } from '../theme.js';
import {
  Banner,
  Card,
  Chip,
  EmptyState,
  ErrorState,
  GhostButton,
  LoadingState,
} from '../components/ui.jsx';
import Icon from '../components/Icon.jsx';
import { formatCurrency, formatSlot, stepsForBooking, testNamesOf, STATUS_LABELS } from '../lib/format.js';

/**
 * Track, transcribed from the prototype's #screen-track: vertical stepper with
 * connecting lines, then the rider card with circular call / WhatsApp buttons.
 *
 * A live map appears above the stepper during `en_route` (DESIGN_SPEC §3.7).
 * Rider position arrives over the socket, which is authenticated and scoped to
 * this booking's room — and on reconnect the current status is re-read over
 * REST, because Redis pub/sub has no replay (CONTEXT §6.3).
 */
const ACTIVE_STATUSES = [
  'pending',
  'rider_assigned',
  'en_route',
  'collected',
  'at_lab',
  'awaiting_confirm',
  'confirmed',
  'processing',
];

export default function TrackScreen({ navigation, route }) {
  const [selectedId, setSelectedId] = useState(route?.params?.bookingId ?? null);

  const bookingsQuery = useQuery({
    queryKey: patientKeys.bookings({ scope: 'track' }),
    queryFn: () => fetchPatientBookings({ limit: 20 }),
    refetchInterval: 30000,
  });

  // Derived inside the memo — a `?? []` literal outside it is a new array on
  // every render, which would make the memo recompute every time.
  const active = useMemo(() => {
    const bookings = bookingsQuery.data?.items ?? bookingsQuery.data ?? [];
    return Array.isArray(bookings) ? bookings.filter((b) => ACTIVE_STATUSES.includes(b.status)) : [];
  }, [bookingsQuery.data]);

  const booking = active.find((b) => b._id === selectedId) ?? active[0] ?? null;

  useEffect(() => {
    if (route?.params?.bookingId) setSelectedId(route.params.bookingId);
  }, [route?.params?.bookingId]);

  // Live rider position + status pushes for this booking only.
  const { riderPosition, connected } = useBookingSocket(booking?._id, {
    onStatusChange: () => bookingsQuery.refetch(),
  });

  if (bookingsQuery.isLoading) {
    return (
      <View style={layout.screen} testID="screen-track">
        <Header />
        <LoadingState label="Loading your bookings…" />
      </View>
    );
  }

  if (bookingsQuery.isError) {
    return (
      <View style={layout.screen} testID="screen-track">
        <Header />
        <ErrorState
          message={
            bookingsQuery.error?.isNetworkError
              ? 'No connection. Your tracking updates when you are back online.'
              : bookingsQuery.error?.message
          }
          onRetry={bookingsQuery.refetch}
        />
      </View>
    );
  }

  if (!booking) {
    return (
      <View style={layout.screen} testID="screen-track">
        <Header />
        <View style={styles.emptyWrap}>
          <EmptyState
            testID="empty-track"
            icon="compass"
            title="Nothing to track right now"
            message="Once you book a test, its progress — booked, rider assigned, en route, collected, report ready — appears here."
            ctaLabel="Browse tests"
            onCta={() => navigation.navigate('TestsTab')}
          />
        </View>
      </View>
    );
  }

  const steps = stepsForBooking(booking);
  const rider = booking.assignedRiderId;
  const riderUser = rider?.userId ?? rider;
  const showMap = booking.status === 'en_route';
  const destination = booking.collectionAddress;
  const mapsKeyMissing = Platform.OS === 'android' && !GOOGLE_MAPS_ANDROID_KEY;

  return (
    <View style={layout.screen} testID="screen-track">
      <Header />

      <ScrollView contentContainerStyle={styles.body}>
        <Text style={styles.reference}>
          {testNamesOf(booking)} · #{String(booking._id).slice(-6).toUpperCase()}
        </Text>

        {active.length > 1 ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.switcher}>
            {active.map((item) => (
              <Chip
                key={item._id}
                testID={`track-switch-${item._id}`}
                label={testNamesOf(item)}
                tone={item._id === booking._id ? 'blue' : 'grey'}
              />
            ))}
          </ScrollView>
        ) : null}

        {/* Live map during en_route only (§3.7) */}
        {showMap ? (
          mapsKeyMissing ? (
            <Banner
              testID="banner-map-key"
              tone="amber"
              text="Live map unavailable: no Google Maps key is configured for this build."
            />
          ) : destination?.lat ? (
            <View style={styles.mapWrap} testID="track-map">
              <MapView
                style={StyleSheet.absoluteFill}
                provider={Platform.OS === 'android' ? PROVIDER_GOOGLE : undefined}
                initialRegion={{
                  latitude: destination.lat,
                  longitude: destination.lng,
                  latitudeDelta: 0.03,
                  longitudeDelta: 0.03,
                }}
              >
                <Marker
                  coordinate={{ latitude: destination.lat, longitude: destination.lng }}
                  title="Your address"
                  pinColor={colors.blue600}
                />
                {riderPosition ? (
                  <Marker
                    testID="marker-rider"
                    coordinate={{ latitude: riderPosition.lat, longitude: riderPosition.lng }}
                    title="Your phlebotomist"
                    pinColor={colors.green}
                  />
                ) : null}
              </MapView>
              {!riderPosition ? (
                <View style={styles.mapOverlay}>
                  <Text style={styles.mapOverlayText}>
                    {connected ? 'Waiting for your phlebotomist to share their location…' : 'Reconnecting…'}
                  </Text>
                </View>
              ) : null}
            </View>
          ) : null
        ) : null}

        {/* Vertical stepper with connecting lines */}
        <Card style={styles.stepperCard} testID="track-stepper">
          {steps.map((step, index) => (
            <View key={step.key} style={styles.stepRow}>
              <View style={styles.stepRail}>
                <View
                  style={[
                    stepper.dot,
                    step.state === 'upcoming' ? stepper.dotUpcoming : stepper.dotDone,
                  ]}
                >
                  <Text
                    style={[
                      stepper.dotLabel,
                      step.state === 'upcoming' ? stepper.dotLabelUpcoming : stepper.dotLabelDone,
                    ]}
                  >
                    {step.state === 'done' ? '✓' : index + 1}
                  </Text>
                </View>
                {index < steps.length - 1 ? (
                  <View style={[styles.connector, step.state === 'done' && styles.connectorDone]} />
                ) : null}
              </View>
              <Text
                style={[
                  styles.stepLabel,
                  step.state === 'current' && styles.stepCurrent,
                  step.state === 'upcoming' && styles.stepUpcoming,
                ]}
              >
                {step.label}
              </Text>
            </View>
          ))}
        </Card>

        {/* Rider card, once assigned */}
        {riderUser?.name ? (
          <Card style={styles.riderCard} testID="track-rider-card">
            <View style={styles.riderAvatar}>
              <Text style={styles.riderInitial}>{riderUser.name[0]?.toUpperCase()}</Text>
            </View>
            <View style={styles.riderText}>
              <Text style={styles.riderName}>{riderUser.name}</Text>
              <Text style={styles.riderRole}>Your phlebotomist</Text>
            </View>
            {riderUser.phone ? (
              <>
                <CircleButton
                  testID="btn-call-rider"
                  icon="phone"
                  label="Call phlebotomist"
                  background={colors.blue600}
                  onPress={() => Linking.openURL(`tel:${riderUser.phone}`).catch(() => {})}
                />
                <CircleButton
                  testID="btn-whatsapp-rider"
                  icon="message"
                  label="Message on WhatsApp"
                  background={colors.green}
                  onPress={() =>
                    Linking.openURL(`whatsapp://send?phone=91${String(riderUser.phone).slice(-10)}`).catch(() => {})
                  }
                />
              </>
            ) : null}
          </Card>
        ) : null}

        {/* Booking details */}
        <Card style={styles.detailCard} testID="track-details">
          <Row label="Status" value={STATUS_LABELS[booking.status] ?? booking.status} />
          <Row label="Slot" value={formatSlot(booking.slotDateTime)} />
          <Row label="Mode" value={booking.mode === 'home' ? 'Home collection' : 'Lab visit'} />
          <Row
            label="Payment"
            value={`${formatCurrency(booking.amount)} · ${
              booking.paymentStatus === 'paid' ? 'Paid' : booking.paymentMode === 'cash' ? 'Cash on collection' : 'Pending'
            }`}
          />
          {booking.barcode ? <Row label="Sample barcode" value={booking.barcode} /> : null}
        </Card>

        {booking.status === 'report_ready' ? (
          <GhostButton
            testID="btn-view-report"
            label="View report"
            onPress={() => navigation.navigate('ProfileTab', { screen: 'Reports' })}
          />
        ) : null}
      </ScrollView>
    </View>
  );
}

function Header() {
  return (
    <View style={styles.header}>
      <Text style={styles.title}>Track</Text>
    </View>
  );
}

function Row({ label, value }) {
  return (
    <View style={styles.row}>
      <Text style={type.meta}>{label}</Text>
      <Text style={styles.rowValue}>{value}</Text>
    </View>
  );
}

function CircleButton({ icon, background, onPress, testID, label }) {
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={[styles.circle, { backgroundColor: background }]}
    >
      <Icon name={icon} size={16} color={colors.white} strokeWidth={2.2} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  header: { paddingHorizontal: 20, paddingTop: 12, paddingBottom: 6 },
  title: { fontSize: 21, fontWeight: '800', letterSpacing: -0.4, color: colors.ink },
  body: { paddingHorizontal: 20, paddingBottom: 96 },
  emptyWrap: { paddingHorizontal: 20, paddingTop: 20 },
  reference: { ...type.meta, fontSize: 12.5, marginBottom: 16 },
  switcher: { gap: 8, paddingBottom: 14 },
  mapWrap: { height: 200, borderRadius: 20, overflow: 'hidden', marginBottom: 20, backgroundColor: colors.blue50 },
  mapOverlay: {
    position: 'absolute',
    left: 12,
    right: 12,
    bottom: 12,
    backgroundColor: colors.white,
    borderRadius: 12,
    padding: 10,
  },
  mapOverlayText: { fontSize: 12, fontWeight: '600', color: colors.muted, textAlign: 'center' },
  stepperCard: { padding: 20, marginBottom: 20 },
  stepRow: { flexDirection: 'row', gap: 12 },
  stepRail: { alignItems: 'center' },
  connector: { width: 2, flex: 1, minHeight: 22, backgroundColor: colors.border, marginVertical: 2 },
  connectorDone: { backgroundColor: colors.blue600 },
  stepLabel: { fontWeight: '700', fontSize: 13.5, color: colors.ink, paddingTop: 3 },
  stepCurrent: { color: colors.blue600 },
  stepUpcoming: { color: colors.muted2, fontWeight: '600' },
  riderCard: { padding: 16, marginBottom: 20, flexDirection: 'row', alignItems: 'center', gap: 12 },
  riderAvatar: {
    width: 46,
    height: 46,
    borderRadius: 999,
    backgroundColor: colors.blue100,
    alignItems: 'center',
    justifyContent: 'center',
  },
  riderInitial: { color: colors.blue700, fontWeight: '800', fontSize: 16 },
  riderText: { flex: 1 },
  riderName: { fontWeight: '700', fontSize: 13.5, color: colors.ink },
  riderRole: { color: colors.muted, fontSize: 11.5, marginTop: 2 },
  circle: {
    width: 38,
    height: 38,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
  },
  detailCard: { padding: 16, marginBottom: 16 },
  row: { marginBottom: 12, gap: 3 },
  rowValue: { fontSize: 14, fontWeight: '700', color: colors.ink },
});
