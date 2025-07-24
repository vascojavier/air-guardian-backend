import React, { useState, useEffect } from 'react';
import { View, Text, Button, StyleSheet, Alert } from 'react-native';
import MapView, { Marker, Polyline, LatLng } from 'react-native-maps';
import AsyncStorage from '@react-native-async-storage/async-storage';

export default function AirfieldSetup() {
  const [cabeceraA, setCabeceraA] = useState<LatLng | null>(null);
  const [cabeceraB, setCabeceraB] = useState<LatLng | null>(null);
  const [fase, setFase] = useState<'A' | 'B'>('A');
  const [viento, setViento] = useState<number | null>(null);
  const [velocidadViento, setVelocidadViento] = useState<number | null>(null);
  const [visibilidad, setVisibilidad] = useState<number | null>(null);
  const [nubosidad, setNubosidad] = useState<number | null>(null);
  const [temperatura, setTemperatura] = useState<number | null>(null);
  const [presion, setPresion] = useState<number | null>(null);
  const [cabeceraActiva, setCabeceraActiva] = useState<'A' | 'B' | null>(null);

  useEffect(() => {
    const lat = -31.4;
    const lon = -62.1;

    const obtenerDatosMeteo = async () => {
      try {
        const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=wind_direction,wind_speed,cloud_cover,visibility,temperature_2m,surface_pressure`;
        const response = await fetch(url);
        const data = await response.json();
        const direccion = data.current?.wind_direction;
        const velocidad = data.current?.wind_speed;
        const visibilidad = data.current?.visibility;
        const nubosidad = data.current?.cloud_cover;
        const temperatura = data.current?.temperature_2m;
        const presion = data.current?.surface_pressure;

        if (direccion !== undefined) setViento(direccion);
        if (velocidad !== undefined) setVelocidadViento(velocidad);
        if (visibilidad !== undefined) setVisibilidad(visibilidad);
        if (nubosidad !== undefined) setNubosidad(nubosidad);
        if (temperatura !== undefined) setTemperatura(temperatura);
        if (presion !== undefined) setPresion(presion);
      } catch (error) {
        console.error('Error al obtener datos meteorológicos:', error);
      }
    };

    obtenerDatosMeteo();
  }, []);

  const manejarToqueMapa = (e: any) => {
    const punto: LatLng = e.nativeEvent.coordinate;
    if (fase === 'A') {
      setCabeceraA(punto);
      setFase('B');
    } else {
      setCabeceraB(punto);
    }
  };

  const calcularRumbo = (p1: LatLng, p2: LatLng): number => {
    const toRad = (deg: number) => deg * Math.PI / 180;
    const toDeg = (rad: number) => rad * 180 / Math.PI;
    const lat1 = toRad(p1.latitude);
    const lat2 = toRad(p2.latitude);
    const dLon = toRad(p2.longitude - p1.longitude);
    const y = Math.sin(dLon) * Math.cos(lat2);
    const x = Math.cos(lat1) * Math.sin(lat2) -
              Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon);
    return (toDeg(Math.atan2(y, x)) + 360) % 360;
  };

  const elegirCabeceraPorViento = () => {
    if (!cabeceraA || !cabeceraB || viento === null) {
      Alert.alert('Faltan datos', 'Definí las cabeceras y asegurate de que el viento esté disponible.');
      return;
    }
    const rumbo = calcularRumbo(cabeceraA, cabeceraB);
    const anguloEntre = (a: number, b: number) => Math.abs(((a - b + 540) % 360) - 180);
    const difA = anguloEntre(viento, rumbo);
    const difB = anguloEntre(viento, (rumbo + 180) % 360);
    const activa = difA < difB ? 'A' : 'B';
    setCabeceraActiva(activa);
    Alert.alert('Cabecera activa', `La cabecera ${activa} tiene viento en contra.`);
  };

  const guardarPista = async () => {
    if (!cabeceraA || !cabeceraB || !cabeceraActiva) {
      Alert.alert('Faltan datos', 'Debes definir ambas cabeceras y el viento.');
      return;
    }
    const data = {
      runway: {
        A: cabeceraA,
        B: cabeceraB
      },
      defaultActiveHeading: cabeceraActiva,
      meteo: {
        windDirection: viento,
        windSpeed: velocidadViento,
        visibility: visibilidad,
        cloudCover: nubosidad,
        temperature: temperatura,
        pressure: presion
      }
    };
    await AsyncStorage.setItem('pistaActiva', JSON.stringify(data));
    Alert.alert('Pista guardada', 'La pista fue guardada como activa.');
  };

  return (
    <View style={{ flex: 1 }}>
      <MapView
        style={{ flex: 1 }}
        onPress={manejarToqueMapa}
        initialRegion={{
          latitude: -31.4,
          longitude: -62.1,
          latitudeDelta: 0.01,
          longitudeDelta: 0.01,
        }}
      >
        {cabeceraA && <Marker coordinate={cabeceraA} title="Cabecera A" pinColor="blue" />}
        {cabeceraB && <Marker coordinate={cabeceraB} title="Cabecera B" pinColor="red" />}
        {cabeceraA && cabeceraB && (
          <Polyline coordinates={[cabeceraA, cabeceraB]} strokeColor="black" strokeWidth={2} />
        )}
      </MapView>
      <View style={styles.panel}>
        <Text style={styles.text}>Toque el mapa para marcar cabecera {fase}</Text>
        {viento !== null && <Text style={styles.text}>Viento actual: {viento}°</Text>}
        {velocidadViento !== null && <Text style={styles.text}>Velocidad del viento: {velocidadViento} km/h</Text>}
        {visibilidad !== null && <Text style={styles.text}>Visibilidad: {visibilidad} m</Text>}
        {nubosidad !== null && <Text style={styles.text}>Nubosidad: {nubosidad}%</Text>}
        {temperatura !== null && <Text style={styles.text}>Temperatura: {temperatura} °C</Text>}
        {presion !== null && <Text style={styles.text}>Presión atmosférica: {presion} hPa</Text>}
        <View style={styles.row}>
          <Button title="Cabecera con viento en contra" onPress={elegirCabeceraPorViento} />
        </View>
        <View style={styles.row}>
          <Button title="Guardar pista activa" onPress={guardarPista} color="green" />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  panel: {
    padding: 10,
    backgroundColor: '#fff',
  },
  row: {
    marginVertical: 5,
  },
  text: {
    marginBottom: 10,
    fontWeight: 'bold'
  }
});
