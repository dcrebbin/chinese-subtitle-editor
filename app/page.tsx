"use client";
import SubtitleEditor from "./components/subtitle-editor/subtitle-editor";
import OverlayPage from "./components/video-overlay/page";

export default function Home() {
  return (
    <div className="flex h-[92vh] items-start justify-start bg-zinc-50 font-sans dark:bg-black">
      <SubtitleEditor />
      <OverlayPage />
    </div>
  );
}
