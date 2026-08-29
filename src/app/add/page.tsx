import { Suspense } from "react";
import RecordForm from "../_components/RecordForm";

export default function AddRestaurantPage() {
  return (
    <Suspense fallback={null}>
      <RecordForm />
    </Suspense>
  );
}
