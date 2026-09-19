import { Text, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import RecordForm from "@/components/RecordForm";
import { useRefresh, useRestaurants, useWishes } from "@/lib/data";
import { C, FONT } from "@/lib/theme";

export default function EditRecordScreen() {
  const router = useRouter();
  const refresh = useRefresh();
  const { rows, isLoading } = useRestaurants();
  const { wishes } = useWishes();

  const { id } = useLocalSearchParams<{ id: string }>();
  const record = rows.find((r) => r.id === Number(id)) ?? null;

  if (!record) {
    return (
      <View style={{ flex: 1, backgroundColor: C.paper, alignItems: "center", justifyContent: "center" }}>
        <Text style={{ fontSize: 12.5, color: C.faint, fontFamily: FONT.sans }}>
          {isLoading ? "불러오는 중…" : "기록을 찾지 못했습니다."}
        </Text>
      </View>
    );
  }

  return (
    <RecordForm
      target={{ mode: "edit", record }}
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
