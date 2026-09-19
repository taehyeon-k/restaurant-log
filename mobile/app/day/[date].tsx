/**
 * 그날 화면 — 월력 칸을 누르면 열립니다. 지난 날은 기록만, 오늘은 둘 다,
 * 다가올 날은 계획만 추가할 수 있습니다. 웹 `DayScreen.tsx` 그대로입니다.
 */
import { useMemo, useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { BookmarkIcon, MobileStars, PhotoFill, PlusIcon, VerifiedMark } from "@/components/ui";
import { useRestaurants, useWishes } from "@/lib/data";
import { coverPhoto, dottedDate, verifiedTime, type Restaurant, type Wish } from "@/lib/types";
import { C, FONT, SHADOW } from "@/lib/theme";

const pad = (n: number) => String(n).padStart(2, "0");
const todayKey = () => {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

export default function DayScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { rows } = useRestaurants();
  const { wishes } = useWishes();

  const { date: dateKey } = useLocalSearchParams<{ date: string }>();
  const [menuOpen, setMenuOpen] = useState(false);

  const visits = useMemo(
    () =>
      rows
        .filter((r) => !r.pending && r.visited_at === dateKey)
        .sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0)),
    [rows, dateKey]
  );

  const dayWishes = useMemo(
    () =>
      wishes
        .filter((w) => w.plan_date === dateKey)
        .sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0)),
    [wishes, dateKey]
  );

  const [, m, d] = dateKey.split("-").map(Number);
  const today = todayKey();
  const isFuture = dateKey > today;
  const isToday = dateKey === today;
  const empty = visits.length === 0 && dayWishes.length === 0;

  const addRecord = () =>
    router.push({ pathname: "/record/new", params: { kind: "restaurant", visitedAt: dateKey } });
  const addWish = () => router.push({ pathname: "/wish/new", params: { plan_date: dateKey } });

  function handlePlus() {
    if (isToday) {
      setMenuOpen((v) => !v);
      return;
    }
    setMenuOpen(false);
    if (isFuture) addWish();
    else addRecord();
  }

  const countLine =
    [visits.length ? `기록 ${visits.length}건` : null, dayWishes.length ? `예정 ${dayWishes.length}건` : null]
      .filter(Boolean)
      .join(" · ") || (isFuture ? "예정 없음" : "기록 없음");

  return (
    <View style={{ flex: 1, backgroundColor: C.paper }}>
      <View
        style={{
          borderBottomWidth: 1,
          borderBottomColor: "#e6e0d3",
          paddingHorizontal: 20,
          paddingTop: insets.top + 8,
          paddingBottom: 16,
          zIndex: 10,
        }}
      >
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
          <Pressable onPress={() => router.back()} accessibilityLabel="뒤로" hitSlop={8} style={{ width: 44, height: 44, alignItems: "center", justifyContent: "center", marginLeft: -10 }}>
            <Text style={{ fontSize: 17, color: C.ink }}>←</Text>
          </Pressable>

          <View>
            <Pressable
              onPress={handlePlus}
              accessibilityLabel="기록·계획 추가"
              style={{
                width: 44,
                height: 44,
                borderRadius: 22,
                alignItems: "center",
                justifyContent: "center",
                borderWidth: 1,
                borderColor: C.line,
                backgroundColor: C.card,
              }}
            >
              <PlusIcon />
            </Pressable>

            {menuOpen && (
              <View style={{ position: "absolute", top: 52, right: 0, alignItems: "flex-end", gap: 8 }}>
                <MenuItem
                  label="기록 추가"
                  icon={<View style={{ width: 22, height: 22, borderRadius: 11, borderWidth: 1.5, borderColor: C.faint }} />}
                  onPress={() => {
                    setMenuOpen(false);
                    addRecord();
                  }}
                />
                <MenuItem
                  label="계획 추가"
                  icon={<BookmarkIcon size={20} stroke={C.ink} />}
                  onPress={() => {
                    setMenuOpen(false);
                    addWish();
                  }}
                />
              </View>
            )}
          </View>
        </View>

        <Text style={{ marginTop: 8, fontFamily: FONT.mono, fontSize: 10, letterSpacing: 1.8, color: C.faint }}>
          {dottedDate(dateKey)}
        </Text>
        <Text style={{ marginTop: 4, fontFamily: FONT.serifBold, fontSize: 26, color: C.ink }}>
          {visits.length > 0 ? `${m}월 ${d}일 방문한 식당` : `${m}월 ${d}일`}
        </Text>
        <Text style={{ marginTop: 4, fontSize: 12, color: C.dim, fontFamily: FONT.sans }}>{countLine}</Text>
      </View>

      <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 14, paddingBottom: insets.bottom + 40 }}>
        {empty ? (
          <View style={{ marginTop: 32, alignItems: "center", gap: 14, paddingHorizontal: 24 }}>
            <Text style={{ fontSize: 13, lineHeight: 22, color: C.faint, textAlign: "center", fontFamily: FONT.sans }}>
              {isFuture
                ? "아직 계획한 곳이 없습니다. 계획을 추가해보시겠습니까?"
                : "아직 방문한 식당이 없습니다. 기록을 추가해보시겠습니까?"}
            </Text>
            <Pressable
              onPress={isFuture ? addWish : addRecord}
              style={{
                minHeight: 48,
                width: "100%",
                maxWidth: 280,
                alignItems: "center",
                justifyContent: "center",
                borderRadius: 18,
                borderWidth: 1,
                borderStyle: "dashed",
                borderColor: "#cdc6b8",
              }}
            >
              <Text style={{ fontSize: 13, color: C.muted, fontFamily: FONT.sans }}>
                {isFuture ? "+ 계획 추가" : "+ 기록 추가"}
              </Text>
            </Pressable>
          </View>
        ) : (
          <View style={{ gap: 10 }}>
            {visits.map((v) => (
              <VisitCard key={v.id} record={v} onPress={() => router.push(`/record/${v.id}`)} />
            ))}

            {dayWishes.length > 0 && (
              <View style={{ marginTop: visits.length > 0 ? 8 : 0, gap: 10 }}>
                {visits.length > 0 && (
                  <Text style={{ paddingHorizontal: 4, fontFamily: FONT.mono, fontSize: 10, letterSpacing: 1.6, color: C.faint }}>
                    예정
                  </Text>
                )}
                {dayWishes.map((w) => (
                  <WishRow
                    key={w.id}
                    wish={w}
                    onPress={() => router.push({ pathname: "/wish/new", params: { id: w.id } })}
                  />
                ))}
              </View>
            )}
          </View>
        )}
      </ScrollView>
    </View>
  );
}

