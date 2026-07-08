import { Panel } from "../ui/Panel";
import { AssistantConsole } from "../ui/AssistantConsole";

export const dynamic = "force-dynamic";

export default function AssistantPage() {
  return (
    <main className="flex flex-col gap-4">
      <Panel title="ASSISTANT">
        <AssistantConsole />
      </Panel>
    </main>
  );
}
