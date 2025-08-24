import React, { useEffect, useState, useRef } from 'react';
import { View, Text, StyleSheet, Dimensions, TouchableOpacity, Image, Alert, Platform } from 'react-native';
import MapView, { Marker, PROVIDER_GOOGLE, Polyline } from 'react-native-maps';
import Slider from '@react-native-community/slider';
import * as Location from 'expo-location';
import { useUser } from '../context/UserContext';
import { getOwnPlaneIcon } from '../utils/getOwnPlaneIcon';
import { getRemotePlaneIcon } from '../utils/getRemotePlaneIcon';
import { normalizeModelToIcon } from '../utils/normalizeModelToIcon';
import TrafficWarningCard from './components/TrafficWarningCard';
import { Plane } from '../types/Plane';



const SERVER_URL = 'https://miappsemaforo-backend-44ded92061ec.herokuapp.com';



interface LatLon {
  latitude: number;
  longitude: number;
}

const getDistance = (lat1: number, lon1: number, lat2: number, lon2: number): number => {
  const R = 6371e3;
  const toRad = (x: number) => (x * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 +
            Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
            Math.sin(dLon / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
};

const getFuturePosition = (lat: number, lon: number, heading: number, speed: number, timeSec: number): LatLon => {
  const distance = speed * timeSec;
  const deltaLat = (distance / 111320) * Math.cos((heading * Math.PI) / 180);
  const deltaLon = (distance / (40075000 * Math.cos((lat * Math.PI) / 180) / 360)) * Math.sin((heading * Math.PI) / 180);
  return {
    latitude: lat + deltaLat,
    longitude: lon + deltaLon,
  };
};

const Radar = () => {
  const { username, aircraftModel, aircraftIcon, callsign } = useUser();
  const [simMode, setSimMode] = useState(true);
  const [selected, setSelected] = useState<Plane | null>(null);
  const [conflict, setConflict] = useState<Plane | null>(null);
  const [followMe, setFollowMe] = useState(true);
  const hideSelectedTimeout = useRef<NodeJS.Timeout | null>(null);
  const [zoom, setZoom] = useState({ latitudeDelta: 0.1, longitudeDelta: 0.1 });
  const [myPlane, setMyPlane] = useState<Plane>({
    id: 'ME',
    name: 'Mi avión',
    lat: 51.95,
    lon: 4.45,
    alt: 300,
    heading: 90,
    speed: 40,
  });
  const [track, setTrack] = useState<LatLon[]>([]);
  const [traffic, setTraffic] = useState<Plane[]>([]);
  const mapRef = useRef<MapView | null>(null);

  const toggleFollowMe = () => setFollowMe(prev => !prev);
 const hasWarning =
  Boolean(conflict) ||
  (selected instanceof Object && conflict instanceof Object && selected.id !== conflict.id);

const getDistanceTo = (plane: Plane): number => {
  if (
    plane?.lat == null || plane?.lon == null ||
    myPlane?.lat == null || myPlane?.lon == null
  ) {
    return NaN;
  }

  return getDistance(myPlane.lat, myPlane.lon, plane.lat, plane.lon);
};



  useEffect(() => {
    const interval = setInterval(async () => {
      try {
        const res = await fetch(`${SERVER_URL}/air-guardian/traffic/${username}`);
        const data = await res.json();
        setTraffic(data.traffic.map((info: any) => ({
          id: info.name,
          name: info.name,
          lat: info.lat,
          lon: info.lon,
          alt: info.alt,
          heading: info.heading,
          speed: info.speed,
          type: info.type,
          callsign: info.callsign,
          
          aircraftIcon: info.aircraftIcon || '2.png', // ✅
        })));
      } catch (err) {
        console.error('Error al obtener tráfico:', err);
      }
      
      
    }, 4000);
    return () => clearInterval(interval);
  }, [username]);

  useEffect(() => {
    if (!simMode) {
      let interval: ReturnType<typeof setInterval>;

      const startTracking = async () => {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== 'granted') return;

        interval = setInterval(async () => {
          const location = await Location.getCurrentPositionAsync({});
          const { latitude, longitude, altitude, heading, speed } = location.coords;

          try {
            await fetch(`${SERVER_URL}/air-guardian/update`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                name: username,
                lat: latitude,
                lon: longitude,
                alt: altitude ?? 0,
                heading: heading ?? 0,
                speed: speed ?? 0,
                type: aircraftModel,
                callsign, // ✅ ahora es correcto
                aircraftIcon: aircraftIcon || '2.png', // ✅ importante
              }),
            });
          } catch (err) {
            console.error('❌ Error GPS:', err);
          }
        }, 1000);
      };

      startTracking();
      return () => {
        if (interval) clearInterval(interval);
      };
    }
  }, [simMode, username, aircraftModel]);
  useEffect(() => {
    if (simMode) {
      const interval = setInterval(() => {
        setMyPlane(prev => {
          const delta = prev.speed * 2;
          const deltaLat = (delta / 111320) * Math.cos((prev.heading * Math.PI) / 180);
          const deltaLon = (delta / (40075000 * Math.cos((prev.lat * Math.PI) / 180) / 360)) * Math.sin((prev.heading * Math.PI) / 180);
          const newLat = prev.lat + deltaLat;
          const newLon = prev.lon + deltaLon;

          // Calcular un punto un poco más atrás del avión para la trayectoria
          const offsetDistance = 500; // en metros (~2-3 mm visuales en pantalla)
          const offsetLat = (offsetDistance / 111320) * Math.cos((prev.heading * Math.PI) / 180 + Math.PI);
          const offsetLon = (offsetDistance / (40075000 * Math.cos((prev.lat * Math.PI) / 180) / 360)) * Math.sin((prev.heading * Math.PI) / 180 + Math.PI);
          const trackLat = newLat + offsetLat;
          const trackLon = newLon + offsetLon;

          setTrack(t => [...t.slice(-20), { latitude: newLat, longitude: newLon }]);

          fetch(`${SERVER_URL}/air-guardian/update`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              name: username,
              lat: newLat,
              lon: newLon,
              alt: prev.alt,
              heading: prev.heading,
              speed: prev.speed,
              type: aircraftModel,
              callsign: callsign || '', // ✅ solución clave
              aircraftIcon: aircraftIcon || '2.png',

            }),
          });

          return { ...prev, lat: newLat, lon: newLon };
        });
      }, 2000);
      return () => clearInterval(interval);
    }
  }, [simMode, username, aircraftModel]);

  useEffect(() => {
    if (!myPlane || traffic.length === 0) return;
    let closest: Plane | null = null;
    let minDist = Infinity;
    const myFuture = getFuturePosition(myPlane.lat, myPlane.lon, myPlane.heading, myPlane.speed, 60);
    for (const plane of traffic) {
      if (plane.id === myPlane.id) continue;
      const theirFuture = getFuturePosition(plane.lat, plane.lon, plane.heading || 0, plane.speed || 0, 60);
      const distNow = getDistance(myPlane.lat, myPlane.lon, plane.lat, plane.lon);
      const distFuture = getDistance(myFuture.latitude, myFuture.longitude, theirFuture.latitude, theirFuture.longitude);
      const deltaAlt = Math.abs(plane.alt - myPlane.alt);
      if (distNow <= 8000 && deltaAlt <= 300 && (distFuture < distNow || distFuture < 5000)) {
        if (distNow < minDist) {
          closest = plane;
          minDist = distNow;
        }
      }
    }
    setConflict(closest);
    if (!closest && selected?.id === conflict?.id) setSelected(null);
    if (!selected && closest) setSelected(closest);
  }, [myPlane, traffic, selected]);

  const centerMap = (lat = myPlane.lat, lon = myPlane.lon) => {
    if (mapRef.current) {
      mapRef.current.animateToRegion({
        latitude: lat,
        longitude: lon,
        latitudeDelta: zoom.latitudeDelta,
        longitudeDelta: zoom.longitudeDelta,
      });
    }
  };

  useEffect(() => {
    if (followMe) centerMap();
  }, [myPlane]);

  return (
    <View style={styles.container}>
      <MapView
        ref={mapRef}
        provider={PROVIDER_GOOGLE}
        style={styles.map}
        initialRegion={{
          latitude: myPlane.lat,
          longitude: myPlane.lon,
          latitudeDelta: zoom.latitudeDelta,
          longitudeDelta: zoom.longitudeDelta,
        }}
        onRegionChangeComplete={region => setZoom({ latitudeDelta: region.latitudeDelta, longitudeDelta: region.longitudeDelta })}
      
      onPress={() => {
        setSelected(null);
        if (hideSelectedTimeout.current) {
          clearTimeout(hideSelectedTimeout.current);
          hideSelectedTimeout.current = null;
        }
      }}

      >
        <Marker
          coordinate={{ latitude: myPlane.lat, longitude: myPlane.lon }}
          anchor={{ x: 0.5, y: 1 }}
          rotation={myPlane.heading}
          flat
        >
        <Image
          source={getOwnPlaneIcon(aircraftIcon)}
          style={{ width: 35, height: 40, marginRight: 1 }}
          resizeMode="contain" //
        />

        </Marker>

        {traffic.map((plane) => (
          <Marker
            key={plane.id}
            coordinate={{ latitude: plane.lat, longitude: plane.lon }}
            anchor={{ x: 0.5, y: 0.5 }}
            rotation={plane.heading}
            flat
          onPress={() => {
            setSelected(plane);

            if (hideSelectedTimeout.current) {
              clearTimeout(hideSelectedTimeout.current);
            }

            hideSelectedTimeout.current = setTimeout(() => {
              setSelected(null);
            }, 6000); // oculta luego de 6 segundos
          }}

          >
        <Image
          source={getRemotePlaneIcon(plane.aircraftIcon || plane.type || '2.png', conflict?.id === plane.id)}
          style={{ width: 30, height: 30 }}
          resizeMode="contain"
        />


          </Marker>
        ))}

        <Polyline coordinates={track} strokeColor="blue" strokeWidth={2} />
      </MapView>

      <View style={styles.controlsBox}>
        <Text style={styles.label}>✈️ Rumbo: {myPlane.heading.toFixed(0)}°</Text>
        <Slider minimumValue={0} maximumValue={359} step={1} value={myPlane.heading} onValueChange={val => setMyPlane(prev => ({ ...prev, heading: val }))} />
        <Text style={styles.label}>🛫 Altitud: {myPlane.alt.toFixed(0)} m</Text>
        <Slider minimumValue={0} maximumValue={2000} step={10} value={myPlane.alt} onValueChange={val => setMyPlane(prev => ({ ...prev, alt: val }))} />
        <Text style={styles.label}>💨 Velocidad: {myPlane.speed.toFixed(0)} km/h</Text>
        <Slider minimumValue={0} maximumValue={400} step={5} value={myPlane.speed} onValueChange={val => setMyPlane(prev => ({ ...prev, speed: val }))} />
      </View>

      {conflict && (
        <TrafficWarningCard aircraft={conflict} distance={getDistanceTo(conflict)} />

        
      )}
      {selected && selected.id !== conflict?.id && (
        <TrafficWarningCard aircraft={selected} distance={getDistanceTo(selected)} />

      )}
      <TouchableOpacity onPress={toggleFollowMe} style={[
          styles.followBtn,
             hasWarning && { bottom: Platform.OS === 'android' ? 170 : 140 }
          ]}
        >
        <Text style={styles.followText}>{followMe ? '✈️ No seguir avión' : '📍 Centrado automático'}</Text>
      </TouchableOpacity>

      <TouchableOpacity
        onPress={() => setSimMode(prev => !prev)}
        style={[
          styles.followBtn,
            { bottom: Platform.OS === 'android' ? 110 : 80 },
            hasWarning && { bottom: Platform.OS === 'android' ? 170 + 50 : 140 + 50 }
          ]}

      >
        <Text style={styles.followText}>
          {simMode ? '🛰️ Usar GPS real' : '🛠️ Usar modo simulación'}
        </Text>
      </TouchableOpacity>
    </View>
  );
};

export default Radar;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingBottom: Platform.OS === 'android' ? 30 : 0,
  },
  map: {
    flex: 1,
  },
  controlsBox: {
    backgroundColor: 'white',
    padding: 10,
    margin: 10,
    borderRadius: 10,
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
    position: 'absolute',
    top: 10,
    left: 10,
    right: 10,
  },
  label: {
    fontSize: 14,
    fontWeight: '500',
    marginTop: 10,
  },
  followBtn: {
    position: 'absolute',
    bottom: Platform.OS === 'android' ? 60 : 30,
    alignSelf: 'center',
    backgroundColor: '#007AFF',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 20,
    elevation: 3,
  },
  followText: {
    color: 'white',
    fontWeight: '600',
  },
});
