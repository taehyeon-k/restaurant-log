import DateTimePicker from "@react-native-community/datetimepicker";
import { requireOptionalNativeModule } from "expo";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { ActivityIndicator, Alert, Platform, Pressable, ScrollView, Share, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { BackButton, Button, Eyebrow } from "@/components/ui";
import {
  createCoupleBook, formatCode, latestInvite, renewInvite, setActiveBook, useActiveBook, useBooks, type Invite,
} from "@/data/books";
import { dayCount, dottedWithDay, hundredDay, nextMilestone, todayIso, yearAnniversary } from "@/lib/anniversary";
import { C, F } from "@/theme";

const pad = (n: number) => String(n).padStart(2, "0");
const isoOf = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

/** 「복사」 — expo-clipboard 는 누를 때 불러옵니다(예전 개발 빌드엔 네이티브 모듈이 없어 불러오는 순간 멈춥니다). */
async function copyText(text: string) {
  // 이 개발 빌드에 네이티브 모듈이 없으면 부르지 않고 공유 시트로 넘깁니다(빨간 오류 없이).
  if (!requireOptionalNativeModule("ExpoClipboard")) return false;
  try {
    const Clipboard = require("expo-clipboard") as typeof import("expo-clipboard");
    await Clipboard.setStringAsync(text);
    return true;
  } catch {
    return false;
  }
}

const hoursLeft = (iso: string) => Math.max(0, Math.ceil((new Date(iso).getTime() - Date.now()) / 3600000));

/**
 * 연인 기록 만들기 2단계(HANDOFF-couple §3-3, 시안 1c·1d).
 *  1/2 사귄 날 — 연·월·일 휠과 기념일 미리보기
 *  2/2 초대 코드 — 크게 보여주고 메시지로 보내기·복사, 상대가 수락할 때까지 기다립니다(24시간).
 * params.book 이 있으면(서랍의 「초대 코드 다시 보기」) 바로 2단계.
 */
export default function CoupleNew() {
  const { book: bookParam } = useLocalSearchParams<{ book?: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const qc = useQueryClient();
  const { me } = useActiveBook();
  const [step, setStep] = useState<1 | 2>(bookParam ? 2 : 1);
  const [date, setDate] = useState<Date>(() => new Date());
  const [pickOpen, setPickOpen] = useState(Platform.OS === "ios");
  const [invite, setInvite] = useState<Invite | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);

  const startedOn = isoOf(date);
  const today = todayIso();
  const count = dayCount(startedOn, today);
  const next = nextMilestone(startedOn, today);

  // 다시 보기: 남은 코드를 읽고, 없거나 지났으면 새로 만듭니다.
  useEffect(() => {
    if (!bookParam) return;
    let alive = true;
    (async () => {
      try {
        const last = await latestInvite(bookParam);
        const inv = last && new Date(last.expires_at).getTime() > Date.now() ? last : await renewInvite(bookParam);
        if (alive) setInvite(inv);
      } catch (e) {
        if (alive) setError(e instanceof Error ? e.message : "코드를 불러오지 못했어요");
      }
    })();
    return () => { alive = false; };
  }, [bookParam]);

  // 기다리는 동안 상대가 들어왔는지 10초마다 봅니다.
  const bookId = invite?.book_id ?? bookParam ?? null;
  const { data: books } = useBooks();
  useQuery({
    queryKey: ["couple-wait", bookId],
    enabled: step === 2 && !!bookId,
    refetchInterval: 10000,
    queryFn: async () => { await qc.invalidateQueries({ queryKey: ["books"] }); return Date.now(); },
  });
  const joined = !!bookId && (books?.all.find((b) => b.id === bookId)?.members.length ?? 0) >= 2;
  useEffect(() => {
    if (!joined || !bookId) return;
    setActiveBook(bookId);
    Alert.alert("함께 쓰기 시작했어요", "이제 연인 기록장이 열려요.", [{ text: "확인", onPress: () => router.dismissAll() }]);
  }, [joined, bookId, router]);

  async function create() {
    setBusy(true);
    setError("");
    try {
      const inv = await createCoupleBook(startedOn);
      setInvite(inv);
      await qc.invalidateQueries({ queryKey: ["books"] });
      setStep(2);
    } catch (e) {
      setError(e instanceof Error ? e.message : "만들지 못했어요");
    } finally {
      setBusy(false);
    }
  }

  async function renew() {
    if (!bookId) return;
    setBusy(true);
    try {
      setInvite(await renewInvite(bookId));
    } catch (e) {
      setError(e instanceof Error ? e.message : "코드를 만들지 못했어요");
    } finally {
      setBusy(false);
    }
  }

  const expired = !!invite && new Date(invite.expires_at).getTime() <= Date.now();
  const message = invite
    ? `${me?.nickname ?? ""}님이 DINARY 연인 기록을 함께 쓰자고 해요.\n앱의 지도 ≡ 메뉴 → 「초대 코드를 받았어요」에 이 코드를 넣어 주세요.\n\n${formatCode(invite.code)}\n\n(24시간 안에 써 주세요)`
    : "";

  const previews = [
    { label: "100일", date: hundredDay(startedOn, 1) },
    { label: "200일", date: hundredDay(startedOn, 2) },
    { label: "1주년", date: yearAnniversary(startedOn, 1) },
  ];

  return (
    <View style={{ flex: 1, backgroundColor: C.paper }}>
      <View style={{ paddingTop: insets.top + 6, paddingHorizontal: 14, flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
        <BackButton onPress={() => (step === 2 && !bookParam ? router.dismissAll() : router.back())} />
        <Text style={{ fontFamily: F.mono, fontSize: 11, color: C.faint, paddingRight: 10 }}>{step} / 2</Text>
      </View>

      <ScrollView contentContainerStyle={{ paddingHorizontal: 22, paddingTop: 6, paddingBottom: insets.bottom + 40 }}>
        <Eyebrow wide>COUPLE BOOK</Eyebrow>

        {step === 1 ? (
          <>
            <Text style={{ marginTop: 8, fontFamily: F.serif, fontSize: 26, color: C.ink }}>사귄 날이 언제예요?</Text>
            <Text style={{ marginTop: 6, fontFamily: F.sans, fontSize: 12, lineHeight: 19, color: C.faint }}>이 날을 1일로 세어 기념일을 챙겨 드려요. 나중에 바꿀 수 있어요.</Text>

            <View style={{ marginTop: 18, borderRadius: 20, borderWidth: 1, borderColor: C.lineSoft, backgroundColor: C.card, paddingVertical: 6, alignItems: "center" }}>
              {Platform.OS !== "ios" && (
                <Pressable onPress={() => setPickOpen(true)} style={{ paddingVertical: 16 }}>
                  <Text style={{ fontFamily: F.mono, fontSize: 22, color: C.ink }}>{startedOn.replaceAll("-", ".")}</Text>
                  <Text style={{ marginTop: 4, textAlign: "center", fontFamily: F.sans, fontSize: 11.5, color: C.brick }}>날짜 바꾸기</Text>
                </Pressable>
              )}
              {pickOpen && (
                <DateTimePicker
                  value={date}
                  maximumDate={new Date()}
                  mode="date"
                  display="spinner"
                  locale="ko-KR"
                  onChange={(e, d) => {
                    if (Platform.OS !== "ios") setPickOpen(false);
                    if (e.type !== "dismissed" && d) setDate(d);
                  }}
                />
              )}
            </View>

            <View style={{ marginTop: 18, borderRadius: 20, backgroundColor: "#f2e0d5", padding: 16 }}>
              <Text style={{ fontFamily: F.serif, fontSize: 17, color: "#a34d27" }}>오늘은 {count}일째예요</Text>
              <View style={{ marginTop: 12, gap: 7 }}>
                {previews.map((p) => (
                  <View key={p.label} style={{ flexDirection: "row", justifyContent: "space-between" }}>
                    <Text style={{ fontFamily: F.sans, fontSize: 12.5, color: p.date < today ? C.faint : C.ink }}>{p.label}</Text>
                    <Text style={{ fontFamily: F.mono, fontSize: 12, color: p.date < today ? C.faint : C.ink }}>{dottedWithDay(p.date)}</Text>
                  </View>
                ))}
                <View style={{ height: 1, backgroundColor: "#e6cdbd", marginVertical: 2 }} />
                <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                  <Text style={{ fontFamily: F.sansMd, fontSize: 12.5, color: "#a34d27" }}>다음 · {next.label}</Text>
                  <Text style={{ fontFamily: F.mono, fontSize: 12, color: "#a34d27" }}>{dottedWithDay(next.date)}</Text>
                </View>
              </View>
            </View>

            {!!error && <Text style={{ marginTop: 14, fontFamily: F.sans, fontSize: 12, color: "#a8412a" }}>{error}</Text>}
            <Button style={{ marginTop: 22 }} label={busy ? "만드는 중…" : "다음 · 초대 코드 만들기"} disabled={busy} onPress={create} />
          </>
        ) : (
          <>
            <Text style={{ marginTop: 8, fontFamily: F.serif, fontSize: 26, color: C.ink }}>상대에게 코드를 보내 주세요</Text>
            <Text style={{ marginTop: 6, fontFamily: F.sans, fontSize: 12, lineHeight: 19, color: C.faint }}>상대가 지도 ≡ 메뉴의 「초대 코드를 받았어요」에 넣으면 함께 쓰기 시작해요.</Text>

            <View style={{ marginTop: 22, borderRadius: 22, borderWidth: 1, borderColor: C.lineSoft, backgroundColor: C.card, paddingVertical: 26, alignItems: "center" }}>
              {invite ? (
                <>
                  <Text selectable style={{ fontFamily: F.mono, fontSize: 34, letterSpacing: 3, color: expired ? C.faint : C.ink }}>{formatCode(invite.code)}</Text>
                  <Text style={{ marginTop: 10, fontFamily: F.mono, fontSize: 10.5, color: expired ? "#a8412a" : C.faint }}>
                    {expired ? "기한이 지났어요" : `${hoursLeft(invite.expires_at)}시간 안에 써 주세요`}
                  </Text>
                </>
              ) : error ? null : (
                <ActivityIndicator color={C.brick} />
              )}
            </View>

            {!!error && <Text style={{ marginTop: 14, fontFamily: F.sans, fontSize: 12, color: "#a8412a" }}>{error}</Text>}

            {invite && !expired && (
              <View style={{ marginTop: 16, gap: 8 }}>
                <Button label="메시지로 보내기" onPress={() => void Share.share({ message })} />
                <Button
                  kind="line"
                  label={copied ? "복사했어요" : "복사"}
                  onPress={async () => {
                    if (await copyText(invite.code)) setCopied(true);
                    else void Share.share({ message: invite.code });
                  }}
                />
              </View>
            )}
            {invite && expired && <Button style={{ marginTop: 16 }} label={busy ? "만드는 중…" : "새 코드 만들기"} disabled={busy} onPress={renew} />}

            {invite && !expired && (
              <View style={{ marginTop: 22, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 }}>
                <ActivityIndicator size="small" color={C.faint} />
                <Text style={{ fontFamily: F.sans, fontSize: 12.5, color: C.muted }}>상대의 수락을 기다리는 중</Text>
              </View>
            )}
          </>
        )}
      </ScrollView>
    </View>
  );
}
