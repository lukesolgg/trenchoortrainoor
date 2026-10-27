"use client";

import { useUi } from "@/store/ui";
import { Game } from "./Game";
import { ModePicker } from "./ModePicker";
import { Setup } from "./Setup";
import { CampaignHub } from "./CampaignHub";
import { AdminPanel } from "./AdminPanel";

export function App() {
  const screen = useUi((s) => s.screen);
  const runId = useUi((s) => s.runId);
  return (
    <>
      {screen === "setup" ? <Setup /> : screen === "campaign" ? <CampaignHub /> : screen === "play" ? <Game key={runId} /> : <ModePicker />}
      <AdminPanel />
    </>
  );
}
