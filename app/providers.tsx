"use client";

import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import { SessionContextProvider } from "@supabase/auth-helpers-react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { NextIntlClientProvider } from "next-intl";
import posthog from "posthog-js";
import { PostHogProvider } from "posthog-js/react";
import { useMemo, useState } from "react";
export interface UserMetadata {
  name: string;
  email: string;
  membershipType: string;
  resetDate: string;
  usageLeft: number;
}

// if (typeof window !== "undefined") {
//   posthog.init(process.env.NEXT_PUBLIC_POSTHOG_KEY!, {
//     api_host: "/ingest",
//     ui_host: "https://us.posthog.com",
//     person_profiles: "identified_only", // or 'always' to create profiles for anonymous users as well
//     loaded: (posthog) => {
//       if (process.env.NODE_ENV === "development") posthog.debug(); // debug mode in development
//     },
//   });
// }

interface KnownCharactersMap {
  [languageCode: string]: {
    [character: string]: number;
  };
}

interface Character {
  text: string;
  learnt_at: string;
  user_id: string;
  id: number;
  language_code: string;
}

export function Providers({
  children,
  messages,
  hostLocale,
}: Readonly<{
  children: React.ReactNode;
  messages: Record<string, string>;
  hostLocale: string;
}>) {
  const [queryClient] = useState(() => new QueryClient());
  const supabase = useMemo(() => createClientComponentClient(), []);
  // const posthogClient = useMemo(() => posthog, []);

  supabase.auth.onAuthStateChange(async (event, session) => {
    if (event === "SIGNED_IN") {
      supabase
        .from("users")
        .select()
        .eq("user_id", session?.user.id)
        .then((user) => {
          if (user.data && user.data.length === 0) {
            fetch("/api/user", {
              method: "POST",
              headers: {
                Authorization: session?.access_token ?? "",
                "Content-Type": "application/json",
              },
            });
          }
        });
    }
  });

  return (
    <SessionContextProvider supabaseClient={supabase}>
      {/* <PostHogProvider client={posthogClient}> */}
      <QueryClientProvider client={queryClient}>
        <NextIntlClientProvider
          timeZone="America/San_Francisco"
          locale={hostLocale}
          messages={messages}
        >
          {children}
        </NextIntlClientProvider>
      </QueryClientProvider>
      {/* </PostHogProvider> */}
    </SessionContextProvider>
  );
}
