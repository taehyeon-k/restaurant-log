/** Continue until empty: a server may cap a page below the requested size. */
export async function fetchAll<T extends { id: string | number }>(page: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>, size = 1000): Promise<T[]> {
  const result: T[] = [];
  const seen = new Set<T["id"]>();
  for (let offset = 0; ; ) {
    const { data, error } = await page(offset, offset + size - 1);
    if (error) throw new Error(error.message);
    if (!data?.length) return result;
    for (const row of data) {
      if (seen.has(row.id)) throw new Error("History changed while paging; retry the request");
      seen.add(row.id); result.push(row);
    }
    offset += data.length;
  }
}
