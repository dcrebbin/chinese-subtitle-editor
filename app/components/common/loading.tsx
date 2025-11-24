import { ArrowPathIcon } from "@heroicons/react/24/solid";
import { getSessionState } from "../../store/session.store";

export default function Loading() {
  const session = getSessionState().session;
  return (
    session.isLoading && (
      <div className="flex flex-col items-center justify-center gap-2.5 z-10 absolute w-full h-full bg-black bg-opacity-50">
        <ArrowPathIcon className="w-10 h-10 animate-spin" />
      </div>
    )
  );
}
