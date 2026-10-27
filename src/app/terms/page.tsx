import Link from "next/link";
import { contactLine, LegalPage } from "@/components/legal";
import { env } from "@/server/env";

export const metadata = { title: "Terms of Service" };
export const dynamic = "force-dynamic";

export default function TermsPage() {
  const e = env();
  const name = e.LEGAL_ENTITY_NAME;
  const contact = contactLine(e.SUPPORT_EMAIL, name);
  return (
    <LegalPage
      title="Terms of Service"
      intro={
        <>
          These terms govern your use of the FLOWT service operated by {name} (&quot;we&quot;, &quot;us&quot;). By creating an account or using the service you agree to them. If you
          use FLOWT for an organisation, you confirm you may accept these terms on its behalf.
        </>
      }
    >
      <section>
        <h2>1. The service</h2>
        <p>
          FLOWT helps you draft social media content (optionally with AI), extract facts from documents you upload, and publish or schedule posts to social accounts you connect
          (currently LinkedIn, Instagram and X) through those platforms&apos; official APIs.
        </p>
      </section>
      <section>
        <h2>2. Your account</h2>
        <ul>
          <li>Provide accurate information and keep your credentials secure. You are responsible for activity under your account.</li>
          <li>You must be at least 16 years old, or the age of digital consent where you live, whichever is higher.</li>
          <li>Workspace owners and admins control who can publish on behalf of the workspace.</li>
        </ul>
      </section>
      <section>
        <h2>3. Connected social accounts</h2>
        <ul>
          <li>You may only connect accounts you own or are authorised to manage. We never ask for your social media passwords; connections use each platform&apos;s official authorisation.</li>
          <li>You authorise us to publish the content you approve or schedule, to the accounts you select, at the times you choose, and to read the data those permissions allow (such as profile details and post metrics).</li>
          <li>
            Your use of each platform remains subject to its own terms and policies: the{" "}
            <a href="https://www.linkedin.com/legal/user-agreement" target="_blank" rel="noreferrer">
              LinkedIn User Agreement
            </a>
            ,{" "}
            <a href="https://help.instagram.com/581066165581870" target="_blank" rel="noreferrer">
              Instagram Terms of Use
            </a>{" "}
            and{" "}
            <a href="https://x.com/en/tos" target="_blank" rel="noreferrer">
              X Terms of Service
            </a>
            . You are responsible for complying with them, including rules on automation, spam and disclosures.
          </li>
          <li>Platforms may change or limit their APIs, permissions, rate limits or pricing at any time. We can&apos;t guarantee any post will be accepted or published, and features may change accordingly.</li>
          <li>You can disconnect an account at any time from the Accounts page or from the platform&apos;s own settings.</li>
        </ul>
      </section>
      <section>
        <h2>4. Your content</h2>
        <ul>
          <li>You keep ownership of the content, documents and media you submit and the posts you publish.</li>
          <li>You grant us a limited licence to host, process, transform (for example resizing images to platform requirements) and transmit that content solely to provide the service to you.</li>
          <li>You are solely responsible for what you publish. That includes AI-assisted text, which you must review before publishing.</li>
          <li>You must have the rights to anything you upload, and you must not upload other people&apos;s private documents without their permission.</li>
        </ul>
      </section>
      <section>
        <h2>5. AI features</h2>
        <ul>
          <li>AI suggestions may be inaccurate or incomplete. FLOWT flags figures that don&apos;t appear in your source, but you must check every fact, name, date and claim before publishing.</li>
          <li>Extracting text from a certificate or document does not verify that the document is authentic.</li>
          <li>When you use AI features, the content you submit is processed by third-party AI providers as described in our <Link href="/privacy">Privacy Policy</Link>.</li>
          <li>We do not promise that text will be undetectable as AI-assisted.</li>
        </ul>
      </section>
      <section>
        <h2>6. Acceptable use</h2>
        <p>You must not use FLOWT to:</p>
        <ul>
          <li>publish unlawful, defamatory, harassing, hateful, sexually exploitative or deceptive content, or misinformation intended to mislead;</li>
          <li>impersonate others, make false claims about qualifications or achievements, or forge or misrepresent documents;</li>
          <li>send spam, run fake engagement, or evade platform limits, rate limits or enforcement;</li>
          <li>infringe intellectual property or privacy rights;</li>
          <li>attack, probe, reverse engineer or overload the service, or extract data from other workspaces.</li>
        </ul>
        <p>We may suspend accounts or remove content that breaks these rules or platform policies.</p>
      </section>
      <section>
        <h2>7. Plans and limits</h2>
        <p>
          Usage is subject to the limits of your plan (for example AI requests, documents, publishing jobs, connected accounts and storage). We may change plans with reasonable notice. Paid
          plans, when offered, will be governed by the pricing and payment terms shown at purchase.
        </p>
      </section>
      <section>
        <h2>8. Availability and changes</h2>
        <p>
          We work to keep FLOWT reliable, but the service is provided &quot;as is&quot; and &quot;as available&quot;. Scheduled posts can be delayed or fail for reasons outside our control (for
          example platform outages, revoked permissions or expired connections). We show the outcome of every publishing attempt in your history and never mark a post as published unless the
          platform confirms it.
        </p>
      </section>
      <section>
        <h2>9. Termination</h2>
        <p>
          You may delete your account at any time in Settings → Account &amp; security. We may suspend or terminate access for material breach of these terms or where required by law or by a
          platform. On deletion we remove your data as described in the Privacy Policy.
        </p>
      </section>
      <section>
        <h2>10. Disclaimers and liability</h2>
        <p>
          To the fullest extent permitted by law, we disclaim implied warranties, and we are not liable for indirect, incidental, special, consequential or punitive damages, or for lost profits,
          reputation or data, arising from your use of the service or content published through it. Our total liability for any claim is limited to the amount you paid us for the service in the
          12 months before the claim, or USD 100 if you have not paid. Nothing in these terms limits liability that cannot be limited by law.
        </p>
      </section>
      <section>
        <h2>11. Governing law</h2>
        <p>These terms are governed by the laws of {e.LEGAL_JURISDICTION}, without regard to conflict-of-law rules, unless mandatory consumer law where you live provides otherwise.</p>
      </section>
      <section>
        <h2>12. Changes and contact</h2>
        <p>
          We may update these terms. If changes are material, we will notify you in the app or by email before they take effect. Questions: {contact}.
        </p>
      </section>
    </LegalPage>
  );
}
