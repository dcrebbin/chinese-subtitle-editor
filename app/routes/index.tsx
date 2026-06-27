import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";

import { MobilePanelTabs } from "../components/common/mobile-panel-tabs";
import SubtitleEditor from "../components/subtitle-editor/subtitle-editor";
import OverlayPage from "../components/video-overlay/overlay-page";

export const Route = createFileRoute("/")({
  component: Home,
});

function Home() {
  const [activePanel, setActivePanel] = useState<"editor" | "video">("editor");

  return (
    <div className="m-0 box-border flex h-dvh flex-col overflow-hidden bg-zinc-50 p-2 font-sans xl:mx-4 xl:grid xl:h-screen xl:grid-cols-1 xl:gap-4 xl:overflow-hidden xl:p-4 2xl:grid-cols-2 dark:bg-black">
      <div
        className={`min-h-0 flex-1 xl:min-h-0 ${
          activePanel === "editor" ? "flex" : "hidden"
        } xl:flex`}
      >
        <SubtitleEditor />
      </div>
      <div
        className={`min-h-0 flex-1 xl:min-h-0 ${
          activePanel === "video" ? "flex" : "hidden"
        } xl:flex`}
      >
        <OverlayPage />
      </div>
      <MobilePanelTabs active={activePanel} onChange={setActivePanel} />
    </div>
  );
}
