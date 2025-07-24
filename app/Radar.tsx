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
import { SERVER_URL } from '../utils/config'; // ajustá la ruta si es distinta
import io from "socket.io-client";



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
  const hideSelectedTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

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

 const socketRef = useRef<ReturnType<typeof io> | null>(null);


useEffect(() => {
  const socket = io(SERVER_URL, {
    transports: ['websocket'],
    query: { name: username }
  });

  socketRef.current = socket;

  socket.on('connect', () => {
    console.log('🔌 Conectado al servidor WebSocket');
  });

  socket.on('traffic-update', (data: any) => {
    // Podés reemplazar esta lógica si el backend te manda otra estructura
    if (Array.isArray(data)) {
      setTraffic(data.map((info: any) => ({
        id: info.name,
        name: info.name,
        lat: info.lat,
        lon: info.lon,
        alt: info.alt,
        heading: info.heading,
        speed: info.speed,
        type: info.type,
        callsign: info.callsign,
        aircraftIcon: info.aircraftIcon || '2.png',
      })));
    }
  });

  socket.on('warning', (warning: any) => {
    console.log('🚨 Warning recibido vía WebSocket:', warning);
    setConflict({
      id: warning.from,
      name: warning.from,
      lat: 0,
      lon: 0,
      alt: 0,
      heading: 0,
      speed: 0,
      alertLevel: warning.type === 'RA' ? 'RA_LOW' : 'TA',
    });
  });

  socket.on('disconnect', () => {
    console.log('🔌 Desconectado del WebSocket');
  });

  return () => {
    socket.disconnect();
    socketRef.current = null;
  };
}, [username]);








  const toggleFollowMe = () => setFollowMe(prev => !prev);
const hasWarning =
  selected?.alertLevel === 'RA_HIGH' ||
  selected?.alertLevel === 'RA_LOW' ||
  selected?.alertLevel === 'TA';


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

        if (data.warnings && data.warnings.length > 0) {
        const warning = data.warnings[0]; // podés hacer un loop si querés varios
        console.log('🛑 Warning recibido del backend:', warning);

    // Opcional: marcar el avión en conflicto aunque no lo hayas detectado localmente
    setConflict({
      id: warning.from,
      name: warning.from,
      lat: 0, // opcional: si no tenés la posición exacta
      lon: 0,
      alt: 0,
      heading: 0,
      speed: 0,
      alertLevel: warning.type === 'RA' ? 'RA_LOW' : 'TA', // ajustar si querés usar RA_HIGH también
      });
    }

      } catch (err) {
        console.error('Error al obtener tráfico:', err);
      }
      
      
    }, 500);// cada 1/2 segundo

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

  const coneAngle = 25; // grados desde el heading
  const timeSteps = Array.from({ length: 36 }, (_, i) => (i + 1) * 5); // [5, 10, ..., 180]
  let selectedConflict: Plane | null = null;
  let selectedConflictLevel: 'RA_HIGH' | 'RA_LOW' | undefined = undefined;

  let selectedNearby: Plane | null = null;
  let minTimeToImpact = Infinity;
  let minProxDist = Infinity;

  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const toDeg = (rad: number) => (rad * 180) / Math.PI;

  const angleBetween = (lat1: number, lon1: number, lat2: number, lon2: number) => {
    const dLon = toRad(lon2 - lon1);
    const y = Math.sin(dLon) * Math.cos(toRad(lat2));
    const x = Math.cos(toRad(lat1)) * Math.sin(toRad(lat2)) -
              Math.sin(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.cos(dLon);
    const brng = Math.atan2(y, x);
    return (toDeg(brng) + 360) % 360;
  };

  const angleDiff = (a: number, b: number) => {
    const d = Math.abs(a - b) % 360;
    return d > 180 ? 360 - d : d;
  };

  for (const plane of traffic) {
    if (plane.id === myPlane.id) continue;

    // TA (tráfico cercano)
    const distanceNow = getDistance(myPlane.lat, myPlane.lon, plane.lat, plane.lon);
    if (distanceNow < 3000 && plane.speed > 30) {
      if (distanceNow < minProxDist) {
        selectedNearby = plane;
        minProxDist = distanceNow;
      }
    }

    // RA (trayectorias convergentes dentro del cono)
    for (const t of timeSteps) {
      const myFuture = getFuturePosition(myPlane.lat, myPlane.lon, myPlane.heading, myPlane.speed, t);
      const theirFuture = getFuturePosition(plane.lat, plane.lon, plane.heading || 0, plane.speed || 0, t);
      const futureDistance = getDistance(myFuture.latitude, myFuture.longitude, theirFuture.latitude, theirFuture.longitude);
      const futureAltDelta = Math.abs(myPlane.alt - plane.alt);

      if (futureDistance < 1500 && futureAltDelta < 300) {
        const bearing = angleBetween(myFuture.latitude, myFuture.longitude, theirFuture.latitude, theirFuture.longitude);
        const diff = angleDiff(myPlane.heading, bearing);

        if (diff < coneAngle) {
          // Clasificamos por tiempo
          if (t < 60 && t < minTimeToImpact) {
            selectedConflict = plane;
            selectedConflictLevel = 'RA_HIGH';
            minTimeToImpact = t;
          } else if (t < 180 && selectedConflictLevel !== 'RA_HIGH') {
            selectedConflict = plane;
            selectedConflictLevel = 'RA_LOW';
            minTimeToImpact = t;
          }
          break;
        }
      }
    }
  }

  setConflict(
    selectedConflict && selectedConflictLevel
      ? {
          ...selectedConflict,
          alertLevel: selectedConflictLevel,
          timeToImpact: minTimeToImpact,
        }
      : null
  );



  if (selectedConflict && selectedConflictLevel) {
    setSelected({
      ...selectedConflict,
      alertLevel: selectedConflictLevel,
      timeToImpact: minTimeToImpact,
    });
  } else if (selectedNearby) {
    setSelected({ ...selectedNearby, alertLevel: 'TA' });
  } else {
    setSelected(null);
  }

  // Enviar warning al backend solo si hay conflicto real
if (selectedConflict && selectedConflictLevel) {
  const warningToSend = {
    from: username, // tu callsign o nombre de avión
    to: selectedConflict.name, // el nombre del avión en conflicto
    type: selectedConflictLevel.startsWith('RA') ? 'RA' : 'TA',
    distance: minProxDist || 0,
    bearing: angleBetween(myPlane.lat, myPlane.lon, selectedConflict.lat, selectedConflict.lon),
    verticalSeparation: myPlane.alt - selectedConflict.alt
  };

  fetch(`${SERVER_URL}/air-guardian/warning`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(warningToSend)
  }).catch(err => console.warn('⚠️ Error al enviar warning:', err));
}


  function isNearby(a: Plane, b: Plane): boolean {
  const dx = a.lat - b.lat;
  const dy = a.lon - b.lon;
  const dz = (a.alt || 0) - (b.alt || 0);

  const horizontalDistance = Math.sqrt(dx * dx + dy * dy) * 111000; // 1° ≈ 111 km
  const verticalDistance = Math.abs(dz);

  return horizontalDistance < 2000 && verticalDistance < 300; // ejemplo: 2 km horizontal y 300 ft vertical
}

  const otherDetectsMeAsNearby = traffic.find((plane) =>
  selected?.id &&
  plane.id !== selected.id &&
  isNearby(plane, selected) // El otro me detecta como cercano
);


