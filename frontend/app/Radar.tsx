import React, { useEffect, useState, useRef, useMemo } from 'react';
import { View, Text, StyleSheet, Dimensions, TouchableOpacity, Image, Alert, Platform, AppState, ScrollView } from 'react-native';
import MapView, { Marker, PROVIDER_GOOGLE, Polyline } from 'react-native-maps';
import Slider from '@react-native-community/slider';
import * as Location from 'expo-location';
import { useUser } from '../context/UserContext';
import { getOwnPlaneIcon } from '../utils/getOwnPlaneIcon';
import { getRemotePlaneIcon } from '../utils/getRemotePlaneIcon';
import { normalizeModelToIcon } from '../utils/normalizeModelToIcon';
import TrafficWarningCard from './components/TrafficWarningCard';
import { Plane } from '../types/Plane';
export const BACKEND_URL = 'https://air-guardian-backend.onrender.com';
export const SERVER_URL  = BACKEND_URL; // alias
import io from "socket.io-client";
import { socket } from '../utils/socket';
//import { calcularWarningLocalMasPeligroso } from '../data/WarningSelector';
import { Warning } from '../data/FunctionWarning';
import { useFocusEffect } from "@react-navigation/native";
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Airfield } from '../types/airfield';
import * as Speech from 'expo-speech';






interface LatLon {
  latitude: number;
  longitude: number;
}

// === Distancia Haversine unificada (metros) ===
const EARTH_RADIUS_M = 6371008.8; // IUGG mean Earth radius
const toRad = (d: number) => (d * Math.PI) / 180;

const getDistance = (lat1: number, lon1: number, lat2: number, lon2: number): number => {
  // Manejo simple de nulos/NaN para evitar NaN cascada
  if (
    typeof lat1 !== 'number' || typeof lon1 !== 'number' ||
    typeof lat2 !== 'number' || typeof lon2 !== 'number'
  ) return NaN;

  const φ1 = toRad(lat1);
  const φ2 = toRad(lat2);
  const Δφ = toRad(lat2 - lat1);
  const Δλ = toRad(lon2 - lon1);

  const a =
    Math.sin(Δφ / 2) ** 2 +
    Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) ** 2;

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return EARTH_RADIUS_M * c;
};


const getFuturePosition = (lat: number, lon: number, heading: number, speedKmh: number, timeSec: number): LatLon => {
  const distanceMeters = (speedKmh * 1000 / 3600) * timeSec; // km/h -> m/s
  const deltaLat = (distanceMeters / 111320) * Math.cos((heading * Math.PI) / 180);
  const denom = 40075000 * Math.cos((lat * Math.PI) / 180) / 360;
  const deltaLon = (distanceMeters / denom) * Math.sin((heading * Math.PI) / 180);
  return { latitude: lat + deltaLat, longitude: lon + deltaLon };
};

// --- Parámetros de RA ajustables ---
const RA_CONE_DEG = 28;       // antes 15°
const RA_MIN_DIST_M = 2000;   // antes 1500 m
const RA_VSEP_MAX_M = 300;    // igual que antes
const RA_HIGH_TTI_S = 60;
const RA_LOW_TTI_S  = 180;



