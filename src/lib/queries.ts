import { supabase } from "@/lib/supabase";
import type { Bbox, Kind, Restaurant, Sort } from "@/lib/types";

export type SearchFilters = {
  bbox?: Bbox | null;
  kind: Kind;
  q?: string;
  categories?: string[];
  regions?: string[];
  keywords?: string[];
  revisitOnly?: boolean;
  sort?: Sort;
};

/** Free-text search over name/region/category/menu/review, plus chip filters. */
export async function searchRestaurants(f: SearchFilters) {
  let query = supabase.from("restaurants").select("*").eq("kind", f.kind);

  if (f.q) {
    const like = `%${f.q}%`;
    query = query.or(
      [
        `name.ilike.${like}`,
        `region.ilike.${like}`,
        `category.ilike.${like}`,
        `menu.ilike.${like}`,
        `review.ilike.${like}`,
      ].join(",")
    );
  }

  if (f.categories?.length) query = query.in("category", f.categories);
  if (f.regions?.length) query = query.in("region", f.regions);
  if (f.keywords?.length) query = query.overlaps("keywords", f.keywords);
  if (f.revisitOnly) query = query.eq("revisit", true);

  if (f.bbox) {
    query = query
      .gte("lat", f.bbox.s)
      .lte("lat", f.bbox.n)
      .gte("lng", f.bbox.w)
      .lte("lng", f.bbox.e);
  }

  if (f.sort === "rating") {
    query = query.order("rating", { ascending: false, nullsFirst: false });
  } else if (f.sort === "price") {
    query = query
      .order("price_level", { ascending: true, nullsFirst: false })
      .order("price_range", { ascending: true, nullsFirst: false });
  } else {
    query = query.order("visited_at", { ascending: false, nullsFirst: false });
  }

  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return (data ?? []) as Restaurant[];
}

/** Distinct chip options for one kind — drives the CATEGORY / REGION / KEYWORD rows. */
export async function getFacets(kind: Kind, bbox?: Bbox | null) {
  let query = supabase
    .from("restaurants")
    .select("category, region, keywords")
    .eq("kind", kind);

  if (bbox) {
    query = query
      .gte("lat", bbox.s)
      .lte("lat", bbox.n)
      .gte("lng", bbox.w)
      .lte("lng", bbox.e);
  }

  const { data, error } = await query;

  if (error) throw new Error(error.message);

  const categories = new Set<string>();
  const regions = new Set<string>();
  const keywords = new Set<string>();

  for (const row of data ?? []) {
    if (row.category) categories.add(row.category);
    if (row.region) regions.add(row.region);
    for (const k of row.keywords ?? []) keywords.add(k);
  }

  return {
    categories: [...categories],
    regions: [...regions],
    keywords: [...keywords],
  };
}

export async function getRestaurant(id: number) {
  const { data, error } = await supabase
    .from("restaurants")
    .select("*")
    .eq("id", id)
    .single();

  if (error) return null;
  return data as Restaurant;
}

/**
 * 모바일 화면이 쓰는 전체 목록. 거르기·정렬·묶기를 브라우저에서 하므로
 * (바텀시트가 서버를 오가지 않고 바로 반응합니다) 조건 없이 한 번만 읽습니다.
 */
export async function getAllRestaurants() {
  const { data, error } = await supabase
    .from("restaurants")
    .select("*")
    .order("visited_at", { ascending: false, nullsFirst: false });

  if (error) throw new Error(error.message);
  return (data ?? []) as Restaurant[];
}
