import { Warning } from './FunctionWarning'; // Usa tu tipo existente si ya lo definiste ahí

export function calcularWarningLocalMasPeligroso(
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

  traffic.forEach((otro) => {
    const dx = otro.lon - myPlane.lon;
    const dy = otro.lat - myPlane.lat;
    const dz = (otro.alt || 0) - (myPlane.alt || 0);
    const distancia = Math.sqrt(dx * dx + dy * dy + dz * dz * 1e-10) * 111000;

    const relativeSpeed = Math.abs((otro.speed || 0) - (myPlane.speed || 0));
    const tiempoImpacto = relativeSpeed > 1 ? distancia / relativeSpeed : Infinity;

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

