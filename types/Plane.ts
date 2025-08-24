export interface Plane {
  id: string;
  name: string;
  lat: number;
  lon: number;
  alt: number;
  heading: number;
  speed: number;
  type?: string;
  callsign?: string;
  aircraftIcon?: string;  // ✅ <--- AÑADÍ ESTA LÍNEA
}
