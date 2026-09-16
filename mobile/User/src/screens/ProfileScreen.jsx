import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useQuery } from '@tanstack/react-query';
import { fetchPatientBookings, fetchFamilyMembers, patientKeys } from '@pathcare/api';
import { useAuth } from '../auth/AuthContext.jsx';
import { getAvatarColor, getInitials } from '@pathcare/design-tokens';
import { colors, type, layout } from '../theme.js';
import { DangerButton } from '../components/ui.jsx';
import { Pressable3D, elevation } from '../components/motion.jsx';
import Icon from '../components/Icon.jsx';

import { CITY } from '../config/locale.js';
/**
 * Profile.
 *
 * Restructured against the pattern the apps we are measured against use
 * (Uber, Zomato, Orange Health), which comes down to three things:
 *
 *   1. A header that establishes identity — avatar, name, and the account's
 *      standing — rather than a name on a white card the same weight as a
 *      form field.
 *   2. A row of metrics that are CONCRETE and ACTIONABLE. Every figure is a
 *      real count and every one is a button into the records behind it. No
 *      vanity numbers, and no dead numbers.
 *   3. Destructive controls in their own area, below everything else.
 *
 * The counts reuse the EXACT query keys the destination screens use, so the
 * number on this screen and the list you land on after tapping it are the same
 * cache entry and cannot disagree. Until a query resolves the row shows dashes
 * rather than zeros: "not loaded yet" and "you have none" are different facts,
 * and showing 0 for the first is a small lie that reads as a broken account.
 */
const ROWS = [
  { key: 'bookings', icon: 'calendar', label: 'My Bookings', hint: 'Upcoming and past collections', target: 'Bookings' },
  { key: 'reports', icon: 'file', label: 'Lab Reports', hint: 'Results with a written summary', target: 'Reports' },
  { key: 'subscriptions', icon: 'repeat', label: 'Subscriptions', hint: 'Recurring tests you have set up', target: 'Subscriptions' },
  { key: 'family', icon: 'users', label: 'Family Members', hint: 'People you can book for', target: 'Family' },
  { key: 'addresses', icon: 'mapPin', label: 'Address Book', hint: 'Where we collect from', target: 'Addresses' },
];

/** `null`/`undefined` means "not loaded", which is not the same as zero. */
function formatCount(value) {
  return typeof value === 'number' ? String(value) : '—';
}

