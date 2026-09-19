import { useLocalSearchParams, useRouter } from "expo-router";
import RecordForm from "@/components/RecordForm";
import { useRefresh, useRestaurants, useWishes } from "@/lib/data";
import type { Kind } from "@/lib/types";

/** 새 기록 — 지도 검색·재방문·하루 화면·인증 없는 촬영이 모두 여기로 옵니다. */
export default function NewRecordScreen() {
  const router = useRouter();
  const refresh = useRefresh();
  const { rows } = useRestaurants();
  const { wishes } = useWishes();

  const p = useLocalSearchParams<{
    kind?: string;
    name?: string;
    address?: string;
    lat?: string;
    lng?: string;
    category?: string;
    revisit?: string;
    visitedAt?: string;
  }>();

  const kind: Kind = p.kind === "cafe" ? "cafe" : "restaurant";
  const num = (v?: string) => (v && v.length > 0 ? Number(v) : undefined);
  const str = (v?: string) => (v && v.length > 0 ? v : undefined);

  return (
    <RecordForm
      target={{
        mode: "new",
        kind,
        preset: {
          name: str(p.name),
          address: str(p.address),
          lat: num(p.lat),
          lng: num(p.lng),
          category: str(p.category),
          revisit: p.revisit === "1",
          visitedAt: str(p.visitedAt),
        },
      }}
      rows={rows}
      wishes={wishes}
      onCancel={() => router.back()}
      onSaved={(saved) => {
        refresh();
        router.replace(`/record/${saved.id}`);
      }}
    />
  );
}
