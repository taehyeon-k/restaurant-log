import { useSyncExternalStore } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";

let session: Session | null | undefined;
let initialized = false;
const listeners = new Set<() => void>();
function initialize() {
  if (initialized) return;
  initialized = true;
  let changed = false;
  const publish = (value: Session | null) => { session = value; listeners.forEach((f) => f()); };
  supabase.auth.onAuthStateChange((_event, value) => { changed = true; publish(value); });
  void supabase.auth.getSession().then(({ data }) => { if (!changed) publish(data.session); });
}
const subscribe = (f: () => void) => {
  listeners.add(f);
  initialize();
  return () => { listeners.delete(f); };
};
const snapshot = () => session;
export function useSession() {
  return useSyncExternalStore(subscribe, snapshot, () => undefined);
}
