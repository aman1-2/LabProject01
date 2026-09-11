import React from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useQuery } from '@tanstack/react-query';
import { fetchPatientBookings, fetchPartnerDoctors, patientKeys } from '@pathcare/api';
import { useAuth } from '../auth/AuthContext.jsx';
import { colors, type, card, layout } from '../theme.js';
import { EmptyState, ErrorState } from '../components/ui.jsx';
import { Pressable3D, SkeletonList, SkeletonCard, elevation } from '../components/motion.jsx';
import Icon from '../components/Icon.jsx';
import { formatSlot, STATUS_LABELS, testNamesOf, greetingFor } from '../lib/format.js';

/**
 * Home, transcribed from the prototype's #screen-home: greeting + avatar,
 * search bar, active booking card, category scroll, doctor cards, 2x2 health hub.
 *
 * The prototype hard-codes "Hi, Arjun!", a booking, doctor names and star
 * ratings. None of that ships: the greeting uses the signed-in user, the
 * booking card renders only when the patient actually has one, and doctors come
 * from the API. Ratings are dropped entirely — Doctor has no rating field
 * (§5.1) and inventing one is fabricated data (§3.1).
 */

/** Prototype category strip. `key` maps to TestCatalog.category / a tag search. */
const CATEGORIES = [
  { key: 'heart', icon: 'heart', label: 'Heart', search: 'lipid' },
  { key: 'diabetes', icon: 'droplet', label: 'Diabetes', search: 'diabetes' },
  { key: 'thyroid', icon: 'activity', label: 'Thyroid', search: 'thyroid' },
  { key: 'women', icon: 'heart', label: "Women's", search: 'women' },
];

const HEALTH_HUB = [
  { key: 'reports', icon: 'testTube', label: 'Lab Reports', target: 'Reports' },
  { key: 'appointments', icon: 'calendar', label: 'Appointments', target: 'Bookings' },
  { key: 'family', icon: 'users', label: 'Family', target: 'Family' },
  { key: 'addresses', icon: 'mapPin', label: 'Addresses', target: 'Addresses' },
];

/** A booking the patient can still act on — the prototype's "Active booking". */
const ACTIVE_STATUSES = ['pending', 'rider_assigned', 'en_route', 'collected', 'at_lab', 'awaiting_confirm', 'confirmed', 'processing'];

