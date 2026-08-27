import Link from "next/link";
import { supabase } from "@/lib/supabase";

export default async function Home() {
  const { data: restaurants, error } = await supabase
    .from("restaurants")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    return (
      <main className="max-w-5xl mx-auto p-6">
        <p>Failed to load restaurants: {error.message}</p>
      </main>
    );
  }

  return (
    <main className="max-w-5xl mx-auto p-6">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold">
            My Restaurant Log
          </h1>

          <p className="text-gray-500 mt-1">
            Restaurants I've visited
          </p>
        </div>

        <Link
          href="/add"
          className="bg-black text-white px-4 py-2 rounded-lg"
        >
          + Add Restaurant
        </Link>
      </div>

      {restaurants?.length === 0 ? (
        <p>No restaurants yet.</p>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {restaurants?.map((restaurant) => (
            <Link
              key={restaurant.id}
              href={`/restaurant/${restaurant.id}`}
              className="block border rounded-xl p-5 shadow-sm hover:shadow-md transition"
            >
              <div className="flex justify-between">
                <div>
                  <h2 className="text-xl font-semibold">
                    {restaurant.name}
                  </h2>

                  <p className="text-gray-500">
                    {restaurant.region}
                    {restaurant.category &&
                      ` · ${restaurant.category}`}
                  </p>
                </div>

                {restaurant.rating && (
                  <div className="font-semibold">
                    ★ {restaurant.rating}
                  </div>
                )}
              </div>

              {restaurant.menu && (
                <p className="mt-4">
                  <span className="font-medium">
                    Menu:
                  </span>{" "}
                  {restaurant.menu}
                </p>
              )}

              {restaurant.review && (
                <p className="mt-2 text-gray-700">
                  {restaurant.review}
                </p>
              )}

              {restaurant.revisit && (
                <p className="mt-3 text-sm font-medium">
                  Would revisit
                </p>
              )}
            </Link>
          ))}
        </div>
      )}
    </main>
  );
}