// Login screen — username/password → POST /auth/login → store JWT
import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet } from 'react-native';
import { useStore } from '../store';
import { connectComms } from '../utils/socket';
import { CONFIG } from '../config';

export function LoginScreen({ navigation }: any) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const setJwt = useStore(s => s.setJwt);

  const login = async () => {
    try {
      // 30s timeout — required for SATCOM links with 800ms+ latency
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 30000);

      const res = await fetch(`${CONFIG.API_URL}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      const data = await res.json();
      if (!res.ok) { setError(data.error ?? 'Login failed'); return; }
      
      setJwt(data.jwt);
      await connectComms(data.jwt);
      navigation.replace('Channels');
    } catch (e: any) {
      if (e.name === 'AbortError') {
        setError('Server did not respond in 30s. If on SATCOM, wait for satellite lock and try again.');
      } else {
        setError(`Cannot reach server: ${e.message}`);
      }
    }
  };


  return (
    <View style={styles.container}>
      <Text style={styles.title}>ForbiddenLAN</Text>
      <TextInput 
        placeholder="Username" 
        value={username} 
        onChangeText={setUsername}
        style={styles.input} 
        autoCapitalize="none"
      />
      <TextInput 
        placeholder="Password" 
        secureTextEntry 
        value={password} 
        onChangeText={setPassword}
        style={styles.input} 
      />
      {!!error && <Text style={styles.errorText}>{error}</Text>}
      
      <TouchableOpacity onPress={login} style={styles.button}>
        <Text style={styles.buttonText}>Connect</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 20 },
  title: { fontSize: 32, fontWeight: 'bold', marginBottom: 20 },
  input: { padding: 12, fontSize: 16, width: '100%', borderRadius: 8, borderWidth: 1, borderColor: '#ccc', marginBottom: 10 },
  errorText: { color: 'red', marginBottom: 10 },
  button: { paddingVertical: 14, paddingHorizontal: 40, backgroundColor: '#0D6EFD', borderRadius: 8, marginTop: 10 },
  buttonText: { color: 'white', fontSize: 18, fontWeight: 'bold' }
});
