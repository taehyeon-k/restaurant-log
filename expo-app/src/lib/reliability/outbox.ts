/** Process a persistent snapshot; remove entries only after acknowledged delivery.
 * Read again before each removal so concurrently appended entries are preserved.
 */
export async function deliverOutbox<T>(io: {
  read: () => Promise<T[]>;
  write: (entries: T[]) => Promise<void>;
  key: (entry: T) => string;
  send: (entry: T) => Promise<boolean>;
  delivered: (entry: T) => Promise<void>;
}) {
  for (const entry of await io.read()) {
    if (!(await io.send(entry))) continue;
    await io.delivered(entry);
    await io.write((await io.read()).filter((r) => io.key(r) !== io.key(entry)));
  }
}
