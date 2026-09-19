/**
 * 가고싶다 — 아직 가지 않은 곳을 담아두는 목록. 기록과는 다른 테이블·다른 화면입니다:
 * 인증마크·별점·사진·메뉴가 없습니다. 웹 `WishScreen.tsx` 그대로입니다.
 */
import { useEffect, useRef, useState } from "react";
import { FlatList, Linking, Pressable, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import DateField from "@/components/DateField";
import { BellIcon, BookmarkIcon, CameraIcon, Eyebrow, ExternalLinkIcon } from "@/components/ui";
import { supabase } from "@/lib/supabase";
import { releasePastWishes, useRefresh, useWishes } from "@/lib/data";
import { firstUrl, noteWithoutUrl } from "@/lib/wishNote";
import { dottedDate, type Wish } from "@/lib/types";
import { C, FONT, TAB_BAR_HEIGHT } from "@/lib/theme";

const pad = (n: number) => String(n).padStart(2, "0");
const todayKey = () => {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

const meta = (w: Wish) => [w.category, w.where_text].filter(Boolean).join(" · ");

export default function WishListScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const refresh = useRefresh();
  const { wishes } = useWishes();

  const [datingId, setDatingId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const swept = useRef(false);

  // 불러온 뒤 한 번 훑어서 지난 예정은 조용히 「언젠가」로 되돌립니다(§2).
  useEffect(() => {
    if (swept.current || wishes.length === 0) return;
    swept.current = true;
    void releasePastWishes(wishes).then((changed) => {
      if (changed) refresh();
    });
  }, [wishes, refresh]);

  const dated = wishes.filter((w) => w.plan_date).sort((a, b) => (a.plan_date! < b.plan_date! ? -1 : 1));
  const someday = wishes.filter((w) => !w.plan_date);

  async function patch(id: string, values: Record<string, unknown>) {
    setBusyId(id);
    await supabase.from("wishes").update(values).eq("id", id);
    setBusyId(null);
    refresh();
  }

  const countLine = dated.length
    ? `담아둔 곳 ${wishes.length}곳 · 날짜 정한 곳 ${dated.length}곳`
    : `담아둔 곳 ${wishes.length}곳`;

  type Row = { type: "section"; title: string } | { type: "wish"; wish: Wish; dated: boolean };

  const rows: Row[] = [
    ...(dated.length ? [{ type: "section", title: "날짜를 정한 곳" } as Row] : []),
    ...dated.map((w) => ({ type: "wish", wish: w, dated: true }) as Row),
    ...(someday.length ? [{ type: "section", title: "언젠가" } as Row] : []),
    ...someday.map((w) => ({ type: "wish", wish: w, dated: false }) as Row),
  ];

  return (
    <View style={{ flex: 1, backgroundColor: C.paper, paddingBottom: TAB_BAR_HEIGHT + insets.bottom }}>
      <View style={{ paddingHorizontal: 20, paddingTop: insets.top + 8, paddingBottom: 14 }}>
        <Eyebrow wide>WISHLIST</Eyebrow>
        <Text style={{ marginTop: 8, fontFamily: FONT.serifBold, fontSize: 22, color: C.ink }}>위시리스트</Text>
        <Text style={{ marginTop: 6, fontSize: 12, color: C.faint, fontFamily: FONT.sans }}>{countLine}</Text>
        <Text style={{ marginTop: 8, fontSize: 11.5, lineHeight: 18, color: C.faint, fontFamily: FONT.sans }}>
          아직 가지 않은 곳입니다. 인증 도장은 그 자리에서 사진을 찍을 때만 붙습니다.
        </Text>

        <Pressable
          onPress={() => router.push("/wish/new")}
          style={{
            marginTop: 14,
            minHeight: 48,
            alignItems: "center",
            justifyContent: "center",
            borderRadius: 18,
            borderWidth: 1,
            borderStyle: "dashed",
            borderColor: "#cdc6b8",
          }}
        >
          <Text style={{ fontSize: 13, color: C.muted, fontFamily: FONT.sans }}>+ 가고 싶은 곳 담기</Text>
        </Pressable>
      </View>

      <FlatList
        data={rows}
        keyExtractor={(r, i) => (r.type === "section" ? `s:${r.title}` : `w:${r.wish.id}`) + i}
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 32, gap: 10 }}
        ListEmptyComponent={
          <Text style={{ paddingHorizontal: 20, paddingVertical: 44, textAlign: "center", fontSize: 12.5, lineHeight: 22, color: C.faint, fontFamily: FONT.sans }}>
            아직 담아둔 곳이 없습니다.
          </Text>
        }
        renderItem={({ item }) =>
          item.type === "section" ? (
            <Text style={{ marginTop: 6, paddingHorizontal: 4, fontFamily: FONT.mono, fontSize: 10, letterSpacing: 1.6, color: C.faint }}>
              {item.title}
            </Text>
          ) : (
            <WishCard
              wish={item.wish}
              dated={item.dated}
              dating={datingId === item.wish.id}
              busy={busyId === item.wish.id}
              onOpen={() => router.push({ pathname: "/wish/new", params: { id: item.wish.id } })}
              onClearDate={() => patch(item.wish.id, { plan_date: null })}
              onStartDating={() => setDatingId(item.wish.id)}
              onSetDate={(d) => {
                setDatingId(null);
                void patch(item.wish.id, { plan_date: d || null });
              }}
              onToggleNotify={() => patch(item.wish.id, { notify: !item.wish.notify })}
              onVerify={() =>
                router.push({ pathname: "/capture", params: { verifyWishId: item.wish.id } })
              }
            />
          )
        }
      />
    </View>
  );
}

