import Link from "next/link";
import { notFound } from "next/navigation";
import { supabase } from "@/lib/supabase";

type Props = {
  params: Promise<{ id: string }>;
};

export default async function RestaurantDetailPage({ params }: Props) {
  const { id } = await params;

  const { data: restaurant, error } = await supabase
    .from("restaurants")
    .select("*")
    .eq("id", id)
    .single();

  if (error || !restaurant) {
    notFound();
  }

  return (
    <main className="max-w-2xl mx-auto p-6">
      <Link href="/" className="text-sm text-gray-500">
        ← Back
      </Link>

      <div className="mt-6 border rounded-xl p-6">
        <div className="flex justify-between items-start">
          <div>
            <h1 className="text-3xl font-bold">{restaurant.name}</h1>
            <p className="text-gray-500 mt-1">
              {restaurant.region}
              {restaurant.category && ` · ${restaurant.category}`}
            </p>
          </div>

          {restaurant.rating && (
            <div className="text-xl font-semibold">
              ★ {restaurant.rating}
            </div>
          )}
        </div>

        <div className="mt-6 space-y-4">
          {restaurant.address && (
            <div>
              <p className="font-medium">Address</p>
              <p>{restaurant.address}</p>
            </div>
          )}

          {restaurant.menu && (
            <div>
              <p className="font-medium">Menu</p>
              <p>{restaurant.menu}</p>
            </div>
          )}

          {restaurant.price_range && (
            <div>
              <p className="font-medium">Price</p>
              <p>₩{restaurant.price_range.toLocaleString()}</p>
            </div>
          )}

          {restaurant.visited_at && (
            <div>
              <p className="font-medium">Visited</p>
              <p>{restaurant.visited_at}</p>
            </div>
          )}

          {restaurant.review && (
            <div>
              <p className="font-medium">Review</p>
              <p className="whitespace-pre-wrap">{restaurant.review}</p>
            </div>
          )}

          <div>
            <p className="font-medium">Revisit</p>
            <p>{restaurant.revisit ? "Yes" : "No"}</p>
          </div>
        </div>

        <Link
          href={`/restaurant/${restaurant.id}/edit`}
          className="block text-center mt-8 bg-black text-white rounded-lg p-3"
        >
          Edit
        </Link>
      </div>
    </main>
  );
}