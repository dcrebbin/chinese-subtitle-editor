type MobilePanel = "editor" | "video";

export function MobilePanelTabs({
  active,
  onChange,
}: {
  active: MobilePanel;
  onChange: (panel: MobilePanel) => void;
}) {
  return (
    <div className="mobile-tab-bar shrink-0 border-t border-white/20 bg-black/80 backdrop-blur-md xl:hidden">
      <div className="flex">
        <button
          type="button"
          onClick={() => onChange("editor")}
          className={`flex-1 py-3 text-sm font-semibold transition-colors ${
            active === "editor"
              ? "border-t-2 border-white text-white"
              : "text-white/60 hover:text-white"
          }`}
        >
          Subtitles
        </button>
        <button
          type="button"
          onClick={() => onChange("video")}
          className={`flex-1 py-3 text-sm font-semibold transition-colors ${
            active === "video"
              ? "border-t-2 border-white text-white"
              : "text-white/60 hover:text-white"
          }`}
        >
          Video
        </button>
      </div>
    </div>
  );
}