function WishCard({
  wish,
  dated,
  dating,
  busy,
  onOpen,
  onClearDate,
  onStartDating,
  onSetDate,
  onToggleNotify,
  onVerify,
}: {
  wish: Wish;
  dated: boolean;
  dating: boolean;
  busy: boolean;
  onOpen: () => void;
  onClearDate: () => void;
  onStartDating: () => void;
  onSetDate: (date: string) => void;
  onToggleNotify: () => void;
  onVerify: () => void;
}) {
  const url = firstUrl(wish.note);
  const noteBody = noteWithoutUrl(wish.note, url);

  return (
    <View
      style={{
        borderRadius: 20,
        padding: 14,
        borderWidth: 1,
        borderStyle: dated ? "solid" : "dashed",
        borderColor: dated ? "#e0c3b1" : C.hairline,
        backgroundColor: dated ? C.card : "transparent",
      }}
    >
      {dated && (
        <View style={{ position: "absolute", top: 13, right: 14, flexDirection: "row", alignItems: "center", gap: 6, zIndex: 2 }}>
          <View style={{ borderRadius: 9, borderWidth: 1, borderStyle: "dashed", borderColor: C.brick, paddingHorizontal: 8 }}>
            <Text style={{ fontFamily: FONT.mono, fontSize: 10.5, color: C.brick }}>{dottedDate(wish.plan_date)}</Text>
          </View>
          <Pressable
            onPress={onClearDate}
            disabled={busy}
            accessibilityLabel="날짜 지우기"
            hitSlop={6}
            style={{
              width: 26,
              height: 26,
              borderRadius: 13,
              alignItems: "center",
              justifyContent: "center",
              borderWidth: 1,
              borderColor: "#e0c3b1",
              backgroundColor: C.card,
            }}
          >
            <Text style={{ fontSize: 12, color: C.muted }}>✕</Text>
          </Pressable>
        </View>
      )}

      <Pressable onPress={onOpen}>
        <View style={{ paddingRight: dated ? 92 : 0 }}>
          <Text style={{ fontFamily: FONT.serifBold, fontSize: 16, color: C.ink }}>{wish.name}</Text>
          {meta(wish).length > 0 && (
            <Text style={{ marginTop: 4, fontSize: 11, color: C.faint, fontFamily: FONT.sans }}>{meta(wish)}</Text>
          )}
        </View>
        {noteBody.length > 0 && (
          <Text style={{ marginTop: 8, fontFamily: FONT.serif, fontSize: 12.5, lineHeight: 21, color: C.body }}>
            {noteBody}
          </Text>
        )}
      </Pressable>

      <View style={{ marginTop: 10, flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <Pressable
          onPress={onToggleNotify}
          disabled={busy}
          accessibilityLabel="근처 알림"
          style={{
            width: 30,
            height: 30,
            borderRadius: 15,
            alignItems: "center",
            justifyContent: "center",
            borderWidth: wish.notify ? 1 : 0,
            borderColor: "#e0c3b1",
            backgroundColor: wish.notify ? C.brickSoft : "transparent",
          }}
        >
          <BellIcon size={14} stroke={wish.notify ? C.brick : C.dim} />
        </Pressable>

        {url && (
          <Pressable
            onPress={() => void Linking.openURL(url)}
            style={{
              minHeight: 26,
              flexDirection: "row",
              alignItems: "center",
              gap: 4,
              borderRadius: 15,
              borderWidth: 1,
              borderColor: C.hairline,
              paddingHorizontal: 10,
            }}
          >
            <ExternalLinkIcon size={11} />
            <Text style={{ fontSize: 11, color: C.muted, fontFamily: FONT.sans }}>출처 보기</Text>
          </Pressable>
        )}

        {!dated &&
          (dating ? (
            <DateField
              value=""
              minimumDate={new Date(`${todayKey()}T00:00:00`)}
              onChange={onSetDate}
              placeholder="날짜 고르기"
              style={{ minHeight: 26, paddingHorizontal: 10, borderColor: C.brick }}
            />
          ) : (
            <Pressable
              onPress={onStartDating}
              style={{
                minHeight: 26,
                justifyContent: "center",
                borderRadius: 15,
                borderWidth: 1,
                borderColor: C.hairline,
                paddingHorizontal: 10,
              }}
            >
              <Text style={{ fontSize: 11, color: C.muted, fontFamily: FONT.sans }}>날짜 정하기</Text>
            </Pressable>
          ))}

        <View style={{ flex: 1 }} />

        <Pressable
          onPress={onOpen}
          style={{
            minHeight: 30,
            justifyContent: "center",
            borderRadius: 15,
            borderWidth: 1,
            borderColor: "#e4dfd3",
            paddingHorizontal: 11,
          }}
        >
          <Text style={{ fontSize: 11, color: C.muted, fontFamily: FONT.sans }}>수정</Text>
        </Pressable>

        <Pressable
          onPress={onVerify}
          style={{
            minHeight: 30,
            flexDirection: "row",
            alignItems: "center",
            gap: 4,
            borderRadius: 15,
            backgroundColor: C.ink,
            paddingHorizontal: 11,
          }}
        >
          <CameraIcon size={12} stroke={C.card} width={1.8} />
          <Text style={{ fontSize: 11, color: C.card, fontFamily: FONT.sansMedium }}>방문 인증</Text>
        </Pressable>
      </View>

      {wish.lat != null && (
        <View style={{ marginTop: 6, flexDirection: "row", alignItems: "center", gap: 4 }}>
          <BookmarkIcon size={10} stroke={C.dim} />
          <Text style={{ fontSize: 10, color: C.dim, fontFamily: FONT.sans }}>지도에 자리 있음</Text>
        </View>
      )}
    </View>
  );
}