export default function HomeScreen({ navigation }) {
  const { user } = useAuth();

  const bookingsQuery = useQuery({
    queryKey: patientKeys.bookings({ scope: 'home' }),
    queryFn: () => fetchPatientBookings({ limit: 20 }),
  });

  const doctorsQuery = useQuery({
    queryKey: patientKeys.doctors({ limit: 6 }),
    queryFn: () => fetchPartnerDoctors({ limit: 6 }),
  });

  const bookings = bookingsQuery.data?.items ?? bookingsQuery.data ?? [];
  const activeBooking = Array.isArray(bookings)
    ? bookings.find((booking) => ACTIVE_STATUSES.includes(booking.status))
    : null;

  const doctors = doctorsQuery.data?.items ?? doctorsQuery.data ?? [];

  return (
    <View style={layout.screen} testID="screen-home">
      <ScrollView
        contentContainerStyle={styles.body}
        refreshControl={
          <RefreshControl
            refreshing={bookingsQuery.isRefetching}
            onRefresh={bookingsQuery.refetch}
            tintColor={colors.blue600}
          />
        }
      >
        {/* Greeting + avatar */}
        <View style={styles.greetingRow}>
          <View>
            <Text style={styles.greeting}>{greetingFor(new Date())}</Text>
            <Text style={styles.name}>Hi, {user?.name?.split(' ')[0] || 'there'}!</Text>
          </View>
          <Pressable
            testID="btn-avatar"
            accessibilityRole="button"
            accessibilityLabel="Open profile"
            onPress={() => navigation.navigate('ProfileTab')}
            style={styles.avatar}
          >
            <Text style={styles.avatarLetter}>{(user?.name?.[0] || '?').toUpperCase()}</Text>
          </Pressable>
        </View>

        {/* Search bar — prototype navigates to the catalogue */}
        <Pressable
          testID="btn-search"
          accessibilityRole="search"
          onPress={() => navigation.navigate('TestsTab')}
          style={styles.search}
        >
          <Icon name="search" size={17} color={colors.muted2} strokeWidth={2.2} />
          <Text style={styles.searchText}>Search tests, packages, doctors...</Text>
        </Pressable>

        {/* Active booking */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Active booking</Text>
          {activeBooking ? (
            <Text testID="link-see-all-bookings" style={styles.seeAll} onPress={() => navigation.navigate('TrackTab')}>
              See all
            </Text>
          ) : null}
        </View>

        {bookingsQuery.isLoading ? (
          <SkeletonCard />
        ) : bookingsQuery.isError ? (
          <ErrorState
            message={
              bookingsQuery.error?.isNetworkError
                ? 'No connection. Your bookings will appear when you are back online.'
                : bookingsQuery.error?.message
            }
            onRetry={bookingsQuery.refetch}
          />
        ) : activeBooking ? (
          <Pressable3D
            testID="card-active-booking"
            onPress={() => navigation.navigate('TrackTab', { bookingId: activeBooking._id })}
            accessibilityLabel="Track your active booking"
            haptic="medium"
            style={[styles.activeCard, elevation.float]}
          >
            {/* Prototype: linear-gradient(135deg, blue600, #1B2C6B) */}
            <LinearGradient
              colors={[colors.blue600, colors.blueGradientEnd]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.activeGradient}
            />
            <View style={styles.activeInner}>
              <View style={styles.activeText}>
                <Text style={styles.activeTitle} numberOfLines={1}>
                  {testNamesOf(activeBooking)}
                </Text>
                <Text style={styles.activeSub}>
                  {STATUS_LABELS[activeBooking.status] ?? activeBooking.status} ·{' '}
                  {formatSlot(activeBooking.slotDateTime)}
                </Text>
              </View>
              <View style={styles.activeCta}>
                <Text style={styles.activeCtaText}>Track</Text>
              </View>
            </View>
          </Pressable3D>
        ) : (
          <EmptyState
            testID="empty-active-booking"
            icon="testTube"
            title="No active booking"
            message="Your next home collection or lab visit appears here once you book a test."
            ctaLabel="Browse tests"
            onCta={() => navigation.navigate('TestsTab')}
          />
        )}

        {/* Categories */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Browse by category</Text>
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.strip}>
          {CATEGORIES.map((category) => (
            <Pressable3D
              key={category.key}
              testID={`category-${category.key}`}
              accessibilityLabel={category.label}
              onPress={() => navigation.navigate('TestsTab', { search: category.search })}
              style={[card.base, styles.categoryCard, elevation.card]}
            >
              <View style={styles.categoryIcon}><Icon name={category.icon} size={20} color={colors.blue700} strokeWidth={2} /></View>
              <Text style={styles.categoryLabel}>{category.label}</Text>
            </Pressable3D>
          ))}
        </ScrollView>

        {/* Partner doctors */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Partner doctors</Text>
        </View>
        {doctorsQuery.isLoading ? (
          <SkeletonList count={1} />
        ) : doctorsQuery.isError ? (
          <ErrorState message={doctorsQuery.error?.message} onRetry={doctorsQuery.refetch} />
        ) : doctors.length === 0 ? (
          <EmptyState
            testID="empty-doctors"
            icon="stethoscope"
            title="No partner doctors yet"
            message="Verified partner doctors in Dehradun will be listed here as they join."
          />
        ) : (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.strip}>
            {doctors.map((doctor) => (
              <Pressable
                key={doctor._id ?? doctor.id}
                testID={`doctor-${doctor._id ?? doctor.id}`}
                accessibilityRole="button"
                onPress={() => navigation.navigate('Doctor', { doctorId: doctor._id ?? doctor.id })}
                style={[card.base, styles.doctorCard]}
              >
                <View style={styles.doctorAvatar}>
                  <Text style={styles.doctorInitials}>{initialsOf(doctor.name)}</Text>
                </View>
                <Text style={styles.doctorName} numberOfLines={1}>
                  {doctor.name}
                </Text>
                <Text style={styles.doctorSpec} numberOfLines={1}>
                  {doctor.specialization}
                </Text>
              </Pressable>
            ))}
          </ScrollView>
        )}

        {/* Health hub — prototype 2x2 grid */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Health hub</Text>
        </View>
        <View style={styles.hub}>
          {HEALTH_HUB.map((item) => (
            <Pressable3D
              key={item.key}
              testID={`hub-${item.key}`}
              accessibilityLabel={item.label}
              onPress={() => navigation.navigate('ProfileTab', { screen: item.target })}
              style={[card.base, styles.hubCard, elevation.card]}
            >
              <View style={styles.hubIcon}><Icon name={item.icon} size={19} color={colors.blue700} strokeWidth={2} /></View>
              <Text style={styles.hubLabel}>{item.label}</Text>
            </Pressable3D>
          ))}
        </View>
      </ScrollView>
    </View>
  );
}

function initialsOf(name) {
  if (!name) return '?';
  return name
    .replace(/^Dr\.?\s*/i, '')
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');
}

const styles = StyleSheet.create({
  // Prototype home padding: 6px 20px 0, with tab-bar clearance.
  body: { paddingHorizontal: 20, paddingTop: 6, paddingBottom: 96 },
  greetingRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 },
  greeting: { ...type.meta, fontSize: 12.5 },
  // Prototype: 21px / 800.
  name: { fontSize: 21, fontWeight: '800', letterSpacing: -0.4, color: colors.ink },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 999,
    backgroundColor: colors.blue100,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarLetter: { color: colors.blue700, fontWeight: '800', fontSize: 15 },
  search: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: colors.white,
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: 14,
    paddingVertical: 13,
    paddingHorizontal: 16,
    marginBottom: 22,
    minHeight: 44,
  },
  searchText: { color: colors.muted2, fontSize: 14 },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, marginTop: 6 },
  sectionTitle: { fontWeight: '800', fontSize: 15.5, color: colors.ink },
  seeAll: { color: colors.blue600, fontSize: 12.5, fontWeight: '700' },
  // Prototype active booking card: blue600 -> #1B2C6B, no border.
  activeCard: { borderRadius: 20, padding: 16, marginBottom: 26, overflow: 'hidden', backgroundColor: colors.blue600 },
  activeGradient: { ...StyleSheet.absoluteFillObject },
  activeInner: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12 },
  activeText: { flex: 1 },
  activeTitle: { color: colors.white, fontWeight: '800', fontSize: 14.5 },
  activeSub: { color: '#B9C6F5', fontSize: 12, marginTop: 2 },
  activeCta: { backgroundColor: 'rgba(255,255,255,0.18)', borderRadius: 999, paddingVertical: 9, paddingHorizontal: 15 },
  activeCtaText: { color: colors.white, fontWeight: '700', fontSize: 12.5 },
  strip: { gap: 10, paddingBottom: 6, paddingRight: 20 },
  categoryCard: { minWidth: 88, paddingVertical: 14, paddingHorizontal: 8, alignItems: 'center' },
  categoryIcon: {
    width: 40, height: 40, borderRadius: 13,
    backgroundColor: colors.blue50, alignItems: 'center', justifyContent: 'center',
  },
  categoryLabel: { fontSize: 11.5, fontWeight: '700', marginTop: 4, color: colors.ink },
  doctorCard: { width: 140, padding: 14, alignItems: 'center' },
  doctorAvatar: {
    width: 56,
    height: 56,
    borderRadius: 999,
    backgroundColor: colors.blue100,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  doctorInitials: { color: colors.blue700, fontWeight: '800', fontSize: 18 },
  doctorName: { fontWeight: '700', fontSize: 13, color: colors.ink, textAlign: 'center' },
  doctorSpec: { color: colors.muted, fontSize: 11, textAlign: 'center', marginTop: 2 },
  hub: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginTop: 4 },
  hubCard: { width: '47.5%', flexGrow: 1, paddingVertical: 18, alignItems: 'center' },
  hubIcon: {
    width: 38, height: 38, borderRadius: 12,
    backgroundColor: colors.blue50, alignItems: 'center', justifyContent: 'center',
  },
  hubLabel: { fontWeight: '700', fontSize: 12.5, marginTop: 6, color: colors.ink },
});
