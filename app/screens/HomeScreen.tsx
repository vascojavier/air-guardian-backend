import React from 'react';
import { View, Text, StyleSheet, Button } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';

type RootStackParamList = {
  Home: undefined;
  Map: undefined;
  Radar: undefined; 
};

type Props = NativeStackScreenProps<RootStackParamList, 'Home'>;

export default function HomeScreen({ navigation }: Props) {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Air Guardian</Text>
      <Button title="Iniciar simulación de tráfico" onPress={() => navigation.navigate('Map')} />
      <Button title="Abrir radar direccional" onPress={() => navigation.navigate('Radar')} />
    </View>
    

  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  title: { fontSize: 24, marginBottom: 20 },
});


