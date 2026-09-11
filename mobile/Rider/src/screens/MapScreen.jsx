import React, { useEffect, useState } from 'react';
import { Platform, StyleSheet, Text, View } from 'react-native';
import * as Location from 'expo-location';
import MapView, { Marker, PROVIDER_GOOGLE } from 'react-native-maps';
import { useRiderJobs } from '../api/riderHooks.js';
import { GOOGLE_MAPS_ANDROID_KEY } from '../config/env.js';
import { colors, type, layout } from '../theme.js';
import { Banner, EmptyState, ErrorState, LoadingState } from '../components/ui.jsx';

/**
 * Where the rider is, and where the collection is.
 *
 * On Android the Google Maps SDK needs an API key. When it is unset the tab says
 * so plainly instead of rendering an empty grey grid that reads as a bug in our
 * code — a fabricated placeholder key would do exactly that (CONTEXT §11).
 */
export default function MapScreen() {
  const { data, isLoading, isError, error, refetch } = useRiderJobs();
  const [position, setPosition] = useState(null);
  const [permissionDenied, setPermissionDenied] = useState(false);

  const job = data?.activeJob ?? null;
  const destination = job?.collectionAddress;

  useEffect(() => {
    let cancelled = false;

    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (cancelled) return;

      if (status !== 'granted') {
        setPermissionDenied(true);
        return;
      }

      const fix = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      if (!cancelled) setPosition(fix.coords);
    })().catch(() => {});

    return () => {
      cancelled = true;
    };
  }, []);

  const keyMissing = Platform.OS === 'android' && !GOOGLE_MAPS_ANDROID_KEY;

  if (keyMissing) {
    return (
      <View style={layout.screen} testID="screen-map">
        <Banner
          testID="banner-missing-maps-key"
          tone="red"
          text="Map unavailable: EXPO_PUBLIC_GOOGLE_MAPS_ANDROID_KEY is not set for this build."
        />
        <EmptyState
          title="Map not configured"
          message="Set a Google Maps SDK for Android key in the app's environment and rebuild. Navigation from a job still works — it hands off to your device's map app."
        />
      </View>
    );
  }

  if (isLoading) {
    return (
      <View style={layout.screen} testID="screen-map">
        <LoadingState label="Loading your job…" />
      </View>
    );
  }

  if (isError) {
    return (
      <View style={layout.screen} testID="screen-map">
        <ErrorState
          message={error?.isNetworkError ? 'No connection. The map will load when you are back online.' : error?.message}
          onRetry={refetch}
        />
      </View>
    );
  }

  if (!destination?.lat || !destination?.lng) {
    return (
      <View style={layout.screen} testID="screen-map">
        <EmptyState
          title={job ? 'No coordinates for this address' : 'No active job'}
          message={
            job
              ? 'This booking has no map coordinates. Call the patient for directions.'
              : 'Accept a job from the Jobs tab and it will appear here.'
          }
        />
      </View>
    );
  }

  return (
    <View style={layout.screen} testID="screen-map">
      {permissionDenied ? (
        <Banner tone="amber" text="Location permission denied — the map cannot show your position." />
      ) : null}
      <MapView
        testID="map-view"
        style={styles.map}
        provider={Platform.OS === 'android' ? PROVIDER_GOOGLE : undefined}
        showsUserLocation={!permissionDenied}
        initialRegion={{
          latitude: destination.lat,
          longitude: destination.lng,
          latitudeDelta: 0.05,
          longitudeDelta: 0.05,
        }}
      >
        <Marker
          testID="marker-destination"
          coordinate={{ latitude: destination.lat, longitude: destination.lng }}
          title={destination.label || 'Collection address'}
          description={destination.line}
          pinColor={colors.blue600}
        />
      </MapView>
      <View style={styles.footer}>
        <Text style={type.cardTitle} numberOfLines={1}>
          {destination.label || 'Collection address'}
        </Text>
        <Text style={type.meta} numberOfLines={2}>
          {destination.line}
        </Text>
        {position ? (
          <Text style={type.meta}>
            You are at {position.latitude.toFixed(4)}, {position.longitude.toFixed(4)}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  map: { flex: 1 },
  footer: {
    position: 'absolute',
    left: 16,
    right: 16,
    bottom: 96,
    backgroundColor: colors.white,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 16,
    gap: 3,
  },
});
