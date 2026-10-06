import { useAuth, useUser } from "@clerk/expo";
import { useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { z } from "zod";

const responseSchema = z.object({ seniorId: z.string() });
const errorSchema = z.object({ error: z.string() });

export function PairingScreen({ onPaired }: { onPaired: () => void }) {
  const { getToken, signOut } = useAuth();
  const { user } = useUser();
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function claimPairing() {
    setBusy(true); setError("");
    try {
      const apiUrl = process.env.EXPO_PUBLIC_PAIRING_API_URL;
      if (!apiUrl) throw new Error("The pairing service URL is not configured.");
      const token = await getToken({ template: "convex" });
      if (!token) throw new Error("Could not get a sign-in token. Please sign in again.");
      const response = await fetch(apiUrl, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ code: code.trim().toUpperCase() }),
      });
      const payload: unknown = await response.json();
      if (!response.ok) throw new Error(errorSchema.parse(payload).error);
      responseSchema.parse(payload);
      await user?.reload();
      await getToken({ template: "convex", skipCache: true });
      onPaired();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not pair this phone.");
    } finally {
      setBusy(false);
    }
  }

  return <View style={styles.screen}>
    <Text style={styles.brand}>snow</Text>
    <Text style={styles.title}>Pair this phone</Text>
    <Text style={styles.copy}>Ask your caregiver for the short-lived pairing code shown on your profile.</Text>
    <TextInput
      accessibilityLabel="Pairing code"
      autoCapitalize="characters"
      autoCorrect={false}
      maxLength={12}
      placeholder="Enter pairing code"
      style={styles.input}
      value={code}
      onChangeText={setCode}
    />
    {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
    <Pressable accessibilityRole="button" disabled={busy || code.trim().length < 6} onPress={() => void claimPairing()} style={[styles.button, (busy || code.trim().length < 6) && styles.disabled]}>
      {busy ? <ActivityIndicator color="white" /> : <Text style={styles.buttonText}>Pair phone</Text>}
    </Pressable>
    <Pressable accessibilityRole="button" onPress={() => void signOut()} style={styles.secondary}><Text style={styles.secondaryText}>Sign out</Text></Pressable>
  </View>;
}

const styles = StyleSheet.create({
  screen: { flex: 1, justifyContent: "center", padding: 28, backgroundColor: "#f5faf9" },
  brand: { color: "#246d63", fontSize: 22, fontWeight: "700", marginBottom: 30 },
  title: { color: "#163b38", fontSize: 32, fontWeight: "700" },
  copy: { color: "#4b625f", fontSize: 18, lineHeight: 27, marginTop: 12, marginBottom: 24 },
  input: { borderColor: "#b7ceca", borderRadius: 12, borderWidth: 1, backgroundColor: "white", fontSize: 20, letterSpacing: 4, padding: 16, textAlign: "center" },
  error: { color: "#a12626", marginTop: 12 },
  button: { alignItems: "center", backgroundColor: "#246d63", borderRadius: 12, marginTop: 18, padding: 16 },
  disabled: { opacity: 0.55 },
  buttonText: { color: "white", fontSize: 18, fontWeight: "700" },
  secondary: { alignSelf: "center", padding: 16, marginTop: 8 },
  secondaryText: { color: "#246d63", fontWeight: "600" },
});
