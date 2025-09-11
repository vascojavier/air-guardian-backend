// C:\air-guardian\frontend\types\airfield.ts

export type Meteo = {
  windDirection?: number | null;
  windSpeed?: number | null;
  visibility?: number | null;
  cloudCover?: number | null;
  temperature?: number | null;
  pressure?: number | null;
};

// Identificador de cabecera
export type RunwayEndId = 'A' | 'B';

// Beacons de secuenciación (B1 = freeze / final, B2 = pre-secuencia)
export type RunwayBeacon = {
  name: 'B1' | 'B2';
  lat: number;
  lon: number;
};

export type Runway = {
  id: string;
  identA: string; // "09", "18L", etc.
  identB: string; // "27", "36R", etc.
  thresholdA: { lat: number; lng: number };
  thresholdB: { lat: number; lng: number };
  heading_true_ab: number;  // grados (A → B)
  length_m?: number;
  width_m?: number;
  surface?: string;         // "asphalt" | "grass" | ...
  active_end?: RunwayEndId; // cabecera activa ('A' | 'B')
  beacons?: RunwayBeacon[]; // <<< NUEVO: B1 y B2 para aproximación
  notes?: string;
};

export type Airfield = {
  id: string; // "manual:<uuid>" o ICAO en el futuro
  name?: string;
  icao?: string;
  iata?: string;
  country?: string;                 // ISO-3166
  elevation_ft?: number;
  location?: { lat: number; lng: number }; // centro aprox.
  runways: Runway[];
  meteo?: Meteo;
  lastUpdated: number;              // epoch ms
  source: 'manual' | 'ourairports' | 'mixed' | 'openaip';
};
