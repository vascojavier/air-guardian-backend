// C:\air-guardian\frontend\app\Pista.tsx
import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, Button, StyleSheet, Alert, TextInput, Modal } from 'react-native';
import MapView, { Marker, Polyline, MapPressEvent, Region } from 'react-native-maps';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useUser } from '../context/UserContext';
import { useRouter } from 'expo-router';
import ioDefault from 'socket.io-client';
import { Platform } from 'react-native';
import type { Airfield, Runway } from '../types/airfield';
import { socket } from '../utils/socket';




// ---------------------- Tipos locales ----------------------
type LatLng = { latitude: number; longitude: number };

// ---------------------- Helpers ----------------------
const uuid = () =>
  `manual-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

const headingToRunwayIdent = (headingDeg: number) => {
  const h = ((headingDeg % 360) + 360) % 360;
  let num = Math.round(h / 10);
  if (num === 0) num = 36;
  if (num > 36) num = 36;
  return num.toString().padStart(2, '0');
};

const calcularRumbo = (p1: LatLng, p2: LatLng): number => {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const toDeg = (rad: number) => (rad * 180) / Math.PI;
  const lat1 = toRad(p1.latitude);
  const lat2 = toRad(p2.latitude);
  const dLon = toRad(p2.longitude - p1.longitude);
  const y = Math.sin(dLon) * Math.cos(lat2);
  const x =
    Math.cos(lat1) * Math.sin(lat2) -
    Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon);
  return (toDeg(Math.atan2(y, x)) + 360) % 360;
};

const calcularPuntoIntermedio = (p1: LatLng, p2: LatLng): LatLng => ({
  latitude: (p1.latitude + p2.latitude) / 2,
  longitude: (p1.longitude + p2.longitude) / 2,
});

const midpointToLoc = (A: LatLng, B: LatLng) => ({
  lat: (A.latitude + B.latitude) / 2,
  lng: (A.longitude + B.longitude) / 2,
});

// ---------------------- Socket ----------------------
// ⛔️ ELIMINÁ estas líneas (y su import):
// import ioDefault from 'socket.io-client';
// import { Platform } from 'react-native';
// type IOSocket = ReturnType<typeof ioDefault>;
// const BACKEND_URL = (process.env.EXPO_PUBLIC_BACKEND_URL as string) || (Platform.OS === 'web' ? 'http://localhost:3000' : 'http://192.168.0.10:3000');

// ✅ USÁ el socket global


export default function PistaScreen() {
  const router = useRouter();
  const { role } = useUser(); // 'pilot' o 'aeroclub'

  const [cabeceraA, setCabeceraA] = useState<LatLng | null>(null);
  const [cabeceraB, setCabeceraB] = useState<LatLng | null>(null);
  const [cabeceraActiva, setCabeceraActiva] = useState<'A' | 'B' | null>(null);
  const [rumbo, setRumbo] = useState<number>(0);
  const [modoSeteo, setModoSeteo] = useState<boolean>(false);
  const [numeroPista, setNumeroPista] = useState<string>('');
  const [showModal, setShowModal] = useState<boolean>(false);
  const [showDetails, setShowDetails] = useState(true);

  // Asegurar conexión cuando entra a Pista
  useEffect(() => {
    if (!socket.connected) socket.connect();
  }, []);


  // Carga inicial: primero intentamos airfieldActive; si no hay, caemos a pistaActiva (legacy)
  useEffect(() => {
    const cargar = async () => {
      try {
        const afRaw = await AsyncStorage.getItem('airfieldActive');
        if (afRaw) {
          const af: Airfield = JSON.parse(afRaw);
          const rw = af.runways?.[0];
          if (rw) {
            const A: LatLng = { latitude: rw.thresholdA.lat, longitude: rw.thresholdA.lng };
            const B: LatLng = { latitude: rw.thresholdB.lat, longitude: rw.thresholdB.lng };
            setCabeceraA(A);
            setCabeceraB(B);
            const active = rw.active_end ?? 'A';
            setCabeceraActiva(active);
            const baseHeading = rw.heading_true_ab;
            setRumbo(active === 'A' ? baseHeading : (baseHeading + 180) % 360);
            setNumeroPista(rw.identA ?? '');
            return;
          }
        }
        // Fallback legacy
        const datos = await AsyncStorage.getItem('pistaActiva');
        if (datos) {
          const { runway, defaultActiveHeading, numero } = JSON.parse(datos);
          setCabeceraA(runway.A);
          setCabeceraB(runway.B);
          setCabeceraActiva(defaultActiveHeading);
          setNumeroPista(numero || '');
          const calcHeading = calcularRumbo(runway.A, runway.B);
          setRumbo(defaultActiveHeading === 'A' ? calcHeading : (calcHeading + 180) % 360);
        }
      } catch (error) {
        console.error('Error al cargar la pista activa:', error);
      }
    };
    cargar();
    return () => {
      try { socket?.disconnect(); } catch {}
    };
  }, [socket]);

  // ---------------------- Handlers ----------------------
  const handleMapPress = async (event: MapPressEvent) => {
    if (role !== 'aeroclub' || !modoSeteo) return;
    const coords = event.nativeEvent.coordinate;
    if (!cabeceraA) {
      setCabeceraA(coords);
      Alert.alert('Cabecera A definida');
    } else if (!cabeceraB) {
      setCabeceraB(coords);
      setShowModal(true);
    }
  };


// Poné esto ARRIBA del componente (o justo antes de cambiarCabecera):
const BACKEND_URL =
  (process.env.EXPO_PUBLIC_BACKEND_URL as string) ||
  'https://air-guardian-backend.onrender.com'; // o tu URL local durante dev

// Helper: asegura conexión y emite de forma confiable
async function emitAirfieldUpsertReliable(af: Airfield, reuse?: ReturnType<typeof ioDefault> | null) {
  return new Promise<void>((resolve) => {
    // 1) Si nos pasaron un socket ya creado, usalo
    if (reuse) {
      const s = reuse;
      const doEmit = () => {
        try {
          s.emit('airfield-upsert', { airfield: af });
          // peguemos un pequeño delay para no cerrar antes de que viaje
          setTimeout(resolve, 200);
        } catch (_) {
          resolve();
        }
      };
      if (s.connected) return doEmit();
      s.once('connect', doEmit);
      s.connect();
      return;
    }

    // 2) One-shot: creamos un socket, esperamos "connect", emitimos y cerramos
    const s = ioDefault(BACKEND_URL, { transports: ['websocket'], autoConnect: false });
    const cleanup = () => {
      // darle tiempo a que salga por la red
      setTimeout(() => {
        try { s.disconnect(); } catch {}
        resolve();
      }, 300);
    };
    s.on('connect', () => {
      try { s.emit('airfield-upsert', { airfield: af }); }
      catch (_) {}
      cleanup();
    });
    s.on('connect_error', cleanup);
    s.connect();
  });
}



const cambiarCabecera = async () => {
  if (!cabeceraActiva || !cabeceraA || !cabeceraB) return;

  const nueva: 'A' | 'B' = cabeceraActiva === 'A' ? 'B' : 'A';
  setCabeceraActiva(nueva);
  setRumbo((prev) => (prev + 180) % 360);

  try {
    // (1) espejo legacy
    const datosLegacy = await AsyncStorage.getItem('pistaActiva');
    if (datosLegacy) {
      const json = JSON.parse(datosLegacy);
      json.defaultActiveHeading = nueva;
      await AsyncStorage.setItem('pistaActiva', JSON.stringify(json));
    }

    // (2) actualizar airfieldActive
    const raw = await AsyncStorage.getItem('airfieldActive');
    if (!raw) return;

    const af: Airfield = JSON.parse(raw);
    if (!af?.runways?.[0]) return;

    af.runways[0].active_end = nueva;
    af.lastUpdated = Date.now();
    await AsyncStorage.setItem('airfieldActive', JSON.stringify(af));

    // (3) EMITIR al backend — usa tu socket memoizado si existe; si no, one-shot robusto
    //     OJO: 'socket' es el que creaste con useMemo arriba en Pista.tsx
    await emitAirfieldUpsertReliable(af, socket);

  } catch (error) {
    console.error('Error al cambiar cabecera activa:', error);
  }
};





  const guardarPista = async () => {
    if (!cabeceraA || !cabeceraB || !numeroPista) {
      Alert.alert('Faltan datos', 'Definí A, B y el número de pista.');
      return;
    }

    const rumboAB = calcularRumbo(cabeceraA, cabeceraB);
    setRumbo(rumboAB);
    const activa: 'A' | 'B' = 'A';
    setCabeceraActiva(activa);

    // Construir Runway/Airfield unificado
    const identA = numeroPista.trim();
    const identB = headingToRunwayIdent((rumboAB + 180) % 360);

    const runway: Runway = {
      id: uuid(),
      identA,
      identB,
      thresholdA: { lat: cabeceraA.latitude, lng: cabeceraA.longitude },
      thresholdB: { lat: cabeceraB.latitude, lng: cabeceraB.longitude },
      heading_true_ab: rumboAB,
      active_end: activa,
    };

    const airfield: Airfield = {
      id: uuid(),
      location: midpointToLoc(cabeceraA, cabeceraB),
      runways: [runway],
      lastUpdated: Date.now(),
      source: 'manual',
    };

    try {
      // Guardar NUEVO modelo
      await AsyncStorage.setItem('airfieldActive', JSON.stringify(airfield));

      // (Temporal) Espejo legacy
      const pistaLegacy = {
        runway: { A: cabeceraA, B: cabeceraB },
        defaultActiveHeading: activa,
        numero: identA,
      };
      await AsyncStorage.setItem('pistaActiva', JSON.stringify(pistaLegacy));

      // Emitir WS
      try { socket?.emit?.('airfield-upsert', { airfield }); } catch {}

      // Cerrar modal / salir de modo seteo
      setModoSeteo(false);
      setShowModal(false);

      // Ir a completar opcionales
      router.push('/AirfieldDetails');
    } catch (e) {
      console.error('Error guardando pista/airfield:', e);
      Alert.alert('Error', 'No se pudo guardar la pista.');
    }
  };

  const onRegionChangeComplete = (region: Region) => {
    const threshold = 0.2; // ≈10 km
    setShowDetails(region.latitudeDelta < threshold && region.longitudeDelta < threshold);
  };

  // ---------------------- Render ----------------------
  return (
    <View style={{ flex: 1 }}>
      <MapView
        style={{ flex: 1 }}
        initialRegion={{
          latitude: cabeceraA?.latitude || 51.956,
          longitude: cabeceraA?.longitude || 4.437,
          latitudeDelta: 0.01,
          longitudeDelta: 0.01,
        }}
        onPress={handleMapPress}
        onRegionChangeComplete={onRegionChangeComplete}
      >
        {cabeceraA && showDetails && (
          <Marker coordinate={cabeceraA} title={`Cabecera A ${numeroPista}`}>
            <View style={styles.marker}><Text style={styles.markerText}>A</Text></View>
          </Marker>
        )}
        {cabeceraB && showDetails && (
          <Marker coordinate={cabeceraB} title={`Cabecera B ${numeroPista}`}>
            <View style={styles.marker}><Text style={styles.markerText}>B</Text></View>
          </Marker>
        )}
        {cabeceraA && cabeceraB && (
          <Polyline coordinates={[cabeceraA, cabeceraB]} strokeColor="black" strokeWidth={2} />
        )}
        {cabeceraA && cabeceraB && cabeceraActiva && (
          <Marker
            coordinate={calcularPuntoIntermedio(cabeceraA, cabeceraB)}
            title={`${numeroPista}`}
            anchor={{ x: 0.5, y: 0.5 }}
            flat
            rotation={rumbo}
          >
            <View style={{ alignItems: 'center' }}>
              <View style={styles.arrow} />
            </View>
          </Marker>
        )}
      </MapView>

      <Modal visible={showModal} transparent animationType="slide">
        <View style={styles.modalContainer}>
          <View style={styles.modalBox}>
            <Text style={styles.text}>Ingresá el número de pista:</Text>
            <TextInput
              style={styles.input}
              placeholder="Ej: 18L"
              value={numeroPista}
              onChangeText={setNumeroPista}
            />
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <Button title="Cancelar" onPress={() => setShowModal(false)} />
              <Button title="Guardar" onPress={guardarPista} />
            </View>
          </View>
        </View>
      </Modal>

      <View style={styles.panel}>
        {cabeceraActiva && <Text style={styles.text}>Cabecera activa: {cabeceraActiva}</Text>}
        {role === 'aeroclub' && (
          <>
            <Button title="Cambiar cabecera activa" onPress={cambiarCabecera} />
            <Button
              title={modoSeteo ? 'Cancelar Seteo de Pista' : 'Setear nueva pista'}
              onPress={() => {
                setCabeceraA(null);
                setCabeceraB(null);
                setCabeceraActiva(null);
                setModoSeteo(!modoSeteo);
                setNumeroPista('');
              }}
            />
          </>
        )}
      </View>
    </View>
  );
}

// ---------------------- Styles ----------------------
const styles = StyleSheet.create({
  panel: {
    padding: 10,
    paddingBottom: 30,
    backgroundColor: '#fff',
  },
  text: {
    fontWeight: 'bold',
    marginBottom: 10,
  },
  arrow: {
    width: 0,
    height: 0,
    backgroundColor: 'transparent',
    borderStyle: 'solid',
    borderLeftWidth: 10,
    borderRightWidth: 10,
    borderBottomWidth: 20,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderBottomColor: 'green',
  },
  input: {
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 5,
    padding: 8,
    marginBottom: 10,
  },
  marker: {
    backgroundColor: '#2196F3',
    padding: 2,
    borderRadius: 10,
    minWidth: 20,
    alignItems: 'center',
  },
  markerText: {
    color: 'white',
    fontWeight: 'bold',
    fontSize: 10,
  },
  runwayNumber: {
    backgroundColor: '#2196F3',
    padding: 4,
    borderRadius: 8,
    alignItems: 'center',
  },
  modalContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  modalBox: {
    width: '80%',
    backgroundColor: 'white',
    borderRadius: 10,
    padding: 20,
    elevation: 5,
  },
});
