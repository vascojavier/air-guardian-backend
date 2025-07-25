import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Plane } from '../../types/Plane';

type Props = {
  aircraft: Plane;
  distance: number;
};

export default function TrafficWarningCard({ aircraft, distance }: Props) {
  if (!aircraft) return null;

  // Determinar estilos y texto según el nivel de alerta
  let bgColor = '#fff3cd'; // TA amarillo
  let borderColor = '#ffeeba';
  let textColor = '#856404';
  let title = '⚠️ Tráfico cercano (TA)';

  if (aircraft.alertLevel === 'RA_LOW') {
    bgColor = '#ffe5b4'; // naranja claro
    borderColor = '#ffbb66';
    textColor = '#7a3e00';
    title = '⚠️ Conflicto potencial (RA < 3 min)';
  } else if (aircraft.alertLevel === 'RA_HIGH') {
    bgColor = '#f8d7da'; // rojo claro
    borderColor = '#f5c6cb';
    textColor = '#721c24';
    title = '🚨 Riesgo inminente (RA < 1 min)';
  }

  return (
    <View style={[styles.container, { backgroundColor: bgColor, borderColor }]}>
      <Text style={[styles.warning, { color: textColor }]}>{title}</Text>

      <Text style={[styles.label, { color: textColor }]}>
        Tipo: <Text style={styles.value}>{aircraft.type || 'Desconocido'}</Text>{'   '}
        Matrícula: <Text style={styles.value}>{aircraft.callsign || 'N/A'}</Text>
      </Text>

      <Text style={[styles.label, { color: textColor }]}>
        Piloto: <Text style={styles.value}>{aircraft.name}</Text>
      </Text>

      <Text style={[styles.label, { color: textColor }]}>
        Distancia: <Text style={styles.value}>{Math.round(distance)} m</Text>
      </Text>

      <Text style={[styles.label, { color: textColor }]}>
        Altitud: <Text style={styles.value}>{aircraft.alt} m</Text>{'   '}
        Rumbo: <Text style={styles.value}>{aircraft.heading}°</Text>{'   '}
        Velocidad: <Text style={styles.value}>{aircraft.speed} km/h</Text>
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderWidth: 1,
    borderRadius: 10,
    padding: 10,
    margin: 10,
    elevation: 3,
  },
  warning: {
    fontWeight: 'bold',
    fontSize: 16,
    marginBottom: 5,
  },
  label: {
    fontSize: 14,
    marginBottom: 2,
  },
  value: {
    fontWeight: 'bold',
  },
});
