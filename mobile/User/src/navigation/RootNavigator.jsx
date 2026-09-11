import React, { useEffect, useRef, useState } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { isExpoGo } from '../push/isExpoGo.js';
import { useQueryClient } from '@tanstack/react-query';

import { useAuth, SESSION } from '../auth/AuthContext.jsx';
import { registerForPushNotifications } from '../push/registerForPush.js';
import { colors, tabBar } from '../theme.js';
import Icon from '../components/Icon.jsx';
import SplashScreen from '../screens/SplashScreen.jsx';
import OnboardingScreen from '../screens/OnboardingScreen.jsx';
import AuthScreen from '../screens/AuthScreen.jsx';
import HomeScreen from '../screens/HomeScreen.jsx';
import CatalogueScreen from '../screens/CatalogueScreen.jsx';
import CartScreen from '../screens/CartScreen.jsx';
import TestDetailScreen from '../screens/TestDetailScreen.jsx';
import BookingScreen from '../screens/BookingScreen.jsx';
import PaymentScreen from '../screens/PaymentScreen.jsx';
import BookingConfirmedScreen from '../screens/BookingConfirmedScreen.jsx';
import TrackScreen from '../screens/TrackScreen.jsx';
import ProfileScreen from '../screens/ProfileScreen.jsx';
import { AddressesScreen, FamilyScreen, BookingsScreen, ReportsScreen } from '../screens/ListScreens.jsx';
import SubscriptionsScreen from '../screens/SubscriptionsScreen.jsx';
import SubscribeScreen from '../screens/SubscribeScreen.jsx';

const Tab = createBottomTabNavigator();
const Stack = createNativeStackNavigator();

/**
 * CONTEXT §7.3: Patient tabs are Home / Tests / Track / Profile.
 *
 * These map to the prototype's own tab-bar SVGs. They were briefly text glyphs
 * (⌂ ⚗ ◷ ☺), which render differently on every Android OEM and cannot take a
 * stroke weight — a regression from the approved design, not a shortcut.
 */
const TAB_ICONS = { HomeTab: 'home', TestsTab: 'flask', TrackTab: 'clock', ProfileTab: 'user' };

function TabIcon({ route, color, focused }) {
  return (
    <Icon
      name={TAB_ICONS[route.name] ?? 'home'}
      size={23}
      color={color}
      // The active tab reads heavier, as in the prototype's `.tab-item.active`.
      strokeWidth={focused ? 2.4 : 1.9}
    />
  );
}

function TestsStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="Catalogue" component={CatalogueScreen} />
      <Stack.Screen name="TestDetail" component={TestDetailScreen} />
      <Stack.Screen name="Cart" component={CartScreen} />
      <Stack.Screen name="Booking" component={BookingScreen} />
      <Stack.Screen name="Payment" component={PaymentScreen} />
      <Stack.Screen name="BookingConfirmed" component={BookingConfirmedScreen} />
      <Stack.Screen name="Subscribe" component={SubscribeScreen} />
      <Stack.Screen name="Subscriptions" component={SubscriptionsScreen} />
    </Stack.Navigator>
  );
}

function ProfileStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="ProfileHome" component={ProfileScreen} />
      <Stack.Screen name="Addresses" component={AddressesScreen} />
      <Stack.Screen name="Family" component={FamilyScreen} />
      <Stack.Screen name="Bookings" component={BookingsScreen} />
      <Stack.Screen name="Reports" component={ReportsScreen} />
      <Stack.Screen name="Subscriptions" component={SubscriptionsScreen} />
    </Stack.Navigator>
  );
}

/** A status-change notification should land on the booking it refers to. */
function usePushRouting(navigationRef) {
  const queryClient = useQueryClient();

  useEffect(() => {
    registerForPushNotifications();

    // Expo Go has no remote push since SDK 53, and merely IMPORTING
    // expo-notifications there throws during module evaluation — the module
    // registers a push-token listener as a side effect, which is why guarding
    // the calls was not enough. So it is required lazily, never at module
    // scope. Everything these listeners do is also done by polling, so the app
    // loses promptness, not function.
    if (isExpoGo) return undefined;

    const Notifications = require('expo-notifications');

    const received = Notifications.addNotificationReceivedListener(() => {
      queryClient.invalidateQueries({ queryKey: ['bookings'] });
    });

    const responded = Notifications.addNotificationResponseReceivedListener((response) => {
      const bookingId = response?.notification?.request?.content?.data?.bookingId;
      queryClient.invalidateQueries({ queryKey: ['bookings'] });
      if (bookingId && navigationRef.current?.isReady()) {
        navigationRef.current.navigate('TrackTab', { bookingId });
      }
    });

    return () => {
      received.remove();
      responded.remove();
    };
  }, [queryClient, navigationRef]);
}

function SignedInTabs({ navigationRef }) {
  usePushRouting(navigationRef);

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
      <Tab.Screen name="HomeTab" component={HomeScreen} options={{ title: 'Home' }} />
      <Tab.Screen name="TestsTab" component={TestsStack} options={{ title: 'Tests' }} />
      <Tab.Screen name="TrackTab" component={TrackScreen} options={{ title: 'Track' }} />
      <Tab.Screen name="ProfileTab" component={ProfileStack} options={{ title: 'Profile' }} />
    </Tab.Navigator>
  );
}

/**
 * Auth-first (CONTEXT §7.3), unlike web: splash → onboarding → auth. The
 * catalogue is public on the web for SEO; in the app there is nothing to index,
 * so the wall is at the front door.
 */
function SignedOutFlow() {
  const [stage, setStage] = useState('onboarding');
  const [authMode, setAuthMode] = useState('login');

  if (stage === 'auth') {
    return (
      <AuthScreen
        initialMode={authMode}
        onBack={() => setStage('onboarding')}
      />
    );
  }

  return (
    <OnboardingScreen
      onCreateAccount={() => {
        setAuthMode('signup');
        setStage('auth');
      }}
      onSignIn={() => {
        setAuthMode('login');
        setStage('auth');
      }}
    />
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
        <SignedOutFlow />
      )}
    </NavigationContainer>
  );
}
