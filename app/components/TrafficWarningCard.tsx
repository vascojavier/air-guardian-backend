import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Plane } from '../../types/Plane';

type Props = {
  aircraft: Plane;
  distance: number;
};

export default function TrafficWarningCard({ aircraft, distance }: Props) {
  if (!aircraft) return null;

  return (
    <View style={styles.container}>
      <Text style={styles.warning}>⚠️ Tráfico cercano</Text>
      
      <Text style={styles.label}>
        Tipo: <Text style={styles.value}>{aircraft.type || 'Desconocido'}</Text>{'   '}
        Matrícula: <Text style={styles.value}>{aircraft.callsign || 'N/A'}</Text>
      </Text>
      
      <Text style={styles.label}>
        Piloto: <Text style={styles.value}>{aircraft.name}</Text>
      </Text>
      
      <Text style={styles.label}>
        Distancia: <Text style={styles.value}>{Math.round(distance)} m</Text>
      </Text>
      
      <Text style={styles.label}>
        Altitud: <Text style={styles.value}>{aircraft.alt} m</Text>{'   '}
        Rumbo: <Text style={styles.value}>{aircraft.heading}°</Text>{'   '}
        Velocidad: <Text style={styles.value}>{aircraft.speed} km/h</Text>
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#fff3cd',
    borderColor: '#ffeeba',
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
    color: '#856404',
  },
  label: {
    fontSize: 14,
    color: '#856404',
    marginBottom: 2,
  },
  value: {
    fontWeight: 'bold',
  },
});
