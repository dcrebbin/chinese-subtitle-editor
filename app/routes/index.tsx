import { createFileRoute } from "@tanstack/react-router";

import SubtitleEditor from "../components/subtitle-editor/subtitle-editor";
import OverlayPage from "../components/video-overlay/page";

export const Route = createFileRoute("/")({
  component: Home,
});

function Home() {
  return (
    <div className="box-border mx-4 grid h-screen grid-cols-1 gap-4 overflow-hidden bg-zinc-50 p-4 font-sans 2xl:grid-cols-2 dark:bg-black">
      <div className="min-h-0">
        <SubtitleEditor />
      </div>
      <div className="min-h-0">
        <OverlayPage />
      </div>
    </div>
  );
}
