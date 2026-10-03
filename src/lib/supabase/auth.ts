import { cache } from "react";
import type { User } from "@supabase/supabase-js";

import { createClient } from "@/lib/supabase/server";

/**
 * Return the currently authenticated user, or `null` if there is no valid
 * session (or if Supabase is not yet configured). Safe to call from Server
 * Components and Route Handlers.
 *
 * Cached for the lifetime of one server request so layout and page share a fetch.
 */
export const getSessionUser = cache(async (): Promise<User | null> => {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error,
    } = await supabase.auth.getUser();
    if (error) return null;
    return user;
  } catch {
    return null;
  }
});
