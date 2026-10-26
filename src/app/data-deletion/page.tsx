import { contactLine, LegalPage } from "@/components/legal";
import { env } from "@/server/env";
import { deletionStatus } from "@/server/meta/service";

export const metadata = { title: "Data deletion" };
export const dynamic = "force-dynamic";

export default async function DataDeletionPage({ searchParams }: { searchParams: Promise<{ code?: string }> }) {
  const e = env();
  const { code } = await searchParams;
  const status = code ? await deletionStatus(code).catch(() => null) : null;
  const contact = contactLine(e.SUPPORT_EMAIL, e.LEGAL_ENTITY_NAME);
  return (
    <LegalPage title="Data deletion" intro="How to delete the data Verdant holds about you, including data received from Instagram, LinkedIn and X.">
      {code && (
        <section className="rounded-xl border border-white/10 bg-black/25 p-4">
          <h2>Request status</h2>
          {status ? (
            <p>
              Request <code className="text-mist">{code}</code> was completed on {new Date(status.createdAt).toUTCString()}. All data we received from the Instagram account in that request
              was deleted: the connected-account record, its tokens, and its publishing history and metrics.
            </p>
          ) : (
            <p>
              We couldn&apos;t find a request with code <code className="text-mist">{code}</code>. Check the code or contact {contact}.
            </p>
          )}
        </section>
      )}
      <section>
        <h2>Delete everything (your Verdant account)</h2>
        <ul>
          <li>Sign in and open Settings → Account &amp; security → Delete my account.</li>
          <li>This permanently deletes your user, the workspaces you solely own, uploaded files, content, publishing history and every connected account&apos;s tokens.</li>
          <li>You can export your data first from Settings → Workspace &amp; privacy.</li>
        </ul>
      </section>
      <section>
        <h2>Disconnect a single social account</h2>
        <ul>
          <li>Open Accounts in Verdant and choose Disconnect. Stored tokens are deleted immediately and revoked where the platform supports it.</li>
          <li>
            Or remove access from the platform: Instagram → Settings → Apps and websites; LinkedIn → Settings → Data privacy → Permitted services; X → Settings → Security and account access → Apps and
            sessions.
          </li>
        </ul>
      </section>
      <section>
        <h2>Instagram (Meta) deletion requests</h2>
        <p>
          If you remove Verdant from your Instagram settings and request data deletion, Meta notifies us automatically. We then delete everything we received from that Instagram account and
          give you a confirmation code. You can check its status on this page.
        </p>
      </section>
      <section>
        <h2>By email</h2>
        <p>You can also request deletion by contacting {contact} from the email address on your account. We complete requests within 30 days.</p>
      </section>
    </LegalPage>
  );
}