const updatedTraffic = traffic.map((plane) => {
  const isConflict =
    selectedConflict &&
    (plane.id === selectedConflict.id || plane.id === selected?.id);

  const isNearby =
    (selectedNearby &&
      (plane.id === selectedNearby.id || plane.id === selected?.id)) ||
    (otherDetectsMeAsNearby && plane.id === selected?.id);

  if (isConflict) {
    return {
      ...plane,
      alertLevel: selectedConflictLevel as 'RA_LOW' | 'RA_HIGH',
    };
  } else if (isNearby) {
    return {
      ...plane,
      alertLevel: 'TA' as const,
    };
  } else {
    return {
      ...plane,
      alertLevel: 'none' as const,
    };
  }
});



const isEqual = JSON.stringify(updatedTraffic) === JSON.stringify(traffic);
if (!isEqual) {
  setTraffic(updatedTraffic);
}



  

}, [myPlane, traffic]);



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

{traffic.map((plane) => {
  console.log('plane', plane.id, 'alertLevel', plane.alertLevel); // 👈 AGREGALO ACÁ

  return (
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
        }, 6000);
      }}
    >
      <Image
        source={getRemotePlaneIcon(
          plane.aircraftIcon || plane.type || '2.png',
          plane.alertLevel
        )}
        style={{ width: 30, height: 30 }}
        resizeMode="contain"
      />
    </Marker>
  );
})}


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
      {/* 
      <View style={styles.legendBox}>
        <Text style={styles.legendText}>🟡 TA: Tráfico cercano</Text>
        <Text style={styles.legendText}>🟠 RA: Conflicto &lt; 3 min</Text>
        <Text style={styles.legendText}>🔴 RA: Riesgo inminente &lt; 1 min</Text>
      </View>
*/}
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
    legendBox: {
    position: 'absolute',
    bottom: 10,
    left: 10,
    backgroundColor: 'white',
    borderRadius: 8,
    padding: 8,
    elevation: 2,
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  legendText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#333',
  },

});
