import { supabase } from "@/lib/supabase";
import type { Kind, Restaurant, Sort } from "@/lib/types";

export type SearchFilters = {
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

  if (f.sort === "rating") {
    query = query.order("rating", { ascending: false, nullsFirst: false });
  } else if (f.sort === "price") {
    query = query.order("price_range", { ascending: true, nullsFirst: false });
  } else {
    query = query.order("visited_at", { ascending: false, nullsFirst: false });
  }

  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return (data ?? []) as Restaurant[];
}

/** Distinct chip options for one kind — drives the CATEGORY / REGION / KEYWORD rows. */
export async function getFacets(kind: Kind) {
  const { data, error } = await supabase
    .from("restaurants")
    .select("category, region, keywords")
    .eq("kind", kind);

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