function MenuItem({ label, icon, onPress }: { label: string; icon: React.ReactNode; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      style={[
        { flexDirection: "row", alignItems: "center", gap: 8, minHeight: 46, borderRadius: 16, backgroundColor: C.card, paddingHorizontal: 16 },
        SHADOW.card,
      ]}
    >
      {icon}
      <Text style={{ fontSize: 13, color: C.ink, fontFamily: FONT.sans }}>{label}</Text>
    </Pressable>
  );
}

function VisitCard({ record, onPress }: { record: Restaurant; onPress: () => void }) {
  const photo = coverPhoto(record);
  const summary = record.review || record.menu || "메모가 비어 있습니다";

  return (
    <Pressable
      onPress={onPress}
      style={{
        flexDirection: "row",
        alignItems: "flex-start",
        gap: 12,
        borderRadius: 22,
        borderWidth: 1,
        borderColor: record.verified ? "#e0c3b1" : "#e4dfd3",
        backgroundColor: C.card,
        padding: 12,
      }}
    >
      <PhotoFill src={photo} category={record.category} radius={18} style={{ width: 72, height: 72 }}>
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
          {!photo && (
            <Text style={{ fontFamily: FONT.mono, fontSize: 9, letterSpacing: 0.7, color: "rgba(251,250,246,.9)" }}>
              PHOTO
            </Text>
          )}
        </View>
        {record.verified && (
          <View style={{ position: "absolute", right: -3, bottom: -3 }}>
            <VerifiedMark size={24} />
          </View>
        )}
      </PhotoFill>

      <View style={{ flex: 1, minWidth: 0 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
          <Text numberOfLines={1} style={{ flexShrink: 1, fontFamily: FONT.serifBold, fontSize: 16, color: C.ink }}>
            {record.name}
          </Text>
          {record.revisit && (
            <View style={{ borderRadius: 9, backgroundColor: C.brickSoft, paddingHorizontal: 7, paddingVertical: 2 }}>
              <Text style={{ fontSize: 9.5, color: C.brick, fontFamily: FONT.sans }}>재방문</Text>
            </View>
          )}
        </View>

        <Text style={{ marginTop: 4, fontSize: 11, color: C.faint, fontFamily: FONT.sans }}>
          {[record.category, record.region].filter(Boolean).join(" · ")}
        </Text>

        <View style={{ marginTop: 6, flexDirection: "row", alignItems: "center", gap: 8 }}>
          <MobileStars rating={record.rating} size={12.5} />
          <Text style={{ fontFamily: FONT.mono, fontSize: 10.5, color: C.muted }}>
            {record.rating?.toFixed(1) ?? "—"}
          </Text>
          {record.verified && record.verified_at && (
            <>
              <View style={{ width: 1, height: 11, backgroundColor: C.hairline }} />
              <Text style={{ fontFamily: FONT.mono, fontSize: 10.5, color: C.brick }}>
                {verifiedTime(record.verified_at)}
              </Text>
            </>
          )}
        </View>

        <Text numberOfLines={2} style={{ marginTop: 6, fontSize: 11.5, lineHeight: 17, color: C.body, fontFamily: FONT.sans }}>
          {summary}
        </Text>
      </View>
    </Pressable>
  );
}

function WishRow({ wish, onPress }: { wish: Wish; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: 12,
        borderRadius: 22,
        borderWidth: 1,
        borderStyle: "dashed",
        borderColor: C.hairline,
        padding: 12,
      }}
    >
      <View
        style={{
          width: 44,
          height: 44,
          borderRadius: 22,
          alignItems: "center",
          justifyContent: "center",
          borderWidth: 1,
          borderColor: "#e0c3b1",
          backgroundColor: "#f9f0e9",
        }}
      >
        <BookmarkIcon size={16} fill={C.brick} stroke={C.brick} />
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text numberOfLines={1} style={{ fontFamily: FONT.serifBold, fontSize: 15, color: C.ink }}>
          {wish.name}
        </Text>
        <Text numberOfLines={1} style={{ marginTop: 2, fontSize: 11, color: C.faint, fontFamily: FONT.sans }}>
          {[wish.category, wish.where_text].filter(Boolean).join(" · ") || "예정"}
        </Text>
      </View>
    </Pressable>
  );
}
