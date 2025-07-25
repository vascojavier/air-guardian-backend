import React, { useEffect, useState } from 'react';
import { View, Text, Button, StyleSheet, Alert, TextInput, Modal, Pressable } from 'react-native';
import MapView, { Marker, Polyline, MapPressEvent, Region } from 'react-native-maps';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useUser } from '../context/UserContext';

// Definimos el tipo LatLng
type LatLng = {
  latitude: number;
  longitude: number;
};

export default function PistaScreen() {
  const { role } = useUser(); // 'pilot' o 'aeroclub'
  const [cabeceraA, setCabeceraA] = useState<LatLng | null>(null);
  const [cabeceraB, setCabeceraB] = useState<LatLng | null>(null);
  const [cabeceraActiva, setCabeceraActiva] = useState<'A' | 'B' | null>(null);
  const [rumbo, setRumbo] = useState<number>(0);
  const [modoSeteo, setModoSeteo] = useState<boolean>(false);
  const [numeroPista, setNumeroPista] = useState<string>('');
  const [showModal, setShowModal] = useState<boolean>(false);
  const [showDetails, setShowDetails] = useState(true);

  useEffect(() => {
    const cargarPista = async () => {
      try {
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
    cargarPista();
  }, []);

  const cambiarCabecera = async () => {
    if (!cabeceraActiva || !cabeceraA || !cabeceraB) return;
    const nueva = cabeceraActiva === 'A' ? 'B' : 'A';
    setCabeceraActiva(nueva);
    const nuevoRumbo = (rumbo + 180) % 360;
    setRumbo(nuevoRumbo);

    try {
      const datos = await AsyncStorage.getItem('pistaActiva');
      if (datos) {
        const json = JSON.parse(datos);
        json.defaultActiveHeading = nueva;
        await AsyncStorage.setItem('pistaActiva', JSON.stringify(json));
      }
    } catch (error) {
      console.error('Error al guardar nueva cabecera activa:', error);
    }
  };

  const calcularPuntoIntermedio = (p1: LatLng, p2: LatLng): LatLng => {
    return {
      latitude: (p1.latitude + p2.latitude) / 2,
      longitude: (p1.longitude + p2.longitude) / 2
    };
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

  const guardarPista = async () => {
    if (!cabeceraA || !cabeceraB || !numeroPista) return;

    const rumboInicial = calcularRumbo(cabeceraA, cabeceraB);
    setRumbo(rumboInicial);
    setCabeceraActiva('A');

    const pista = {
      runway: { A: cabeceraA, B: cabeceraB },
      defaultActiveHeading: 'A',
      numero: numeroPista,
    };
    await AsyncStorage.setItem('pistaActiva', JSON.stringify(pista));
    setModoSeteo(false);
    setShowModal(false);
  };

  const onRegionChangeComplete = (region: Region) => {
    const threshold = 0.2; // Aproximadamente 10 km
    setShowDetails(region.latitudeDelta < threshold && region.longitudeDelta < threshold);
  };

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
        {cabeceraA && showDetails && <Marker coordinate={cabeceraA} title={`Cabecera A ${numeroPista}`}><View style={styles.marker}><Text style={styles.markerText}>A</Text></View></Marker>}
        {cabeceraB && showDetails && <Marker coordinate={cabeceraB} title={`Cabecera B ${numeroPista}`}><View style={styles.marker}><Text style={styles.markerText}>B</Text></View></Marker>}
        {cabeceraA && cabeceraB && <Polyline coordinates={[cabeceraA, cabeceraB]} strokeColor="black" strokeWidth={2} />}
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
            <Button title={modoSeteo ? 'Cancelar Seteo de Pista' : 'Setear nueva pista'} onPress={() => {
              setCabeceraA(null);
              setCabeceraB(null);
              setCabeceraActiva(null);
              setModoSeteo(!modoSeteo);
            }} />
          </>
        )}
      </View>
    </View>
  );
}

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
    backgroundColor: 'rgba(0,0,0,0.5)'
  },
  modalBox: {
    width: '80%',
    backgroundColor: 'white',
    borderRadius: 10,
    padding: 20,
    elevation: 5,
  }
});
