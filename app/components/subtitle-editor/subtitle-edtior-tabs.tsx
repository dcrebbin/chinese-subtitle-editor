import { setSessionState, useSessionStore } from "../../store/session.store";

export default function SubtitleEditorTabs() {
  const { session } = useSessionStore();
  return (
    <div className="flex text-xl flex-row gap-1.5 items-center w-full">
      <button
        type="button"
        onClick={() => setSessionState({ ...session, selectedTab: "captions" })}
        className={`cursor-pointer p-1.5 ${
          session.selectedTab === "captions" ? "border-b-2 border-white/20" : ""
        }`}
      >
        Captions
      </button>
      <button
        type="button"
        onClick={() => setSessionState({ ...session, selectedTab: "search" })}
        className={`cursor-pointer p-1.5 ${
          session.selectedTab === "search" ? "border-b-2 border-white/20" : ""
        }`}
      >
        Search
      </button>
      <button
        type="button"
        onClick={() => setSessionState({ ...session, selectedTab: "testing" })}
        className={`cursor-pointer p-1.5 ${
          session.selectedTab === "testing" ? "border-b-2 border-white/20" : ""
        }`}
      >
        Testing
      </button>
    </div>
  );
}
