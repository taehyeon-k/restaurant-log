import DateTimePicker from "@react-native-community/datetimepicker";
import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import * as Linking from "expo-linking";
import { useEffect, useRef, useState } from "react";
import { Platform, Pressable, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { BellIcon, BookmarkIcon, CameraIcon } from "@/components/icons";
import { Eyebrow } from "@/components/ui";
import { refreshAll } from "@/data/invalidate";
import { useWishes } from "@/data/queries";
import { supabase } from "@/lib/supabase";
import { dottedDate, wishKind, type Wish } from "@/lib/types";
import { firstUrl, noteWithoutUrl, releasePastWishes } from "@/lib/wishes";
import { C, F } from "@/theme";
import { setState } from "@/data/store";

const pad = (n: number) => String(n).padStart(2, "0");
const isoOf = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

/**
 * 가고싶다 — 아직 가지 않은 곳을 담아두는 목록. 기록과는 다른 테이블·다른 화면입니다
 * (인증마크·별점·사진·메뉴가 없습니다).
 */
export default function WishTab() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const qc = useQueryClient();
  const { data: wishes = [] } = useWishes();
  const [datingId, setDatingId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const swept = useRef(false);

  // 불러온 뒤 한 번 훑어서 지난 예정은 조용히 「언젠가」로 되돌립니다.
  useEffect(() => {
    if (swept.current || !wishes.length) return;
    swept.current = true;
    releasePastWishes(supabase, wishes).then((next) => { if (next !== wishes) void refreshAll(qc); });
  }, [wishes, qc]);

  const dated = wishes.filter((w) => w.plan_date).sort((a, b) => (a.plan_date! < b.plan_date! ? -1 : 1));
  const someday = wishes.filter((w) => !w.plan_date);

  async function patch(id: string, values: Partial<Wish>) {
    setBusyId(id);
    await supabase.from("wishes").update(values).eq("id", id);
    setBusyId(null);
    setDatingId(null);
    refreshAll(qc);
  }

  const verify = (w: Wish) => {
    setState({ kind: wishKind(w) });
    router.push({ pathname: "/capture", params: { verifyWishId: w.id, kind: wishKind(w) } });
  };

  const card = (w: Wish, isDated: boolean) => {
    const url = firstUrl(w.note);
    const body = noteWithoutUrl(w.note, url);
    const edit = () => router.push({ pathname: "/wish/new", params: { id: w.id } });
    return (
      <View key={w.id} style={{ borderRadius: 20, padding: 14, borderWidth: 1, borderStyle: isDated ? "solid" : "dashed", borderColor: isDated ? "#e0c3b1" : "#ded8cb", backgroundColor: isDated ? C.card : "transparent" }}>
        {isDated && (
          <View style={{ position: "absolute", top: 13, right: 14, flexDirection: "row", alignItems: "center", gap: 6 }}>
            <Text style={{ borderRadius: 9, borderWidth: 1, borderStyle: "dashed", borderColor: C.brick, paddingHorizontal: 8, fontFamily: F.mono, fontSize: 10.5, color: C.brick }}>{dottedDate(w.plan_date)}</Text>
            <Pressable onPress={() => patch(w.id, { plan_date: null })} disabled={busyId === w.id} accessibilityLabel="날짜 지우기" style={{ width: 26, height: 26, borderRadius: 13, borderWidth: 1, borderColor: "#e0c3b1", backgroundColor: C.card, alignItems: "center", justifyContent: "center" }}>
              <Text style={{ fontSize: 12, color: C.muted }}>✕</Text>
            </Pressable>
          </View>
        )}
        <Pressable onPress={edit}>
          <View style={{ paddingRight: isDated ? 92 : 0 }}>
            <Text style={{ fontFamily: F.serif, fontSize: 16, color: C.ink }}>{w.name}</Text>
            {!!(w.category || w.where_text) && <Text style={{ marginTop: 4, fontFamily: F.sans, fontSize: 11, color: C.faint }}>{[w.category, w.where_text].filter(Boolean).join(" · ")}</Text>}
          </View>
          {!!body && <Text style={{ marginTop: 8, fontFamily: F.serif, fontSize: 12.5, lineHeight: 21, color: "#4d4842" }}>{body}</Text>}
        </Pressable>

        <View style={{ marginTop: 10, flexDirection: "row", alignItems: "center", gap: 8 }}>
          <Pressable onPress={() => patch(w.id, { notify: !w.notify })} disabled={busyId === w.id} accessibilityLabel="근처 알림"
            style={{ width: 30, height: 30, borderRadius: 15, borderWidth: 1, borderColor: w.notify ? "#e0c3b1" : "transparent", backgroundColor: w.notify ? C.brickSoft : "transparent", alignItems: "center", justifyContent: "center" }}>
            <BellIcon size={14} stroke={w.notify ? C.brick : "#a29a8c"} />
          </Pressable>
          {url && (
            <Pressable onPress={() => Linking.openURL(url)} style={{ minHeight: 26, borderRadius: 15, borderWidth: 1, borderColor: "#ded8cb", paddingHorizontal: 10, justifyContent: "center" }}>
              <Text style={{ fontFamily: F.sans, fontSize: 11, color: C.muted }}>↗ 출처 보기</Text>
            </Pressable>
          )}
          {!isDated && (
            <Pressable onPress={() => setDatingId(w.id)} style={{ minHeight: 26, borderRadius: 15, borderWidth: 1, borderColor: "#ded8cb", paddingHorizontal: 10, justifyContent: "center" }}>
              <Text style={{ fontFamily: F.sans, fontSize: 11, color: C.muted }}>날짜 정하기</Text>
            </Pressable>
          )}
          <View style={{ flex: 1 }} />
          <Pressable onPress={edit} style={{ minHeight: 30, borderRadius: 15, borderWidth: 1, borderColor: "#e4dfd3", paddingHorizontal: 11, justifyContent: "center" }}>
            <Text style={{ fontFamily: F.sans, fontSize: 11, color: C.muted }}>수정</Text>
          </Pressable>
          <Pressable onPress={() => verify(w)} style={{ minHeight: 30, borderRadius: 15, backgroundColor: C.ink, paddingHorizontal: 11, flexDirection: "row", alignItems: "center", gap: 4 }}>
            <CameraIcon size={12} stroke={C.card} strokeWidth={1.8} />
            <Text style={{ fontFamily: F.sansMd, fontSize: 11, color: C.card }}>방문 인증</Text>
          </Pressable>
        </View>

        {datingId === w.id && (
          <DateTimePicker
            value={new Date()}
            minimumDate={new Date()}
            mode="date"
            display={Platform.OS === "ios" ? "inline" : "default"}
            onChange={(e, d) => {
              if (e.type === "dismissed") return setDatingId(null);
              if (d) patch(w.id, { plan_date: isoOf(d) });
            }}
          />
        )}

        {w.lat != null && (
          <View style={{ marginTop: 6, flexDirection: "row", alignItems: "center", gap: 4 }}>
            <BookmarkIcon size={10} stroke="#a29a8c" />
            <Text style={{ fontFamily: F.sans, fontSize: 10, color: "#a29a8c" }}>지도에 자리 있음</Text>
          </View>
        )}
      </View>
    );
  };

  const Section = ({ title, children }: { title: string; children: React.ReactNode }) => (
    <View style={{ marginTop: 16 }}>
      <Text style={{ paddingHorizontal: 4, fontFamily: F.mono, fontSize: 10, letterSpacing: 1.6, color: C.faint }}>{title}</Text>
      <View style={{ marginTop: 8, gap: 10 }}>{children}</View>
    </View>
  );

  return (
    <View style={{ flex: 1, backgroundColor: C.paper, paddingTop: insets.top + 8 }}>
      <View style={{ paddingHorizontal: 20, paddingBottom: 14 }}>
        <Eyebrow wide>WISHLIST</Eyebrow>
        <Text style={{ marginTop: 8, fontFamily: F.serif, fontSize: 22, color: C.ink }}>위시리스트</Text>
        <Text style={{ marginTop: 6, fontFamily: F.sans, fontSize: 12, color: C.faint }}>
          {dated.length ? `담아둔 곳 ${wishes.length}곳 · 날짜 정한 곳 ${dated.length}곳` : `담아둔 곳 ${wishes.length}곳`}
        </Text>
        <Text style={{ marginTop: 8, fontFamily: F.sans, fontSize: 11.5, lineHeight: 18, color: C.faint }}>아직 가지 않은 곳입니다. 인증 도장은 그 자리에서 사진을 찍을 때만 붙습니다.</Text>
        <Pressable onPress={() => router.push("/wish/new")} style={{ marginTop: 14, minHeight: 48, borderRadius: 18, borderWidth: 1, borderStyle: "dashed", borderColor: "#cdc6b8", alignItems: "center", justifyContent: "center" }}>
          <Text style={{ fontFamily: F.sans, fontSize: 13, color: C.muted }}>+ 가고 싶은 곳 담기</Text>
        </Pressable>
      </View>
      <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 74 + insets.bottom + 32 }}>
        {wishes.length === 0 ? (
          <Text style={{ paddingVertical: 44, textAlign: "center", fontFamily: F.sans, fontSize: 12.5, color: C.faint }}>아직 담아둔 곳이 없습니다.</Text>
        ) : (
          <>
            {dated.length > 0 && <Section title="날짜를 정한 곳">{dated.map((w) => card(w, true))}</Section>}
            {someday.length > 0 && <Section title="언젠가">{someday.map((w) => card(w, false))}</Section>}
          </>
        )}
      </ScrollView>
    </View>
  );
}
