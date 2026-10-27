import Link from "next/link";
import { contactLine, LegalPage } from "@/components/legal";
import { env } from "@/server/env";

export const metadata = { title: "Privacy Policy" };
export const dynamic = "force-dynamic";

export default function PrivacyPage() {
  const e = env();
  const name = e.LEGAL_ENTITY_NAME;
  const contact = contactLine(e.SUPPORT_EMAIL, name);
  return (
    <LegalPage title="Privacy Policy" intro={<>This policy explains what personal data {name} collects through FLOWT, why, who processes it, how long we keep it, and the choices you have.</>}>
      <section>
        <h2>1. Data we collect</h2>
        <ul>
          <li>
            <strong className="text-mist">Account data:</strong> name, email, password hash (never the password itself), Google profile basics if you sign in with Google, time zone, and session
            records (IP address, device/browser) for security.
          </li>
          <li>
            <strong className="text-mist">Content you create:</strong> drafts, platform versions, hashtags, links, brand-voice settings and sample posts you provide, media you upload.
          </li>
          <li>
            <strong className="text-mist">Documents you upload:</strong> the file (for example a certificate or letter), its extracted text and the facts you review and confirm.
          </li>
          <li>
            <strong className="text-mist">Connected social accounts:</strong> account ID, name, username, profile picture, granted permissions, and encrypted access/refresh tokens. From the
            platforms we read only what your granted permissions allow: profile basics, the IDs and links of posts we publish for you, and post metrics where available.
          </li>
          <li>
            <strong className="text-mist">Usage and logs:</strong> feature usage counts (for plan limits), publishing outcomes, audit logs of sensitive actions, and technical logs. Logs exclude
            tokens, passwords and document text.
          </li>
        </ul>
      </section>
      <section>
        <h2>2. How we use it</h2>
        <ul>
          <li>To provide the service: authenticate you, generate and edit drafts, extract facts from documents, publish and schedule posts, show analytics and notifications.</li>
          <li>To keep it secure and reliable: prevent abuse, enforce limits, debug failures, and keep audit trails.</li>
          <li>To communicate with you about your account (verification, password resets, important changes).</li>
        </ul>
        <p>We do not sell personal data, use it for advertising, or use your content or documents to train AI models.</p>
      </section>
      <section>
        <h2>3. AI processing</h2>
        <p>
          AI features run only when you use them. The text you submit (ideas, drafts, sample posts) is sent to <strong className="text-mist">Groq</strong> and/or{" "}
          <strong className="text-mist">Google Gemini</strong>. Documents you upload, after you consent, are processed by <strong className="text-mist">Google Gemini</strong> only, and are
          never re-routed to another provider. These providers process the data under their own API terms to return results to us.
        </p>
      </section>
      <section>
        <h2>4. Social platform data</h2>
        <p>
          Data received from LinkedIn, Instagram (Meta) and X APIs is used only to provide features you request: publishing, showing connection status, and showing post performance. It is not shared
          with other users outside your workspace, not sold, and not used to build profiles. Tokens are encrypted at rest (AES-256-GCM) and never sent to your browser. You can disconnect at any time;
          disconnecting deletes the stored tokens immediately.
        </p>
      </section>
      <section>
        <h2>5. Processors and sharing</h2>
        <p>We share data only with service providers who process it on our behalf to run FLOWT:</p>
        <ul>
          <li>Hosting, database, queue and file storage providers used by the operator of this instance;</li>
          <li>AI providers: Groq and Google (Gemini API);</li>
          <li>Email delivery: Resend (if enabled);</li>
          <li>The social platforms you choose to publish to (LinkedIn, Meta/Instagram, X), which receive the content you publish.</li>
        </ul>
        <p>We may disclose data if required by law or to protect rights and safety.</p>
      </section>
      <section>
        <h2>6. Retention</h2>
        <ul>
          <li>Uploaded document files are deleted automatically after your workspace&apos;s retention period (30 days by default, adjustable in Settings). Facts you confirmed are kept until you delete the document.</li>
          <li>Content, media and publishing history are kept until you delete them or your account.</li>
          <li>Social tokens are kept while an account is connected and deleted on disconnect.</li>
          <li>Security and audit logs are kept for as long as needed for security and legal obligations.</li>
        </ul>
      </section>
      <section>
        <h2>7. Your rights and choices</h2>
        <ul>
          <li>Access and export: download your workspace data as JSON in Settings.</li>
          <li>Deletion: delete documents, media and posts individually, or delete your whole account in Settings → Account &amp; security.</li>
          <li>Disconnect social accounts on the Accounts page or in each platform&apos;s app settings.</li>
          <li>
            Depending on where you live (for example under the GDPR or similar laws) you may also have rights to rectification, restriction, objection and to complain to a supervisory authority.
            Contact us at {contact}.
          </li>
        </ul>
        <p>
          To request deletion of data received from Instagram, see <Link href="/data-deletion">Data deletion instructions</Link>.
        </p>
      </section>
      <section>
        <h2>8. Cookies</h2>
        <p>We use only essential cookies: your sign-in session and your selected workspace. We do not use advertising or third-party tracking cookies.</p>
      </section>
      <section>
        <h2>9. Security</h2>
        <p>
          Encryption in transit (HTTPS) and of social tokens at rest, private file storage with short-lived signed links, workspace isolation, role-based access, rate limiting and audit logs. No
          system is perfectly secure; we will notify you of breaches as required by law.
        </p>
      </section>
      <section>
        <h2>10. Children</h2>
        <p>FLOWT is not intended for children under 16, and we do not knowingly collect their data.</p>
      </section>
      <section>
        <h2>11. Changes and contact</h2>
        <p>We will post updates here and notify you of material changes. Contact: {contact}.</p>
      </section>
    </LegalPage>
  );
}
