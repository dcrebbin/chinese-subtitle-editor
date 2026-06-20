import { createClient } from "@supabase/supabase-js";
import { SessionContextProvider } from "@supabase/auth-helpers-react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { NextIntlClientProvider } from "next-intl";
import { useMemo, useState } from "react";

export interface UserMetadata {
  name: string;
  email: string;
  membershipType: string;
  resetDate: string;
  usageLeft: number;
}

export function Providers({
  children,
  messages,
  hostLocale,
}: Readonly<{
  children: React.ReactNode;
  messages: Record<string, unknown>;
  hostLocale: string;
}>) {
  const [queryClient] = useState(() => new QueryClient());
  const supabase = useMemo(() => {
    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
    const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseAnonKey) {
      return createClient("https://placeholder.supabase.co", "placeholder-key");
    }

    return createClient(supabaseUrl, supabaseAnonKey);
  }, []);

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
      <QueryClientProvider client={queryClient}>
        <NextIntlClientProvider
          timeZone="America/San_Francisco"
          locale={hostLocale}
          messages={messages}
        >
          {children}
        </NextIntlClientProvider>
      </QueryClientProvider>
    </SessionContextProvider>
  );
}
