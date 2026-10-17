import DateTimePicker from "@react-native-community/datetimepicker";
import { useQueryClient } from "@tanstack/react-query";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import { useState } from "react";
import { Alert, Modal, Platform, Pressable, ScrollView, Text, View } from "react-native";
import Animated, { SlideInLeft } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, { Path } from "react-native-svg";
import { Character } from "@/components/Character";
import { Eyebrow } from "@/components/ui";
import { closeBook, setActiveBook, updateStartedOn, useActiveBook, type Book } from "@/data/books";
import { useAccount } from "@/data/profile";
import { useBookRows } from "@/data/queries";
import { dayCount, todayIso } from "@/lib/anniversary";
import type { Restaurant } from "@/lib/types";
import { C, F } from "@/theme";
import { Pair } from "./Avatars";
import { SinceDays } from "./Since";
import { SignedImage } from "@/lib/signedPhoto";

const DRAWER_W = 308;
const pad = (n: number) => String(n).padStart(2, "0");
const isoOf = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const placeKeyOf = (r: Restaurant) => r.place_key ?? `${r.name}|${r.address ?? ""}`.toLowerCase();

/** 기록장 하나의 「가게 n · 기록 n」. */
function useCounts(book: Book | null) {
  const { data: rows = [] } = useBookRows(book?.id ?? null, !!book);
  const visible = rows.filter((r) => !r.pending);
  return { places: new Set(visible.map(placeKeyOf)).size, records: visible.length };
}

const Check = () => (
  <View style={{ width: 22, height: 22, borderRadius: 11, backgroundColor: C.ink, alignItems: "center", justifyContent: "center" }}>
    <Svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke={C.card} strokeWidth={3} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M5 12.5l4.5 4.5L19 7.5" />
    </Svg>
  </View>
);

/**
 * 내 계정 사진(HANDOFF-recommend §2, 시안 2a·2b) — 40px 원, 안쪽 테두리 2 종이색 + 바깥 링 1.5 벽돌색.
 * 사진 → 대표 캐릭터 → 닉네임 첫 글자 순.
 */
function AccountPhoto() {
  const { data: account } = useAccount();
  const initial = Array.from(account?.nickname?.trim() || "나")[0];
  return (
    <View style={{ width: 43, height: 43, borderRadius: 21.5, borderWidth: 1.5, borderColor: C.brick, alignItems: "center", justifyContent: "center" }}>
      <View
        style={{
          width: 40, height: 40, borderRadius: 20, borderWidth: 2, borderColor: C.card, overflow: "hidden", alignItems: "center", justifyContent: "center",
          backgroundColor: account?.avatarUrl ? "#ded8cb" : account?.characterId ? C.brickSoft : C.brick,
        }}
      >
        {account?.avatarUrl ? (
          <SignedImage uri={account.avatarUrl} style={{ width: 36, height: 36 }} />
        ) : account?.characterId ? (
          <View style={{ marginTop: 6 }}><Character id={account.characterId} size={34} /></View>
        ) : (
          <Text style={{ fontFamily: F.sansBd, fontSize: 16, color: C.card }}>{initial}</Text>
        )}
      </View>
    </View>
  );
}

/**
 * 기록장 메뉴(HANDOFF-couple §3-2, 시안 1b·2b) — 왼쪽에서 열리는 308px 서랍.
 * 카드 두 장(개인 기록 / 연인 기록) 중 하나를 고르면 지도·캘린더·촬영 저장 위치가 그 기록장으로 바뀝니다.
 */