const Radar = () => {


  const { username, aircraftModel, aircraftIcon, callsign } = useUser();
  const [simMode, setSimMode] = useState(true);
  const [selected, setSelected] = useState<Plane | null>(null);
  const [conflict, setConflict] = useState<Plane | null>(null);
  const [followMe, setFollowMe] = useState(true);
  const hideSelectedTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Guarda la última vez (ms) que enviamos un warning por avión
  const lastWarningTimeRef = useRef<Record<string, number>>({});
  const backendDistanceRef = useRef<Record<string, number>>({});
  const selectedHoldUntilRef = useRef<number>(0);


  const refreshPinnedDistance = () => {
  setPrioritizedWarning(prev => {
    if (!prev) return prev;

    // 1) ¿tenemos distancia “oficial” del backend (emisor)?
    const backendDist = backendDistanceRef.current[prev.id];

    let freshDist: number | undefined = undefined;
    if (typeof backendDist === 'number') {
      freshDist = backendDist;
    } else {
      // 2) si no hay backendDist, calculamos localmente contra el ícono en pantalla
      const p = planes.find(pl => pl.id === prev.id);
      if (p && myPlane) {
        freshDist = getDistance(myPlane.lat, myPlane.lon, p.lat, p.lon);
      }
    }

    // si logramos una distancia nueva, sólo actualizamos ese campo
    return (typeof freshDist === 'number')
      ? { ...prev, distanceMeters: freshDist }
      : prev;
      });
    };


    

  // único timer
  const holdTimerRef = useRef<NodeJS.Timeout | null>(null);
  // debounce solo para TA
  const taDebounceRef = useRef<NodeJS.Timeout | null>(null);
  const TA_DEBOUNCE_MS = 400;
  const snoozeUntilRef = useRef<number>(0);
  const snoozeIdRef = useRef<string | null>(null);



  const [warnings, setWarnings] = useState<{ [id: string]: Warning }>({});
  const [selectedWarning, setSelectedWarning] = useState<Warning | null>(null);
  const [localWarning, setLocalWarning] = useState<Warning | null>(null);
  const [backendWarning, setBackendWarning] = useState<Warning | null>(null);
  const [prioritizedWarning, setPrioritizedWarning] = useState<Warning | null>(null);
  // === RUNWAY: estado del panel y del estado de pista ===
  const [runwayState, setRunwayState] = useState<null | {
    airfield?: any;
    state?: {
      landings?: any[];
      takeoffs?: any[];
      inUse?: any | null;
      timeline?: any[];
      serverTime?: number;
    }
  }>(null);
  


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

  const lastSentWarningRef = useRef<{ sig: string; t: number } | null>(null);
  const lastRAIdRef = useRef<string | null>(null);
  // Hold por RA de 6s por avión (evita que TA local “pise” al RA backend)
  const raHoldUntilRef = useRef<Record<string, number>>({});


  

  const maybeEmitWarning = (w: Warning) => {
    // solo emitimos TA/RA válidos
    if (!w || !['TA','RA_LOW','RA_HIGH'].includes(w.alertLevel)) return;
    const s = socketRef.current;
    if (!s) return;

    const sig = `${w.id}|${w.alertLevel}`;
    const now = Date.now();
    // re-emití si cambia la firma o pasaron 3s desde el último envío
    if (
      !lastSentWarningRef.current ||
      lastSentWarningRef.current.sig !== sig ||
      now - lastSentWarningRef.current.t > 3000
    ) {
      s.emit('warning', w);
      lastSentWarningRef.current = { sig, t: now };
      console.log('📡 Enviado warning (forzado):', w);
    }
  };


  const clearWarningFor = (planeId: string) => {
  // 1) sacá el warning del diccionario
  setWarnings(prev => {
    const { [planeId]: _omit, ...rest } = prev;
    return rest;
  });

    // 2) poné el avión en estado visual “sin alerta”
    setPlanes(prev =>
      prev.map(p =>
        p.id === planeId
          ? { ...p, alertLevel: 'none', timeToImpact: undefined }
          : p
      )
    );

    setTraffic(prev =>
      prev.map(t =>
        t.id === planeId
          ? { ...t, alertLevel: 'none', timeToImpact: undefined }
          : t
      )
    );

    // 3) si justo ese avión estaba seleccionado/priorizado, limpiá tarjetas
    setSelected(s => (s && s.id === planeId ? null : s));
    setConflict(c => (c && c.id === planeId ? null : c));
    setPrioritizedWarning(w => (w && w.id === planeId ? null : w));
  };
// Cuando cambia el username (p. ej., elegís otro avión), sincroniza myPlane.id
useEffect(() => {
  if (!username) return;
  setMyPlane(prev => ({ ...prev, id: username, name: username }));
}, [username]);

const [track, setTrack] = useState<LatLon[]>([]);
const [traffic, setTraffic] = useState<Plane[]>([]);
// Secuencia/slots (de sequence-update)
const [slots, setSlots] = useState<Array<{opId:string; type:'ARR'|'DEP'; name:string; startMs:number; endMs:number; frozen:boolean;}>>([]);
// Target de navegación que llega por ATC (o por tu lógica local)
const [navTarget, setNavTarget] = useState<LatLon | null>(null);
const mapRef = useRef<MapView | null>(null);
const socketRef = useRef<ReturnType<typeof io> | null>(null);
const isFocusedRef = useRef(false);
const lastDistanceRef = useRef<Record<string, number>>({});

// === Airfield (pista) ===
const [airfield, setAirfield] = useState<Airfield | null>(null);

// Derivados de la runway activa (si existe)
const rw = airfield?.runways?.[0];
const A_runway = rw ? { latitude: rw.thresholdA.lat, longitude: rw.thresholdA.lng } : null;
const B_runway = rw ? { latitude: rw.thresholdB.lat, longitude: rw.thresholdB.lng } : null;
const runwayHeading = rw
  ? (rw.active_end === 'A' ? rw.heading_true_ab : (rw.heading_true_ab + 180) % 360)
  : 0;
const runwayMid = (A_runway && B_runway)
  ? { latitude: (A_runway.latitude + B_runway.latitude) / 2, longitude: (A_runway.longitude + B_runway.longitude) / 2 }
  : null;

    // === Beacons desde airfield (si existen) ===
  const beaconB1 = useMemo<LatLon | null>(() => {
    const arr = (rw as any)?.beacons as Array<{name:string; lat:number; lon:number}> | undefined;
    const b1 = arr?.find(b => (b.name || '').toUpperCase() === 'B1');
    return b1 ? { latitude: b1.lat, longitude: b1.lon } : null;
  }, [rw]);

  const beaconB2 = useMemo<LatLon | null>(() => {
    const arr = (rw as any)?.beacons as Array<{name:string; lat:number; lon:number}> | undefined;
    const b2 = arr?.find(b => (b.name || '').toUpperCase() === 'B2');
    return b2 ? { latitude: b2.lat, longitude: b2.lon } : null;
  }, [rw]);

  const activeThreshold = useMemo<LatLon | null>(() => {
    if (!rw) return null;
    return rw.active_end === 'B' ? B_runway : A_runway;
  }, [rw, A_runway, B_runway]);

// === AG: helper para avisar que salimos ===
const emitLeave = () => {
  try {
    const s = socketRef.current;
    if (s && (s as any).connected) {
      (s as any).emit('air-guardian/leave');
      console.log('👋 Enviado air-guardian/leave');
    }
  } catch (_) {}
};
// === AG: fin helper ===

const priorizarWarningManual = (warning: Warning) => {
  setPrioritizedWarning(warning);
  setSelectedWarning(warning);
};

// === RUNWAY UI EFÍMERA (labels + banners 6s) ===
const [runwayTapEnd, setRunwayTapEnd] = useState<'A'|'B'|null>(null);     // qué cabecera tocaste
const [runwayLabelUntil, setRunwayLabelUntil] = useState<number>(0);      // expira a los 6s
const [banner, setBanner] = useState<{ text: string; key?: string } | null>(null); // avisos 6s

// flags de flujo
const takeoffRequestedRef = useRef(false);
const landingRequestedRef = useRef(false);
const iAmOccupyingRef = useRef<null | 'landing' | 'takeoff'>(null); // sé si marqué occupy

// cooldown anti-spam para banners
const lastBannerAtRef = useRef<Record<string, number>>({});
const landClearShownRef = useRef(false);


// estimar velocidad de pérdida (km/h) por tipo
function estimateStallKmh(t: string|undefined) {
  const up = (t||'').toUpperCase();
  if (up.includes('GLIDER') || up.includes('PLANEADOR')) return 55;
  if (up.includes('JET') || up.includes('LINEA')) return 180;
  if (up.includes('TWIN') || up.includes('BIMOTOR')) return 110;
  return 80; // monomotor liviano
}

// radio de medio giro (m) por tipo
function halfTurnRadiusM(t: string|undefined) {
  const up = (t||'').toUpperCase();
  if (up.includes('GLIDER') || up.includes('PLANEADOR')) return 50;
  if (up.includes('TWIN') || up.includes('BIMOTOR')) return 100;
  if (up.includes('JET') || up.includes('LINEA')) return 500;
  return 50; // monomotor liviano
}

// promedio entre velocidad actual y pérdida -> m/s
function avgApproachSpeedMps(speedKmh: number, type?: string) {
  const stall = estimateStallKmh(type);
  const avgKmh = (Math.max(30, speedKmh) + stall) / 2;
  return (avgKmh * 1000) / 3600;
}

// distancia punto–segmento (m) para saber si estás sobre la pista (eje)
function distancePointToSegmentM(
  p:{lat:number;lon:number},
  a:{lat:number;lon:number},
  b:{lat:number;lon:number}
) {
  const ax=a.lat, ay=a.lon, bx=b.lat, by=b.lon, px=p.lat, py=p.lon;
  const abx=bx-ax, aby=by-ay;
  const apx=px-ax, apy=py-ay;
  const ab2 = abx*abx + aby*aby;
  const u = Math.max(0, Math.min(1, ab2 ? ((apx*abx + apy*aby)/ab2) : 0));
  const q = { lat: ax + u*abx, lon: ay + u*aby };
  return getDistance(px, py, q.lat, q.lon);
}

function isOnRunwayStrip(): boolean {
  if (!A_runway || !B_runway) return false;
  const d = distancePointToSegmentM(
    { lat: myPlane.lat, lon: myPlane.lon },
    { lat: A_runway.latitude, lon: A_runway.longitude },
    { lat: B_runway.latitude, lon: B_runway.longitude }
  );
  // ancho de pista + margen (aprox 40m)
  return d <= 40;
}

function isNearThreshold(end:'A'|'B', radiusM=60): boolean {
  const thr = end==='A' ? A_runway : B_runway;
  if (!thr) return false;
  return getDistance(myPlane.lat, myPlane.lon, thr.latitude, thr.longitude) <= radiusM;
}

// ETA a la cabecera activa (segundos), con penalidad por medio giro si venís por la opuesta
function etaToActiveThresholdSec(): number | null {
  if (!rw) return null;
  const end = rw.active_end === 'B' ? 'B' : 'A';
  const thr = end==='A' ? A_runway : B_runway;
  if (!thr) return null;
  const d = getDistance(myPlane.lat, myPlane.lon, thr.latitude, thr.longitude); // m
  const v = avgApproachSpeedMps(myPlane.speed, myPlane.type);
  if (!v) return null;

  // penalidad si estás más cerca del umbral opuesto
  const other = end==='A' ? B_runway : A_runway;
  let extra = 0;
  if (other) {
    const dOther = getDistance(myPlane.lat, myPlane.lon, other.latitude, other.longitude);
    if (dOther < d) {
      extra = Math.PI * halfTurnRadiusM(myPlane.type);
    }
  }
  return Math.round((d + extra) / v);
}

// banner 6s con anti-spam por key
function flashBanner(text: string, key?: string) {
  const now = Date.now();
  if (key) {
    const last = lastBannerAtRef.current[key] || 0;
    if (now - last < 2500) return; // no repetir en <2.5s
    lastBannerAtRef.current[key] = now;
  }
  setBanner({ text, key });
  setTimeout(() => setBanner(null), 6000);
}

// al tocar la pista/cabecera -> abrir label 6s y sugerir alineamiento si vienes por contraria
function showRunwayLabel(end:'A'|'B') {
  setRunwayTapEnd(end);
  setRunwayLabelUntil(Date.now() + 6000);
  socketRef.current?.emit('runway-get'); // refresco al abrir

  if (rw) {
    const active = rw.active_end === 'B' ? 'B' : 'A';
    const other = active==='A' ? 'B' : 'A';
    const nearOther = isNearThreshold(other as 'A'|'B', 500); // del lado opuesto
    if (nearOther) flashBanner('Por favor alinéese con la pista por la derecha', 'align-right');
  }
}

// --- PERMISO DE ATERRIZAJE SEGÚN DISTANCIA ---
type Cat = 'GLIDER_HELI' | 'PROP' | 'BIZJET' | 'AIRLINER';

function aircraftCategory(t?: string): Cat {
  const up = (t || '').toUpperCase();
  if (up.includes('GLIDER') || up.includes('PLANEADOR') || up.includes('HELI')) return 'GLIDER_HELI';
  // Airliners (heurística)
  if (
    up.includes('AIRBUS') || up.includes('BOEING') || up.includes('A3') || up.includes('B7') ||
    up.includes('E19') || up.includes('E17') || up.includes('E-JET') || up.includes('A32') || up.includes('A33')
  ) return 'AIRLINER';
  // Jets no comerciales (bizjets)
  if (up.includes('JET')) return 'BIZJET';
  // Turboprop y hélice
  if (up.includes('TURBOPROP') || up.includes('HELICES') || up.includes('HÉLICE') || up.includes('HÉLICE') || up.includes('PROP')) return 'PROP';
  return 'PROP';
}

// Distancias de permiso (en metros)
// (Si querés ajustar airliners, cambiá 8000 por el valor que prefieras)
const PERMIT_RADIUS_M: Record<Cat, number> = {
  GLIDER_HELI: 500,    // planeadores y helicópteros
  PROP:        2000,   // aviones a hélice
  BIZJET:      5000,   // jets no comerciales
  AIRLINER:    8000,   // línea (sugerencia)
};

function distToActiveThresholdM(): number | null {
  if (!rw) return null;
  const end = rw.active_end === 'B' ? 'B' : 'A';
  const thr = end === 'A' ? A_runway : B_runway;
  if (!thr) return null;
  return getDistance(myPlane.lat, myPlane.lon, thr.latitude, thr.longitude); // metros
}


// === RUNWAY: acción por defecto según altura relativa ===
const defaultActionForMe = () => {
  const planeAlt = (myPlane?.alt ?? 0);
  const fieldElev =
    (airfield as any)?.elevation ??
    (runwayState?.airfield?.elevation ?? 0); // si no hay, usamos 0
  const altRel = Math.max(0, planeAlt - fieldElev);
  return altRel > 10 ? 'land' : 'takeoff';
};

// === RUNWAY: pedidos al backend ===
const requestLanding = () => {
  const payload = {
    action: 'land',
    name: myPlane?.id || username,
    callsign: callsign || '',
    aircraft: aircraftModel || '',
    type: aircraftModel || '',
    emergency: !!(myPlane as any)?.emergency,
    altitude: myPlane?.alt ?? 0,
  };
  console.log('[RUNWAY] requestLanding →', payload);
  socketRef.current?.emit('runway-request', payload);
  socketRef.current?.emit('runway-get');
  setTimeout(() => socketRef.current?.emit('runway-get'), 300);
};

const requestTakeoff = (ready: boolean) => {
  const payload = {
    action: 'takeoff',
    name: myPlane?.id || username,
    callsign: callsign || '',
    aircraft: aircraftModel || '',
    type: aircraftModel || '',
    ready: !!ready,
  };
  console.log('[RUNWAY] requestTakeoff →', payload);
  socketRef.current?.emit('runway-request', payload);
  socketRef.current?.emit('runway-get');
  setTimeout(() => socketRef.current?.emit('runway-get'), 300);
};

const cancelMyRequest = () => {
  const payload = { name: myPlane?.id || username };
  console.log('[RUNWAY] cancel →', payload);
  socketRef.current?.emit('runway-cancel', payload);
  socketRef.current?.emit('runway-get');
};

const markRunwayOccupy = (action: 'landing' | 'takeoff' | any) => {
  socketRef.current?.emit('runway-occupy', {
    action,
    name: myPlane?.id || username,
    callsign: callsign || '',
  });
  socketRef.current?.emit('runway-get');
};

const markRunwayClear = () => {
  socketRef.current?.emit('runway-clear');
  socketRef.current?.emit('runway-get');
};


// === RUNWAY: wrappers para setear flags y banners ===
const requestLandingLabel = () => {
  requestLanding();
  landingRequestedRef.current = true;
};

const requestTakeoffLabel = () => {
  requestTakeoff(false);
  takeoffRequestedRef.current = true;
  flashBanner('Ir a cabecera de pista', 'go-threshold');
};

const cancelRunwayLabel = () => {
  cancelMyRequest();
  landingRequestedRef.current = false;
  takeoffRequestedRef.current = false;
};

// ---- Focus hook #1: registro de socket / tráfico al enfocar Radar
useFocusEffect(
  React.useCallback(() => {
    // al entrar a Radar
    isFocusedRef.current = true;

    // si ya tenemos socket y username, pedimos tráfico y nos registramos
    const s = socketRef.current;
    if (s) {
      if (!s.connected) s.connect(); // 🔌 asegurar conexión antes de emitir
      if (username) {
        s.emit('get-traffic');
        s.emit('airfield-get');// 👉 pedir pista actual al backend
        s.emit('runway-get'); // 👉 sincronizar estado de pista al conectar


        // envía un update inmediato con el nuevo id (username)
        s.emit('update', {
          name: username,
          latitude: myPlane.lat,
          longitude: myPlane.lon,
          alt: myPlane.alt,
          heading: myPlane.heading,
          type: aircraftModel,
          speed: myPlane.speed,
          callsign: callsign || '',
          aircraftIcon: aircraftIcon || '2.png',
        });
      }
    }

    // al salir de Radar
    return () => {
      isFocusedRef.current = false;
      // opcional: si querés “limpiar vista” solo localmente
      // setSelected(null); setConflict(null); setPrioritizedWarning(null);
      // (NO borres traffic/planes acá; eso ya lo maneja el backend con remove-user)
    };
  }, [
    username,
    myPlane.lat,
    myPlane.lon,
    myPlane.alt,
    myPlane.heading,
    myPlane.speed,
    aircraftModel,
    aircraftIcon,
    callsign,
  ])
);

// ---- Focus hook #2: leer airfieldActive (pista) al enfocar Radar
useFocusEffect(
  React.useCallback(() => {
    let cancelled = false;
    (async () => {
      try {
        const raw = await AsyncStorage.getItem('airfieldActive');
        if (!cancelled && raw) {
          const af: Airfield = JSON.parse(raw);
          setAirfield(af);
          // 👇 reenvía la pista activa al backend si hay socket conectado
          const s = socketRef.current;
          if (s && (s as any).connected) {
            s.emit('airfield-upsert', { airfield: af });
          }

        }
      } catch {}
    })();
    return () => { cancelled = true; };
  }, [])
);

//   useEffect(() => {
//     if (
//       prioritizedWarning &&
//       socketRef.current &&
//       ['TA', 'RA_LOW', 'RA_HIGH'].includes(prioritizedWarning.alertLevel)
//     ) {
//       socketRef.current.emit('warning', prioritizedWarning);
//       console.log('📡 Warning enviado al backend:', prioritizedWarning);
//     }
//   }, [prioritizedWarning]);

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

const blockUpdateUntil = useRef<number>(0);

useEffect(() => {
  const trafficWithoutMe = planes.filter(p => p.id !== myPlane?.id);
  if (!myPlane || trafficWithoutMe.length === 0) return;

  const timeSteps = Array.from({ length: 36 }, (_, i) => (i + 1) * 5);
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
    return (toDeg(Math.atan2(y, x)) + 360) % 360;
  };
  const angleDiff = (a: number, b: number) => {
    const d = Math.abs(a - b) % 360;
    return d > 180 ? 360 - d : d;
  };

  for (const plane of trafficWithoutMe) {
    const distanceNow = getDistance(myPlane.lat, myPlane.lon, plane.lat, plane.lon);

    // TA: tráfico cercano
    if (distanceNow < 3000 && plane.speed > 30) {
      if (distanceNow < minProxDist) {
        selectedNearby = plane;
        minProxDist = distanceNow;
      }
    }

    // RA: trayectorias convergentes
    // === RA: trayectorias convergentes (más sensible y robusto) ===

    // 1) Distancia futura en 5..180 s
    const futureDistances: number[] = [];
    for (const t of timeSteps) {
      const myF = getFuturePosition(myPlane.lat, myPlane.lon, myPlane.heading, myPlane.speed, t);
      const thF = getFuturePosition(plane.lat, plane.lon, plane.heading || 0, plane.speed || 0, t);
      futureDistances.push(getDistance(myF.latitude, myF.longitude, thF.latitude, thF.longitude));
    }
    const minDistance = Math.min(...futureDistances);
    const idxMin      = futureDistances.indexOf(minDistance);
    const timeOfMin   = timeSteps[idxMin];

    const futureAltDelta = Math.abs(myPlane.alt - plane.alt);

    // 2) “Acercamiento” simple: distancia a 5s menor que ahora
    const currentDistance = getDistance(myPlane.lat, myPlane.lon, plane.lat, plane.lon);
    const distance5s  = futureDistances[0] ?? distanceNow;
    const closingSoon = distance5s < (distanceNow - 15); // margen 15 m

    // 3) Cono de RA: bearing ahora y en el punto de mínimo
    const bearingDeg = (lat1:number, lon1:number, lat2:number, lon2:number) => {
      const dLon = toRad(lon2 - lon1);
      const y = Math.sin(dLon) * Math.cos(toRad(lat2));
      const x = Math.cos(toRad(lat1)) * Math.sin(toRad(lat2)) -
                Math.sin(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.cos(dLon);
      const b = (Math.atan2(y, x) * 180) / Math.PI;
      return (b + 360) % 360;
    };
    const myAtMin    = getFuturePosition(myPlane.lat, myPlane.lon, myPlane.heading, myPlane.speed, timeOfMin);
    const theirAtMin = getFuturePosition(plane.lat, plane.lon, plane.heading || 0, plane.speed || 0, timeOfMin);

    const diffNow = (() => {
      const bNow = bearingDeg(myPlane.lat, myPlane.lon, plane.lat, plane.lon);
      const d = Math.abs(((myPlane.heading - bNow + 540) % 360) - 180);
      return d;
    })();
    const diffAtMin = (() => {
      const bMin = bearingDeg(myAtMin.latitude, myAtMin.longitude, theirAtMin.latitude, theirAtMin.longitude);
      const d = Math.abs(((myPlane.heading - bMin + 540) % 360) - 180);
      return d;
    })();
    const withinCone = (diffNow <= RA_CONE_DEG) || (diffAtMin <= RA_CONE_DEG);

    // 4) Criterio RA final
    if (
      minDistance < RA_MIN_DIST_M &&
      futureAltDelta <= RA_VSEP_MAX_M &&
      closingSoon &&
      withinCone
    ) {
      if (timeOfMin < RA_HIGH_TTI_S && timeOfMin < minTimeToImpact) {
        selectedConflict = plane;
        selectedConflictLevel = 'RA_HIGH';
        minTimeToImpact = timeOfMin;
      } else if (timeOfMin < RA_LOW_TTI_S && selectedConflictLevel !== 'RA_HIGH') {
        selectedConflict = plane;
        selectedConflictLevel = 'RA_LOW';
        minTimeToImpact = timeOfMin;
      }
    }


      lastDistanceRef.current[plane.id] = currentDistance;
    }

    let nuevoWarningLocal: Warning | null = null;

    if (selectedConflict && selectedConflictLevel) {
      setConflict({
        ...selectedConflict,
        alertLevel: selectedConflictLevel,
        timeToImpact: minTimeToImpact,
      });
      setSelected({
        ...selectedConflict,
        alertLevel: selectedConflictLevel,
        timeToImpact: minTimeToImpact,
      });

      const distSel = getDistance(myPlane.lat, myPlane.lon, selectedConflict.lat, selectedConflict.lon);


      nuevoWarningLocal = {
        id: selectedConflict.id,
        name: selectedConflict.name,
        lat: selectedConflict.lat,
        lon: selectedConflict.lon,
        alt: selectedConflict.alt,
        heading: selectedConflict.heading,
        speed: selectedConflict.speed,
        alertLevel: selectedConflictLevel,
        timeToImpact: minTimeToImpact,
        distanceMeters: distSel,   // ✅ agregado
        type: selectedConflict.type,            // 👈 AÑADIR
        aircraftIcon: selectedConflict.aircraftIcon || '2.png',
        callsign: selectedConflict.callsign || '',
      };
    } else if (selectedNearby) {
      setSelected({ ...selectedNearby, alertLevel: 'TA' as 'TA' });
      setConflict(null);
      const distTa = getDistance(myPlane.lat, myPlane.lon, selectedNearby.lat, selectedNearby.lon);

      nuevoWarningLocal = {
        id: selectedNearby.id,
        name: selectedNearby.name,
        lat: selectedNearby.lat,
        lon: selectedNearby.lon,
        alt: selectedNearby.alt,
        heading: selectedNearby.heading,
        speed: selectedNearby.speed,
        alertLevel: 'TA',
        timeToImpact: undefined,
        distanceMeters: distTa,
        type: selectedNearby.type,  
        aircraftIcon: selectedNearby.aircraftIcon || '2.png',
        callsign: selectedNearby.callsign || '',
      };
    } else {
      setConflict(null);
       setSelected(prev =>
      Date.now() < selectedHoldUntilRef.current ? prev : null
      );
    }
    setLocalWarning(nuevoWarningLocal);

    // ⬇️ recordar el último RA local
    if (
      nuevoWarningLocal &&
      (nuevoWarningLocal.alertLevel === 'RA_LOW' || nuevoWarningLocal.alertLevel === 'RA_HIGH')
    ) {
      lastRAIdRef.current = nuevoWarningLocal.id;
    }

    // ⬇️ salir si está corriendo el hold de RA o el bloqueador temporal
    if (holdTimerRef.current || Date.now() < blockUpdateUntil.current) return;

    // ⬇️ evita re-mostrar el mismo avión mientras dura el snooze
    const candId = (nuevoWarningLocal?.id) || (backendWarning?.id);
    if (snoozeIdRef.current && Date.now() < snoozeUntilRef.current && candId === snoozeIdRef.current) {
      return;
    }




    const prioridades = { RA_HIGH: 3, RA_LOW: 2, TA: 1 };

    // Si no hay warnings, limpiamos
    if (!nuevoWarningLocal && !backendWarning) {
      setPrioritizedWarning(null);
      return;
    }

    // Si solo hay local
    if (nuevoWarningLocal && !backendWarning) {
      if (nuevoWarningLocal.alertLevel === 'TA') {
        setPrioritizedWarning(nuevoWarningLocal);
        maybeEmitWarning(nuevoWarningLocal);
        return;
      }
      if (holdTimerRef.current && nuevoWarningLocal.alertLevel.startsWith('RA')) return;
      setPrioritizedWarning(nuevoWarningLocal);
      maybeEmitWarning(nuevoWarningLocal);
      return;
    }

    // Si solo hay backend
    if (!nuevoWarningLocal && backendWarning) {
      if (backendWarning.alertLevel === 'TA') {
        setPrioritizedWarning(backendWarning);
        maybeEmitWarning(backendWarning);
        return;
      }
      if (holdTimerRef.current && backendWarning.alertLevel.startsWith('RA')) return;
      setPrioritizedWarning(backendWarning);
      maybeEmitWarning(backendWarning);
      return;
    }

    // Si llegamos aquí, ambos existen
    const localPriority = prioridades[nuevoWarningLocal!.alertLevel];
    const backendPriority = prioridades[backendWarning!.alertLevel];

    if (localPriority > backendPriority) {
      // Gana el LOCAL → sí emitimos (respetando hold/TA)
      if (nuevoWarningLocal!.alertLevel === 'TA' || !holdTimerRef.current) {
        setPrioritizedWarning(nuevoWarningLocal!);
        maybeEmitWarning(nuevoWarningLocal!);
      }
    } else if (backendPriority > localPriority) {
      // Gana el BACKEND → NO re-emitir
      if (backendWarning!.alertLevel === 'TA' || !holdTimerRef.current) {
        setPrioritizedWarning(backendWarning!);
        // (no maybeEmitWarning aquí)
      }
    } else {
      // Empate: decidir por menor TTI y solo emitir si el ganador es local
      const localTime   = nuevoWarningLocal!.timeToImpact || Infinity;
      const backendTime = backendWarning!.timeToImpact || Infinity;
      const ganador = localTime < backendTime ? nuevoWarningLocal! : backendWarning!;

      if (ganador.alertLevel === 'TA' || !holdTimerRef.current) {
        if (ganador === backendWarning) {
          setPrioritizedWarning(ganador);           // NO re-emitir
        } else {
          setPrioritizedWarning(ganador);           // Sí emitir si ganó el local
          maybeEmitWarning(ganador);
        }
      }
    }




    // Visual update
    const updatedTraffic = trafficWithoutMe.map((plane) => {
      if (selectedConflict && plane.id === selectedConflict.id) {
        return { ...plane, alertLevel: selectedConflictLevel as 'RA_LOW' | 'RA_HIGH' };
      } else if (selectedNearby && plane.id === selectedNearby.id) {
        return { ...plane, alertLevel: 'TA' as 'TA'};
      } else {
        return { ...plane, alertLevel: 'none' as 'none' };
      }
    });

    const isEqual = JSON.stringify(updatedTraffic) === JSON.stringify(trafficWithoutMe);
    if (!isEqual) {
      setPlanes([...updatedTraffic]);
    }
  }, [planes, myPlane, backendWarning]);

  useEffect(() => {
    if (!username) return;

    socketRef.current = socket;
    const s = socketRef.current;
    // Si el socket está desconectado (porque saliste de Radar antes), reconectalo
    if (s && !s.connected) {
      s.connect();
    }


    s.on('connect', async () => {
      console.log('🔌 Conectado al servidor WebSocket');
      s.emit('get-traffic');
      s.emit('airfield-get');
      s.emit('runway-get');

      // === NUEVO: secuencia y beacons desde el backend
      s.on('sequence-update', (msg: any) => {
        try {
          if (Array.isArray(msg?.slots)) setSlots(msg.slots);
          // Si el backend manda beacons, podés pintarlos aquí también:
          // const b1 = msg?.beacons?.B1; const b2 = msg?.beacons?.B2;
          // (si querés mostrarlos, convertí a {latitude,longitude} y dibujalos)
        } catch {}
      });

      // === NUEVO: instrucciones dirigidas (ATC) ===
      s.on('atc-instruction', (instr: any) => {
        if (!instr?.type) return;

        if (instr.type === 'goto-beacon' && typeof instr.lat === 'number' && typeof instr.lon === 'number') {
          setNavTarget({ latitude: instr.lat, longitude: instr.lon });
          flashBanner(instr.text || 'Proceda al beacon', 'atc-goto');
          try { Speech.stop(); Speech.speak('Proceda al beacon', { language: 'es-ES' }); } catch {}
        }

        if (instr.type === 'turn-to-B1') {
          // Si ya tenés beacon B1 local derivado del airfield, podés usarlo
          // setNavTarget(beaconB1); // si tenés beaconB1 calculado
          flashBanner(instr.text || 'Vire hacia B1', 'atc-b1');
          try { Speech.stop(); Speech.speak('Vire hacia be uno', { language: 'es-ES' }); } catch {}
        }

        if (instr.type === 'cleared-to-land') {
          // Mantener navTarget al umbral si querés (si ya lo seteás en otro lado, podés no tocarlo)
          flashBanner((instr.text || 'Autorizado a aterrizar') + (instr.rwy ? ` pista ${instr.rwy}` : ''), 'atc-clr');
          try { Speech.stop(); Speech.speak((instr.text || 'Autorizado a aterrizar') + (instr.rwy ? ` pista ${instr.rwy}` : ''), { language: 'es-ES' }); } catch {}
        }
      });


      // 👇 si el server no tiene pista cargada, reinyectala desde AsyncStorage
      try {
        const raw = await AsyncStorage.getItem('airfieldActive');
        if (raw) {
          const af = JSON.parse(raw);
          s.emit('airfield-upsert', { airfield: af });
        }
      } catch {}
    });


s.on('conflicto', (data: any) => {
  console.log('⚠️ Conflicto recibido vía WebSocket:', data);

  const match =
    planes.find(p => p.id === data.id || p.id === data.name || p.name === data.name) || null;

  const distNow =
    typeof data.distanceMeters === 'number' ? data.distanceMeters :
    typeof data.distance === 'number'       ? data.distance :
    (match && myPlane
      ? getDistance(myPlane.lat, myPlane.lon, match.lat, match.lon)
      : NaN);

  if (match) {
    backendDistanceRef.current[match.id] = distNow;
  }

  // Si la tarjeta pinneada es este mismo avión, refrescá la distancia al toque
  setPrioritizedWarning(prev =>
    prev && (prev.id === (match?.id ?? data.id ?? data.name))
      ? { ...prev, distanceMeters: distNow }
      : prev
  );

  const level = (data.alertLevel === 'RA_HIGH' || data.alertLevel === 'RA_LOW' || data.alertLevel === 'TA')
    ? data.alertLevel
    : (data.type === 'RA' ? 'RA_LOW' : 'TA');

    // ID unificado del “otro” avión y hold por RA (6s)
    const id = String(match?.id ?? data.id ?? data.name);
    if (level === 'RA_LOW' || level === 'RA_HIGH') {
      raHoldUntilRef.current[id] = Date.now() + 6000;
    }


  const enrichedWarning: Warning = {
    id: match?.id ?? data.id ?? data.name,
    name: match?.name ?? data.name,
    lat: match?.lat ?? data.lat,
    lon: match?.lon ?? data.lon,
    alt: match?.alt ?? data.alt,
    heading: match?.heading ?? data.heading,
    speed: match?.speed ?? data.speed,
    alertLevel: data.alertLevel
    ?? (data.type === 'RA' ? 'RA_LOW' : 'TA'),
    timeToImpact: typeof data.timeToImpact === 'number' ? data.timeToImpact : 999,
    distanceMeters: distNow,
    aircraftIcon: match?.aircraftIcon ?? data.aircraftIcon ?? '2.png',
    callsign: match?.callsign ?? data.callsign ?? '',
    type: match?.type ?? data.type,
  };

    setWarnings(prev => ({ ...prev, [enrichedWarning.id]: enrichedWarning }));
    setBackendWarning(enrichedWarning);
      // ⏳ TTL: si no se renueva el 'conflicto' en 4s, se limpia
  const BW_TTL_MS = 4000;
  if ((s as any).__bwTtlTimer) clearTimeout((s as any).__bwTtlTimer);
  (s as any).__bwTtlTimer = setTimeout(() => {
    // ⚠️ si todavía hay hold activo para este id, no limpies
    const holdUntil = raHoldUntilRef.current[id] ?? 0;
    if (Date.now() < holdUntil) return;

    setBackendWarning(prev => (prev && prev.id === id) ? null : prev);
    setPrioritizedWarning(prev => (prev && prev.id === id) ? null : prev);
  }, BW_TTL_MS);

  });

  // ⬇️ PEGAR ESTO JUSTO AQUÍ
  s.on('conflicto-clear', (msg: any) => {
    const id = String(msg?.id || '');
    if (!id) return;
    clearWarningFor(id);
    setBackendWarning(prev => (prev && prev.id === id) ? null : prev);
    setPrioritizedWarning(prev => (prev && prev.id === id) ? null : prev);
  });

  // (sigue el resto)
  s.on('traffic-update', (data: any) => {
    // ...
  });


    s.on('traffic-update', (data: any) => {
      if (Array.isArray(data)) {
        console.log('✈️ Tráfico recibido:', data);

        setTraffic(() => {
          // ids presentes en este batch
          const ids = new Set<string>(data.map((t: any) => String(t.name)));

          // 1) si el priorizado ya no está, limpiar tarjeta
          setPrioritizedWarning(prev => {
            if (prev && !ids.has(prev.id)) {
              // si el avión que estaba priorizado ya no está, limpiamos el bloqueo de envío
              if (lastWarningTimeRef.current[prev.id]) {
                delete lastWarningTimeRef.current[prev.id];
              }
              return null;
            }
            return prev;
          });


          // 2) podar selected/conflict si desaparecieron
          setSelected(prev => (prev && !ids.has(prev.id) ? null : prev));
          setConflict(prev => (prev && !ids.has(prev.id) ? null : prev));

          // 3) podar warnings que ya no correspondan a ningún id presente
          setWarnings(prev => {
            const next: { [k: string]: Warning } = {};
            for (const [id, w] of Object.entries(prev)) {
              if (ids.has(id)) next[id] = w;
            }
            return next;
          });

          // 4) devolver el nuevo tráfico normalizado
          return data.map((info: any) => ({
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
          }));
        });
      }
    });




    // ✅ NUEVO: tráfico inicial al entrar (mapea latitude/longitude)
    s.on('initial-traffic', (data: any) => {
      if (Array.isArray(data)) {
        console.log('📦 initial-traffic:', data);
        setTraffic(data.map((info: any) => ({
          id: info.name,
          name: info.name,
          // initial-traffic viene con latitude/longitude (del backend)
          lat: typeof info.lat === 'number' ? info.lat : info.latitude,
          lon: typeof info.lon === 'number' ? info.lon : info.longitude,
          alt: info.alt,
          heading: info.heading,
          speed: info.speed,
          type: info.type,
          callsign: info.callsign,
          aircraftIcon: info.aircraftIcon || info.icon || '2.png',
        })));
      }
    });

    // 👉 actualizar airfield en tiempo real
    s.on('airfield-update', async ({ airfield: af }: { airfield: Airfield }) => {
      try {
        setAirfield(af);
        await AsyncStorage.setItem('airfieldActive', JSON.stringify(af));
      } catch {}
    });

    // --- RUNWAY: estado de pista en tiempo real ---
    s.on('runway-state', (payload: any) => {
      try { console.log('[RUNWAY] state ←', JSON.stringify(payload)); } catch {}
      setRunwayState(payload);
    });


    // Banner de turno + VOZ (6 s con anti-spam)
    s.on('runway-msg', (m: any) => {
      if (!m?.text) return;

      // 1) Banner en UI
      flashBanner(m.text, `srv:${m.key || m.text}`);

      // 2) Texto a voz (castellano). Ej: “#3” -> “número 3”
      try {
        const spoken = String(m.text)
          .replace(/#\s*(\d+)/g, 'número $1')
          .replace(/^Tu /i, 'Su ');
        Speech.stop();
        Speech.speak(spoken, { language: 'es-ES', rate: 1.0, pitch: 1.0 });
      } catch {}
    });




    // 👇 NUEVO: si otro usuario se desconecta, eliminamos su avión
    s.on('user-removed', (name: string) => {
      console.log('🗑️ user-removed:', name);
      setTraffic(prev => prev.filter(p => p.id !== name));
      setPlanes(prev => prev.filter(p => p.id !== name));

      // 💥 limpiar warnings/selecciones si apuntaban al eliminado
      setWarnings(prev => {
        const copy = { ...prev };
        delete copy[name];
        return copy;
      });
      setPrioritizedWarning(prev => (prev?.id === name ? null : prev));
      setSelected(prev => (prev?.id === name ? null : prev));
      setConflict(prev => (prev?.id === name ? null : prev));

      // (opcional) limpiar distancia cacheada
      // ⬇️ ver 2.b para poder usar lastDistanceRef acá
      try { delete lastDistanceRef.current[name]; } catch (_) {}
    });



    s.on('disconnect', () => {
      console.log('🔌 Desconectado del WebSocket');
    });

    let intervalId: NodeJS.Timeout;

    intervalId = setInterval(async () => {
      let data;

    if (simMode) {
      setMyPlane(prev => {
        // prev.speed está en km/h -> convertir a m/s para 1 segundo de paso
        const v_ms = (prev.speed * 1000) / 3600;
        const distanceMeters = v_ms * 1; // 1s por tick

        const deltaLat =
          (distanceMeters / 111320) * Math.cos((prev.heading * Math.PI) / 180);

        const metersPerDegLon =
          40075000 * Math.cos((prev.lat * Math.PI) / 180) / 360;

        const deltaLon =
          (distanceMeters / metersPerDegLon) *
          Math.sin((prev.heading * Math.PI) / 180);

        const newLat = prev.lat + deltaLat;
        const newLon = prev.lon + deltaLon;

        const data = {
          name: username,
          latitude: newLat,
          longitude: newLon,
          alt: prev.alt,
          heading: prev.heading,
          type: aircraftModel,
          // 👇 mantenemos km/h al enviar (consistente con el resto del sistema)
          speed: prev.speed,
          callsign: callsign || '',
          aircraftIcon: aircraftIcon || '2.png',
        };

        s.emit('update', data);

        return { ...prev, lat: newLat, lon: newLon };
      });
    } else {
      (async () => {
        try {
          const { coords } = await Location.getCurrentPositionAsync({});
          const speedKmh = coords.speed ? coords.speed * 3.6 : 0;

          const data = {
            name: username,
            latitude: coords.latitude,
            longitude: coords.longitude,
            alt: coords.altitude || 0,
            heading: coords.heading || 0,
            type: aircraftModel,
            // 👇 enviamos en km/h para ser consistentes
            speed: speedKmh,
            callsign,
            aircraftIcon: aircraftIcon || '2.png',
          };

          s.emit('update', data);

          setMyPlane(prev => ({
            ...prev,
            lat: coords.latitude,
            lon: coords.longitude,
            alt: coords.altitude || 0,
            heading: coords.heading || 0,
            speed: speedKmh, // km/h en estado
          }));
        } catch (err) {
          console.warn('📍 Error obteniendo ubicación:', err);
        }
      })();
    }

    // 🔹 refrescar la distancia en vivo del warning “pinneado”
    refreshPinnedDistance();

    // 👇👇 FALTABA cerrar el setInterval
    }, 1000);

    // 👇👇 Y el cleanup + cierre del useEffect
    return () => {
      try {
        if (s && myPlane?.id) {
          s.emit('remove-user', myPlane.id);
        }
      } catch (_) {}

      clearInterval(intervalId);
      s.off('connect');
      s.off('conflicto');
      s.off('traffic-update');
      s.off('initial-traffic');
      s.off('user-removed');
      s.off('disconnect');
      s.off('airfield-update');
      s.off('runway-state');
      s.off('runway-msg');
      s.off('sequence-update');
      s.off('atc-instruction');
      s.off('conflicto-clear');




      // si compartís un socket global, NO lo desconectes aquí
      // s.disconnect(); // <- dejalo comentado
      socketRef.current = null;
    };
}, [username, simMode, aircraftModel, aircraftIcon, callsign, myPlane?.id]);

  // === AG: NUEVO — avisar si la app va a background ===
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
    if (state === 'background' || state === 'inactive') {
      if (socketRef.current && myPlane?.id) {
        socketRef.current.emit('remove-user', myPlane.id); // 👈 NUEVO
      }
      //emitLeave(); // lo que ya tenías
    }

    });
    return () => sub.remove();
  }, []);
  // === AG: fin background ===


  useEffect(() => {
    if (!myPlane || traffic.length === 0) return;

    const trafficWithoutMe = traffic.filter(p => p.id !== myPlane.id);

    const timeSteps = Array.from({ length: 36 }, (_, i) => (i + 1) * 5);
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
      return (toDeg(Math.atan2(y, x)) + 360) % 360;
    };
    const angleDiff = (a: number, b: number) => {
      const d = Math.abs(a - b) % 360;
      return d > 180 ? 360 - d : d;
    };

    for (const plane of trafficWithoutMe) {
      const distanceNow = getDistance(myPlane.lat, myPlane.lon, plane.lat, plane.lon);

      // TA: tráfico cercano
      if (distanceNow < 3000 && plane.speed > 30) {
        if (distanceNow < minProxDist) {
          selectedNearby = plane;
          minProxDist = distanceNow;
        }
      }

      // RA: trayectorias convergentes
// === RA: trayectorias convergentes (más sensible y robusto) ===

// 1) Distancia futura en 5..180 s
const futureDistances: number[] = [];
for (const t of timeSteps) {
  const myF = getFuturePosition(myPlane.lat, myPlane.lon, myPlane.heading, myPlane.speed, t);
  const thF = getFuturePosition(plane.lat, plane.lon, plane.heading || 0, plane.speed || 0, t);
  futureDistances.push(getDistance(myF.latitude, myF.longitude, thF.latitude, thF.longitude));
}
const minDistance = Math.min(...futureDistances);
const idxMin      = futureDistances.indexOf(minDistance);
const timeOfMin   = timeSteps[idxMin];

const futureAltDelta = Math.abs(myPlane.alt - plane.alt);

// 2) “Acercamiento” simple: distancia a 5s menor que ahora
const currentDistance = getDistance(myPlane.lat, myPlane.lon, plane.lat, plane.lon);
const distance5s  = futureDistances[0] ?? distanceNow;
const closingSoon = distance5s < (distanceNow - 15); // margen 15 m

// 3) Cono de RA: bearing ahora y en el punto de mínimo
const bearingDeg = (lat1:number, lon1:number, lat2:number, lon2:number) => {
  const dLon = toRad(lon2 - lon1);
  const y = Math.sin(dLon) * Math.cos(toRad(lat2));
  const x = Math.cos(toRad(lat1)) * Math.sin(toRad(lat2)) -
            Math.sin(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.cos(dLon);
  const b = (Math.atan2(y, x) * 180) / Math.PI;
  return (b + 360) % 360;
};
const myAtMin    = getFuturePosition(myPlane.lat, myPlane.lon, myPlane.heading, myPlane.speed, timeOfMin);
const theirAtMin = getFuturePosition(plane.lat, plane.lon, plane.heading || 0, plane.speed || 0, timeOfMin);

const diffNow = (() => {
  const bNow = bearingDeg(myPlane.lat, myPlane.lon, plane.lat, plane.lon);
  const d = Math.abs(((myPlane.heading - bNow + 540) % 360) - 180);
  return d;
})();
const diffAtMin = (() => {
  const bMin = bearingDeg(myAtMin.latitude, myAtMin.longitude, theirAtMin.latitude, theirAtMin.longitude);
  const d = Math.abs(((myPlane.heading - bMin + 540) % 360) - 180);
  return d;
})();
const withinCone = (diffNow <= RA_CONE_DEG) || (diffAtMin <= RA_CONE_DEG);

// 4) Criterio RA final
if (
  minDistance < RA_MIN_DIST_M &&
  futureAltDelta <= RA_VSEP_MAX_M &&
  closingSoon &&
  withinCone
) {
  if (timeOfMin < RA_HIGH_TTI_S && timeOfMin < minTimeToImpact) {
    selectedConflict = plane;
    selectedConflictLevel = 'RA_HIGH';
    minTimeToImpact = timeOfMin;
  } else if (timeOfMin < RA_LOW_TTI_S && selectedConflictLevel !== 'RA_HIGH') {
    selectedConflict = plane;
    selectedConflictLevel = 'RA_LOW';
    minTimeToImpact = timeOfMin;
  }
}


      // 🟢 Guardar distancia actual para la próxima iteración
      lastDistanceRef.current[plane.id] = currentDistance;
    }

    // Limpiar conflictos si no hay ninguno nuevo
    if (!selectedConflict && !selectedNearby) {
      if (conflict !== null) setConflict(null);
        setSelected(prev =>
         Date.now() < selectedHoldUntilRef.current ? prev : null
      );
    } else if (selectedConflict && selectedConflictLevel) {
      setConflict({
        ...selectedConflict,
        alertLevel: selectedConflictLevel,
        timeToImpact: minTimeToImpact,
      });
      setSelected({
        ...selectedConflict,
        alertLevel: selectedConflictLevel,
        timeToImpact: minTimeToImpact,
      });
    } else if (selectedNearby) {
      setSelected({ ...selectedNearby, alertLevel: 'TA' });
        setSelected(prev =>
      Date.now() < selectedHoldUntilRef.current ? prev : null
      );
    }

    // Estado visual (marcar los íconos)
    const updatedTraffic = trafficWithoutMe.map((plane) => {
      if (selectedConflict && plane.id === selectedConflict.id) {
        return { ...plane, alertLevel: selectedConflictLevel as 'RA_LOW' | 'RA_HIGH' };
      } else if (selectedNearby && plane.id === selectedNearby.id) {
        return { ...plane, alertLevel: 'TA' as 'TA' };
      } else {
        return { ...plane, alertLevel: 'none' as 'none' };
      }
    });

    const isEqual = JSON.stringify(updatedTraffic) === JSON.stringify(trafficWithoutMe);
    if (!isEqual) {
      setPlanes([...updatedTraffic]);
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

  // Mantener cualquier prioritizedWarning durante 6s y bloquear recálculos
  useEffect(() => {
    if (!prioritizedWarning) return;

  // Solo RA tiene hold de 6s
  if (prioritizedWarning.alertLevel === 'RA_LOW' || prioritizedWarning.alertLevel === 'RA_HIGH') {
    if (holdTimerRef.current) clearTimeout(holdTimerRef.current);
    blockUpdateUntil.current = Date.now() + 6000;

    const pwId = prioritizedWarning.id; // capturo el id mostrado

    holdTimerRef.current = setTimeout(() => {
      setSelectedWarning(null);
      setPrioritizedWarning(null);

      // ⬇️ además oculto conflict/selected si son el mismo avión
      setConflict(prev => (prev && prev.id === pwId ? null : prev));
      setSelected(prev => (prev && prev.id === pwId ? null : prev));

      // ⬇️ snooze 3s para no re-mostrar inmediatamente al siguiente tick
      snoozeIdRef.current = pwId;
      snoozeUntilRef.current = Date.now() + 3000;

      // reset internos
      holdTimerRef.current = null;
      lastSentWarningRef.current = null;

      // 🔕 avisar al resto que este RA terminó
      try {
        const id = lastRAIdRef.current || pwId; // usa el que tengas más confiable
        lastRAIdRef.current = null;
        if (id) socketRef.current?.emit('warning-clear', { id });
      } catch {}
    }, 6000);


  }
  // TA no setea hold (puede ser preempted por RA)
  }, [prioritizedWarning?.id, prioritizedWarning?.alertLevel]);


  // === RUNWAY: Automatismos de avisos y ocupación/liberación ===
useEffect(() => {
  if (!rw) return;

  // 1) "Liberar pista" si estoy sobre la pista (sin botón)
  if (isOnRunwayStrip()) {
    flashBanner('¡Liberar pista!', 'free-runway');
    // si estoy aterrizando y aún no marqué occupy, marcar
    if (landingRequestedRef.current && iAmOccupyingRef.current !== 'landing' && defaultActionForMe()==='land') {
      markRunwayOccupy('landing');
      iAmOccupyingRef.current = 'landing';
    }
  } else {
    // si yo ocupaba, y ya salí de la pista -> clear
    if (iAmOccupyingRef.current) {
      markRunwayClear();
      iAmOccupyingRef.current = null;
    }
  }

  // 2) Permisos según turno y huecos
  const me = myPlane?.id || username;
  const st = runwayState?.state;
  if (!st) return;

// permiso de aterrizar: sólo si soy #1, pista libre y estoy dentro del radio según tipo
const firstLanding = (st.landings || [])[0];
if (firstLanding?.name === me && !st.inUse && defaultActionForMe() === 'land') {
  const distM = distToActiveThresholdM();
  const cat = aircraftCategory(aircraftModel || (myPlane as any)?.type);
  const radius = PERMIT_RADIUS_M[cat];

  if (typeof distM === 'number') {
    if (distM <= radius) {
      if (!landClearShownRef.current) {
        flashBanner('Tiene permiso para aterrizar', 'clr-land');
        landClearShownRef.current = true; // mostrar una vez por “aproximación”
      }
    } else {
      // si te volviste a alejar, reseteamos para poder volver a mostrar al reingresar
      landClearShownRef.current = false;
    }
  }
} else {
  // si dejaste de ser #1 o la pista se ocupó, resetea
  landClearShownRef.current = false;
}


  // solicitud despegue: guiar a cabecera, ocupar, y despegar
  if (takeoffRequestedRef.current && defaultActionForMe()==='takeoff') {
    const activeEnd = rw.active_end==='B'?'B':'A';
    const nearThr = isNearThreshold(activeEnd, 80);
    const nextLanding = (st.timeline||[]).find((x:any)=>x.action==='landing' && new Date(x.at).getTime() > Date.now());
    const gapMin = nextLanding ? Math.round((new Date(nextLanding.at).getTime()-Date.now())/60000) : 999;

    if (nearThr) {
      const meTk = (st.takeoffs||[]).find((t:any)=>t.name===me);
      const waited = meTk?.waitedMin ?? 0;
      const can = (!st.inUse && (gapMin >= 5 || waited >= 15));
      if (can && iAmOccupyingRef.current !== 'takeoff') {
        flashBanner('Ocupe cabecera de pista', 'lineup');
        // cuando te vemos entrar a pista cerca de cabecera -> occupy + "puede despegar"
        if (isOnRunwayStrip()) {
          markRunwayOccupy('takeoff');
          iAmOccupyingRef.current = 'takeoff';
          flashBanner('Puede despegar', 'cleared-tko');
        }
      }
    }
  }

  // 3) Separación <5 min entre dos aterrizajes => al segundo: giro 360 por derecha
  const myETA = etaToActiveThresholdSec();
  if (landingRequestedRef.current && typeof myETA === 'number') {
    const others = (st.landings||[]).filter((l:any)=>l.name!==me && typeof l.etaSec==='number');
    const lead = others.sort((a:any,b:any)=>a.etaSec-b.etaSec)[0];
    if (lead && (myETA - lead.etaSec) < 5*60) {
      flashBanner('Haga un giro de 360° por derecha en espera', 'orbit-right');
    }
  }
}, [myPlane.lat, myPlane.lon, myPlane.alt, myPlane.speed, runwayState, rw]);

  // === NAV: guía simple con B2 → B1 → Umbral, según turno en cola (con voz) ===
  useEffect(() => {
    if (!rw || !beaconB1 || !beaconB2) { setNavTarget(null); return; }
    // Sólo guiamos si pediste aterrizaje y estás “volando”
    if (!landingRequestedRef.current || defaultActionForMe() !== 'land') {
      setNavTarget(null);
      return;
    }

    const me = myPlane?.id || username;
    const landings = runwayState?.state?.landings || [];
    const idx = landings.findIndex((x:any) => x?.name === me);

    if (idx === -1) { setNavTarget(null); return; }

    // Si NO soy #1 → me mando a B2
    if (idx > 0) {
      if (!navTarget || navTarget.latitude !== beaconB2.latitude || navTarget.longitude !== beaconB2.longitude) {
        setNavTarget(beaconB2);
        flashBanner('Proceda a B2', 'goto-b2');
        try { Speech.stop(); Speech.speak('Proceda a be dos', { language: 'es-ES', rate: 1.0, pitch: 1.0 }); } catch {}
      }
      return;
    }

    // Soy #1 → voy a B1; si estoy muy cerca de B1, apunto al umbral activo
    const dToB1 = getDistance(myPlane.lat, myPlane.lon, beaconB1.latitude, beaconB1.longitude);
    if (dToB1 > 800) {
      if (!navTarget || navTarget.latitude !== beaconB1.latitude || navTarget.longitude !== beaconB1.longitude) {
        setNavTarget(beaconB1);
        flashBanner('Vire hacia B1', 'turn-b1');
        try { Speech.stop(); Speech.speak('Vire hacia be uno', { language: 'es-ES', rate: 1.0, pitch: 1.0 }); } catch {}
      }
    } else if (activeThreshold) {
      if (!navTarget || navTarget.latitude !== activeThreshold.latitude || navTarget.longitude !== activeThreshold.longitude) {
        setNavTarget(activeThreshold);
        // El “permiso para aterrizar” lo manejás en otro effect; aquí solo guía.
        flashBanner('Continúe a final', 'continue-final');
        try { Speech.stop(); Speech.speak('Continúe a final', { language: 'es-ES', rate: 1.0, pitch: 1.0 }); } catch {}
      }
    }
  }, [
    rw,
    runwayState,          // cambia cuando se replanifica la cola
    beaconB1, beaconB2,
    activeThreshold,
    myPlane.lat, myPlane.lon,
    username,
    navTarget
  ]);



  useEffect(() => {
    return () => {
      if (holdTimerRef.current) clearTimeout(holdTimerRef.current);
      if (taDebounceRef.current) clearTimeout(taDebounceRef.current);
    };
  }, []);


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
          .filter(plane => plane.id !== username)
          .map((plane) => {
            console.log('plane', plane.id, 'alertLevel', plane.alertLevel);
            return (
              <Marker
                key={plane.id}
                coordinate={{ latitude: plane.lat, longitude: plane.lon }}
                anchor={{ x: 0.5, y: 0.5 }}
                rotation={plane.heading}
                flat
                onPress={() => {
                  setSelected(plane);

                  const warning = warnings[plane.id];

                  const isPureInfo =
                  !warning &&
                  (plane.alertLevel === 'none' || !plane.alertLevel);
                  // si el tap es informativo, holdeamos 5s
                  selectedHoldUntilRef.current = isPureInfo ? Date.now() + 5000 : 0;
                                  
                  if (warning) {
                    priorizarWarningManual(warning);
                    maybeEmitWarning(warning);       // suma
                  } else if (
                    plane.alertLevel === 'TA' ||
                    plane.alertLevel === 'RA_LOW' ||
                    plane.alertLevel === 'RA_HIGH'
                  ) {
                    priorizarWarningManual({
                      
                      alertLevel: plane.alertLevel,
                      timeToImpact: plane.timeToImpact || Infinity,
                      distanceMeters: getDistance(myPlane.lat, myPlane.lon, plane.lat, plane.lon),
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

                  if (isPureInfo) {
                  hideSelectedTimeout.current = setTimeout(() => {
                    setSelected(null);
                    selectedHoldUntilRef.current = 0;
                    hideSelectedTimeout.current = null;
                  }, 5000); // ⬅️ 5s
                  }


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

                  {/* === RUNWAY (Airfield) === */}
          {A_runway && B_runway && (
            <Polyline coordinates={[A_runway, B_runway]} strokeColor="black" strokeWidth={3} />
          )}
          {A_runway && (
            <Marker coordinate={A_runway} title={`Cabecera A ${rw?.identA || ''}`} onPress={() => showRunwayLabel('A')}>
              <View style={{ backgroundColor: '#2196F3', padding: 2, borderRadius: 10, minWidth: 20, alignItems: 'center' }}>
                <Text style={{ color: 'white', fontWeight: 'bold', fontSize: 10 }}>A</Text>
              </View>
            </Marker>
          )}
          {B_runway && (
            <Marker coordinate={B_runway} title={`Cabecera B ${rw?.identB || ''}`} onPress={() => showRunwayLabel('B')}>
              <View style={{ backgroundColor: '#E53935', padding: 2, borderRadius: 10, minWidth: 20, alignItems: 'center' }}>
                <Text style={{ color: 'white', fontWeight: 'bold', fontSize: 10 }}>B</Text>
              </View>
            </Marker>
          )}
          {runwayMid && (
            <Marker
              coordinate={runwayMid}
              title={`${rw?.identA ?? 'RWY'}`}
              onPress={() => showRunwayLabel(rw?.active_end === 'B' ? 'B' : 'A')}
              anchor={{ x: 0.5, y: 0.5 }}
              flat
              rotation={runwayHeading}
            >
              <View style={{ alignItems: 'center' }}>
                <View style={{
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
                }} />
              </View>
            </Marker>
          )}
          {/* === FIN RUNWAY === */}

        <Polyline coordinates={track} strokeColor="blue" strokeWidth={2} />

        {/* === BEACONS: Línea guía B2 -> B1 -> Umbral activo === */}
        {beaconB1 && beaconB2 && (
          <Polyline
            coordinates={[
              beaconB2,
              beaconB1,
              activeThreshold || beaconB1
            ]}
            strokeColor="green"
            strokeWidth={2}
          />
        )}
        {/* B2 */}
        {beaconB2 && (
          <Marker coordinate={beaconB2} title="B2">
            <View style={{ backgroundColor: '#673AB7', padding: 2, borderRadius: 10, minWidth: 24, alignItems: 'center' }}>
              <Text style={{ color: 'white', fontWeight: 'bold', fontSize: 10 }}>B2</Text>
            </View>
          </Marker>
        )}

        {/* B1 */}
        {beaconB1 && (
          <Marker coordinate={beaconB1} title="B1">
            <View style={{ backgroundColor: '#4CAF50', padding: 2, borderRadius: 10, minWidth: 24, alignItems: 'center' }}>
              <Text style={{ color: 'white', fontWeight: 'bold', fontSize: 10 }}>B1</Text>
            </View>
          </Marker>
        )}
        {/* Mi pierna hacia el target (B2/B1/Umbral) */}
        {navTarget && (
          <Polyline
            coordinates={[
              { latitude: myPlane.lat, longitude: myPlane.lon },
              navTarget
            ]}
            strokeColor="blue"
            strokeWidth={2}
          />
        )}





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
        // prioritizedWarning es Warning: tiene distanceMeters ✅
        <TrafficWarningCard
          aircraft={prioritizedWarning}
          distance={prioritizedWarning.distanceMeters}
        />
      ) : conflict ? (
        // conflict es Plane: calculá on-the-fly
        <TrafficWarningCard
          aircraft={conflict}
          distance={getDistanceTo(conflict)}
        />
      ) : selected ? (
        // selected es Plane: calculá on-the-fly
        <TrafficWarningCard
          aircraft={selected}
          distance={getDistanceTo(selected)}
        />
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

{/* === RUNWAY: Label efímero al tocar pista (6s) === */}
{runwayTapEnd && Date.now() < runwayLabelUntil && (
    <View style={{
      position:'absolute', left:10, right:10, bottom: Platform.OS==='android'? 210 : 180,
      backgroundColor:'#fff', borderRadius:14, padding:12, elevation:4
    }}>

    {/* Turno propio en rojo (usa la cola donde REALMENTE estoy) */}
    <Text style={{color:'#C62828', fontWeight:'700', marginBottom:6}}>
      {(() => {
        const me = myPlane?.id || username;
        const ls = runwayState?.state?.landings || [];
        const ts = runwayState?.state?.takeoffs || [];

        const iL = ls.findIndex((x:any)=>x?.name===me);
        const iT = ts.findIndex((x:any)=>x?.name===me);

        // si estoy en alguna cola, usar esa; si no, caer a defaultActionForMe()
        const activeList =
          iL >= 0 ? ls :
          iT >= 0 ? ts :
          (defaultActionForMe()==='land' ? ls : ts);

        const idx = activeList.findIndex((x:any)=>x?.name===me);
        return idx >= 0 ? `Turno #${idx+1}` : 'Sin turno asignado';
      })()}
    </Text>


    {/* Quién está en uso */}
    <Text style={{fontWeight:'700', marginBottom:4}}>
      {runwayState?.state?.inUse
        ? `${runwayState.state.inUse.action==='landing'?'Aterrizando':'Despegando'} — `
          + `${runwayState.state.inUse.name} (${runwayState.state.inUse.callsign||'—'})`
        : 'Pista libre'}
    </Text>

{(() => { const me=myPlane?.id||username; const s=slots.find(x=>x.name===me); return s?.frozen ? <Text style={{marginBottom:4}}>🔒 Posición congelada (B1)</Text> : null; })()}

{(() => { const me=myPlane?.id||username; const s=slots.find(x=>x.name===me); return s ? <Text style={{marginBottom:2}}>ETA a slot: {Math.max(0, Math.round((s.startMs - Date.now())/1000))} s</Text> : null; })()}

{(() => { const me=myPlane?.id||username; const s=slots.find(x=>x.name===me) as any; const sh=Math.round((s?.shiftAccumMs||0)/1000); return s&&sh>0 ? <Text style={{marginBottom:8}}>Desvío aplicado: +{sh}s</Text> : null; })()}


    {/* Acciones según estado (volando/tierra) */}
    <View style={{flexDirection:'row', gap:10, flexWrap:'wrap', marginBottom:6}}>
      {(() => {
        const action = defaultActionForMe();
        const already =
          (action==='land' && landingRequestedRef.current) ||
          (action==='takeoff' && takeoffRequestedRef.current);

        if (already) {
          return (
            <TouchableOpacity onPress={cancelRunwayLabel}
              style={{backgroundColor:'#eee', paddingHorizontal:12, paddingVertical:8, borderRadius:10}}>
              <Text>Cancelar {action==='land'?'aterrizaje':'despegue'}</Text>
            </TouchableOpacity>
          );
        }

        if (action==='land') {
          return (
            <>
              <TouchableOpacity onPress={requestLandingLabel}
                style={{backgroundColor:'#111', paddingHorizontal:12, paddingVertical:8, borderRadius:10}}>
                <Text style={{color:'#fff', fontWeight:'600'}}>Solicitar Aterrizaje</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={()=>{
                  socketRef.current?.emit('runway-request',{
                    action:'land', name: myPlane?.id||username,
                    callsign: callsign||'', aircraft: aircraftModel||'',
                    type: aircraftModel||'', emergency:true, altitude: myPlane?.alt??0
                  });
                  landingRequestedRef.current = true;
                  flashBanner('EMERGENCIA declarada', 'emg');
                }}
                style={{backgroundColor:'#b71c1c', paddingHorizontal:12, paddingVertical:8, borderRadius:10}}
              >
                <Text style={{color:'#fff', fontWeight:'700'}}>EMERGENCIA</Text>
              </TouchableOpacity>
            </>
          );
        }

        // en tierra: solo despegue
        return (
          <TouchableOpacity onPress={requestTakeoffLabel}
            style={{backgroundColor:'#111', paddingHorizontal:12, paddingVertical:8, borderRadius:10}}>
            <Text style={{color:'#fff', fontWeight:'600'}}>Solicitar Despegue</Text>
          </TouchableOpacity>
        );
      })()}
    </View>

{/* Cola completa (scrolleable si es larga) */}
<Text style={{fontWeight:'600', marginTop:4, marginBottom:4}}>
  {defaultActionForMe()==='land' ? 'Cola de aterrizajes' : 'Cola de despegues'}
</Text>

<View style={{maxHeight: 180}}>
  <ScrollView>
    {(() => {
      const me = myPlane?.id||username;
      const action = defaultActionForMe();
      const list = action==='land'
        ? (runwayState?.state?.landings||[])
        : (runwayState?.state?.takeoffs||[]);

      if (!list.length) return <Text style={{fontSize:12}}>(vacío)</Text>;

      return list.map((x:any, i:number) => {
        const mine   = x?.name === me;
        const etaMin = typeof x?.etaSec === 'number' ? Math.round(x.etaSec/60) : null;
        const waited = typeof x?.waitedMin === 'number' ? x.waitedMin : null;
        const tags = [
          x?.emergency ? 'EMERGENCIA' : null,
          (action==='land'    && x?.holding) ? 'HOLD'  : null,
          (action==='takeoff' && x?.ready)   ? 'LISTO' : null,
          (action==='takeoff' && waited!=null) ? `+${waited}m` : null,
        ].filter(Boolean).join(' · ');

        return (
          <Text
            key={x?.name || i}
            style={{
              fontSize:12,
              marginBottom:2,
              ...(mine ? { fontWeight:'700', color:'#C62828' } : {})
            }}
          >
            #{i+1} {x?.name}{x?.callsign ? ` (${x.callsign})` : ''}
            {etaMin!=null ? ` — ETA ${etaMin} min` : ''}
            {tags ? ` — [${tags}]` : ''}
          </Text>
        );
      });
    })()}
  </ScrollView>
</View>


  </View>
)}

{/* === RUNWAY: Banner efímero 6s === */}
{banner && (
  <View style={{
    position:'absolute', left:10, right:10, bottom: Platform.OS==='android'? 270 : 240,
    backgroundColor:'#263238', borderRadius:12, padding:10, elevation:4
  }}>
    <Text
        style={{
          color: '#C62828',      // rojo
          textAlign: 'center',
          fontWeight: '900',
          fontSize: 22,          // más grande
        }}
      >
        {banner.text}
    </Text>
  </View>
)}







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
