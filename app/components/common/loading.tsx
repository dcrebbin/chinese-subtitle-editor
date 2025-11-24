import { ArrowPathIcon } from "@heroicons/react/24/solid";

import { getSessionState } from "../../store/session.store";

export default function Loading() {
  const session = getSessionState().session;

  if (!session.isLoading) {
    return null;
  }
  return (
    <div className="bg-opacity-50 absolute z-10 flex h-full w-full flex-col items-center justify-center gap-2.5 bg-black/30">
      <ArrowPathIcon className="h-10 w-10 animate-spin" />
    </div>
  );
}