export default function BookDrawer({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const qc = useQueryClient();
  const { books, book: active, me } = useActiveBook();
  const personal = books?.personal ?? null;
  const couple = books?.couple ?? null;
  const personalCount = useCounts(personal);
  const coupleCount = useCounts(couple);
  const [editDate, setEditDate] = useState(false);
  const [busy, setBusy] = useState(false);

  const open = couple && !couple.closedAt;
  const partner = couple?.members.find((m) => m.userId !== me?.userId) ?? null;
  const waiting = !!open && !partner;
  // 사귄 날 · 연결 끊기는 연인 기록을 골랐을 때만.
  const coupleActive = !!open && active?.id === couple?.id;

  const pick = (b: Book) => {
    Haptics.selectionAsync();
    setActiveBook(b.id);
    onClose();
  };

  const go = (path: "/couple/new" | "/couple/join", params?: Record<string, string>) => {
    onClose();
    router.push(params ? { pathname: path, params } : path);
  };

  async function changeDate(d: Date) {
    if (!couple) return;
    const iso = isoOf(d);
    if (iso > todayIso()) return Alert.alert("오늘 이후 날짜는 고를 수 없어요");
    try {
      await updateStartedOn(qc, couple.id, iso);
    } catch (e) {
      Alert.alert("사귄 날을 바꾸지 못했어요", e instanceof Error ? e.message : undefined);
    }
  }

  function disconnect() {
    if (!couple) return;
    Alert.alert(
      "연결을 끊을까요?",
      "끊은 뒤에는 두 사람 모두 이 기록장을 읽기만 할 수 있어요. 개인 기록은 그대로입니다.",
      [
        { text: "취소", style: "cancel" },
        {
          text: "연결 끊기",
          style: "destructive",
          onPress: async () => {
            setBusy(true);
            try {
              await closeBook(qc, couple.id);
              if (personal) setActiveBook(personal.id);
            } catch (e) {
              Alert.alert("연결을 끊지 못했어요", e instanceof Error ? e.message : undefined);
            } finally {
              setBusy(false);
            }
          },
        },
      ]
    );
  }

  const card = (b: Book, title: string, sub: string, lead: React.ReactNode, tag?: string) => {
    const selected = active?.id === b.id;
    return (
      <Pressable
        onPress={() => pick(b)}
        accessibilityRole="button"
        accessibilityState={{ selected }}
        style={{
          flexDirection: "row", alignItems: "center", gap: 12, borderRadius: 20, padding: 14, backgroundColor: C.card,
          borderWidth: selected ? 1.5 : 1, borderColor: selected ? C.ink : C.lineSoft,
        }}
      >
        {lead}
        <View style={{ flex: 1, minWidth: 0 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
            <Text style={{ fontFamily: F.serif, fontSize: 16, color: C.ink }}>{title}</Text>
            {tag && (
              <Text style={{ borderRadius: 8, backgroundColor: "#efe9dc", paddingHorizontal: 6, paddingVertical: 1, fontFamily: F.mono, fontSize: 9, color: C.muted, overflow: "hidden" }}>{tag}</Text>
            )}
          </View>
          <Text numberOfLines={1} style={{ marginTop: 4, fontFamily: F.mono, fontSize: 10.5, color: C.faint }}>{sub}</Text>
        </View>
        {selected && <Check />}
      </Pressable>
    );
  };

  const coupleSub = couple
    ? waiting
      ? "상대의 수락을 기다리는 중"
      : `가게 ${coupleCount.places} · 기록 ${coupleCount.records}${couple.startedOn ? ` · D+${dayCount(couple.startedOn)}` : ""}`
    : "";

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <View style={{ flex: 1, flexDirection: "row", backgroundColor: "rgba(28,26,23,.38)" }}>
        {visible && (
          <Animated.View entering={SlideInLeft.duration(220)} style={{ width: DRAWER_W, maxWidth: "86%", backgroundColor: C.paper, paddingTop: insets.top + 14, paddingBottom: insets.bottom + 16 }}>
            <ScrollView contentContainerStyle={{ paddingHorizontal: 18, gap: 10 }}>
              <Eyebrow wide>BOOKS</Eyebrow>
              <Text style={{ marginTop: 2, marginBottom: 8, fontFamily: F.serif, fontSize: 22, color: C.ink }}>기록장</Text>

              {personal &&
                card(
                  personal, "개인 기록", `가게 ${personalCount.places} · 기록 ${personalCount.records}`,
                  <View style={{ width: 42, height: 42, borderRadius: 21, backgroundColor: "#efe9dc", alignItems: "center", justifyContent: "center" }}>
                    <MenuLines stroke={C.ink} />
                  </View>
                )}

              {couple &&
                card(
                  couple, "연인 기록", coupleSub,
                  <View style={{ width: 42, alignItems: "center" }}><Pair me={me} partner={partner} size={26} overlap={8} /></View>,
                  couple.closedAt ? "끊긴 기록장" : undefined
                )}

              {/* 열린 연인 기록장이 없으면 만들기 — 끊긴 기록장이 있어도 새로 만들 수 있습니다(§4). */}
              {!open && (
                <View style={{ borderRadius: 20, borderWidth: 1, borderStyle: "dashed", borderColor: "#cdc6b8", padding: 16 }}>
                  <Text style={{ fontFamily: F.serif, fontSize: 16, color: C.ink }}>연인 기록</Text>
                  <Text style={{ marginTop: 5, fontFamily: F.sans, fontSize: 11.5, lineHeight: 18, color: C.muted }}>둘이 함께 쓰는 기록장을 따로 만들어요. 무료예요.</Text>
                  <Pressable onPress={() => go("/couple/new")} style={{ marginTop: 12, minHeight: 42, borderRadius: 16, backgroundColor: C.ink, alignItems: "center", justifyContent: "center" }}>
                    <Text style={{ fontFamily: F.sansMd, fontSize: 13, color: C.card }}>만들기</Text>
                  </Pressable>
                </View>
              )}
              {!open && (
                <Pressable onPress={() => go("/couple/join")} style={{ alignSelf: "center", paddingVertical: 10, paddingHorizontal: 12 }}>
                  <Text style={{ fontFamily: F.sans, fontSize: 12.5, color: C.brick, textDecorationLine: "underline" }}>초대 코드를 받았어요</Text>
                </Pressable>
              )}

              {coupleActive && (
                <View style={{ marginTop: 4, borderTopWidth: 1, borderTopColor: C.lineSoft }}>
                  {waiting && (
                    <Pressable onPress={() => go("/couple/new", { book: couple.id })} style={rowStyle}>
                      <Text style={rowLabel}>초대 코드 다시 보기</Text>
                      <Text style={{ fontSize: 14, color: C.faint }}>›</Text>
                    </Pressable>
                  )}
                  <Pressable onPress={() => setEditDate((v) => !v)} style={rowStyle}>
                    {couple.startedOn ? <SinceDays startedOn={couple.startedOn} size={12.5} /> : <Text style={rowLabel}>사귄 날</Text>}
                    <Text style={{ fontFamily: F.sans, fontSize: 12, color: C.brick }}>{editDate ? "닫기" : "수정"}</Text>
                  </Pressable>
                  {editDate && (
                    <DateTimePicker
                      value={couple.startedOn ? new Date(couple.startedOn + "T00:00:00") : new Date()}
                      maximumDate={new Date()}
                      mode="date"
                      display={Platform.OS === "ios" ? "spinner" : "default"}
                      locale="ko-KR"
                      onChange={(e, d) => {
                        if (Platform.OS !== "ios") setEditDate(false);
                        if (e.type !== "dismissed" && d) void changeDate(d);
                      }}
                    />
                  )}
                  <Pressable onPress={disconnect} disabled={busy} style={[rowStyle, { opacity: busy ? 0.5 : 1 }]}>
                    <Text style={[rowLabel, { color: "#a8412a" }]}>연결 끊기</Text>
                  </Pressable>
                </View>
              )}

            </ScrollView>
            {/* 머리 오른쪽 위 내 계정 사진 — 서랍을 닫고 내계정을 엽니다. 연인 기록 중에도 내 계정. */}
            <Pressable
              onPress={() => { onClose(); router.navigate("/me"); }}
              accessibilityRole="button"
              accessibilityLabel="내 계정"
              style={{ position: "absolute", right: 16, top: insets.top + 20, width: 44, height: 44, alignItems: "center", justifyContent: "center" }}
            >
              <AccountPhoto />
            </Pressable>
          </Animated.View>
        )}
        <Pressable style={{ flex: 1 }} onPress={onClose} accessibilityLabel="기록장 메뉴 닫기" />
      </View>
    </Modal>
  );
}

const rowStyle = {
  minHeight: 48, flexDirection: "row" as const, alignItems: "center" as const, justifyContent: "space-between" as const,
  borderBottomWidth: 1, borderBottomColor: C.lineSoft, paddingHorizontal: 4,
};
const rowLabel = { fontFamily: F.sans, fontSize: 13, color: C.muted };

/** ≡ 세 줄 — 지도 머리 버튼과 개인 기록 카드. */
export const MenuLines = ({ stroke = C.ink, size = 18 }: { stroke?: string; size?: number }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth={1.8} strokeLinecap="round">
    <Path d="M4.5 7h15M4.5 12h15M4.5 17h15" />
  </Svg>
);
