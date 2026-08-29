import { redirect } from "next/navigation";
import Link from "next/link";
import { getFacets, getRestaurant, searchRestaurants } from "@/lib/queries";
import { CATEGORY_COLORS, type Kind, type Sort } from "@/lib/types";
import KindTabs from "./_components/KindTabs";
import SearchBar from "./_components/SearchBar";
import PlaceSearch from "./_components/PlaceSearch";
import FilterPanel from "./_components/FilterPanel";
import SortRow from "./_components/SortRow";
import Workspace from "./_components/Workspace";

const toArray = (v: string | string[] | undefined) =>
  v == null ? [] : Array.isArray(v) ? v : [v];

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;

  const kind: Kind = sp.kind === "cafe" ? "cafe" : "restaurant";
  const sort: Sort =
    sp.sort === "rating" || sp.sort === "price" ? sp.sort : "recent";
  const q = typeof sp.q === "string" ? sp.q : "";
  const categories = toArray(sp.category);
  const regions = toArray(sp.region);
  const keywords = toArray(sp.keyword);
  const revisitOnly = sp.revisit === "1";

  const [rows, facets] = await Promise.all([
    searchRestaurants({ kind, q, categories, regions, keywords, revisitOnly, sort }),
    getFacets(kind),
  ]);

  const selectedId = typeof sp.id === "string" ? Number(sp.id) : null;
  const selected =
    selectedId != null && !Number.isNaN(selectedId)
      ? await getRestaurant(selectedId)
      : null;

  // A stale ?id (deleted row) shouldn't leave the detail pane empty.
  if (selectedId != null && selected == null) {
    const keep = new URLSearchParams(
      Object.entries(sp).flatMap(([k, v]) =>
        k === "id" ? [] : toArray(v).map((val) => [k, val] as [string, string])
      )
    );
    const qs = keep.toString();
    redirect(qs ? `/?${qs}` : "/");
  }

  // 이 종류에 실제로 쓰인 카테고리만 범례에 보여줍니다.
  const legend = Object.entries(CATEGORY_COLORS).filter(([label]) =>
    facets.categories.includes(label)
  );

  return (
    <main className="flex h-screen">
      <Workspace
        rows={rows}
        selected={selected}
        mapOverlay={
          <>
            <div className="absolute inset-x-0 top-0 z-[1000] flex items-start gap-5 p-8">
              <Link
                href="/"
                 className="pt-3 pr-1.5 font-serif text-[22px] font-bold tracking-[0.14em] whitespace-nowrap hover:text-brick"
              >
                DINARY
              </Link>
              <PlaceSearch rows={rows} />
            </div>

            {legend.length > 0 && (
              <div className="absolute bottom-7 left-8 z-[1000] flex max-w-[520px] flex-wrap items-center gap-x-3.5 gap-y-2 rounded-[20px] border border-line bg-card/90 px-4 py-2.5 text-xs text-muted">
                {legend.map(([label, color]) => (
                  <span key={label} className="flex items-center gap-1.5">
                    <span
                      className="size-2.5 rotate-[-45deg] rounded-[50%_50%_50%_0]"
                      style={{ background: color }}
                    />
                    {label}
                  </span>
                ))}
                <span className="flex items-center gap-1.5 border-l border-line pl-3.5">
                  <span className="size-2.5 rounded-full bg-[#8a8377] opacity-45" />
                  한 번만
                </span>
              </div>
            )}
          </>
        }
        asideHeader={
          selected ? null : (
            <>
              <div className="flex items-center gap-3.5 px-8 pt-5.5">
                <Link
                  href="/add"
                  className="shrink-0 border-b border-[#e2c9bb] text-[13px] whitespace-nowrap text-brick"
                >
                  + 기록 추가
                </Link>

                <SearchBar defaultValue={q} />

                <KindTabs kind={kind} />
              </div>

              <FilterPanel
                facets={facets}
                selected={{ categories, regions, keywords, revisitOnly }}
              />

              <SortRow count={rows.length} sort={sort} />
            </>
          )
        }
      />
    </main>
  );
}
