export type PaisInfo = {
  nombre: string;
  formatear: (raw: string) => string;
};

export const paises: { [key: string]: PaisInfo } = {
  'LV': {
    nombre: 'Argentina',
    formatear: (raw) => {
      const clean = raw.toUpperCase().replace(/[^A-Z0-9]/g, '');
      if (clean.length <= 2) return clean;
      if (!clean.includes('-')) return `LV-${clean.slice(2)}`;
      return clean;
    }
  },
  'N': {
    nombre: 'Estados Unidos',
    formatear: (raw) => raw.toUpperCase().replace(/[^A-Z0-9]/g, '')
  },
  'G': {
    nombre: 'Reino Unido',
    formatear: (raw) => {
      const clean = raw.toUpperCase().replace(/[^A-Z]/g, '');
      return clean.startsWith('G') && !clean.includes('-')
        ? `G-${clean.slice(1)}`
        : clean;
    }
  },
};

export function detectarYFormatearMatricula(input: string): string {
  const clean = input.toUpperCase().replace(/[^A-Z0-9]/g, '');
  const prefijos = Object.keys(paises).sort((a, b) => b.length - a.length);

  for (const prefijo of prefijos) {
    if (clean.startsWith(prefijo)) {
      return paises[prefijo].formatear(clean);
    }
  }

  return clean;
}
