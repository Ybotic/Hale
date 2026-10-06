import { useAuth, useSignIn } from "@clerk/expo";
import { Link, useRouter } from "expo-router";
import { useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";

export default function SignInScreen() {
  const { signIn, fetchStatus } = useSignIn();
  const { isLoaded } = useAuth();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const busy = fetchStatus === "fetching";

  async function submit() {
    if (!isLoaded) return;
    setError("");
    try {
      const { error: signInError } = await signIn.password({ emailAddress: email.trim(), password });
      if (signInError) throw new Error(signInError.message);
      if (signIn.status === "complete") {
        await signIn.finalize();
        router.replace("/");
      } else if (signIn.status === "needs_client_trust") {
        await signIn.mfa.sendEmailCode();
      } else if (signIn.status === "needs_second_factor") {
        throw new Error("This account needs an additional verification method that is not enabled in Snow.");
      } else {
        throw new Error("Sign-in could not be completed. Check your email and password.");
      }
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not sign in."); }
  }

  async function verifyDevice() {
    setError("");
    try {
      const { error: verificationError } = await signIn.mfa.verifyEmailCode({ code: code.trim() });
      if (verificationError) throw new Error(verificationError.message);
      if (signIn.status !== "complete") throw new Error("The verification step is not complete yet.");
      await signIn.finalize();
      router.replace("/");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not verify sign-in."); }
  }

  if (!isLoaded) return <View style={styles.screen}><Text style={styles.copy}>Loading…</Text></View>;

  if (signIn.status === "needs_client_trust") return <View style={styles.screen}>
    <Text style={styles.brand}>snow</Text><Text style={styles.title}>Verify your sign-in</Text>
    <TextInput autoCapitalize="none" keyboardType="number-pad" placeholder="Email verification code" style={styles.input} value={code} onChangeText={setCode} />
    {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
    <Pressable disabled={busy} onPress={() => void verifyDevice()} style={styles.button}><Text style={styles.buttonText}>{busy ? "Verifying…" : "Verify"}</Text></Pressable>
  </View>;

  return <View style={styles.screen}>
    <Text style={styles.brand}>snow</Text><Text style={styles.title}>Welcome back</Text>
    <TextInput autoCapitalize="none" autoComplete="email" keyboardType="email-address" placeholder="Email" style={styles.input} value={email} onChangeText={setEmail} />
    <TextInput autoComplete="password" placeholder="Password" secureTextEntry style={styles.input} value={password} onChangeText={setPassword} />
    {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
    <Pressable disabled={busy} onPress={() => void submit()} style={styles.button}><Text style={styles.buttonText}>{busy ? "Signing in…" : "Sign in"}</Text></Pressable>
    <Text style={styles.copy}>New to Snow? <Link href="/sign-up" style={styles.link}>Create an account</Link></Text>
  </View>;
}

const styles = StyleSheet.create({
  screen: { flex: 1, justifyContent: "center", padding: 28, backgroundColor: "#f5faf9" },
  brand: { color: "#246d63", fontSize: 22, fontWeight: "700", marginBottom: 28 },
  title: { color: "#163b38", fontSize: 30, fontWeight: "700", marginBottom: 24 },
  input: { borderColor: "#b7ceca", borderRadius: 10, borderWidth: 1, backgroundColor: "white", fontSize: 17, marginBottom: 14, padding: 15 },
  error: { color: "#a12626", marginBottom: 12 },
  button: { alignItems: "center", backgroundColor: "#246d63", borderRadius: 11, padding: 15 },
  buttonText: { color: "white", fontSize: 17, fontWeight: "700" },
  copy: { color: "#4b625f", marginTop: 20, textAlign: "center" },
  link: { color: "#246d63", fontWeight: "700" },
});
