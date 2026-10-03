import { useLocalSearchParams, useRouter } from "expo-router";
import { useMemo, useState } from "react";
import { Modal, Pressable, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { BookmarkIcon, VerifiedMark } from "@/components/icons";
import { BackButton, MobileStars, PhotoBox } from "@/components/ui";
import { useRows, useWishes } from "@/data/queries";
import { coverPhoto, dottedDate, verifiedTime, type Restaurant, type Wish } from "@/lib/types";
import { C, F, SHADOW } from "@/theme";

const pad = (n: number) => String(n).padStart(2, "0");
const todayKey = () => {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

/**
 * 그날 화면 — 지난 날은 기록만, 오늘은 기록·계획 다, 다가올 날은 계획만 추가할 수 있습니다.
 */
export default function DayRoute() {
  const { date: dateKey } = useLocalSearchParams<{ date: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { data: allRows = [] } = useRows();
  const { data: wishes = [] } = useWishes();
  const [menuOpen, setMenuOpen] = useState(false);

  const byName = (a: { name: string }, b: { name: string }) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0);
  const visits = useMemo(() => allRows.filter((r) => !r.pending && r.visited_at === dateKey).sort(byName), [allRows, dateKey]);
  const dayWishes = useMemo(() => wishes.filter((w) => w.plan_date === dateKey).sort(byName), [wishes, dateKey]);

  const [, month, day] = dateKey.split("-").map(Number);
  const today = todayKey();
  const isFuture = dateKey > today;
  const isToday = dateKey === today;
  const empty = !visits.length && !dayWishes.length;

  const addRecord = () => router.push({ pathname: "/record/edit", params: { visitedAt: dateKey } });
  const addWish = () => router.push({ pathname: "/wish/new", params: { plan_date: dateKey } });

  function handlePlus() {
    if (isToday) return setMenuOpen((v) => !v);
    setMenuOpen(false);
    if (isFuture) addWish();
    else addRecord();
  }

  const countLine =
    [visits.length ? `기록 ${visits.length}건` : null, dayWishes.length ? `예정 ${dayWishes.length}건` : null].filter(Boolean).join(" · ") ||
    (isFuture ? "예정 없음" : "기록 없음");

  return (
    <View style={{ flex: 1, backgroundColor: C.paper }}>
      <View style={{ paddingTop: insets.top + 6, paddingHorizontal: 20, paddingBottom: 16, borderBottomWidth: 1, borderBottomColor: "#e6e0d3", zIndex: 10 }}>
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
          <View style={{ marginLeft: -10 }}><BackButton /></View>
          <Pressable onPress={handlePlus} accessibilityLabel="기록·계획 추가" style={{ width: 44, height: 44, borderRadius: 22, borderWidth: 1, borderColor: C.line, backgroundColor: C.card, alignItems: "center", justifyContent: "center" }}>
            <Text style={{ fontSize: 22, color: C.ink, transform: [{ rotate: menuOpen ? "45deg" : "0deg" }] }}>+</Text>
          </Pressable>
        </View>
        <Text style={{ marginTop: 8, fontFamily: F.mono, fontSize: 10, letterSpacing: 1.8, color: C.faint }}>{dottedDate(dateKey)}</Text>
        <Text style={{ marginTop: 4, fontFamily: F.serif, fontSize: 26, color: C.ink }}>{visits.length > 0 ? `${month}월 ${day}일 방문한 식당` : `${month}월 ${day}일`}</Text>
        <Text style={{ marginTop: 4, fontFamily: F.sans, fontSize: 12, color: "#a29a8c" }}>{countLine}</Text>
      </View>

      <Modal visible={menuOpen} transparent animationType="fade" onRequestClose={() => setMenuOpen(false)}>
        <Pressable style={{ flex: 1 }} onPress={() => setMenuOpen(false)}>
          <View style={{ position: "absolute", right: 20, top: insets.top + 56, gap: 8, alignItems: "flex-end" }}>
            {[
              { label: "기록 추가", onPress: addRecord, icon: <View style={{ width: 22, height: 22, borderRadius: 11, borderWidth: 1.5, borderColor: C.faint }} /> },
              { label: "계획 추가", onPress: addWish, icon: <BookmarkIcon size={20} /> },
            ].map((o) => (
              <Pressable key={o.label} onPress={() => { setMenuOpen(false); o.onPress(); }} style={[{ minHeight: 46, flexDirection: "row", alignItems: "center", gap: 8, borderRadius: 16, backgroundColor: C.card, paddingHorizontal: 16 }, SHADOW.card]}>
                {o.icon}
                <Text style={{ fontFamily: F.sans, fontSize: 13, color: C.ink }}>{o.label}</Text>
              </Pressable>
            ))}
          </View>
        </Pressable>
      </Modal>

      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 40, gap: 10 }}>
        {empty ? (
          <View style={{ marginTop: 32, alignItems: "center", gap: 14, paddingHorizontal: 24 }}>
            <Text style={{ textAlign: "center", fontFamily: F.sans, fontSize: 13, lineHeight: 22, color: C.faint }}>
              {isFuture ? "아직 계획한 곳이 없습니다. 계획을 추가해보시겠습니까?" : "아직 방문한 식당이 없습니다. 기록을 추가해보시겠습니까?"}
            </Text>
            <Pressable onPress={isFuture ? addWish : addRecord} style={{ minHeight: 48, width: "100%", maxWidth: 280, borderRadius: 18, borderWidth: 1, borderStyle: "dashed", borderColor: "#cdc6b8", alignItems: "center", justifyContent: "center" }}>
              <Text style={{ fontFamily: F.sans, fontSize: 13, color: C.muted }}>{isFuture ? "+ 계획 추가" : "+ 기록 추가"}</Text>
            </Pressable>
          </View>
        ) : (
          <>
            {visits.map((v) => <VisitCard key={v.id} record={v} onOpen={() => router.push({ pathname: "/record/[id]", params: { id: String(v.id) } })} />)}
            {dayWishes.length > 0 && (
              <View style={{ marginTop: visits.length ? 8 : 0, gap: 10 }}>
                {visits.length > 0 && <Text style={{ paddingHorizontal: 4, fontFamily: F.mono, fontSize: 10, letterSpacing: 1.6, color: C.faint }}>예정</Text>}
                {dayWishes.map((w) => <WishRow key={w.id} wish={w} onOpen={() => router.push({ pathname: "/wish/[id]", params: { id: w.id } })} />)}
              </View>
            )}
          </>
        )}
      </ScrollView>
    </View>
  );
}

