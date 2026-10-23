"use client";

import { useUi } from "@/store/ui";
import { Game } from "./Game";
import { ModePicker } from "./ModePicker";
import { Setup } from "./Setup";

export function App() {
  const screen = useUi((s) => s.screen);
  const runId = useUi((s) => s.runId);
  if (screen === "setup") return <Setup />;
  if (screen === "play") return <Game key={runId} />;
  return <ModePicker />;
}
