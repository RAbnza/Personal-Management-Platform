import { getSettingsBootstrap, SettingsShell } from "../_lib";
import { FileCatalog } from "@/components/files/file-catalog";
export default async function Page() {
  const b = await getSettingsBootstrap();
  return (
    <SettingsShell
      bootstrap={b}
      title="Private supporting files"
      path="/settings/files"
    >
      <FileCatalog />
    </SettingsShell>
  );
}
