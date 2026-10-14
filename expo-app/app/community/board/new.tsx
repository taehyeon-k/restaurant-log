import { useQueryClient } from "@tanstack/react-query";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useMemo, useState } from "react";
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRows } from "@/data/queries";
import { createPost, hasContact, usePostsToday, useCurrentTheme, type PostType } from "@/features/community/api";
import { askTitle, Cond, guOf } from "@/features/community/BoardPost";
import { K, monthDay, PhotoOrStripes } from "@/features/community/ui";
import { regionFromSearch } from "@/lib/regions";
import { coverPhoto, type Restaurant } from "@/lib/types";
import { C, F } from "@/theme";

const MIN_VERIFIED = 5;
const DAILY = 3;
const SITUATIONS = ["혼밥", "데이트", "모임", "회식", "가족", "술자리"];
const TIMES = ["점심", "저녁", "20시 이후", "주말"];

/** 올리기(3e) — 세 형식 중 하나를 고릅니다. 사진 · 가게는 내 인증 기록에서만. */
export default function BoardCompose() {
  const router = useRouter();
  const qc = useQueryClient();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ type?: PostType }>();
  const { data: rows = [] } = useRows();
  const { data: theme } = useCurrentTheme();
  const { data: today = 0 } = usePostsToday();

  const [type, setType] = useState<PostType>(params.type ?? "record_share");
  const [recordId, setRecordId] = useState<number | null>(null);
  const [area, setArea] = useState<string | null>(null);
  const [situation, setSituation] = useState<string | null>(null);
  const [time, setTime] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [step, setStep] = useState<1 | 2>(1);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const verified = useMemo(
    () => rows.filter((r) => r.verified && !r.pending).sort((a, b) => ((a.verified_at ?? a.created_at) < (b.verified_at ?? b.created_at) ? 1 : -1)),
    [rows],
  );
  const hasUnverified = rows.some((r) => !r.verified && !r.pending);

  // 동네 칩 — 내 기록 주소의 동(없으면 구). 많이 간 순. 고른 동네의 구는 게시판 동네 거르기에 씁니다.
  const areas = useMemo(() => {
    const m = new Map<string, { n: number; gu: string }>();
    for (const r of rows) {
      const s = regionFromSearch(r.address);
      if (!s) continue;
      const label = s.dong ?? s.gu.split(" ").pop()!;
      const cur = m.get(label);
      m.set(label, { n: (cur?.n ?? 0) + 1, gu: s.gu });
    }
    return [...m.entries()].sort((a, b) => b[1].n - a[1].n).slice(0, 10);
  }, [rows]);

  const limit = type === "ask" ? 60 : 120;
  const record = verified.find((r) => r.id === recordId) ?? null;
  const tags = [situation, time].filter((v): v is string => !!v);
  const ready = type === "ask" ? !!area && tags.length > 0 : !!record && (type !== "theme_answer" || !!theme);
  const blocked = verified.length < MIN_VERIFIED ? `인증 기록 ${MIN_VERIFIED}건부터 올릴 수 있습니다 · 지금 ${verified.length}건` : today >= DAILY ? "오늘은 3개를 다 올렸습니다" : null;
  const contact = hasContact(note);

  async function submit() {
    if (!ready || blocked || busy) return;
    setBusy(true);
    setError("");
    try {
      const id = await createPost(qc, {
        type,
        recordId: record?.id,
        themeId: type === "theme_answer" ? theme?.id : undefined,
        askArea: type === "ask" ? area! : undefined,
        askTags: type === "ask" ? tags : undefined,
        area: type === "ask" ? areas.find(([l]) => l === area)?.[1].gu ?? null : guOf(record?.address),
        note: note.trim() || undefined,
      });
      router.back();
      if (type === "ask") router.push({ pathname: "/community/board/[id]", params: { id: String(id) } });
    } catch (e) {
      setError(e instanceof Error ? e.message : "올리지 못했습니다");
    }
    setBusy(false);
  }

  const radio = (id: PostType, title: string, sub: string, disabled = false) => {
    const on = type === id;
    return (
      <Pressable
        key={id}
        disabled={disabled}
        onPress={() => { setType(id); setError(""); }}
        accessibilityRole="radio"
        accessibilityState={{ selected: on, disabled }}
        style={{ borderRadius: 18, borderWidth: on ? 1.5 : 1, borderColor: on ? C.brick : C.lineSoft, backgroundColor: C.card, paddingVertical: 13, paddingHorizontal: 14, flexDirection: "row", gap: 12, alignItems: "flex-start", opacity: disabled ? 0.5 : 1 }}
      >
        <View style={{ marginTop: 2, width: 18, height: 18, borderRadius: 9, borderWidth: on ? 5 : 1.5, borderColor: on ? C.brick : K.dashed }} />
        <View style={{ flex: 1, gap: 3 }}>
          <Text style={{ fontFamily: F.sansMd, fontSize: 13.5, color: C.ink }}>{title}</Text>
          <Text style={{ fontFamily: F.sans, fontSize: 11.5, lineHeight: 18, color: C.faint }}>{sub}</Text>
        </View>
      </Pressable>
    );
  };

  const recordPicker = (
    <View style={{ borderRadius: 16, backgroundColor: C.card, borderWidth: 1, borderColor: C.lineSoft, paddingTop: 2, paddingBottom: 4, paddingHorizontal: 12 }}>
      {verified.length === 0 && <Text style={{ paddingVertical: 12, fontFamily: F.sans, fontSize: 12, color: C.faint }}>아직 인증 기록이 없습니다.</Text>}
      {verified.slice(0, 12).map((r) => <RecordPick key={r.id} r={r} on={r.id === recordId} onPress={() => setRecordId(r.id)} />)}
      {hasUnverified && <Text style={{ paddingTop: 9, paddingBottom: 5, fontFamily: F.sans, fontSize: 11.5, color: K.inactive }}>인증 없는 기록은 고를 수 없습니다</Text>}
    </View>
  );

  const chipRow = (label: string, options: string[], value: string | null, set: (v: string | null) => void) => (
    <View style={{ gap: 6 }}>
      <Text style={{ fontFamily: F.mono, fontSize: 10, letterSpacing: 1.6, color: C.faint }}>{label}</Text>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
        {options.map((o) => {
          const on = value === o;
          return (
            <Pressable key={o} onPress={() => set(on ? null : o)} style={{ height: 30, borderRadius: 15, paddingHorizontal: 12, justifyContent: "center", backgroundColor: on ? C.ink : C.card, borderWidth: on ? 0 : 1, borderColor: C.line }}>
              <Text style={{ fontFamily: F.sans, fontSize: 12, color: on ? C.card : K.text2 }}>{o}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );

  const askPicker = (
    <View style={{ borderRadius: 16, backgroundColor: C.card, borderWidth: 1, borderColor: C.lineSoft, padding: 12, gap: 12 }}>
      {areas.length ? chipRow("동네", areas.map(([l]) => l), area, setArea) : <Text style={{ fontFamily: F.sans, fontSize: 12, color: C.faint }}>주소가 있는 기록이 있어야 동네를 고를 수 있습니다.</Text>}
      {chipRow("상황", SITUATIONS, situation, setSituation)}
      {chipRow("시간", TIMES, time, setTime)}
      {!!area && tags.length > 0 && <Text style={{ fontFamily: F.serif, fontSize: 15, color: C.ink }}>{askTitle(area, tags)}</Text>}
    </View>
  );

  return (
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1, backgroundColor: C.paper }}>
      <View style={{ paddingTop: Platform.OS === "ios" ? 10 : insets.top + 8, paddingHorizontal: 20 }}>
        {Platform.OS === "ios" && <View style={{ alignSelf: "center", width: 36, height: 4, borderRadius: 2, backgroundColor: C.line }} />}
        <View style={{ marginTop: 10, flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
          <Pressable onPress={() => (step === 2 ? setStep(1) : router.back())} hitSlop={10}>
            <Text style={{ fontFamily: F.sans, fontSize: 13, color: C.muted }}>{step === 2 ? "‹ 고치기" : "취소"}</Text>
          </Pressable>
          <Text style={{ fontFamily: F.sansMd, fontSize: 13, color: C.ink }}>올리기</Text>
          <View style={{ width: 26 }} />
        </View>
      </View>

      {step === 1 ? (
        <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 140 }} keyboardShouldPersistTaps="handled">
          <Text style={{ marginTop: 18, fontFamily: F.serif, fontSize: 20, color: C.ink }}>무엇을 올릴까요?</Text>
          <Text style={{ marginTop: 6, fontFamily: F.sans, fontSize: 12, color: C.faint }}>빈 글쓰기 칸은 없습니다. 셋 중 하나를 고릅니다.</Text>
          <View style={{ marginTop: 14, gap: 8 }}>
            {radio("record_share", "기록 나누기", "내 인증 기록 하나를 골라 올립니다")}
            {type === "record_share" && recordPicker}
            {radio("theme_answer", "주제에 답하기", theme ? `이번 주 ‘${theme.title}’` : "이번 주 주제가 없습니다", !theme)}
            {type === "theme_answer" && recordPicker}
            {radio("ask", "어디 가요?", "동네 · 상황 · 시간을 골라 묻습니다. 답은 가 본 가게로만 받습니다")}
            {type === "ask" && askPicker}
          </View>
          <View style={{ marginTop: 14, minHeight: 46, borderRadius: 14, borderWidth: 1, borderColor: contact ? C.brick : C.lineSoft, backgroundColor: C.card, paddingHorizontal: 14, flexDirection: "row", alignItems: "center", gap: 8 }}>
            <TextInput
              value={note}
              onChangeText={(t) => setNote(t.slice(0, limit))}
              placeholder="한 줄 덧붙이기"
              placeholderTextColor={K.inactive}
              style={{ flex: 1, paddingVertical: 12, fontFamily: F.sans, fontSize: 12.5, color: C.ink }}
            />
            <Text style={{ fontFamily: F.mono, fontSize: 10, color: K.inactive }}>{note.length} / {limit}</Text>
          </View>
          {contact && <Text style={{ marginTop: 6, fontFamily: F.sans, fontSize: 11.5, color: C.brick }}>링크 · 연락처는 올릴 때 지워집니다</Text>}
        </ScrollView>
      ) : (
        <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 140 }}>
          <Text style={{ marginTop: 18, fontFamily: F.serif, fontSize: 20, color: C.ink }}>이렇게 올라갑니다</Text>
          <View style={{ marginTop: 14, borderRadius: 18, borderWidth: 1, borderColor: C.lineSoft, backgroundColor: C.card, padding: 14, gap: 9 }}>
            {type === "ask" ? (
              <>
                <Text style={{ fontFamily: F.serif, fontSize: 17, color: C.ink }}>{askTitle(area, tags)}</Text>
                <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>{[area!, ...tags].map((t) => <Cond key={t} label={t} />)}</View>
              </>
            ) : record ? (
              <View style={{ flexDirection: "row", gap: 12, alignItems: "center" }}>
                <PhotoOrStripes uri={coverPhoto(record)} width={60} height={60} radius={12} />
                <View style={{ flex: 1, gap: 2 }}>
                  <Text style={{ fontFamily: F.serif, fontSize: 15, color: C.ink }}>{record.name}</Text>
                  <Text style={{ fontFamily: F.sans, fontSize: 11, color: C.faint }}>{[record.category, record.region].filter(Boolean).join(" · ")}</Text>
                  <Text style={{ fontFamily: F.mono, fontSize: 10, color: C.brick }}>✓ 인증 {monthDay(record.verified_at)}</Text>
                </View>
              </View>
            ) : null}
            {!!note.trim() && <Text style={{ fontFamily: type === "ask" ? F.sans : F.serif, fontSize: 12.5, lineHeight: 21, color: K.text2 }}>{note.trim()}</Text>}
          </View>
          <Text style={{ marginTop: 10, fontFamily: F.sans, fontSize: 11.5, lineHeight: 18, color: C.faint }}>DINARY 사용자 모두가 봅니다. 메모 · 메뉴 · 가격은 올라가지 않습니다.</Text>
        </ScrollView>
      )}

      <View style={{ position: "absolute", left: 20, right: 20, bottom: Math.max(38, insets.bottom + 12), gap: 8 }}>
        {!!error && <Text style={{ textAlign: "center", fontFamily: F.sans, fontSize: 11.5, color: C.brick }}>{error}</Text>}
        <Text style={{ textAlign: "center", fontFamily: F.sans, fontSize: 11, color: K.inactive }}>{blocked ?? "링크 · 연락처는 넣을 수 없습니다 · 하루 3개까지"}</Text>
        <Pressable
          onPress={() => (step === 1 ? setStep(2) : submit())}
          disabled={!ready || !!blocked || busy}
          style={{ minHeight: 50, borderRadius: 18, backgroundColor: C.ink, alignItems: "center", justifyContent: "center", opacity: !ready || blocked || busy ? 0.4 : 1 }}
        >
          <Text style={{ fontFamily: F.sansMd, fontSize: 14, color: C.card }}>{step === 1 ? "다음" : busy ? "올리는 중…" : "올리기"}</Text>
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

function RecordPick({ r, on, onPress }: { r: Restaurant; on: boolean; onPress: () => void }) {
  const today = new Date().toISOString().slice(0, 10);
  const when = r.verified_at ? (r.verified_at.slice(0, 10) === today ? "오늘" : monthDay(r.verified_at)) : "";
  return (
    <Pressable onPress={onPress} accessibilityState={{ selected: on }} style={{ flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 9, borderBottomWidth: 1, borderBottomColor: "#ece8de" }}>
      <PhotoOrStripes uri={coverPhoto(r)} width={40} height={40} radius={10} />
      <View style={{ flex: 1, gap: 1 }}>
        <Text numberOfLines={1} style={{ fontFamily: F.serif, fontSize: 14, color: C.ink }}>{r.name}</Text>
        <Text style={{ fontFamily: F.sans, fontSize: 10.5, color: C.faint }}>{when} · ✓ 인증</Text>
      </View>
      <View style={{ width: 22, height: 22, borderRadius: 11, alignItems: "center", justifyContent: "center", backgroundColor: on ? C.brick : "transparent", borderWidth: on ? 0 : 1.5, borderColor: K.dashed }}>
        {on && <Text style={{ fontSize: 11, color: C.card }}>✓</Text>}
      </View>
    </Pressable>
  );
}
