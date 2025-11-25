"use client";

import SubtitleEditor from "./components/subtitle-editor/subtitle-editor";
import OverlayPage from "./components/video-overlay/page";

export default function Home() {
  return (
    <div className="grid h-auto grid-cols-1 items-start justify-start overflow-hidden bg-zinc-50 font-sans 2xl:grid-cols-2 dark:bg-black">
      <SubtitleEditor />
      <OverlayPage />
    </div>
  );
}
