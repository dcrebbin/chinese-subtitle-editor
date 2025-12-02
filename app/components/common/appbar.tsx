"use client";

import { useEffect, useMemo, useState } from "react";
import { useSession } from "@supabase/auth-helpers-react";
import { useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { usePathname } from "next/navigation";

import type { ApiUser } from "../../interfaces/User";
import { useSessionStore } from "../../store/session.store";
import { useUiStore } from "../../store/ui.store";
import MenuIcon from "./icons/menu";
import UserIcon from "./icons/user";

export default function AppBar({ hostLocale }: Readonly<{ hostLocale: string }>) {
  const t = useTranslations("AppBar");
  const session = useSession();

  const { data: userMetadata } = useQuery({
    queryKey: ["userMetadata", session?.user?.id],
    queryFn: async () => {
      console.log("UserMetadata query executing");
      const userId = session?.user?.id;
      if (!userId || !session?.access_token) return null;

      const response = await fetch("/api/user", {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
      });

      if (!response.ok) {
        return null;
      }

      const data = await response.json();
      return data;
    },
    enabled: Boolean(session?.user?.id && session?.access_token),
    staleTime: Infinity,
    refetchOnWindowFocus: false,
    refetchOnMount: false,
    refetchOnReconnect: false,
  }) as { data: ApiUser };

  return (
    <div
      className={`titlebar-drag flex h-[8vh] w-full flex-row items-center justify-between bg-blue-500 p-4 px-2 transition-all duration-300 lg:pt-4`}
    >
      <Link href="/" className="titlebar-no-drag mt-4">
        <h1 className="flex flex-col items-center font-sans text-white drop-shadow-md">
          <span className="w-full text-center font-sans text-2xl">Chinese Subtitle Editor</span>
          <p className="text-sm text-white">by Langpal話朋</p>
        </h1>
      </Link>
      <AppbarNavigation userMetadata={userMetadata} t={t} hostLocale={hostLocale} />
    </div>
  );
}

function AppbarNavigation({
  userMetadata,
  t,
  hostLocale,
}: {
  userMetadata: ApiUser;
  t: (key: string) => string;
  hostLocale: string;
}) {
  const setLoginOpen = useUiStore((state) => state.setLoginOpen);
  const setProfileOpen = useUiStore((state) => state.setProfileOpen);

  const userIconMemoized = useMemo(() => <UserIcon />, []);

  return (
    <div className="ml-0 hidden flex-row items-center justify-between gap-10 text-center text-xl text-white lg:ml-0 lg:flex lg:gap-0 lg:text-2xl xl:ml-4">
      {userMetadata ? (
        <div className="flex w-fit flex-row items-center justify-end gap-4 lg:px-6">
          <p className="text-2xl text-white">Hey {userMetadata?.name.split(" ")[0]}</p>
          <button
            type="button"
            className="titlebar-no-drag flex items-center justify-center text-2xl text-white"
            onClick={() => {
              setProfileOpen(true);
            }}
          >
            {userIconMemoized}
          </button>
        </div>
      ) : (
        <button
          type="button"
          className="titlebar-no-drag mx-6 flex w-[10rem] flex-row items-center gap-2 text-2xl text-white lg:text-3xl"
          onClick={() => {
            setLoginOpen(true);
          }}
        >
          {t("buttons.login")}
        </button>
      )}
    </div>
  );
}
