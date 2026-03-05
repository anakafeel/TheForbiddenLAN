import React, { useState } from "react";
import { View, Text, TextInput, Pressable, StyleSheet } from "react-native";
import { useAuth } from "../context/AuthContext";
import { useStore } from "../store";

// For Expo, set this in packages/mobile/.env as:
// EXPO_PUBLIC_API_URL=http://localhost:3001
const API_URL = process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:3001";
const DEV_BYPASS_TOKEN = "devtoken";

export default function LoginScreen() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  const setJwt = useStore((s) => s.setJwt);
  // =====================
  // WARNING: DEV MODE ONLY!
  // Use signIn from useAuth for auth bypass. Remove this shortcut in production!
  // =====================
  const { signIn } = useAuth();

  const login = async () => {
    setError("");
    try {
      const res = await fetch(`${API_URL}/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data?.error ?? "Login failed");
        return;
      }

      // adjust key name to whatever your server returns
      const jwt = data?.jwt ?? data?.token;
      if (!jwt) {
        setError("No token returned from server");
        return;
      }

      // =====================
      // WARNING: DEV MODE ONLY!
      // Use signIn to set auth state. In production, use the real JWT from server.
      // =====================
      setJwt(jwt); // This line is redundant if signIn is used everywhere
      signIn(jwt); // <--- Use this for both dev and prod, but ensure jwt is real in prod
    } catch (e) {
      setError("Cannot reach server");
    }
  };

  const bypassLoginForDev = () => {
    signIn(DEV_BYPASS_TOKEN);
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>SkyTalk</Text>

      <TextInput
        placeholder="Username"
        placeholderTextColor="#888"
        value={username}
        onChangeText={setUsername}
        autoCapitalize="none"
        style={styles.input}
      />

      <TextInput
        placeholder="Password"
        placeholderTextColor="#888"
        value={password}
        onChangeText={setPassword}
        secureTextEntry
        style={styles.input}
      />

      {error ? <Text style={styles.error}>{error}</Text> : null}

      <Pressable onPress={login} style={styles.button}>
        <Text style={styles.buttonText}>Connect</Text>
      </Pressable>

      {__DEV__ ? (
        <Pressable onPress={bypassLoginForDev} style={[styles.button, styles.devButton]}>
          <Text style={styles.buttonText}>Dev Bypass</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
    backgroundColor: "#0A1628",
    gap: 12,
  },
  title: { color: "white", fontSize: 32, fontWeight: "800", marginBottom: 8 },
  input: {
    width: 280,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#2B3A55",
    color: "white",
    backgroundColor: "#111B2E",
  },
  button: {
    marginTop: 8,
    paddingVertical: 12,
    paddingHorizontal: 30,
    borderRadius: 10,
    backgroundColor: "#0D6EFD",
  },
  devButton: {
    backgroundColor: "#4A5568",
  },
  buttonText: { color: "white", fontSize: 16, fontWeight: "700" },
  error: { color: "#ff6b6b", marginTop: 4 },
});
