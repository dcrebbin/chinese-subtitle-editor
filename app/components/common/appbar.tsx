"use client";
import { useSession } from "@supabase/auth-helpers-react";
import { useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import type { ApiUser } from "../../interfaces/User";
import { useSessionStore } from "../../store/session.store";
import { useUiStore } from "../../store/ui.store";
import MenuIcon from "./icons/menu";
import UserIcon from "./icons/user";

export default function AppBar({
  hostLocale,
}: Readonly<{ hostLocale: string }>) {
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
      className={`h-[8vh] w-full bg-blue-500 flex flex-row p-4 px-2 items-center justify-between lg:pt-4 transition-all duration-300`}
    >
      <Link href="/" className="mt-4">
        <h1 className="flex-col text-white font-sans drop-shadow-md flex items-center">
          <span className="font-sans w-full text-center text-2xl">
            Chinese Subtitle Editor
          </span>
          <p className="text-white text-sm">by Langpal話朋</p>
        </h1>
      </Link>
      <AppbarNavigation
        userMetadata={userMetadata}
        t={t}
        hostLocale={hostLocale}
      />
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
    <div className="justify-between flex-row gap-10 text-xl lg:text-2xl lg:gap-0 lg:ml-0 xl:ml-4 ml-0 items-center text-white hidden lg:flex text-center">
      {userMetadata ? (
        <div className="flex flex-row items-center gap-4 w-fit justify-end lg:px-6">
          <p className="text-white text-2xl">
            Hey {userMetadata?.name.split(" ")[0]}
          </p>
          <button
            type="button"
            className="text-white text-2xl flex items-center justify-center"
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
          className="text-white text-2xl lg:text-3xl mx-6 w-[10rem] flex flex-row items-center gap-2"
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
