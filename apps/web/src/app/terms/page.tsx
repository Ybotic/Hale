import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, ArrowRight } from "lucide-react";
import styles from "./terms.module.css";

export const metadata: Metadata = {
  title: "Terms of Service",
  description: "Terms for using Hale’s patient and family memory-support service.",
};

export default function TermsPage() {
  return <main className={styles.page}>
    <Link className={styles.backLink} href="/signup"><ArrowLeft aria-hidden size={18} />Back to sign up</Link>
    <article className={styles.document}>
      <header className={styles.header}>
        <p className="eyebrow">Hale · Service terms</p>
        <h1>Terms of Service</h1>
        <p className={styles.effectiveDate}>Effective October 18, 2026</p>
        <p className={styles.lead}>These terms explain how you may use Hale’s personal memory-support tools for patients and families. Please read them before creating an account.</p>
      </header>

      <section>
        <h2>1. Agreement and who may use Hale</h2>
        <p>By creating an account or using Hale, you agree to these Terms. If you use Hale for another person or help manage their patient space, you confirm that you are authorized to do so and will follow that person’s choices and applicable law.</p>
      </section>

      <section>
        <h2>2. What Hale does—and does not do</h2>
        <p>Hale helps people keep care conversations, notes, and everyday details organized and easier to revisit. Hale is not a medical service and does not diagnose, treat, monitor, or prevent any condition. It does not replace a clinician, pharmacist, emergency service, or official medical record. Do not rely on Hale for urgent care or medication decisions; contact a qualified professional when you need medical guidance.</p>
      </section>

      <section>
        <h2>3. Accounts, invitations, and access</h2>
        <p>Keep your sign-in credentials secure and use your own account. Creating a family account or profile does not grant access to another person’s patient space. Access requires an invitation and the permissions assigned to your membership. Do not share, bypass, or attempt to expand access beyond those permissions.</p>
      </section>

      <section>
        <h2>4. Recording and information you provide</h2>
        <p>You are responsible for the audio, text, images, and records you submit. Before recording or uploading another person’s information, obtain their clear agreement and any permission required by law. Do not use Hale for covert recording or submit information you are not authorized to share. You retain your rights to the information you provide.</p>
      </section>

      <section>
        <h2>5. Storage and external processing</h2>
        <p>Hale stores information to provide the features you use. Raw audio is retained under the patient space’s retention settings, which are designed for a period of up to seven days; transcripts and saved memories remain until they are deleted according to the available controls. Cloud processing is not end-to-end encrypted.</p>
        <p>Live patient Ask Hale automatically sends each message and relevant source-bound recall results—including saved-conversation excerpts and Care &amp; Tasks records when available—to OpenRouter to generate an answer. If OpenRouter is unavailable, the online answer may not be available. When you choose a voice feature, voice-message audio is sent to ElevenLabs for transcription, spoken replies are sent to ElevenLabs for speech generation, and continuous voice may send audio to your browser’s speech-recognition provider. Audio is only captured or sent when you start a voice feature. Family Ask Hale sends relevant excerpts to OpenRouter only when online answers are selected; otherwise it forms answers locally. Demo spaces use fictional examples locally. Speaker matching and voice-profile enrollment require separate consent where presented. Other external-service features, such as medication-PDF extraction, are used when you choose them.</p>
      </section>

      <section>
        <h2>6. Connected services and demo data</h2>
        <p>Some features link to third-party services, such as appointment scheduling, ride planning, cloud processing, or financial-data sandboxes. Those services have their own terms and privacy practices. Hale does not automatically book rides or appointments. Nessie care-cost actions use sandbox data and do not move real money.</p>
        <p>Demo spaces contain fictional examples. Do not treat demo names, conversations, schedules, account balances, or PDFs as real patient or financial information.</p>
      </section>

      <section>
        <h2>7. Acceptable use</h2>
        <p>Use Hale lawfully and respectfully. Do not interfere with the service, access another person’s information without permission, upload harmful or unlawful content, or use Hale to make decisions that should be made by a qualified professional.</p>
      </section>

      <section>
        <h2>8. Service availability and changes</h2>
        <p>Hale may change, suspend, or discontinue features to maintain or improve the service. We may update these Terms when the service or applicable requirements change. The effective date above identifies the current version. Continued use after updated Terms take effect means you accept them; if you do not agree, stop using Hale.</p>
      </section>

      <section>
        <h2>9. Disclaimers and limits</h2>
        <p>Hale is provided “as is” and “as available” to the extent permitted by law. Transcripts, summaries, extracted details, and answers may be incomplete or incorrect; check important information against its original source. To the extent permitted by law, Hale is not responsible for indirect or consequential loss arising from use of the service. Nothing in these Terms limits rights or liability that cannot legally be limited.</p>
      </section>

      <section>
        <h2>10. Ending use and questions</h2>
        <p>You may stop using Hale at any time and use the available controls to delete records. Access may be suspended if these Terms are materially violated or needed to protect users or the service. For questions about these Terms or account access, contact the person or organization that provided your Hale account.</p>
      </section>

      <footer className={styles.footer}>
        <p>By signing up, you confirm that you have read and agree to these Terms of Service.</p>
        <Link href="/signup">Family sign up<ArrowRight aria-hidden size={17} /></Link>
        <Link href="/signup/patient">Patient sign up<ArrowRight aria-hidden size={17} /></Link>
      </footer>
    </article>
  </main>;
}
