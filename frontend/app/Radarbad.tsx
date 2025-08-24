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
import { socket } from '../utils/socket';
//import { calcularWarningLocalMasPeligroso } from '../data/WarningSelector';
import { Warning } from '../data/FunctionWarning'; // Usa tu tipo existente si ya lo definiste ahí


interface LatLon {
  latitude: number;
  longitude: number;
}

// Al inicio del archivo (debajo de otros imports)
function angleBetween(lat1: number, lon1: number, lat2: number, lon2: number) {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const toDeg = (rad: number) => (rad * 180) / Math.PI;

  const dLon = toRad(lon2 - lon1);
  const y = Math.sin(dLon) * Math.cos(toRad(lat2));
  const x = Math.cos(toRad(lat1)) * Math.sin(toRad(lat2)) -
            Math.sin(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.cos(dLon);
  return (toDeg(Math.atan2(y, x)) + 360) % 360;
}

function angleDiff(a: number, b: number) {
  const d = Math.abs(a - b) % 360;
  return d > 180 ? 360 - d : d;
}

function calcularWarningLocalMasPeligroso(
  myPlane: {
    lat: number;
    lon: number;
    alt: number;
    speed: number;
    heading: number;
    name: string;
  },
  traffic: any[]
): Warning | null {
  const warnings: Warning[] = [];

  const getFuturePosition = 
    (
    lat: number,
    lon: number,
    heading: number,
    speed: number,
    t: number
    ): { lat: number; lon: number } => {

    const R = 6371e3;
    const d = (speed / 3.6) * t;
    const θ = (heading * Math.PI) / 180;
    const φ1 = (lat * Math.PI) / 180;
    const λ1 = (lon * Math.PI) / 180;

    const φ2 = Math.asin(Math.sin(φ1) * Math.cos(d / R) +
      Math.cos(φ1) * Math.sin(d / R) * Math.cos(θ));
    const λ2 = λ1 + Math.atan2(Math.sin(θ) * Math.sin(d / R) * Math.cos(φ1),
      Math.cos(d / R) - Math.sin(φ1) * Math.sin(φ2));

    return {
      lat: (φ2 * 180) / Math.PI,
      lon: (λ2 * 180) / Math.PI
    };
  };

  traffic.forEach((otro) => {
    const dx = otro.lon - myPlane.lon;
    const dy = otro.lat - myPlane.lat;
    const dz = (otro.alt || 0) - (myPlane.alt || 0);
    const distancia = Math.sqrt(dx * dx + dy * dy + dz * dz * 1e-10) * 111000;

    const relativeSpeed = Math.abs((otro.speed || 0) - (myPlane.speed || 0));
    const tiempoImpacto = relativeSpeed > 1 ? distancia / relativeSpeed : Infinity;

    const bearing = angleBetween(myPlane.lat, myPlane.lon, otro.lat, otro.lon);
    const angulo = angleDiff(myPlane.heading, bearing);
    const dentroDeCono = angulo < 15;

    const futuroMyPlane = getFuturePosition(myPlane.lat, myPlane.lon, myPlane.heading, myPlane.speed, 10);
    const futuroOtro = getFuturePosition(otro.lat, otro.lon, otro.heading, otro.speed, 10);
    const distFutura = Math.sqrt(
      Math.pow(futuroOtro.lon - futuroMyPlane.lon, 2) +
      Math.pow(futuroOtro.lat - futuroMyPlane.lat, 2)
    ) * 111000;

    const seAproxima = distFutura < distancia;

    if (seAproxima && dentroDeCono) {
      let alertLevel: Warning['alertLevel'] | null = null;

      if (tiempoImpacto < 60) {
        alertLevel = 'RA_HIGH';
      } else if (tiempoImpacto < 180) {
        alertLevel = 'RA_LOW';
      } else if (distancia < 2000) {
        alertLevel = 'TA';
      }

      if (alertLevel) {
        warnings.push({
          id: otro.id,
          name: otro.name,
          lat: otro.lat,
          lon: otro.lon,
          alt: otro.alt,
          heading: otro.heading,
          speed: otro.speed,
          alertLevel,
          timeToImpact: tiempoImpacto,
        });
      }
    }
  });

  const prioridades = { RA_HIGH: 3, RA_LOW: 2, TA: 1 };
  warnings.sort((a, b) => {
    const p1 = prioridades[a.alertLevel];
    const p2 = prioridades[b.alertLevel];
    if (p1 !== p2) return p2 - p1;
    return (a.timeToImpact || Infinity) - (b.timeToImpact || Infinity);
  });

  return warnings[0] || null;
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
  const prioritizedTimerRef = useRef<NodeJS.Timeout | null>(null);

  const [warnings, setWarnings] = useState<{ [id: string]: Warning }>({});
  
  const [selectedWarning, setSelectedWarning] = useState<Warning | null>(null);
  const [localWarning, setLocalWarning] = useState<Warning | null>(null);
  const [backendWarning, setBackendWarning] = useState<Warning | null>(null);
  const [prioritizedWarning, setPrioritizedWarning] = useState<Warning | null>(null);

  const [zoom, setZoom] = useState({ latitudeDelta: 0.1, longitudeDelta: 0.1 });
  const [planes, setPlanes] = useState<Plane[]>([]);
  const [myPlane, setMyPlane] = useState<Plane>({
    id: username,
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

  const priorizarWarningManual = (warning: Warning) => {
    blockUpdateUntil.current = Date.now() + 6000; // ⏱️ bloquea 6s

    setPrioritizedWarning(warning);
    setSelectedWarning(warning);

    if (prioritizedTimerRef.current) {
      clearTimeout(prioritizedTimerRef.current);
    }

    prioritizedTimerRef.current = setTimeout(() => {
      setSelectedWarning(null);
      setPrioritizedWarning(null); // 👈 también borra el warning priorizado
      prioritizedTimerRef.current = null; // ✅ Libera el candado
    }, 6000);
};

useEffect(() => {
  if (
    prioritizedWarning &&
    socketRef.current &&
    ['TA', 'RA_LOW', 'RA_HIGH'].includes(prioritizedWarning.alertLevel)
  ) {
    socketRef.current.emit('warning', prioritizedWarning);
    console.log('📡 Warning enviado al backend:', prioritizedWarning);
  }
}, [prioritizedWarning]);


  const toggleFollowMe = () => setFollowMe(prev => !prev);

  const hasWarning = !!(prioritizedWarning || selected || conflict);



  const getDistanceTo = (plane: Plane): number => {
  if (
    plane?.lat == null || plane?.lon == null ||
    myPlane?.lat == null || myPlane?.lon == null
  ) {
    return NaN;
  }

    return getDistance(myPlane.lat, myPlane.lon, plane.lat, plane.lon);
};


const blockUpdateUntil = useRef<number>(0); // ⬅️ asegurate de declarar esto al inicio del componente

useEffect(() => {
  const traffic = planes.filter(p => p.id !== myPlane?.id);
  if (!myPlane || !traffic) return;

const nuevoWarningLocal = calcularWarningLocalMasPeligroso(
  myPlane,
  traffic.filter(p => p.id !== myPlane.id)
);


  // No sobrescribas el warning si hay uno priorizado manualmente
  if (prioritizedTimerRef.current) {
    console.log('⏱️ Manteniendo warning manual actual:', prioritizedWarning);
  // Hay un warning manual activo, no lo reemplazamos.
  return;
  }


  const prioridades = { RA_HIGH: 3, RA_LOW: 2, TA: 1 };

  if (!nuevoWarningLocal && !backendWarning && !prioritizedTimerRef.current) {
    console.log('🟢 No hay warnings válidos, limpiando.');
    setPrioritizedWarning(null);
    return;
  }

  if (nuevoWarningLocal && !backendWarning) {
    console.log('📡 Usando warning LOCAL:', nuevoWarningLocal);
    setPrioritizedWarning(nuevoWarningLocal);
    return;
  }

  if (!nuevoWarningLocal && backendWarning) {
    console.log('🌐 Usando warning del BACKEND:', backendWarning);
    setPrioritizedWarning(backendWarning);
    return;
  }

  // Ambos existen, comparar prioridad
  const localPriority = prioridades[nuevoWarningLocal!.alertLevel];
  const backendPriority = prioridades[backendWarning!.alertLevel];

  if (localPriority > backendPriority) {
    console.log('⚖️ Ambos warnings, prioridad local gana:', nuevoWarningLocal);
    setPrioritizedWarning(nuevoWarningLocal);
  } else if (backendPriority > localPriority) {
    console.log('⚖️ Ambos warnings, prioridad backend gana:', backendWarning);
    setPrioritizedWarning(backendWarning);
  } else {
    const localTime = nuevoWarningLocal!.timeToImpact || Infinity;
    const backendTime = backendWarning!.timeToImpact || Infinity;
      console.log(
      '⚖️ Misma prioridad, comparando tiempos:',
     'local:', localTime,
     'backend:', backendTime
      );
    setPrioritizedWarning(localTime < backendTime ? nuevoWarningLocal : backendWarning);
  }
}, [planes, myPlane, backendWarning]);


useEffect(() => {
  if (!username) return;

  socketRef.current = socket;

  const s = socketRef.current;

  s.on('connect', () => {
    console.log('🔌 Conectado al servidor WebSocket');
  });

  s.on('conflicto', (data: any) => {
    console.log('⚠️ Conflicto recibido vía WebSocket:', data);
// Buscar en el tráfico el avión que coincide
  const matchingPlane = planes.find(p => p.id === data.name || p.name === data.name);
  if (!matchingPlane) return;

  const enrichedWarning: Warning = {
    id: matchingPlane.id,
    name: matchingPlane.name,
    lat: matchingPlane.lat,
    lon: matchingPlane.lon,
    alt: matchingPlane.alt,
    heading: matchingPlane.heading,
    speed: matchingPlane.speed,
    alertLevel: data.type === 'RA' ? 'RA_LOW' : 'TA', // ajustá según el backend
    timeToImpact: 999, // opcional si no viene del backend
    aircraftIcon: matchingPlane.aircraftIcon,
    callsign: matchingPlane.callsign,
  };

    setWarnings(prev => ({
      ...prev,
      [enrichedWarning.id]: enrichedWarning,
    }));

});

  s.on('traffic-update', (data: any) => {
    if (Array.isArray(data)) {
      console.log('✈️ Tráfico recibido:', data);
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

  s.on('disconnect', () => {
    console.log('🔌 Desconectado del WebSocket');
  });

  let intervalId: NodeJS.Timeout;

  intervalId = setInterval(async () => {
    let data;

    if (simMode) {
      setMyPlane(prev => {
        const delta = prev.speed * 2;
        const deltaLat = (delta / 111320) * Math.cos((prev.heading * Math.PI) / 180);
        const deltaLon = (delta / (40075000 * Math.cos((prev.lat * Math.PI) / 180) / 360)) * Math.sin((prev.heading * Math.PI) / 180);
        const newLat = prev.lat + deltaLat;
        const newLon = prev.lon + deltaLon;

        data = {
          name: username,
          latitude: newLat,
          longitude: newLon,
          alt: prev.alt,
          heading: prev.heading,
          type: aircraftModel,
          speed: prev.speed,
          callsign: callsign || '',
          aircraftIcon: aircraftIcon || '2.png',
        };

        console.log('📡 Enviando posición simulada por WS:', data);
        s.emit('update', data);

        return {
          ...prev,
          lat: newLat,
          lon: newLon,
        };
      });
    } else {
      try {
        const { coords } = await Location.getCurrentPositionAsync({});
        data = {
          name: username,
          latitude: coords.latitude,
          longitude: coords.longitude,
          alt: coords.altitude || 0,
          heading: coords.heading || 0,
          type: aircraftModel,
          speed: coords.speed || 0,
          callsign,
          aircraftIcon: aircraftIcon || '2.png',
        };

        console.log('📡 Enviando posición real por WS:', data);
        s.emit('update', data);
      } catch (err) {
        console.warn('📍 Error obteniendo ubicación:', err);
      }
    }
  }, 1000);

  return () => {
    clearInterval(intervalId);
    s.off('connect');
    s.off('conflicto');
    s.off('traffic-update');
    s.off('disconnect');
    s.disconnect();
    socketRef.current = null;
  };
}, [username, simMode, aircraftModel, aircraftIcon, callsign]);



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

{planes
  .filter(plane => plane.id !== username) // Evita dibujarte dos veces
  .map((plane) => {

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

  const warning = warnings[plane.id]; // ⚠️ Buscar si ya hay un warning recibido para este avión

  if (warning) {
    priorizarWarningManual(warning);
  } else if (
    plane.alertLevel === 'TA' ||
    plane.alertLevel === 'RA_LOW' ||
    plane.alertLevel === 'RA_HIGH'
  ) {
    priorizarWarningManual({
      alertLevel: plane.alertLevel,
      timeToImpact: plane.timeToImpact || Infinity,
      id: plane.id,
      name: plane.name,
      lat: plane.lat,
      lon: plane.lon,
      alt: plane.alt,
      heading: plane.heading,
      speed: plane.speed,
      type: plane.type,
      callsign: plane.callsign,
      aircraftIcon: plane.aircraftIcon,
    });
  }

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
        <Text style={styles.label}>✈️ heading: {myPlane.heading.toFixed(0)}°</Text>
        <Slider minimumValue={0} maximumValue={359} step={1} value={myPlane.heading} onValueChange={val => setMyPlane(prev => ({ ...prev, heading: val }))} />
        <Text style={styles.label}>🛫 Altitud: {myPlane.alt.toFixed(0)} m</Text>
        <Slider minimumValue={0} maximumValue={2000} step={10} value={myPlane.alt} onValueChange={val => setMyPlane(prev => ({ ...prev, alt: val }))} />
        <Text style={styles.label}>💨 Velocidad: {myPlane.speed.toFixed(0)} km/h</Text>
        <Slider minimumValue={0} maximumValue={400} step={5} value={myPlane.speed} onValueChange={val => setMyPlane(prev => ({ ...prev, speed: val }))} />
      </View>

      {prioritizedWarning ? (
        <TrafficWarningCard aircraft={prioritizedWarning} distance={getDistanceTo(prioritizedWarning)} />
      ) : conflict ? (
        <TrafficWarningCard aircraft={conflict} distance={getDistanceTo(conflict)} />
      ) : selected ? (
        <TrafficWarningCard aircraft={selected} distance={getDistanceTo(selected)} />
      ) : null}


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


