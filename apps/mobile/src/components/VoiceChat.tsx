import { useMutation, useQuery, useAction } from "convex/react";
import { Audio } from "expo-av";
import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { z } from "zod";
import type { Id } from "../../../../convex/_generated/dataModel";
import { api } from "../../../../convex/_generated/api";
import { DataCard } from "./DataCard";

const uploadResponseSchema = z.object({ storageId: z.string() });

export function VoiceChat() {
  const activeSession = useQuery(api.sessions.current, {});
  const startSession = useMutation(api.sessions.start);
  const endSession = useMutation(api.sessions.end);
  const getUploadUrl = useMutation(api.storage.generateAudioUploadUrl);
  const registerAudioUpload = useMutation(api.storage.registerAudioUpload);
  const processVoiceTurn = useAction(api.voice.processVoiceTurn);
  const [sessionId, setSessionId] = useState<Id<"sessions"> | null>(null);
  const [recording, setRecording] = useState<Audio.Recording | null>(null);
  const [busy, setBusy] = useState(false);
  const [ended, setEnded] = useState(false);
  const [error, setError] = useState("");
  const starting = useRef(false);
  const soundRef = useRef<Audio.Sound | null>(null);
  const seenMessageCount = useRef<number | null>(null);
  const messages = useQuery(api.messages.listForSession, sessionId ? { sessionId } : "skip");

  useEffect(() => {
    if (activeSession?._id) {
      setSessionId(activeSession._id);
      return;
    }
    if (activeSession !== null || ended || starting.current) return;
    starting.current = true;
    void startSession({})
      .then((id) => setSessionId(id))
      .catch((cause: unknown) => setError(cause instanceof Error ? cause.message : "Could not start chat."))
      .finally(() => { starting.current = false; });
  }, [activeSession, ended, startSession]);

  useEffect(() => {
    if (!messages) return;
    if (seenMessageCount.current === null) {
      seenMessageCount.current = messages.length;
      return;
    }
    const newMessages = messages.slice(seenMessageCount.current);
    seenMessageCount.current = messages.length;
    const latestAudio = [...newMessages].reverse().find((message) => message.role === "assistant" && message.audioUrl);
    if (latestAudio?.audioUrl) void playReply(latestAudio.audioUrl);
  }, [messages]);

  useEffect(() => () => {
    if (soundRef.current) void soundRef.current.unloadAsync();
  }, []);

  async function playReply(uri: string) {
    try {
      await Audio.setAudioModeAsync({ allowsRecordingIOS: false, playsInSilentModeIOS: true, shouldDuckAndroid: true });
      if (soundRef.current) await soundRef.current.unloadAsync();
      const { sound } = await Audio.Sound.createAsync({ uri }, { shouldPlay: true });
      soundRef.current = sound;
      sound.setOnPlaybackStatusUpdate((status) => {
        if (status.isLoaded && status.didJustFinish) {
          void sound.unloadAsync();
          soundRef.current = null;
        }
      });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not play reply audio.");
    }
  }

  async function uploadAndProcess(uri: string, currentSessionId: Id<"sessions">) {
    setBusy(true); setError("");
    try {
      const uploadUrl = await getUploadUrl({ sessionId: currentSessionId });
      const localResponse = await fetch(uri);
      if (!localResponse.ok) throw new Error("The recording could not be opened.");
      const audio = await localResponse.blob();
      const uploadResponse = await fetch(uploadUrl, {
        method: "POST",
        headers: { "Content-Type": audio.type || "audio/m4a" },
        body: audio,
      });
      if (!uploadResponse.ok) throw new Error("The recording could not be uploaded.");
      const payload: unknown = await uploadResponse.json();
      const { storageId } = uploadResponseSchema.parse(payload);
      const typedStorageId = storageId as Id<"_storage">;
      await registerAudioUpload({ sessionId: currentSessionId, storageId: typedStorageId });
      await processVoiceTurn({ sessionId: currentSessionId, audioStorageId: typedStorageId });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not send your recording.");
    } finally {
      setBusy(false);
    }
  }

  async function toggleRecording() {
    setError("");
    if (recording) {
      try {
        await recording.stopAndUnloadAsync();
        const uri = recording.getURI();
        setRecording(null);
        if (!uri || !sessionId) throw new Error("The recording was empty.");
        await uploadAndProcess(uri, sessionId);
      } catch (cause) {
        setRecording(null);
        setError(cause instanceof Error ? cause.message : "Could not finish recording.");
      }
      return;
    }
    if (!sessionId || busy || ended) return;
    try {
      const permission = await Audio.requestPermissionsAsync();
      if (!permission.granted) throw new Error("Allow microphone access to speak with Snow.");
      await Audio.setAudioModeAsync({ allowsRecordingIOS: true, playsInSilentModeIOS: true, shouldDuckAndroid: true });
      const nextRecording = new Audio.Recording();
      await nextRecording.prepareToRecordAsync(Audio.RecordingOptionsPresets.HIGH_QUALITY);
      await nextRecording.startAsync();
      setRecording(nextRecording);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not start recording.");
    }
  }

  async function finishChat() {
    if (!sessionId) return;
    setBusy(true); setError("");
    setEnded(true);
    try {
      if (recording) {
        await recording.stopAndUnloadAsync();
        setRecording(null);
      }
      await endSession({ sessionId });
      setEnded(true);
    } catch (cause) {
      setEnded(false);
      setError(cause instanceof Error ? cause.message : "Could not end chat.");
    } finally { setBusy(false); }
  }

  async function newChat() {
    setEnded(false); setSessionId(null); seenMessageCount.current = null;
    try { setSessionId(await startSession({})); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Could not start another chat."); }
  }

  return <View style={styles.screen}>
    <View style={styles.header}><View><Text style={styles.brand}>snow</Text><Text style={styles.subtitle}>I’m here to help.</Text></View>{!ended && <Pressable disabled={busy || !sessionId} onPress={() => void finishChat()} style={styles.endButton}><Text style={styles.endText}>End chat</Text></Pressable>}</View>
    <ScrollView contentContainerStyle={styles.messages}>
      {messages?.map((message) => <View key={message._id} style={[styles.bubble, message.role === "user" ? styles.userBubble : styles.assistantBubble]}>
        <Text style={styles.messageText}>{message.text}</Text>
        {message.card ? <DataCard card={message.card} /> : null}
        {message.role === "assistant" && message.audioUrl ? <Text style={styles.audioHint}>Playing voice reply…</Text> : null}
      </View>)}
      {busy && <View style={styles.loading}><ActivityIndicator color="#246d63" /><Text style={styles.loadingText}>Snow is listening…</Text></View>}
      {ended && <View style={styles.ended}><Text style={styles.endedText}>Chat ended.</Text><Pressable onPress={() => void newChat()} style={styles.newChatButton}><Text style={styles.newChatText}>Start a new chat</Text></Pressable></View>}
    </ScrollView>
    {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
    {!ended && <View style={styles.controls}>
      <Pressable accessibilityRole="button" accessibilityLabel={recording ? "Finish recording and send" : "Start speaking"} disabled={busy || !sessionId} onPress={() => void toggleRecording()} style={[styles.mic, recording && styles.recording, (busy || !sessionId) && styles.disabled]}>
        {busy ? <ActivityIndicator color="white" /> : <Text style={styles.micIcon}>{recording ? "✓" : "🎙"}</Text>}
      </Pressable>
      <Text style={styles.controlCopy}>{recording ? "Tap when you’re finished" : "Tap to talk to Snow"}</Text>
    </View>}
  </View>;
}

const styles = StyleSheet.create({
  screen: { backgroundColor: "#f5faf9", flex: 1, paddingTop: 16 },
  header: { alignItems: "center", flexDirection: "row", justifyContent: "space-between", paddingHorizontal: 20, paddingBottom: 12 },
  brand: { color: "#246d63", fontSize: 25, fontWeight: "800" },
  subtitle: { color: "#536b67", fontSize: 14, marginTop: 2 },
  endButton: { borderColor: "#b7ceca", borderRadius: 10, borderWidth: 1, paddingHorizontal: 13, paddingVertical: 9 },
  endText: { color: "#246d63", fontWeight: "600" },
  messages: { flexGrow: 1, gap: 10, paddingHorizontal: 16, paddingVertical: 10 },
  bubble: { borderRadius: 16, maxWidth: "92%", padding: 14 },
  userBubble: { alignSelf: "flex-end", backgroundColor: "#d9eeea" },
  assistantBubble: { alignSelf: "flex-start", backgroundColor: "white", borderColor: "#e0ebe9", borderWidth: 1 },
  messageText: { color: "#183a37", fontSize: 17, lineHeight: 25 },
  audioHint: { color: "#6c807d", fontSize: 12, marginTop: 7 },
  loading: { alignItems: "center", flexDirection: "row", gap: 9, padding: 12 },
  loadingText: { color: "#536b67", fontSize: 15 },
  ended: { alignItems: "center", gap: 12, padding: 18 },
  endedText: { color: "#214a45", fontSize: 18, fontWeight: "600" },
  newChatButton: { backgroundColor: "#246d63", borderRadius: 10, paddingHorizontal: 16, paddingVertical: 11 },
  newChatText: { color: "white", fontWeight: "700" },
  error: { color: "#a12626", paddingHorizontal: 18, paddingVertical: 6 },
  controls: { alignItems: "center", borderTopColor: "#e0ebe9", borderTopWidth: 1, padding: 16 },
  mic: { alignItems: "center", backgroundColor: "#246d63", borderRadius: 40, height: 78, justifyContent: "center", width: 78 },
  recording: { backgroundColor: "#b63b3b" },
  disabled: { opacity: 0.55 },
  micIcon: { color: "white", fontSize: 31, fontWeight: "700" },
  controlCopy: { color: "#536b67", fontSize: 14, marginTop: 8 },
});