function VisitCard({ record, onOpen }: { record: Restaurant; onOpen: () => void }) {
  const photo = coverPhoto(record);
  return (
    <Pressable onPress={onOpen} style={{ flexDirection: "row", alignItems: "flex-start", gap: 12, borderRadius: 22, borderWidth: 1, borderColor: record.verified ? "#e0c3b1" : "#e4dfd3", backgroundColor: C.card, padding: 12 }}>
      <View>
        <PhotoBox src={photo} category={record.category} size={72} radius={18}>
          {!photo && <Text style={{ fontFamily: F.mono, fontSize: 9, letterSpacing: 0.7, color: "rgba(251,250,246,.9)" }}>PHOTO</Text>}
        </PhotoBox>
        {record.verified && <View style={{ position: "absolute", right: -3, bottom: -3 }}><VerifiedMark size={24} /></View>}
      </View>
      <View style={{ flex: 1 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
          <Text numberOfLines={1} style={{ flexShrink: 1, fontFamily: F.serif, fontSize: 16, color: C.ink }}>{record.name}</Text>
          {record.revisit && <Text style={{ borderRadius: 9, backgroundColor: C.brickSoft, paddingHorizontal: 7, paddingVertical: 2, fontFamily: F.sans, fontSize: 9.5, color: C.brick, overflow: "hidden" }}>재방문</Text>}
        </View>
        <Text style={{ marginTop: 4, fontFamily: F.sans, fontSize: 11, color: C.faint }}>{[record.category, record.region].filter(Boolean).join(" · ")}</Text>
        <View style={{ marginTop: 6, flexDirection: "row", alignItems: "center", gap: 8 }}>
          <MobileStars rating={record.rating} />
          <Text style={{ fontFamily: F.mono, fontSize: 10.5, color: C.muted }}>{record.rating?.toFixed(1) ?? "—"}</Text>
          {record.verified && record.verified_at && <Text style={{ fontFamily: F.mono, fontSize: 10.5, color: C.brick }}>{verifiedTime(record.verified_at)}</Text>}
        </View>
        <Text numberOfLines={2} style={{ marginTop: 6, fontFamily: F.sans, fontSize: 11.5, lineHeight: 18, color: "#4d4842" }}>{record.review || record.menu || "메모가 비어 있습니다"}</Text>
      </View>
    </Pressable>
  );
}

function WishRow({ wish, onOpen }: { wish: Wish; onOpen: () => void }) {
  return (
    <Pressable onPress={onOpen} style={{ flexDirection: "row", alignItems: "center", gap: 12, borderRadius: 22, borderWidth: 1, borderStyle: "dashed", borderColor: "#ded8cb", padding: 12 }}>
      <View style={{ width: 44, height: 44, borderRadius: 22, borderWidth: 1, borderColor: "#e0c3b1", backgroundColor: "#f9f0e9", alignItems: "center", justifyContent: "center" }}>
        <BookmarkIcon size={16} fill={C.brick} stroke={C.brick} />
      </View>
      <View style={{ flex: 1 }}>
        <Text numberOfLines={1} style={{ fontFamily: F.serif, fontSize: 15, color: C.ink }}>{wish.name}</Text>
        <Text numberOfLines={1} style={{ marginTop: 2, fontFamily: F.sans, fontSize: 11, color: C.faint }}>{[wish.category, wish.where_text].filter(Boolean).join(" · ") || "예정"}</Text>
      </View>
    </Pressable>
  );
}
