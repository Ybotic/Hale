import { useAuth, useUser } from "@clerk/expo";
import { APP_NAME } from "@care/shared";
import { useQuery } from "convex/react";
import { Link } from "expo-router";
import { useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { api } from "../../../convex/_generated/api";
import { PairingScreen } from "../src/components/PairingScreen";
import { VoiceChat } from "../src/components/VoiceChat";

export default function HomeScreen() {
  const { isLoaded, isSignedIn, signOut } = useAuth();
  const { user } = useUser();
  const [paired, setPaired] = useState(false);
  const role = user?.publicMetadata.haleRole;
  const hasSeniorProfile = useQuery(api.users.hasCurrentSeniorProfile, role === "senior" ? {} : "skip");

  if (!isLoaded) return <View style={styles.center}><ActivityIndicator color="#246d63" /></View>;
  if (!isSignedIn) return <View style={styles.screen}>
    <Text style={styles.brand}>{APP_NAME}</Text><Text style={styles.title}>A friendly voice, whenever you need it.</Text>
    <Text style={styles.copy}>Speak with {APP_NAME} and hear a calm, personal reply.</Text>
    <Link href="/sign-in" asChild><Pressable style={styles.button}><Text style={styles.buttonText}>Sign in</Text></Pressable></Link>
    <Link href="/sign-up" asChild><Pressable style={styles.secondary}><Text style={styles.secondaryText}>Create an account</Text></Pressable></Link>
  </View>;

  if ((role === "senior" && hasSeniorProfile === true) || paired) return <VoiceChat />;
  if (role === "caregiver") return <View style={styles.center}>
    <Text style={styles.title}>Caregiver account</Text><Text style={styles.copy}>Use the {APP_NAME} caregiver dashboard to manage profiles.</Text>
    <Pressable onPress={() => void signOut()} style={styles.secondary}><Text style={styles.secondaryText}>Sign out</Text></Pressable>
  </View>;
  if (role === "senior" && hasSeniorProfile === undefined) return <View style={styles.center}><ActivityIndicator color="#246d63" /></View>;
  return <PairingScreen onPaired={() => setPaired(true)} />;
}

const styles = StyleSheet.create({
  screen: { backgroundColor: "#f5faf9", flex: 1, justifyContent: "center", padding: 28 },
  center: { alignItems: "center", backgroundColor: "#f5faf9", flex: 1, justifyContent: "center", padding: 28 },
  brand: { color: "#246d63", fontSize: 24, fontWeight: "800", marginBottom: 30 },
  title: { color: "#163b38", fontSize: 31, fontWeight: "700", lineHeight: 40 },
  copy: { color: "#536b67", fontSize: 17, lineHeight: 25, marginTop: 12 },
  button: { alignItems: "center", backgroundColor: "#246d63", borderRadius: 12, marginTop: 28, padding: 16 },
  buttonText: { color: "white", fontSize: 18, fontWeight: "700" },
  secondary: { alignItems: "center", padding: 16, marginTop: 5 },
  secondaryText: { color: "#246d63", fontSize: 16, fontWeight: "600" },
});
