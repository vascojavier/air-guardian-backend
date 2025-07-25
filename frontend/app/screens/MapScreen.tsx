import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, Dimensions, ActivityIndicator } from 'react-native';
import MapView, { Marker } from 'react-native-maps';
import * as Location from 'expo-location';

const { width, height } = Dimensions.get('window');

type Aircraft = {
  id: string;
  name: string;
  lat: number;
  lon: number;
  alt: number;
};

export default function MapScreen() {
  const [location, setLocation] = useState<Location.LocationObject | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [traffic, setTraffic] = useState<Aircraft[]>([]);

  useEffect(() => {
    (async () => {
      let { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        setErrorMsg('Permiso de ubicación denegado');
        return;
      }

      let loc = await Location.getCurrentPositionAsync({});
      setLocation(loc);

      // Simular tráfico aéreo cerca
      const simulatedTraffic: Aircraft[] = [
        {
          id: 'A1',
          name: 'Plane A',
          lat: loc.coords.latitude + 0.002,
          lon: loc.coords.longitude + 0.0015,
          alt: 420,
        },
        {
          id: 'B2',
          name: 'Glider B',
          lat: loc.coords.latitude - 0.001,
          lon: loc.coords.longitude - 0.0015,
          alt: 380,
        },
        {
          id: 'C3',
          name: 'Tow C',
          lat: loc.coords.latitude + 0.0008,
          lon: loc.coords.longitude - 0.002,
          alt: 400,
        },
      ];
      setTraffic(simulatedTraffic);
    })();
  }, []);

  if (!location) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" />
        <Text>Cargando ubicación...</Text>
      </View>
    );
  }

  const calcDistance = (lat1: number, lon1: number, lat2: number, lon2: number) => {
    const R = 6371e3; // Radio de la Tierra en metros
    const toRad = (x: number) => (x * Math.PI) / 180;
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);
    const a =
      Math.sin(dLat / 2) ** 2 +
      Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  };

  return (
    <View style={styles.container}>
      <MapView
        style={styles.map}
        initialRegion={{
          latitude: location.coords.latitude,
          longitude: location.coords.longitude,
          latitudeDelta: 0.01,
          longitudeDelta: 0.01,
        }}
        showsUserLocation
      >
        {traffic.map((aircraft) => (
          <Marker
            key={aircraft.id}
            coordinate={{ latitude: aircraft.lat, longitude: aircraft.lon }}
            title={aircraft.name}
            description={`Alt: ${aircraft.alt} m`}
          />
        ))}
      </MapView>

      <View style={styles.panel}>
        <Text style={styles.title}>Tráfico cercano:</Text>
        {traffic.map((a) => {
          const dist = calcDistance(
            location.coords.latitude,
            location.coords.longitude,
            a.lat,
            a.lon
          );
          const deltaAlt = a.alt - (location.coords.altitude ?? 0);
          return (
            <Text key={a.id}>
              ✈️ {a.name} - {dist.toFixed(0)} m - ΔAlt: {deltaAlt.toFixed(0)} m
            </Text>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  map: { width, height },
  panel: {
    position: 'absolute',
    bottom: 10,
    left: 10,
    right: 10,
    backgroundColor: '#ffffffcc',
    padding: 10,
    borderRadius: 10,
  },
  title: { fontWeight: 'bold', marginBottom: 5 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
});