export default function ProfileScreen({ navigation }) {
  const { user, signOut } = useAuth();

  const bookingsQuery = useQuery({
    queryKey: patientKeys.bookings({ scope: 'all' }),
    queryFn: () => fetchPatientBookings({ limit: 50 }),
  });
  const familyQuery = useQuery({
    queryKey: patientKeys.familyMembers(),
    queryFn: () => fetchFamilyMembers(),
  });

  const bookings = bookingsQuery.data?.items ?? bookingsQuery.data ?? [];
  const family = familyQuery.data?.items ?? familyQuery.data ?? [];

  // Same predicate ReportsScreen uses: a report exists once the lab publishes it.
  const reportCount = bookings.filter((booking) =>
    ['report_ready', 'completed'].includes(booking.status)
  ).length;

  // `undefined` while loading or failed, so the row shows a dash. A failed
  // fetch must not render as "0 bookings" to someone who has twelve.
  const settled = bookingsQuery.isSuccess;

  const stats = [
    {
      key: 'bookings',
      label: 'Bookings',
      value: settled ? bookings.length : undefined,
      target: 'Bookings',
    },
    { key: 'reports', label: 'Reports', value: settled ? reportCount : undefined, target: 'Reports' },
    {
      key: 'family',
      label: 'Family',
      value: familyQuery.isSuccess ? family.length : undefined,
      target: 'Family',
    },
  ];

  return (
    <View style={layout.screen} testID="screen-profile">
      <ScrollView contentContainerStyle={styles.body}>
        <LinearGradient
          colors={[colors.blue900, colors.blueGradientEnd]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.header}
          testID="card-identity"
        >
          <View style={styles.identity}>
            {/* Colour and initials come from the shared design tokens, the
                same source the website uses, so a patient is not one colour in
                the app and another on the web. */}
            <View style={[styles.avatar, { backgroundColor: getAvatarColor(user?.name || '') }]}>
              <Text style={styles.avatarLetter}>{getInitials(user?.name || '')}</Text>
            </View>
            <View style={styles.identityText}>
              <Text style={styles.name}>{user?.name || '—'}</Text>
              <Text style={styles.handle}>@{user?.accountHandle || '—'}</Text>
              <View style={styles.badge}>
                <Icon
                  name={user?.accountType === 'family' ? 'users' : 'user'}
                  size={11}
                  color={colors.blue100}
                  strokeWidth={2.4}
                />
                <Text style={styles.badgeText}>
                  {user?.accountType === 'family' ? 'Family account' : 'Single account'}
                </Text>
              </View>
            </View>
          </View>

          <View style={styles.stats}>
            {stats.map((stat) => (
              <Pressable3D
                key={stat.key}
                testID={`profile-stat-${stat.key}`}
                onPress={() => navigation.navigate(stat.target)}
                accessibilityLabel={`${stat.label}, ${formatCount(stat.value)}`}
                style={styles.stat}
                scaleTo={0.97}
              >
                <Text style={styles.statValue}>{formatCount(stat.value)}</Text>
                <Text style={styles.statLabel}>{stat.label}</Text>
              </Pressable3D>
            ))}
          </View>
        </LinearGradient>

        <View style={styles.list}>
          {ROWS.map((row, index) => (
            <Pressable3D
              key={row.key}
              testID={`profile-row-${row.key}`}
              onPress={() => navigation.navigate(row.target)}
              accessibilityLabel={row.label}
              style={[styles.row, index < ROWS.length - 1 && styles.rowDivider]}
              scaleTo={0.985}
            >
              <View style={styles.rowIcon}>
                <Icon name={row.icon} size={17} color={colors.blue700} strokeWidth={2.1} />
              </View>
              <View style={styles.rowText}>
                <Text style={styles.rowLabel}>{row.label}</Text>
                <Text style={styles.rowHint}>{row.hint}</Text>
              </View>
              <Icon name="chevronRight" size={17} color={colors.muted2} strokeWidth={2.2} />
            </Pressable3D>
          ))}
        </View>

        {/* Its own area, below everything else — a destructive control should
            never sit in the same list as navigation. */}
        <View style={styles.dangerZone}>
          <DangerButton testID="btn-signout" label="Log out" onPress={signOut} />
        </View>

        <Text style={styles.footnote}>
          PathCare · {CITY}{'\n'}
          Partner labs are NABL or ISO accredited.
        </Text>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  body: { paddingHorizontal: 20, paddingTop: 12, paddingBottom: 96 },

  header: { borderRadius: 20, padding: 20, marginBottom: 22, ...elevation.card },
  identity: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  avatar: {
    width: 60,
    height: 60,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 3,
    borderColor: 'rgba(255,255,255,0.18)',
  },
  avatarLetter: { color: colors.white, fontWeight: '800', fontSize: 22 },
  identityText: { flex: 1 },
  name: { fontWeight: '800', fontSize: 17, color: colors.white, letterSpacing: -0.3 },
  handle: { color: 'rgba(255,255,255,0.6)', fontSize: 12.5, marginTop: 2 },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    alignSelf: 'flex-start',
    marginTop: 8,
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.12)',
  },
  badgeText: { color: colors.blue100, fontSize: 11, fontWeight: '700' },

  stats: {
    flexDirection: 'row',
    marginTop: 18,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.15)',
  },
  stat: { flex: 1, alignItems: 'center', paddingVertical: 4, minHeight: 44, justifyContent: 'center' },
  statValue: { color: colors.white, fontSize: 19, fontWeight: '800' },
  statLabel: { color: 'rgba(255,255,255,0.55)', fontSize: 11.5, marginTop: 3 },

  list: { marginBottom: 26 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 4,
    minHeight: 44,
  },
  rowDivider: { borderBottomWidth: 1, borderBottomColor: colors.border },
  rowText: { flex: 1 },
  rowLabel: { fontWeight: '700', fontSize: 14, color: colors.ink },
  rowHint: { fontSize: 11.5, color: colors.muted, marginTop: 2 },
  rowIcon: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: colors.blue50,
    alignItems: 'center',
    justifyContent: 'center',
  },

  dangerZone: { borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 20 },
  footnote: { ...type.meta, textAlign: 'center', marginTop: 24, lineHeight: 18 },
});
