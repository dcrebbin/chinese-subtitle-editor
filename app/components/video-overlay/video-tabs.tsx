import { setOverlayState, useOverlayStore } from "@/app/store/overlay.store";

export default function VideoTabs() {
  const { overlay } = useOverlayStore();
  return (
    <div className="flex text-xl flex-row gap-1.5 items-center w-full">
      <button
        type="button"
        onClick={() => setOverlayState({ ...overlay, selectedTab: "editor" })}
        className={`cursor-pointer p-1.5 ${
          overlay.selectedTab === "editor" ? "border-b-2 border-white/20" : ""
        }`}
      >
        Editor
      </button>
      <button
        type="button"
        onClick={() => setOverlayState({ ...overlay, selectedTab: "render" })}
        className={`cursor-pointer p-1.5 ${
          overlay.selectedTab === "render" ? "border-b-2 border-white/20" : ""
        }`}
      >
        Render
      </button>
    </div>
  );
}
