"use client";

import { createContext, useContext, useState, type ReactNode } from "react";
import Link from "next/link";
import { ClerkProvider, UserButton, useAuth } from "@clerk/nextjs";
import { ConvexReactClient, useConvexAuth, useMutation, useQuery } from "convex/react";
import { ConvexProviderWithClerk } from "convex/react-clerk";
import type { PatientSpace } from "@mnemo/contracts";
import { demoSpace, DEMO_TODAY } from "@mnemo/contracts/demo";
import { localDate } from "@mnemo/contracts/time";
import { api, type PatientInfo } from "@/lib/api";
import { ArrowRight, Leaf, ShieldCheck } from "lucide-react";
import { appMode } from "@/lib/app-mode";

export interface SegmentUpload { blob: Blob; sequence: number; capturedAt: number; endedAt: number }
interface Workspace {
  mode: "demo" | "live";
  space: PatientSpace;
  today: string;
  patients: PatientInfo[];
  selectPatient: (id: string) => void;
  deleteConversation: (id: string) => Promise<void>;
  resetDemo?: () => void;
  account: ReactNode;
  beginSession: () => Promise<string>;
  setSessionState: (id: string, state: "recording" | "paused" | "interrupted" | "stopped") => Promise<void>;
  uploadSegment: (sessionId: string, segment: SegmentUpload) => Promise<void>;
}

const WorkspaceContext = createContext<Workspace | null>(null);
export function useWorkspace() {
  const value = useContext(WorkspaceContext);
  if (!value) throw new Error("Workspace provider missing.");
  return value;
}

function DemoProvider({ children }: { children: ReactNode }) {
  const [space, setSpace] = useState<PatientSpace>(demoSpace);
  return <WorkspaceContext.Provider value={{
    mode: "demo", space, today: DEMO_TODAY,
    patients: [{ id: space.id, name: space.name, timezone: space.timezone, capabilities: space.capabilities }],
    selectPatient: () => {},
    deleteConversation: async (id) => setSpace((current) => ({ ...current, conversations: current.conversations.filter((item) => item.id !== id), memories: current.memories.filter((item) => item.conversationId !== id) })),
    resetDemo: () => setSpace(demoSpace),
    account: <Link href="/login" className="avatar avatar-ink" aria-label="Account and sign in" title="Fictional family member · Daniel Okafor">DO</Link>,
    beginSession: async () => crypto.randomUUID(),
    setSessionState: async () => {},
    uploadSegment: async () => { throw new Error("Demo recordings stay on this device. Connect Convex to upload."); },
  }}>{children}</WorkspaceContext.Provider>;
}

