import { notFound } from "next/navigation";
import { getRestaurant } from "@/lib/queries";
import { createClient } from "@/lib/supabase/server";
import RecordForm from "@/app/_components/RecordForm";

export default async function EditRestaurantPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();
  const place = await getRestaurant(supabase, Number(id));

  if (!place) notFound();

  return <RecordForm initial={place} />;
}
