import React, { useEffect, useRef } from 'react';
import { isExpoGo } from '../push/isExpoGo.js';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useAuth, SESSION } from '../auth/AuthContext.jsx';
import { useRiderJobs, useInvalidateJobs } from '../api/riderHooks.js';
import { startJobLocationTracking, stopJobLocationTracking } from '../location/backgroundLocation.js';
import { colors, tabBar } from '../theme.js';
import Icon from '../components/Icon.jsx';
import SplashScreen from '../screens/SplashScreen.jsx';
import LoginScreen from '../screens/LoginScreen.jsx';
import JobsScreen from '../screens/JobsScreen.jsx';
import JobDetailScreen from '../screens/JobDetailScreen.jsx';
import CollectionScreen from '../screens/CollectionScreen.jsx';
import HandoffScreen from '../screens/HandoffScreen.jsx';
import CashScreen from '../screens/CashScreen.jsx';
import MapScreen from '../screens/MapScreen.jsx';
import ProfileScreen from '../screens/ProfileScreen.jsx';

const Tab = createBottomTabNavigator();
const JobsStack = createNativeStackNavigator();

/**
 * Bottom tabs, per CONTEXT §7.3: Rider is Jobs / Map / Profile.
 *
 * Real SVGs rather than text glyphs — a glyph renders differently on every
 * Android OEM and cannot carry a stroke weight, so the active tab could not
 * read heavier the way the prototype's `.tab-item.active` does.
 */
const TAB_ICONS = { JobsTab: 'flask', MapTab: 'mapPin', ProfileTab: 'user' };

function TabIcon({ route, color, focused }) {
  return (
    <Icon
      name={TAB_ICONS[route.name] ?? 'flask'}
      size={23}
      color={color}
      strokeWidth={focused ? 2.4 : 1.9}
    />
  );
}

function JobsStackNavigator() {
  return (
    <JobsStack.Navigator screenOptions={{ headerShown: false }}>
      <JobsStack.Screen name="JobsList" component={JobsScreen} />
      <JobsStack.Screen name="JobDetail" component={JobDetailScreen} />
      <JobsStack.Screen name="Collection" component={CollectionScreen} />
      <JobsStack.Screen name="Cash" component={CashScreen} />
      <JobsStack.Screen name="Handoff" component={HandoffScreen} />
    </JobsStack.Navigator>
  );
}

/**
 * Location tracking follows the job, not the session.
 *
 * Starting it at sign-in would track a phlebotomist through their whole shift,
 * including breaks and the ride home, for no operational reason. It starts when
 * a job is held and stops the moment it is not.
 */
function useJobLocationLifecycle() {
  const { data } = useRiderJobs();
  const activeStatus = data?.activeJob?.status ?? null;
  const trackingRef = useRef(false);

  useEffect(() => {
    // Only while the rider is actually travelling to or working the collection.
    const shouldTrack = ['rider_assigned', 'en_route'].includes(activeStatus);

    if (shouldTrack && !trackingRef.current) {
      trackingRef.current = true;
      startJobLocationTracking().catch(() => {
        trackingRef.current = false;
      });
    } else if (!shouldTrack && trackingRef.current) {
      trackingRef.current = false;
      stopJobLocationTracking().catch(() => {});
    }
  }, [activeStatus]);

  // Stop on unmount (sign-out) so tracking can never outlive the session.
  useEffect(
    () => () => {
      stopJobLocationTracking().catch(() => {});
    },
    []
  );
}

/** A tapped job-assignment notification should land on the job, not the tab root. */
function usePushNavigation(navigationRef) {
  const invalidateJobs = useInvalidateJobs();

  useEffect(() => {
    // Expo Go dropped Android remote push in SDK 53, and touching these APIs
    // there throws during module evaluation — the app dies before its first
    // screen with "[runtime not ready]". The jobs list polls anyway, so this
    // costs a little latency in development and nothing in a real build.
    if (isExpoGo) return undefined;

    // Required lazily, never at module scope: merely importing
    // expo-notifications registers a push-token listener as a side effect, and
    // since SDK 53 that throws inside Expo Go. Guarding the calls alone was
    // not enough — the static import was itself the failure.
    const Notifications = require('expo-notifications');

    const received = Notifications.addNotificationReceivedListener(() => {
      // A new assignment invalidates the list even if the rider ignores the banner.
      invalidateJobs();
    });

    const responded = Notifications.addNotificationResponseReceivedListener((response) => {
      const bookingId = response?.notification?.request?.content?.data?.bookingId;
      invalidateJobs();
      if (bookingId && navigationRef.current?.isReady()) {
        navigationRef.current.navigate('JobsTab', { screen: 'JobDetail', params: { bookingId } });
      }
    });

    return () => {
      received.remove();
      responded.remove();
    };
  }, [invalidateJobs, navigationRef]);
}

function SignedInTabs({ navigationRef }) {
  useJobLocationLifecycle();
  usePushNavigation(navigationRef);

  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarStyle: tabBar.bar,
        tabBarLabelStyle: tabBar.label,
        tabBarActiveTintColor: colors.blue600,
        tabBarInactiveTintColor: colors.muted2,
        tabBarIcon: ({ color, focused }) => <TabIcon route={route} color={color} focused={focused} />,
      })}
    >
      <Tab.Screen name="JobsTab" component={JobsStackNavigator} options={{ title: 'Jobs' }} />
      <Tab.Screen name="MapTab" component={MapScreen} options={{ title: 'Map' }} />
      <Tab.Screen name="ProfileTab" component={ProfileScreen} options={{ title: 'Profile' }} />
    </Tab.Navigator>
  );
}

export default function RootNavigator() {
  const { status } = useAuth();
  const navigationRef = useRef(null);

  return (
    <NavigationContainer ref={navigationRef}>
      {status === SESSION.RESTORING ? (
        <SplashScreen />
      ) : status === SESSION.SIGNED_IN ? (
        <SignedInTabs navigationRef={navigationRef} />
      ) : (
        <LoginScreen />
      )}
    </NavigationContainer>
  );
}
