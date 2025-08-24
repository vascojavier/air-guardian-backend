import React, { useState, useEffect, useRef } from 'react';
import { View, Text, TextInput, Button, StyleSheet, Alert, KeyboardAvoidingView, Platform, ScrollView, Image, TouchableOpacity } from 'react-native';
import { Picker } from '@react-native-picker/picker';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useUser } from '../context/UserContext';
import { router } from 'expo-router';
import { detectarYFormatearMatricula, paises } from '../utils/matricula_utils';
import { iconMap } from '../utils/iconMap';
import { aircraftList } from './data/aircraftList'; // ajustá el path según tu estructura

const modelosDesdeLista = aircraftList.reduce((acc, modelo) => {
  if (modelo.category === 1) {
    acc.glider.push(modelo.name); // solo los planeadores
  } else {
    acc.motor.push(modelo.name); // el resto son a motor
  }
  return acc;
}, { motor: [], glider: [] } as { motor: string[]; glider: string[] });


export default function IndexScreen() {
  const { setUser, setAircraft } = useUser();
  const [name, setName] = useState('');
  const [callsign, setCallsign] = useState('');
  const [country, setCountry] = useState('');
  const [password, setPassword] = useState('');
  const [aircraftType, setAircraftType] = useState<'motor' | 'glider' | ''>('');
  const [aircraftModel, setAircraftModel] = useState('');
  const [otroModelo, setOtroModelo] = useState('');
  const [customIcon, setCustomIcon] = useState('');
  const [iconoPreview, setIconoPreview] = useState('');
  const [modelosMotor, setModelosMotor] = useState<string[]>(modelosDesdeLista.motor);
  const [modelosGlider, setModelosGlider] = useState<string[]>(modelosDesdeLista.glider);
  const [iconosPersonalizados, setIconosPersonalizados] = useState<Record<string, string>>({});
  const otroModeloRef = useRef<TextInput>(null);
  const scrollRef = useRef<ScrollView>(null);

  useEffect(() => {
    const cargarModelosGuardados = async () => {
      try {
        const motorGuardados = await AsyncStorage.getItem('modelosMotor');
        const gliderGuardados = await AsyncStorage.getItem('modelosGlider');
        if (motorGuardados) {
          const nuevos = JSON.parse(motorGuardados);
          setModelosMotor(prev => Array.from(new Set([...prev, ...nuevos])));
        }
        if (gliderGuardados) {
          const nuevos = JSON.parse(gliderGuardados);
          setModelosGlider(prev => Array.from(new Set([...prev, ...nuevos])));
        }
      } catch (error) {
        console.error('Error al cargar modelos personalizados:', error);
      }
    };
    cargarModelosGuardados();
  }, []);

    useEffect(() => {
    const cargarDatosPrevios = async () => {
      try {
        const datos = await AsyncStorage.getItem('datosUsuario');
        if (datos) {
          const {
            name,
            callsign,
            password,
            aircraftType,
            aircraftModel,
            otroModelo,
            customIcon
          } = JSON.parse(datos);

          setName(name || '');
          setCallsign(callsign || '');
          setPassword(password || '');
          setAircraftType(aircraftType || '');
          setAircraftModel(aircraftModel || '');
          setOtroModelo(otroModelo || '');
          setCustomIcon(customIcon || '');
        }
      } catch (e) {
        console.error('Error al cargar datos previos:', e);
      }
    };
    cargarDatosPrevios();
  }, []);


  useEffect(() => {
    const cargarIconosPersonalizados = async () => {
      try {
        const datos = await AsyncStorage.getItem('iconosPersonalizados');
        if (datos) setIconosPersonalizados(JSON.parse(datos));
      } catch (e) {
        console.error('Error al cargar íconos personalizados:', e);
      }
    };
    cargarIconosPersonalizados();
  }, []);

  useEffect(() => {
    if (aircraftModel === 'otro') {
      setTimeout(() => otroModeloRef.current?.focus(), 100);
    }
  }, [aircraftModel]);
  
    useEffect(() => {
    if (aircraftModel !== 'otro') {
      setCustomIcon('');
    }
    }, [aircraftModel]);


    useEffect(() => {
      const modeloFinal = aircraftModel === 'otro' ? otroModelo.trim() : aircraftModel;
      const modeloLower = modeloFinal.toLowerCase();

      let icono = aircraftType === 'glider' ? '1' : '2'; // default depende del tipo


      // Buscar en aircraftList
      const encontrado = aircraftList.find((a) => a.name === modeloFinal);
      if (encontrado) {
        icono = `${encontrado.category}`; // Ej: '3'
      }

      // Si tiene ícono personalizado guardado, lo prioriza
      const iconoGuardado = iconosPersonalizados[modeloFinal];
      if (iconoGuardado) {
        icono = iconoGuardado;
      }

      // Si el usuario eligió un customIcon (manual), se usa
      if (customIcon.trim() && iconMap[customIcon.trim()]) {
        icono = customIcon.trim();
      }

      // Fallback final a categoría 2 si nada es válido
      if (!iconMap[icono]) {
        icono = '2';
      }

      setIconoPreview(icono);
    }, [aircraftType, aircraftModel, otroModelo, customIcon, iconosPersonalizados]);


  const eliminarModelo = async (modelo: string) => {
    try {
      const key = aircraftType === 'motor' ? 'modelosMotor' : 'modelosGlider';
      const listaActual = aircraftType === 'motor' ? modelosMotor : modelosGlider;
      const nuevaLista = listaActual.filter(m => m !== modelo);
      await AsyncStorage.setItem(key, JSON.stringify(nuevaLista));
      if (aircraftType === 'motor') setModelosMotor(nuevaLista);
      else setModelosGlider(nuevaLista);
      Alert.alert('Modelo eliminado', `El modelo "${modelo}" fue eliminado.`);
    } catch (error) {
      console.error('Error al eliminar modelo:', error);
    }
  };

  const handleLogin = async () => {
    if (
      !name.trim() ||
      !callsign.trim() ||
      !aircraftType ||
      aircraftModel === '' ||
      (aircraftModel === 'otro' && !otroModelo.trim())
    ) {
      alert('Por favor completá todos los campos.');
      return;
    }

    const modeloFinal = aircraftModel === 'otro' ? otroModelo.trim() : aircraftModel;

    if (aircraftModel === 'otro' && modeloFinal) {
      const key = aircraftType === 'motor' ? 'modelosMotor' : 'modelosGlider';
      const listaActual = aircraftType === 'motor' ? modelosMotor : modelosGlider;
      const actualizados = Array.from(new Set([...listaActual, modeloFinal]));
      await AsyncStorage.setItem(key, JSON.stringify(actualizados));
      if (aircraftType === 'motor') setModelosMotor(actualizados);
      else setModelosGlider(actualizados);

      if (customIcon) {
        const nuevosIconos = { ...iconosPersonalizados, [modeloFinal]: customIcon };
        await AsyncStorage.setItem('iconosPersonalizados', JSON.stringify(nuevosIconos));
        setIconosPersonalizados(nuevosIconos);
      }
    }

    const isAdmin = password === 'aeroclub123';
    const role = isAdmin ? 'aeroclub' : 'pilot';

    // Verificar que iconoPreview sea válido
    const finalIcon = iconMap[iconoPreview] ? iconoPreview : '2';

    setUser(name.trim(), role, callsign.trim());
    setAircraft(aircraftType, modeloFinal, finalIcon, callsign.trim());




await AsyncStorage.setItem('datosUsuario', JSON.stringify({
  name: name.trim(),
  callsign: callsign.trim(),
  password,
  aircraftType,
  aircraftModel,
  otroModelo,
  customIcon
}));

router.push(isAdmin ? '/Pista' : '/Radar');

  };

  const handleCallsignChange = (text: string) => {
    const clean = text.toUpperCase().replace(/[^A-Z0-9]/g, '');
    const formateada = detectarYFormatearMatricula(clean);
    setCallsign(formateada);

    const prefijos = Object.keys(paises).sort((a, b) => b.length - a.length);
    for (const prefijo of prefijos) {
      if (clean.startsWith(prefijo)) {
        setCountry(paises[prefijo].nombre);
        return;
      }
    }
    setCountry('');
  };

  return (
<KeyboardAvoidingView
  style={{ flex: 1 }}
  behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
  keyboardVerticalOffset={Platform.OS === 'ios' ? 100 : 0}
>
  <ScrollView
    ref={scrollRef}
    keyboardShouldPersistTaps="handled"
    contentContainerStyle={{ flexGrow: 1, padding: 20, paddingBottom: 120 }}
  >
    <Text style={styles.label}>Tu nombre:</Text>
    <TextInput style={styles.input} value={name} onChangeText={setName} placeholder="Tu nombre (piloto)" />

    <Text style={styles.label}>Matrícula del avión:</Text>
    <TextInput
      style={styles.input}
      value={callsign}
      onChangeText={handleCallsignChange}
      placeholder="Ej: LV-ABC123"
      autoCapitalize="characters"
    />

    {country !== '' && <Text style={styles.label}>País detectado: {country}</Text>}

    <Text style={styles.label}>Tipo de avión:</Text>
    <Picker selectedValue={aircraftType} onValueChange={(value) => {
      setAircraftType(value);
      setAircraftModel('');
      setOtroModelo('');
      setCustomIcon('');
    }} style={styles.picker}>
      <Picker.Item label="Seleccionar..." value="" />
      <Picker.Item label="A motor" value="motor" />
      <Picker.Item label="Planeador" value="glider" />
    </Picker>

    {aircraftType !== '' && (
      <>
        <Text style={styles.label}>Modelo de avión:</Text>
        <Picker selectedValue={aircraftModel} onValueChange={setAircraftModel} style={styles.picker}>
          <Picker.Item label="Seleccionar..." value="" />
          {(aircraftType === 'motor' ? modelosMotor : modelosGlider).map((modelo) => (
            <Picker.Item key={modelo} label={modelo} value={modelo} />
          ))}
          <Picker.Item label="Otro..." value="otro" />
        </Picker>

        {aircraftModel === 'otro' && (
          <>
            <TextInput
              ref={otroModeloRef}
              style={styles.input}
              value={otroModelo}
              onChangeText={setOtroModelo}
              placeholder="Ingresá el modelo manualmente"
              onFocus={() => scrollRef.current?.scrollToEnd({ animated: true })}
            />

            <Text style={styles.label}>Elegí una categoría de avión:</Text>
            <View style={styles.iconGallery}>
              {[1, 2, 3, 4, 5, 6, 7].map((num) => {
                const iconName = `${num}`;
                return (
                  <TouchableOpacity key={iconName} onPress={() => setCustomIcon(iconName)}>
                    <Image
                      source={iconMap[iconName]}
                      style={[
                        styles.iconOption,
                        customIcon === iconName && styles.iconSelected,
                      ]}
                    />
                  </TouchableOpacity>
                );
              })}
            </View>
          </>
        )}


        {iconoPreview !== '' && (
          <Image
            source={iconMap[iconoPreview] || iconMap['default.png']}
            style={{ width: 60, height: 60, alignSelf: 'center', marginVertical: 10 }}
          />
        )}
      </>
    )}

    <Text style={styles.label}>Contraseña (si sos administrador):</Text>
    <TextInput
      style={styles.input}
      value={password}
      onChangeText={setPassword}
      secureTextEntry
      placeholder="opcional"
      onFocus={() => scrollRef.current?.scrollToEnd({ animated: true })}
    />

    <Button title="Ingresar" onPress={handleLogin} />

    {aircraftModel && aircraftModel !== 'otro' && (
      <Button title={`Eliminar modelo "${aircraftModel}"`} color="red" onPress={() => eliminarModelo(aircraftModel)} />
    )}
  </ScrollView>
</KeyboardAvoidingView>

  );
}

const styles = StyleSheet.create({
  container: { flexGrow: 1, padding: 20, paddingBottom: 120 },
  label: { marginTop: 10 },
  input: {
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 5,
    padding: 10,
    marginBottom: 10,
  },
  picker: {
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 5,
    marginBottom: 10,
  },
  iconGallery: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    marginVertical: 10,
  },
  iconOption: {
    width: 60,
    height: 60,
    margin: 5,
    borderWidth: 2,
    borderColor: 'transparent',
    borderRadius: 8,
  },
  iconSelected: {
    borderColor: '#007AFF',
  },
});
