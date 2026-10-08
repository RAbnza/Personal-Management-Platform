import Link from "next/link";
import { FeedbackDraft } from "@/components/help/feedback-draft";
import { getServerEnvironment } from "@/platform/env/server";
import { getSettingsBootstrap, SettingsShell } from "../../settings/_lib";
export default async function SupportPage() {
  const b = await getSettingsBootstrap();
  return (
    <SettingsShell
      bootstrap={b}
      title="Support and feedback"
      path="/help/support"
    >
      <Link href="/help" className="text-link underline">
        Back to Help
      </Link>
      <FeedbackDraft email={getServerEnvironment().SUPPORT_EMAIL ?? null} />
    </SettingsShell>
  );
}
