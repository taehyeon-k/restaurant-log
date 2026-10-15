import DateTimePicker from "@react-native-community/datetimepicker";
import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { useMemo, useState } from "react";
import { Alert, Platform, Pressable, ScrollView, Share, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, { Path } from "react-native-svg";
import { Row, Stat } from "@/components/AccountRows";
import { Character } from "@/components/Character";
import { Eyebrow } from "@/components/ui";
import {
  closeBook, ME_COLOR, PARTNER_COLOR, setActiveBook, updateStartedOn, useActiveBook, useAnniversaryPicks, useRecordNotes,
} from "@/data/books";
import { useAccount } from "@/data/profile";
import { useRows, useWishes } from "@/data/queries";
import { daysBetween, dayCount, dottedWithDay, mealFor, milestonesUntil, nextMilestone, todayIso } from "@/lib/anniversary";
import { DEFAULT_CHARACTER } from "@/lib/characters";
import { earnedCoupleLabels, filledAnniversaries, visitsByPlace } from "@/lib/coupleLabels";
import { dottedDate } from "@/lib/types";
import { C, F, TAB_BAR_H } from "@/theme";
import { Pair } from "./Avatars";

const pad = (n: number) => String(n).padStart(2, "0");
const isoOf = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const DISCONNECT = "#a8412a";

const Heart = ({ size = 16 }: { size?: number }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24">
    <Path d="M12 20.5s-7.5-4.6-7.5-10.3A4.2 4.2 0 0 1 12 7.6a4.2 4.2 0 0 1 7.5 2.6c0 5.7-7.5 10.3-7.5 10.3Z" fill={C.brick} />
  </Svg>
);

const SectionHead = ({ title, right, onPress }: { title: string; right?: string; onPress?: () => void }) => (
  <View style={{ marginTop: 22, flexDirection: "row", justifyContent: "space-between", alignItems: "baseline" }}>
    <Text style={{ fontFamily: F.serif, fontSize: 15, color: C.ink }}>{title}</Text>
    {right != null && (
      <Pressable onPress={onPress} disabled={!onPress} hitSlop={8}>
        <Text style={{ fontFamily: F.mono, fontSize: 10.5, color: C.faint }}>{right}</Text>
      </Pressable>
    )}
  </View>
);

const chevron = <Text style={{ fontSize: 13, color: C.faint }}>›</Text>;

/**
 * 연인계정 탭(HANDOFF-couple-account §2, 시안 4a·4b) — 연인 기록장일 때 내계정 자리에 들어옵니다.
 * 숫자는 모두 연인 기록장 기록(보관함 제외)으로 셉니다. 개인 라벨·캐릭터·뽑기권은 여기서 다루지 않습니다.
 */
export default function CoupleAccount() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const qc = useQueryClient();
  const { book, books, me, partner, readOnly } = useActiveBook();
  const { data: account } = useAccount();
  const { data: allRows = [] } = useRows();
  const { data: wishes = [] } = useWishes();
  const { data: picks = [] } = useAnniversaryPicks();
  const { data: notes = [] } = useRecordNotes();
  const [editDate, setEditDate] = useState(false);
  const [busy, setBusy] = useState(false);

  const rows = useMemo(() => allRows.filter((r) => !r.pending), [allRows]);
  const today = todayIso();
  const startedOn = book?.startedOn ?? null;
  const meId = me?.userId ?? account?.userId ?? "";
  const partnerId = partner?.userId ?? null;
  const personal = books?.personal ?? null;

  // 두 사람 모두 한 줄을 남긴 기록 수.
  const sharedNotes = useMemo(() => {
    if (!partnerId) return 0;
    const visible = new Set(rows.map((r) => r.id));
    const by = new Map<number, Set<string>>();
    for (const n of notes) {
      if (!visible.has(n.record_id)) continue;
      if (!by.has(n.record_id)) by.set(n.record_id, new Set());
      by.get(n.record_id)!.add(n.user_id);
    }
    return [...by.values()].filter((s) => s.has(meId) && s.has(partnerId)).length;
  }, [rows, notes, meId, partnerId]);

  if (!book || !startedOn) return <View style={{ flex: 1, backgroundColor: C.paper }} />;

  const meName = me?.nickname ?? "나";
  const partnerName = partner?.nickname ?? "상대";
  const records = rows.length;
  const verifiedRows = rows.filter((r) => r.verified);
  const places = visitsByPlace(rows);
  const mine = verifiedRows.filter((r) => r.user_id === meId).length;
  const theirs = verifiedRows.filter((r) => partnerId && r.user_id === partnerId).length;
  const topPlaces = [...places.values()].sort((a, b) => b.count - a.count).slice(0, 3);

  const next = nextMilestone(startedOn, today);
  const left = daysBetween(today, next.date);
  const past = milestonesUntil(startedOn, today);
  const shown = past.slice(-5);
  const filled = filledAnniversaries(startedOn, picks, rows, today);
  const latestYear = [...past].reverse().find((m) => m.key.endsWith("y"))?.key ?? null;

  const labels = earnedCoupleLabels({ rows, startedOn, picks, sharedNotes, meId, partnerId, today });
  const got = labels.filter((l) => l.earned);
  // 진행 중 하나 — 목표에 가장 가까운 것.
  const progress = labels.filter((l) => !l.earned).sort((a, b) => b.have / b.need - a.have / a.need)[0] ?? null;

  const statusChip = readOnly ? "끊긴 기록장" : partner ? "연인 기록 함께 쓰는 중" : "상대를 기다리는 중";
  const goAnniversary = () => router.navigate("/anniversary");

  async function changeDate(d: Date) {
    const iso = isoOf(d);
    if (iso > todayIso()) return Alert.alert("오늘 이후 날짜는 고를 수 없어요");
    try {
      await updateStartedOn(qc, book!.id, iso);
    } catch (e) {
      Alert.alert("사귄 날을 바꾸지 못했어요", e instanceof Error ? e.message : undefined);
    }
  }

  function exportRecords() {
    const payload = { exported_at: new Date().toISOString(), book: "couple", restaurants: allRows, wishes };
    Share.share({ title: `dinary-couple-${today}.json`, message: JSON.stringify(payload, null, 2) });
  }

  function goPersonal() {
    if (personal) setActiveBook(personal.id);
  }

  function disconnect() {
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
              await closeBook(qc, book!.id);
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

  return (
    <ScrollView style={{ flex: 1, backgroundColor: C.paper }} contentContainerStyle={{ paddingHorizontal: 20, paddingTop: insets.top + 14, paddingBottom: TAB_BAR_H + insets.bottom + 32 }}>
      <Eyebrow wide>COUPLE</Eyebrow>

      {/* 머리 */}
      <View style={{ marginTop: 16, flexDirection: "row", alignItems: "center", gap: 14 }}>
        <Pair me={me} partner={partner} size={56} overlap={14} ring={C.paper} />
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text numberOfLines={1} style={{ fontFamily: F.serif, fontSize: 21, color: C.ink }}>{meName} · {partnerName}</Text>
          <View style={{ marginTop: 6, flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 6 }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6, borderRadius: 11, backgroundColor: C.brickSoft, paddingHorizontal: 8, paddingVertical: 3 }}>
              <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: C.brick }} />
              <Text style={{ fontFamily: F.sans, fontSize: 10.5, color: C.muted }}>{statusChip}</Text>
            </View>
            <Text style={{ fontFamily: F.mono, fontSize: 10, color: C.faint }}>SINCE {startedOn.slice(0, 4)}.{startedOn.slice(5, 7)}</Text>
          </View>
        </View>
      </View>

      {/* 만난 지 */}
      <View style={{ marginTop: 18, flexDirection: "row", alignItems: "center", borderRadius: 22, borderWidth: 1, borderColor: C.lineSoft, backgroundColor: C.card, padding: 18 }}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={{ fontFamily: F.mono, fontSize: 10.5, color: C.faint }}>만난 지</Text>
          <Text style={{ marginTop: 6, fontFamily: F.serif, fontSize: 36, color: C.ink }}>
            {dayCount(startedOn, today)}<Text style={{ fontSize: 20 }}>일</Text>
          </Text>
          <Text style={{ marginTop: 4, fontFamily: F.mono, fontSize: 10.5, color: C.faint }}>{dottedWithDay(startedOn)}부터</Text>
          <Pressable onPress={goAnniversary} style={{ marginTop: 10, alignSelf: "flex-start", borderRadius: 12, backgroundColor: C.brickSoft, paddingHorizontal: 10, paddingVertical: 5 }}>
            <Text style={{ fontFamily: F.sans, fontSize: 11, color: C.brick }}>다음 {next.label} · {left === 0 ? "오늘" : `${left}일`} ›</Text>
          </Pressable>
        </View>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 2 }}>
          <Character id={account?.characterId ?? me?.characterId ?? DEFAULT_CHARACTER} size={70} />
          <Heart />
          <Character id={partner?.characterId ?? DEFAULT_CHARACTER} size={70} />
        </View>
      </View>

      {/* 통계 */}
      <View style={{ marginTop: 14, flexDirection: "row", borderRadius: 18, borderWidth: 1, borderColor: C.lineSoft, backgroundColor: C.card }}>
        <Stat value={places.size} label="함께 간 식당" />
        <Stat value={records} label="기록" border />
        <Stat value={verifiedRows.length} label="인증" brick border />
      </View>

      {/* 우리의 인증 */}
      <SectionHead title="우리의 인증" right={`인증 ${verifiedRows.length}`} />
      <View style={{ marginTop: 10, flexDirection: "row", height: 10, gap: mine && theirs ? 3 : 0 }}>
        {mine + theirs === 0 ? (
          <View style={{ flex: 1, borderRadius: 5, backgroundColor: C.lineSoft }} />
        ) : (
          <>
            {mine > 0 && <View style={{ flex: mine, borderRadius: 5, backgroundColor: ME_COLOR }} />}
            {theirs > 0 && <View style={{ flex: theirs, borderRadius: 5, backgroundColor: PARTNER_COLOR }} />}
          </>
        )}
      </View>
      <View style={{ marginTop: 8, flexDirection: "row", justifyContent: "space-between" }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 5 }}>
          <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: ME_COLOR }} />
          <Text style={{ fontFamily: F.sans, fontSize: 11.5, color: C.muted }}>{meName} <Text style={{ fontFamily: F.mono, color: C.ink }}>{mine}</Text></Text>
        </View>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 5 }}>
          <Text style={{ fontFamily: F.sans, fontSize: 11.5, color: C.muted }}>{partnerName} <Text style={{ fontFamily: F.mono, color: C.ink }}>{theirs}</Text></Text>
          <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: PARTNER_COLOR }} />
        </View>
      </View>
      <Text style={{ marginTop: 8, fontFamily: F.sans, fontSize: 11.5, color: C.faint }}>
        함께 남긴 기록 <Text style={{ fontFamily: F.mono, color: C.ink }}>{sharedNotes}</Text>
      </Text>

      {/* 기념일 식사 */}
      <SectionHead title="기념일 식사" right={`${filled} / ${past.length} ›`} onPress={goAnniversary} />
      {shown.length === 0 ? (
        <Text style={{ marginTop: 8, fontFamily: F.sans, fontSize: 11.5, color: C.faint }}>첫 기념일 {next.label}까지 {left}일 남았어요</Text>
      ) : (
        <View style={{ marginTop: 10, flexDirection: "row", gap: 6 }}>
          {shown.map((m) => {
            const meal = mealFor(m, picks, rows);
            const has = meal.kind === "picked" || meal.kind === "day";
            const hi = m.key === latestYear;
            return (
              <Pressable
                key={m.key}
                onPress={goAnniversary}
                style={{
                  flex: 1, minWidth: 0, height: 62, borderRadius: 12, paddingHorizontal: 6,
                  justifyContent: "center", alignItems: "center",
                  borderWidth: hi ? 1.5 : 1, borderStyle: has ? "solid" : "dashed",
                  borderColor: hi ? C.brick : has ? C.lineSoft : "#cdc6b8",
                  backgroundColor: hi ? C.brickSoft : has ? C.card : "transparent",
                }}
              >
                <Text numberOfLines={1} style={{ fontFamily: F.mono, fontSize: 10.5, color: hi ? C.brick : has ? C.ink : C.faint }}>{m.label}</Text>
                {has && <Text numberOfLines={1} style={{ marginTop: 4, fontFamily: F.sans, fontSize: 10, color: C.muted }}>{meal.record.name}</Text>}
              </Pressable>
            );
          })}
        </View>
      )}

      {/* 자주 간 식당 */}
      {topPlaces.length > 0 && (
        <>
          <SectionHead title="자주 간 식당" />
          <View style={{ marginTop: 10, borderRadius: 18, borderWidth: 1, borderColor: C.lineSoft, backgroundColor: C.card, overflow: "hidden" }}>
            {topPlaces.map((p, i) => (
              <View key={`${p.name}-${i}`} style={{ height: 46, flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 16, borderTopWidth: i ? 1 : 0, borderTopColor: C.lineSoft }}>
                <Text style={{ width: 14, fontFamily: F.mono, fontSize: 12, color: C.brick }}>{i + 1}</Text>
                <Text numberOfLines={1} style={{ flex: 1, fontFamily: F.sans, fontSize: 13.5, color: C.ink }}>{p.name}</Text>
                <Text style={{ fontFamily: F.mono, fontSize: 11, color: C.faint }}>{p.count}번</Text>
              </View>
            ))}
          </View>
        </>
      )}

      {/* 함께 모은 라벨 — 연인 전용 */}
      <SectionHead title="함께 모은 라벨" right={`${got.length} / ${labels.length}`} />
      <Text style={{ marginTop: 4, fontFamily: F.sans, fontSize: 10.5, color: C.faint }}>연인 기록에서만 받는 라벨입니다</Text>
      <View style={{ marginTop: 10, flexDirection: "row", flexWrap: "wrap", gap: 7 }}>
        {got.map((l) => (
          <View key={l.id} style={{ borderRadius: 13, borderWidth: 1, borderColor: "rgba(180,85,45,.2)", backgroundColor: C.brickSoft, paddingHorizontal: 11, paddingVertical: 5 }}>
            <Text style={{ fontFamily: F.sans, fontSize: 11.5, color: C.brick }}>{l.name}</Text>
          </View>
        ))}
        {progress && (
          <View style={{ borderRadius: 13, borderWidth: 1, borderStyle: "dashed", borderColor: "#cdc6b8", paddingHorizontal: 11, paddingVertical: 5 }}>
            <Text style={{ fontFamily: F.sans, fontSize: 11.5, color: C.faint }}>
              {progress.name} · <Text style={{ fontFamily: F.mono }}>{progress.have}/{progress.need}</Text>
            </Text>
          </View>
        )}
      </View>

      {/* 메뉴 */}
      <View style={{ marginTop: 22, borderRadius: 18, borderWidth: 1, borderColor: C.lineSoft, backgroundColor: C.card, overflow: "hidden" }}>
        {!readOnly && (
          <>
            <Row
              label={`사귄 날 ${dottedDate(startedOn)}`}
              border={false}
              onPress={() => setEditDate((v) => !v)}
              right={<Text style={{ fontFamily: F.sans, fontSize: 12, color: C.brick }}>{editDate ? "닫기" : "수정"}</Text>}
            />
            {editDate && (
              <DateTimePicker
                value={new Date(startedOn + "T00:00:00")}
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
          </>
        )}
        {/* 기념일 알림 줄은 알림 기능이 생기면 여기에(§2-9). */}
        <Row label="연인 기록 내려받기" border={!readOnly} onPress={exportRecords} right={chevron} />
        {personal && <Row label="내 계정 · 개인 기록·캐릭터·로그아웃" onPress={goPersonal} right={chevron} />}
        {!readOnly && (
          <Pressable onPress={disconnect} disabled={busy} style={{ minHeight: 50, justifyContent: "center", paddingHorizontal: 16, borderTopWidth: 1, borderTopColor: C.lineSoft, opacity: busy ? 0.5 : 1 }}>
            <Text style={{ fontFamily: F.sans, fontSize: 13.5, color: DISCONNECT }}>연결 끊기</Text>
          </Pressable>
        )}
      </View>

      <Text style={{ marginTop: 14, textAlign: "center", fontFamily: F.sans, fontSize: 11, lineHeight: 18, color: C.faint }}>
        두 기록장은 따로 저장됩니다. 개인 기록은 상대에게 보이지 않습니다.
      </Text>
    </ScrollView>
  );
}
