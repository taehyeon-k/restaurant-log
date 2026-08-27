"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

export default function AddRestaurantPage() {
  const router = useRouter();

  const [name, setName] = useState("");
  const [category, setCategory] = useState("");
  const [region, setRegion] = useState("");
  const [address, setAddress] = useState("");
  const [rating, setRating] = useState("");
  const [menu, setMenu] = useState("");
  const [priceRange, setPriceRange] = useState("");
  const [review, setReview] = useState("");
  const [visitedAt, setVisitedAt] = useState("");
  const [revisit, setRevisit] = useState(false);

  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    setLoading(true);
    setErrorMessage("");

    const { error } = await supabase.from("restaurants").insert({
      name,
      category: category || null,
      region: region || null,
      address: address || null,
      rating: rating ? Number(rating) : null,
      menu: menu || null,
      price_range: priceRange ? Number(priceRange) : null,
      review: review || null,
      revisit,
      visited_at: visitedAt || null,
    });

    if (error) {
      setErrorMessage(error.message);
      setLoading(false);
      return;
    }

    router.push("/");
    router.refresh();
  }

  return (
    <main className="max-w-2xl mx-auto p-6">
      <h1 className="text-3xl font-bold mb-8">
        Add Restaurant
      </h1>

      <form onSubmit={handleSubmit} className="space-y-5">

        <div>
          <label className="block mb-1 font-medium">
            Restaurant name *
          </label>
          <input
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full border rounded-lg p-3"
          />
        </div>

        <div>
          <label className="block mb-1 font-medium">
            Category
          </label>
          <input
            placeholder="Korean, Japanese, Cafe..."
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="w-full border rounded-lg p-3"
          />
        </div>

        <div>
          <label className="block mb-1 font-medium">
            Region
          </label>
          <input
            placeholder="Seoul, Sokcho..."
            value={region}
            onChange={(e) => setRegion(e.target.value)}
            className="w-full border rounded-lg p-3"
          />
        </div>

        <div>
          <label className="block mb-1 font-medium">
            Address
          </label>
          <input
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            className="w-full border rounded-lg p-3"
          />
        </div>

        <div>
          <label className="block mb-1 font-medium">
            Rating
          </label>
          <input
            type="number"
            min="0"
            max="5"
            step="0.1"
            value={rating}
            onChange={(e) => setRating(e.target.value)}
            className="w-full border rounded-lg p-3"
          />
        </div>

        <div>
          <label className="block mb-1 font-medium">
            Menu
          </label>
          <input
            value={menu}
            onChange={(e) => setMenu(e.target.value)}
            className="w-full border rounded-lg p-3"
          />
        </div>

        <div>
          <label className="block mb-1 font-medium">
            Price
          </label>
          <input
            type="number"
            value={priceRange}
            onChange={(e) => setPriceRange(e.target.value)}
            className="w-full border rounded-lg p-3"
          />
        </div>

        <div>
          <label className="block mb-1 font-medium">
            Visit date
          </label>
          <input
            type="date"
            value={visitedAt}
            onChange={(e) => setVisitedAt(e.target.value)}
            className="w-full border rounded-lg p-3"
          />
        </div>

        <div>
          <label className="block mb-1 font-medium">
            Review
          </label>
          <textarea
            rows={5}
            value={review}
            onChange={(e) => setReview(e.target.value)}
            className="w-full border rounded-lg p-3"
          />
        </div>

        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={revisit}
            onChange={(e) => setRevisit(e.target.checked)}
          />
          Would revisit
        </label>

        {errorMessage && (
          <p className="text-red-600">{errorMessage}</p>
        )}

        <button
          disabled={loading}
          className="w-full bg-black text-white rounded-lg p-3 disabled:opacity-50"
        >
          {loading ? "Saving..." : "Save Restaurant"}
        </button>
      </form>
    </main>
  );
}