import React, { useState } from 'react';
import { View, Text, TextInput, Button } from 'react-native';
import { useUser } from '../context/UserContext';
import { useRouter } from 'expo-router';

type PaisInfo = {
  nombre: string;
  formatear: (raw: string) => string;
  validar: (formateada: string) => boolean;
};

const paises: { [prefijo: string]: PaisInfo } = {
  'LV': {
    nombre: 'Argentina',
    formatear: (raw) => {
      const match = raw.match(/^LV([A-Z]{1,3})(\d{0,4})$/);
      return match ? `LV-${match[1]}${match[2]}` : raw;
    },
    validar: (mat) => /^LV-[A-Z]{1,3}\d{1,4}$/.test(mat)
  },
  'N': {
    nombre: 'Estados Unidos',
    formatear: (raw) => raw,
    validar: (mat) => /^N[0-9A-Z]{2,5}$/.test(mat)
  },
  'G': {
    nombre: 'Reino Unido',
    formatear: (raw) => raw.startsWith('G') ? `G-${raw.slice(1)}` : raw,
    validar: (mat) => /^G-[A-Z]{4}$/.test(mat)
  },
  'HC': {
    nombre: 'Ecuador',
    formatear: (raw) => raw.startsWith('HC') ? `HC-${raw.slice(2)}` : raw,
    validar: (mat) => /^HC-[A-Z]{3}$/.test(mat)
  },
  'F': {
    nombre: 'Francia',
    formatear: (raw) => raw.startsWith('F') ? `F-${raw.slice(1)}` : raw,
    validar: (mat) => /^F-[A-Z]{4}$/.test(mat)
  },
  'D': {
    nombre: 'Alemania',
    formatear: (raw) => raw.startsWith('D') ? `D-${raw.slice(1)}` : raw,
    validar: (mat) => /^D-[A-Z]{4}$/.test(mat)
  },
  'I': {
    nombre: 'Italia',
    formatear: (raw) => raw.startsWith('I') ? `I-${raw.slice(1)}` : raw,
    validar: (mat) => /^I-[A-Z]{4}$/.test(mat)
  },
  'CC': {
    nombre: 'Chile',
    formatear: (raw) => raw.startsWith('CC') ? `CC-${raw.slice(2)}` : raw,
    validar: (mat) => /^CC-[A-Z]{3}$/.test(mat)
  },
};

function detectarYFormatearMatricula(input: string): {
  formateada: string;
  pais: string | null;
  esValida: boolean;
} {
  const clean = input.toUpperCase().replace(/[^A-Z0-9]/g, '');
  const prefijos = Object.keys(paises).sort((a, b) => b.length - a.length);

  for (const prefijo of prefijos) {
    if (clean.startsWith(prefijo)) {
      const { nombre, formatear, validar } = paises[prefijo];
      const formateada = formatear(clean);
      return { formateada, pais: nombre, esValida: validar(formateada) };
    }
  }

  return { formateada: clean, pais: null, esValida: false };
}

export default function AircraftSelection() {
  const { username, role, setUser } = useUser();
  const [matricula, setMatricula] = useState('');
  const [paisDetectado, setPaisDetectado] = useState<string | null>(null);
  const [esValida, setEsValida] = useState(false);
  const router = useRouter();

  const handleChange = (text: string) => {
    const { formateada, pais, esValida } = detectarYFormatearMatricula(text);
    setMatricula(formateada);
    setPaisDetectado(pais);
    setEsValida(esValida);
  };

  const handleSubmit = () => {
    if (!matricula || !esValida) return;
    setUser(username, role, matricula);
    router.push('/Radar');
  };

  return (
    <View style={{ padding: 20 }}>
      <Text style={{ fontSize: 18, marginBottom: 10 }}>Ingrese matrícula de la aeronave:</Text>
      <TextInput
        style={{ borderWidth: 1, padding: 10, fontSize: 16 }}
        placeholder="Ej: LV-G123, N123AB, G-ABCD"
        value={matricula}
        onChangeText={handleChange}
        autoCapitalize="characters"
      />
      {paisDetectado && (
        <Text style={{ marginTop: 8, fontStyle: 'italic' }}>
          País detectado: {paisDetectado}
        </Text>
      )}
      {!esValida && matricula.length > 0 && (
        <Text style={{ color: 'red', marginTop: 5 }}>
          Matrícula no válida para el país detectado.
        </Text>
      )}
      <View style={{ marginTop: 20 }}>
        <Button title="Confirmar" onPress={handleSubmit} disabled={!esValida} />
      </View>
    </View>
  );
}
