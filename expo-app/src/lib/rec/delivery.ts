/** Coalesce concurrent writes and cache successes only. Failed deliveries remain retryable. */
export function createDeliveryCache() {
  const jobs = new Map<string, Promise<boolean>>();
  return {
    get: (key: string) => jobs.get(key),
    run(key: string, task: () => Promise<boolean>): Promise<boolean> {
      const existing = jobs.get(key);
      if (existing) return existing;
      const job = Promise.resolve().then(task).catch(() => false).then((ok) => {
        if (!ok) jobs.delete(key);
        return ok;
      });
      jobs.set(key, job);
      return job;
    },
  };
}
