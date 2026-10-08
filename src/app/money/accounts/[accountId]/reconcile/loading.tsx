import { Panel } from "@/components/ui/panel";
export default function Loading() {
  return (
    <Panel
      title="Loading account reconciliation"
      description="Preparing account balances and comparison history."
    >
      <p role="status">Loading...</p>
    </Panel>
  );
}
