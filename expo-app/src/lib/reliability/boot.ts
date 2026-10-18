export const BOOT_MIN_MS = 800;
export const BOOT_SLOW_MS = 4000;
export type BootState = "loading" | "slow" | "offline" | "failed" | "done";
export function bootState(input: { elapsed: number; ready: boolean; resolved: boolean; offline: boolean; fetching: boolean; error: boolean }): BootState {
  if (input.ready && input.resolved && input.elapsed >= BOOT_MIN_MS) return "done";
  if (!input.resolved && input.offline) return "offline";
  if (input.fetching) return input.elapsed >= BOOT_SLOW_MS ? "slow" : "loading";
  if (input.error) return "failed";
  return input.elapsed >= BOOT_SLOW_MS ? "slow" : "loading";
}
