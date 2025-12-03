import { ArrowPathIcon } from "@heroicons/react/24/solid";

export default function Loading() {
  return (
    <div className="bg-opacity-50 absolute z-10 flex h-full w-full flex-col items-center justify-center gap-2.5 bg-black/30">
      <ArrowPathIcon className="h-10 w-10 animate-spin" />
    </div>
  );
}