function LiveSpace({ patientId, patients, selectPatient, children }: { patientId: string; patients: PatientInfo[]; selectPatient: (id: string) => void; children: ReactNode }) {
  const space = useQuery(api.space, { patientId });
  const remove = useMutation(api.deleteConversation);
  const begin = useMutation(api.startRecording);
  const setState = useMutation(api.recordingState);
  const { getToken } = useAuth();
  if (!space) return <Gate title="Opening your memory space…" />;
  return <WorkspaceContext.Provider value={{
    mode: "live", space, today: localDate(new Date(), space.timezone), patients, selectPatient,
    account: <UserButton />,
    deleteConversation: async (conversationId) => { await remove({ conversationId }); },
    beginSession: () => begin({ patientId, participantsConsented: true }),
    setSessionState: async (sessionId, state) => { await setState({ sessionId, state }); },
    uploadSegment: async (sessionId, segment) => {
      const token = await getToken({ template: "convex" });
      if (!token) throw new Error("Your session ended. Sign in before uploading.");
      const origin = process.env.NEXT_PUBLIC_CONVEX_SITE_URL;
      if (!origin) throw new Error("Convex HTTP URL is not configured.");
      const url = new URL("/audio", origin);
      for (const [key, value] of Object.entries({ sessionId, sequence: segment.sequence, capturedAt: segment.capturedAt, endedAt: segment.endedAt })) url.searchParams.set(key, String(value));
      const response = await fetch(url, { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": segment.blob.type }, body: segment.blob, cache: "no-store" });
      if (!response.ok) throw new Error("Upload failed. Keep this page open and try again.");
    },
  }}>{children}</WorkspaceContext.Provider>;
}

function LiveGate({ children }: { children: ReactNode }) {
  const { isLoaded, isSignedIn } = useAuth();
  const { isLoading: authLoading, isAuthenticated } = useConvexAuth();
  const patients = useQuery(api.patients, isAuthenticated ? {} : "skip");
  const family = useQuery(api.voiceProfile, isAuthenticated ? {} : "skip");
  const [selected, setSelected] = useState<string>();
  if (!isLoaded) return <Gate title="A moment for your memories…" />;
  if (!isSignedIn) return <Gate title="Your memories. Your space." description="Sign in to open your private memory bank. Only people you authorize can access it."><div className="button-group"><Link href="/login" className="btn btn-primary">Log in <ArrowRight size={17} /></Link><Link href="/signup" className="btn btn-quiet">Create an account</Link></div></Gate>;
  if (authLoading) return <Gate title="Connecting securely…" />;
  if (!isAuthenticated) return <Gate title="Your memory connection needs attention." description="Your account is signed in, but Convex could not authenticate it. Check the Clerk convex JWT template and deployment issuer configuration."><UserButton /></Gate>;
  if (!patients || !family) return <Gate title="Finding your memory space…" />;
  if (!patients.length && family.profile) return <Gate title="You’re part of the circle." description="Your family account is ready. A patient-space administrator still needs to give your account access. Creating an account or a voice profile never grants access to someone’s memories. Invitation management isn’t connected in this prototype."><div className="button-group"><Link href="/signup/voice" className="btn btn-primary">Manage my voice profile <ArrowRight size={17} /></Link><UserButton /></div></Gate>;
  if (!patients.length) return <Onboarding />;
  const patientId = patients.find((patient) => patient.id === selected)?.id ?? patients[0].id;
  return <LiveSpace key={patientId} patientId={patientId} patients={patients} selectPatient={setSelected}>{children}</LiveSpace>;
}

function Onboarding() {
  const createPatient = useMutation(api.createPatient);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  return <Gate title="A little introduction." description="Create your own patient space. For this prototype, use a fictional name and consented test audio only.">
    <form className="onboarding-form" onSubmit={async (event) => {
      event.preventDefault(); setBusy(true); setError("");
      const data = new FormData(event.currentTarget);
      try { await createPatient({ name: String(data.get("name")), timezone: String(data.get("timezone")), recordingConsent: data.get("consent") === "on" }); }
      catch { setError("We couldn’t create your space. Check your details and try again."); }
      finally { setBusy(false); }
    }}>
      <label>Your display name<input name="name" required minLength={2} maxLength={100} placeholder="e.g. Margaret Okafor" /></label>
      <label>Your timezone<input name="timezone" required defaultValue={Intl.DateTimeFormat().resolvedOptions().timeZone} /></label>
      <div className="notice"><ShieldCheck size={20} /><p>Audio playback expires after 7 days; a periodic job deletes the files. Transcripts remain until deleted. Cloud processing is not end-to-end encrypted. This prototype is not a medical service.</p></div>
      <label className="check-label"><input type="checkbox" name="consent" required /><span>I understand this processing and consent to test recordings. Everyone in each conversation must also agree.</span></label>
      {error && <p role="alert" className="error-text">{error}</p>}
      <button className="btn btn-primary" disabled={busy}>{busy ? "Creating…" : "Create my space"}<ArrowRight size={17} /></button>
    </form>
  </Gate>;
}

export function Gate({ title, description, children }: { title: string; description?: string; children?: ReactNode }) {
  return <main className="gate"><Link className="wordmark" href="/"><Leaf size={23} />mnemo.</Link><p className="eyebrow">YOUR MEMORIES, ALWAYS WITHIN REACH.</p><h1>{title}</h1>{description && <p className="gate-description">{description}</p>}{children}</main>;
}

function configuredClient() {
  if (appMode !== "live" || !process.env.NEXT_PUBLIC_CONVEX_URL) return null;
  try { return new ConvexReactClient(process.env.NEXT_PUBLIC_CONVEX_URL); }
  catch { return null; }
}
const convex = configuredClient();
export function AppProviders({ children }: { children: ReactNode }) {
  if (appMode === "demo") return <DemoProvider>{children}</DemoProvider>;
  if (appMode === "invalid") return <Gate title="Choose a valid app mode." description="NEXT_PUBLIC_APP_MODE must be demo or live. An invalid configuration never silently opens a different data source." />;
  if (!convex || !process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY) return <Gate title="Your live connection isn’t configured." description="Set the Clerk and Convex variables in apps/web/.env.local, or explicitly select demo mode. Private data is never replaced with demo data after a connection error." />;
  return <ClerkProvider signInUrl="/login" signUpUrl="/signup" signInFallbackRedirectUrl="/family/overview" signUpFallbackRedirectUrl="/signup/voice"><ConvexProviderWithClerk client={convex} useAuth={useAuth}>{children}</ConvexProviderWithClerk></ClerkProvider>;
}

// Public auth/onboarding routes need identity/backend providers, not a patient workspace.
export function WorkspaceProvider({ children }: { children: ReactNode }) {
  if (appMode !== "live") return children;
  return <LiveGate>{children}</LiveGate>;
}
