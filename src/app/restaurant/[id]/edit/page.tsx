"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

export default function EditRestaurantPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();

  const [form, setForm] = useState({
    name: "",
    category: "",
    region: "",
    address: "",
    rating: "",
    menu: "",
    price_range: "",
    review: "",
    visited_at: "",
    revisit: false,
  });

  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadRestaurant() {
      const { data } = await supabase
        .from("restaurants")
        .select("*")
        .eq("id", id)
        .single();

      if (data) {
        setForm({
          name: data.name ?? "",
          category: data.category ?? "",
          region: data.region ?? "",
          address: data.address ?? "",
          rating: data.rating?.toString() ?? "",
          menu: data.menu ?? "",
          price_range: data.price_range?.toString() ?? "",
          review: data.review ?? "",
          visited_at: data.visited_at ?? "",
          revisit: data.revisit ?? false,
        });
      }

      setLoading(false);
    }

    loadRestaurant();
  }, [id]);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();

    const { error } = await supabase
      .from("restaurants")
      .update({
        name: form.name,
        category: form.category || null,
        region: form.region || null,
        address: form.address || null,
        rating: form.rating ? Number(form.rating) : null,
        menu: form.menu || null,
        price_range: form.price_range
          ? Number(form.price_range)
          : null,
        review: form.review || null,
        visited_at: form.visited_at || null,
        revisit: form.revisit,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id);

    if (error) {
      alert(error.message);
      return;
    }

    router.push(`/restaurant/${id}`);
    router.refresh();
  }

  async function handleDelete() {
    if (!confirm("Delete this restaurant?")) return;

    const { error } = await supabase
      .from("restaurants")
      .delete()
      .eq("id", id);

    if (error) {
      alert(error.message);
      return;
    }

    router.push("/");
    router.refresh();
  }

  if (loading) return <main className="p-6">Loading...</main>;

  return (
    <main className="max-w-2xl mx-auto p-6">
      <h1 className="text-3xl font-bold mb-8">Edit Restaurant</h1>

      <form onSubmit={handleSave} className="space-y-4">
        {[
          ["name", "Restaurant name"],
          ["category", "Category"],
          ["region", "Region"],
          ["address", "Address"],
          ["menu", "Menu"],
        ].map(([key, label]) => (
          <div key={key}>
            <label className="block mb-1 font-medium">{label}</label>
            <input
              value={form[key as keyof typeof form] as string}
              onChange={(e) =>
                setForm({ ...form, [key]: e.target.value })
              }
              className="w-full border rounded-lg p-3"
            />
          </div>
        ))}

        <div>
          <label className="block mb-1 font-medium">Rating</label>
          <input
            type="number"
            min="0"
            max="5"
            step="0.1"
            value={form.rating}
            onChange={(e) =>
              setForm({ ...form, rating: e.target.value })
            }
            className="w-full border rounded-lg p-3"
          />
        </div>

        <div>
          <label className="block mb-1 font-medium">Price</label>
          <input
            type="number"
            value={form.price_range}
            onChange={(e) =>
              setForm({ ...form, price_range: e.target.value })
            }
            className="w-full border rounded-lg p-3"
          />
        </div>

        <div>
          <label className="block mb-1 font-medium">Visit date</label>
          <input
            type="date"
            value={form.visited_at}
            onChange={(e) =>
              setForm({ ...form, visited_at: e.target.value })
            }
            className="w-full border rounded-lg p-3"
          />
        </div>

        <div>
          <label className="block mb-1 font-medium">Review</label>
          <textarea
            rows={5}
            value={form.review}
            onChange={(e) =>
              setForm({ ...form, review: e.target.value })
            }
            className="w-full border rounded-lg p-3"
          />
        </div>

        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={form.revisit}
            onChange={(e) =>
              setForm({ ...form, revisit: e.target.checked })
            }
          />
          Would revisit
        </label>

        <button className="w-full bg-black text-white p-3 rounded-lg">
          Save Changes
        </button>
      </form>

      <button
        onClick={handleDelete}
        className="w-full mt-4 border border-red-500 text-red-600 p-3 rounded-lg"
      >
        Delete Restaurant
      </button>
    </main>
  );
}