import { notFound } from "next/navigation";
import { getRestaurant } from "@/lib/queries";
import RecordForm from "@/app/_components/RecordForm";

export default async function EditRestaurantPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const place = await getRestaurant(Number(id));

  if (!place) notFound();

  return <RecordForm initial={place} />;
}
