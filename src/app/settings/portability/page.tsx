import { getSettingsBootstrap, SettingsShell } from "../_lib";
import { WorkspacePortability } from "@/components/portability/workspace-portability";
export default async function Page() {
  const b = await getSettingsBootstrap();
  return (
    <SettingsShell
      bootstrap={b}
      title="Imports and workspace portability"
      path="/settings/portability"
    >
      <WorkspacePortability />
    </SettingsShell>
  );
}
