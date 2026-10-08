import { useAuth, useSignUp } from "@clerk/expo";
import { APP_NAME } from "@care/shared";
import { Link, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";

export default function SignUpScreen() {
  const { signUp, fetchStatus } = useSignUp();
  const { isLoaded, isSignedIn } = useAuth();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [verifying, setVerifying] = useState(false);
  const [error, setError] = useState("");
  const busy = fetchStatus === "fetching";

  useEffect(() => {
    if (isSignedIn) router.replace("/");
  }, [isSignedIn, router]);

  async function beginSignUp() {
    if (!isLoaded) return;
    setError("");
    try {
      const { error: signUpError } = await signUp.password({ emailAddress: email.trim(), password });
      if (signUpError) throw new Error(signUpError.message);
      const { error: sendError } = await signUp.verifications.sendEmailCode();
      if (sendError) throw new Error(sendError.message);
      setVerifying(true);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not create account."); }
  }

  async function verifyEmail() {
    if (!isLoaded) return;
    setError("");
    try {
      const { error: verificationError } = await signUp.verifications.verifyEmailCode({ code: code.trim() });
      if (verificationError) throw new Error(verificationError.message);
      if (signUp.status !== "complete") throw new Error("Email verification could not be completed.");
      await signUp.finalize();
      router.replace("/");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not verify email."); }
  }

  if (!isLoaded) return <View style={styles.screen}><Text style={styles.copy}>Loading…</Text></View>;
  if (isSignedIn) return <View style={styles.screen}><Text style={styles.copy}>Opening {APP_NAME}…</Text></View>;

  return <View style={styles.screen}>
    <Text style={styles.brand}>{APP_NAME}</Text><Text style={styles.title}>{verifying ? "Check your email" : "Create your account"}</Text>
    {!verifying ? <>
      <TextInput autoCapitalize="none" autoComplete="email" keyboardType="email-address" placeholder="Email" style={styles.input} value={email} onChangeText={setEmail} />
      <TextInput autoComplete="new-password" placeholder="Password" secureTextEntry style={styles.input} value={password} onChangeText={setPassword} />
      <Pressable disabled={busy} onPress={() => void beginSignUp()} style={styles.button}><Text style={styles.buttonText}>{busy ? "Creating…" : "Continue"}</Text></Pressable>
    </> : <>
      <Text style={styles.copy}>Enter the verification code sent to {email}.</Text>
      <TextInput autoCapitalize="none" keyboardType="number-pad" placeholder="Email code" style={styles.input} value={code} onChangeText={setCode} />
      <Pressable disabled={busy} onPress={() => void verifyEmail()} style={styles.button}><Text style={styles.buttonText}>{busy ? "Verifying…" : "Verify email"}</Text></Pressable>
    </>}
    {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
    <Text style={styles.copy}>Already have an account? <Link href="/sign-in" style={styles.link}>Sign in</Link></Text>
  </View>;
}

const styles = StyleSheet.create({
  screen: { flex: 1, justifyContent: "center", padding: 28, backgroundColor: "#f5faf9" },
  brand: { color: "#246d63", fontSize: 22, fontWeight: "700", marginBottom: 28 },
  title: { color: "#163b38", fontSize: 30, fontWeight: "700", marginBottom: 24 },
  input: { borderColor: "#b7ceca", borderRadius: 10, borderWidth: 1, backgroundColor: "white", fontSize: 17, marginBottom: 14, padding: 15 },
  error: { color: "#a12626", marginTop: 12 },
  button: { alignItems: "center", backgroundColor: "#246d63", borderRadius: 11, padding: 15 },
  buttonText: { color: "white", fontSize: 17, fontWeight: "700" },
  copy: { color: "#4b625f", marginTop: 20, textAlign: "center" },
  link: { color: "#246d63", fontWeight: "700" },
});
