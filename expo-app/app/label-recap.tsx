import * as Clipboard from "expo-clipboard";
import * as Haptics from "expo-haptics";
import * as MediaLibrary from "expo-media-library/legacy";
import { useLocalSearchParams, useRouter } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useEffect, useMemo, useRef, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions, type GestureResponderEvent } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, { Circle, Path, Rect } from "react-native-svg";
import { Toggle } from "@/components/ui";
import { useAccount } from "@/data/profile";
import { usePersonalRows } from "@/data/queries";
import { EmptySlot, Stamp, StampingIn } from "@/features/stamps/Stamp";
import { computeLabelRecap, type LabelRecap, type Line } from "@/features/stamps/labelRecap";
import { useSeenLabels } from "@/lib/labelSeen";
import { stampTilt } from "@/lib/labels";
import { SignedImage } from "@/lib/signedPhoto";
import { dottedDate, type Restaurant } from "@/lib/types";
import { C, F } from "@/theme";

const INK = "#1c1a17";
const PAPER = "#f6f3ec";
const NEEDS_BUILD = "새 개발 빌드가 필요해요";
const BASE = process.env.EXPO_PUBLIC_API_BASE_URL ?? "";

/** 공유 카드에만 쓰는 네이티브 모듈은 누를 때 불러옵니다(분기 리캡과 같은 이유 — 예전 빌드에서 시작하자마자 멈추지 않게). */
function shareModules() {
  try {
    const { captureRef } = require("react-native-view-shot") as typeof import("react-native-view-shot");
    const Sharing = require("expo-sharing") as typeof import("expo-sharing");
    return { captureRef, Sharing };
  } catch {
    return null;
  }
}
const missingNative = (e: unknown) => e instanceof Error && /RNViewShot|native module/i.test(e.message);

const photoOf = (r: Restaurant) => r.photo_urls?.[0] ?? r.photo_url ?? null;

/**
 * 라벨 리캡(지시서 3 §E-5) — 라벨을 받을 때마다 볼 수 있는 4장. 검정 바탕, 화면을 누르면 다음 장(왼쪽 30% 는 이전).
 * 숫자는 내 기록 안의 값만 — 남과 견주지 않습니다. 4장째 「공유하기」는 공유 카드(§E-6).
 * extra: 인증 완료 화면에서 열 때, 아직 저장 전인 방금 그 기록(JSON).
 */
export default function LabelRecapScreen() {
  const { id = "", extra } = useLocalSearchParams<{ id: string; extra?: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width: W } = useWindowDimensions();
  const { data: rows, isSuccess } = usePersonalRows();
  const { data: account } = useAccount();

  const all = useMemo(() => {
    const list = rows ?? [];
    if (!extra) return list;
    try {
      const row = JSON.parse(extra) as Restaurant;
      return list.some((r) => r.id === row.id) ? list : [...list, row];
    } catch {
      return list;
    }
  }, [rows, extra]);
  const recap = useMemo(() => (isSuccess ? computeLabelRecap(id, all) : null), [id, all, isSuccess]);

  // 리캡을 열면 그 라벨의 「· 새로」를 지웁니다.
  const { markSeen, ready } = useSeenLabels(account?.userId, [], isSuccess);
  useEffect(() => { if (recap && ready) markSeen([recap.def.id]); }, [recap, ready, markSeen]);

  const [i, setI] = useState(0);
  const [share, setShare] = useState(false);
  const close = () => router.back();

  if (!isSuccess) return <View style={{ flex: 1, backgroundColor: INK }} />;
  if (!recap) {
    return (
      <View style={{ flex: 1, backgroundColor: INK, alignItems: "center", justifyContent: "center", padding: 28 }}>
        <StatusBar style="light" />
        <Text style={{ fontFamily: F.serif, fontSize: 20, color: PAPER }}>아직 받지 않은 라벨이에요</Text>
        <Pressable onPress={close} style={{ marginTop: 20, borderRadius: 20, backgroundColor: PAPER, paddingVertical: 12, paddingHorizontal: 22 }}>
          <Text style={{ fontFamily: F.sansMd, fontSize: 13.5, color: INK }}>닫기</Text>
        </Pressable>
      </View>
    );
  }

  if (share) return <ShareView recap={recap} onBack={() => setShare(false)} />;

  const tap = (e: GestureResponderEvent) => {
    Haptics.selectionAsync();
    setI((v) => (e.nativeEvent.pageX < W * 0.3 ? Math.max(0, v - 1) : Math.min(3, v + 1)));
  };

  return (
    <View style={{ flex: 1, backgroundColor: INK }}>
      <StatusBar style="light" />
      <Pressable style={StyleSheet.absoluteFill} onPress={tap} accessible={false}>
        <View key={i} style={{ flex: 1, paddingTop: insets.top + 64, paddingBottom: insets.bottom + 24, paddingHorizontal: 28 }}>
          {i === 0 && <CoverSlide recap={recap} />}
          {i === 1 && <JourneySlide recap={recap} />}
          {i === 2 && <NumbersSlide recap={recap} />}
          {i === 3 && <NextSlide recap={recap} onShare={() => setShare(true)} onClose={close} />}
        </View>
      </Pressable>
      <View pointerEvents="box-none" style={{ position: "absolute", top: insets.top + 6, left: 16, right: 16, gap: 12 }}>
        <View pointerEvents="none" style={{ flexDirection: "row", gap: 3 }}>
          {[0, 1, 2, 3].map((k) => (
            <View key={k} style={{ flex: 1, height: 3, borderRadius: 2, backgroundColor: PAPER, opacity: k <= i ? 1 : 0.25 }} />
          ))}
        </View>
        <View pointerEvents="box-none" style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 6 }}>
          <Text style={{ fontFamily: F.mono, fontSize: 10, letterSpacing: 2.2, color: PAPER }}>DINARY · LABEL</Text>
          <Pressable onPress={close} hitSlop={14} accessibilityLabel="리캡 닫기">
            <Text style={{ fontSize: 16, color: PAPER }}>✕</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

/** 표지 도장의 숫자 — 그릇 수는 단계 숫자, 이야기는 들어간 기록 수. */
const coverNo = (r: LabelRecap) => (r.def.group === "bowl" ? r.def.need : r.journey.length);

function CoverSlide({ recap }: { recap: LabelRecap }) {
  return (
    <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
      <StampingIn n={coverNo(recap)} size={150} />
      <Text style={{ marginTop: 34, fontFamily: F.serif, fontSize: 34, color: PAPER, textAlign: "center" }}>{recap.def.name}</Text>
      <Text style={{ marginTop: 10, fontFamily: F.mono, fontSize: 11, letterSpacing: 1, color: "#a29a8c" }}>{dottedDate(recap.earnedOn)} 받음</Text>
    </View>
  );
}

/** 길면 앞 다섯 · 뒤 다섯만 — 가운데는 「⋯」. */
function trimJourney(list: LabelRecap["journey"]) {
  if (list.length <= 12) return list.map((j) => ({ ...j, gap: false }));
  return [...list.slice(0, 5).map((j) => ({ ...j, gap: false })), { ...list[5], gap: true }, ...list.slice(-5).map((j) => ({ ...j, gap: false }))];
}

function JourneySlide({ recap }: { recap: LabelRecap }) {
  const first = recap.journey[0]?.no;
  const last = recap.journey[recap.journey.length - 1]?.no;
  return (
    <View style={{ flex: 1 }}>
      <Text style={{ fontFamily: F.serif, fontSize: 24, lineHeight: 34, color: PAPER }}>{recap.journeyTitle}</Text>
      <ScrollView style={{ marginTop: 22 }} contentContainerStyle={{ gap: 4 }} showsVerticalScrollIndicator={false}>
        {trimJourney(recap.journey).map((j) =>
          j.gap ? (
            <Text key="gap" style={{ paddingVertical: 4, paddingLeft: 8, fontFamily: F.mono, fontSize: 12, color: "#6f685e" }}>⋯</Text>
          ) : (
            <View key={j.row.id} style={{ flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 7 }}>
              {j.no === first || j.no === last ? (
                <View style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: C.brick, alignItems: "center", justifyContent: "center" }}>
                  <Text style={{ fontFamily: F.mono, fontSize: 11, color: "#fff" }}>{j.no}</Text>
                </View>
              ) : (
                <View style={{ width: 28, height: 28, borderRadius: 14, borderWidth: 1, borderColor: "#4d4842", alignItems: "center", justifyContent: "center" }}>
                  <Text style={{ fontFamily: F.mono, fontSize: 11, color: "#a29a8c" }}>{j.no}</Text>
                </View>
              )}
              <Text numberOfLines={1} style={{ flex: 1, fontFamily: F.sans, fontSize: 14, color: PAPER }}>{j.row.name}</Text>
              <Text style={{ fontFamily: F.mono, fontSize: 11, color: "#a29a8c" }}>{dottedDate(j.row.visited_at ?? j.row.created_at.slice(0, 10))}</Text>
            </View>
          )
        )}
      </ScrollView>
    </View>
  );
}

function NumbersSlide({ recap }: { recap: LabelRecap }) {
  return (
    <View style={{ flex: 1, justifyContent: "center", gap: 34 }}>
      <View>
        <Text style={s.kicker}>걸린 날</Text>
        <Text style={{ marginTop: 6, fontFamily: F.serif, fontSize: 64, color: C.brick }}>{recap.days}<Text style={{ fontSize: 24 }}>일</Text></Text>
      </View>
      <View>
        <Text style={s.kicker}>다녀온 곳</Text>
        <Text style={{ marginTop: 6, fontFamily: F.serif, fontSize: 40, color: PAPER }}>{recap.places}<Text style={{ fontSize: 20 }}>곳</Text></Text>
      </View>
      <View>
        <Text style={s.kicker}>가장 많이 먹은 종류</Text>
        <Text style={{ marginTop: 6, fontFamily: F.serif, fontSize: 40, color: PAPER }}>{recap.topCategory ?? "—"}</Text>
      </View>
    </View>
  );
}

function NextSlide({ recap, onShare, onClose }: { recap: LabelRecap; onShare?: () => void; onClose?: () => void }) {
  const n = recap.next;
  const pct = n ? Math.min(1, Math.max(0, (n.have - n.from) / Math.max(1, n.need - n.from))) : 1;
  return (
    <View style={{ flex: 1 }}>
      <View style={{ flex: 1, justifyContent: "center" }}>
        {n ? (
          <>
            <Text style={s.kicker}>다음 라벨까지</Text>
            <Text style={{ marginTop: 10, fontFamily: F.serif, fontSize: 28, lineHeight: 40, color: PAPER }}>
              {n.name}까지 <Text style={{ color: C.brick }}>{n.left}</Text>
            </Text>
            <View style={{ marginTop: 22, height: 6, borderRadius: 3, backgroundColor: "#3a3631", overflow: "hidden" }}>
              <View style={{ width: `${pct * 100}%`, height: 6, borderRadius: 3, backgroundColor: C.brick }} />
            </View>
            <View style={{ marginTop: 8, flexDirection: "row", justifyContent: "space-between" }}>
              <Text style={{ fontFamily: F.mono, fontSize: 10.5, color: "#a29a8c" }}>{n.from}</Text>
              <Text style={{ fontFamily: F.mono, fontSize: 10.5, color: "#a29a8c" }}>{n.need}</Text>
            </View>
          </>
        ) : (
          <Text style={{ fontFamily: F.serif, fontSize: 26, color: PAPER }}>모든 라벨을 받았어요</Text>
        )}
      </View>
      {(onShare || onClose) && (
        <View style={{ gap: 10 }}>
          <Pressable onPress={onShare} style={{ height: 52, borderRadius: 26, backgroundColor: PAPER, alignItems: "center", justifyContent: "center" }}>
            <Text style={{ fontFamily: F.sansMd, fontSize: 14, color: INK }}>공유하기</Text>
          </Pressable>
          <Pressable onPress={onClose} style={{ height: 48, borderRadius: 24, borderWidth: 1, borderColor: "#4d4842", alignItems: "center", justifyContent: "center" }}>
            <Text style={{ fontFamily: F.sans, fontSize: 13, color: PAPER }}>닫기</Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}

/* ── 공유 카드(§E-6) ─────────────────────────────── */

const LineText = ({ line, size = 15, color = INK }: { line: Line; size?: number; color?: string }) => (
  <Text style={{ fontFamily: F.serif, fontSize: size, lineHeight: size * 1.6, color, textAlign: "center" }}>
    {line.map((p, k) => <Text key={k} style={p.em ? { color: C.brick } : undefined}>{p.t}</Text>)}
  </Text>
);

const CARD_W = 290;
const PHOTO_GAP = 5;
const PHOTO_W = (CARD_W - 16 - PHOTO_GAP * 4) / 5;

function ShareCard({ recap, photos }: { recap: LabelRecap; photos: boolean }) {
  const last10 = recap.journey.slice(-10);
  return (
    <View style={{ width: CARD_W, minHeight: 480, borderRadius: 22, backgroundColor: PAPER, paddingTop: 20, paddingBottom: 20, paddingHorizontal: 22 }}>
      <Text style={{ fontFamily: F.serif, fontSize: 13, color: INK }}>DINARY</Text>
      <View style={{ marginTop: 22, alignItems: "center" }}>
        <Stamp n={coverNo(recap)} size={64} tilt={-8} />
        <Text style={{ marginTop: 14, fontFamily: F.serif, fontSize: 30, color: INK }}>{recap.def.name}</Text>
      </View>
      <View style={{ marginTop: 12 }}><LineText line={recap.discovery} /></View>

      {photos ? (
        <View style={{ marginTop: 20, marginHorizontal: -14, flexDirection: "row", flexWrap: "wrap", columnGap: PHOTO_GAP, rowGap: 8 }}>
          {Array.from({ length: 10 }, (_, k) => last10[k]).map((j, k) => (
            <View key={k} style={{ width: PHOTO_W }}>
              <View style={{ width: PHOTO_W, height: PHOTO_W * 4 / 3, borderRadius: 8, overflow: "hidden", backgroundColor: "#e6e0d3" }}>
                {j && photoOf(j.row) && <SignedImage uri={photoOf(j.row)} style={{ width: PHOTO_W, height: PHOTO_W * 4 / 3 }} />}
              </View>
              <Text numberOfLines={1} style={{ marginTop: 3, fontFamily: F.sans, fontSize: 8, color: "#4d4842" }}>{j?.row.name ?? ""}</Text>
            </View>
          ))}
        </View>
      ) : (
        <View style={{ marginTop: 22, alignSelf: "center", width: 36 * 5 + 10 * 4, flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
          {Array.from({ length: 10 }, (_, k) => last10[k]).map((j, k) =>
            j ? <Stamp key={k} n={j.no} size={36} tilt={stampTilt(k)} /> : <EmptySlot key={k} size={36} />
          )}
        </View>
      )}

      <View style={{ marginTop: 22, borderTopWidth: 1, borderTopColor: "#e2dccf" }}>
        <CardRow k="걸린 시간" v={`${recap.days}일`} />
        <CardRow k="다녀온 곳" v={`${recap.places}곳`} />
        <CardRow k="가장 많이 먹은 것" v={recap.topCategory ?? "—"} last />
      </View>
    </View>
  );
}

const CardRow = ({ k, v, last }: { k: string; v: string; last?: boolean }) => (
  <View style={{ flexDirection: "row", justifyContent: "space-between", paddingVertical: 8, borderBottomWidth: last ? 0 : 1, borderBottomColor: "#ece7dc" }}>
    <Text style={{ fontFamily: F.sans, fontSize: 11.5, color: "#8a8377" }}>{k}</Text>
    <Text style={{ fontFamily: F.mono, fontSize: 11.5, color: INK }}>{v}</Text>
  </View>
);

type Target = { id: string; label: string; icon: React.ReactNode; bg: string };

function ShareView({ recap, onBack }: { recap: LabelRecap; onBack: () => void }) {
  const insets = useSafeAreaInsets();
  const cardRef = useRef<View>(null);
  const [photos, setPhotos] = useState(false);
  const [grid, setGrid] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 2200);
    return () => clearTimeout(t);
  }, [toast]);

  async function capture() {
    const mods = shareModules();
    if (!mods) { setToast(NEEDS_BUILD); return null; }
    try {
      return { uri: await mods.captureRef(cardRef, { format: "png", quality: 1, result: "tmpfile" }), Sharing: mods.Sharing };
    } catch (e) {
      setToast(missingNative(e) ? NEEDS_BUILD : "이미지를 만들지 못했어요");
      return null;
    }
  }

  // 인스타 스토리 · 카카오톡 · 메시지 · 더보기는 지금은 시스템 공유창으로 보냅니다(각 앱이 공유창에 뜹니다).
  async function sendImage() {
    const shot = await capture();
    if (!shot) return;
    if (!(await shot.Sharing.isAvailableAsync())) return setToast("이 기기에서는 공유할 수 없어요");
    await shot.Sharing.shareAsync(shot.uri, { mimeType: "image/png", UTI: "public.png", dialogTitle: `${recap.def.name} 공유` }).catch(() => {});
  }

  async function saveImage() {
    const shot = await capture();
    if (!shot) return;
    try {
      const perm = await MediaLibrary.requestPermissionsAsync(true);
      if (!perm.granted) return setToast("사진 접근을 허용하면 저장할 수 있어요");
      await MediaLibrary.saveToLibraryAsync(shot.uri);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setToast("사진 앱에 저장했어요");
    } catch {
      setToast("이미지를 저장하지 못했어요");
    }
  }

  async function copyLink() {
    await Clipboard.setStringAsync(`DINARY · ${recap.def.name}${BASE ? ` ${BASE}` : ""}`);
    setToast("복사했어요");
  }

  const targets: (Target & { run: () => void })[] = [
    { id: "ig", label: "인스타 스토리", bg: "#c1446f", icon: <IgGlyph />, run: sendImage },
    { id: "kakao", label: "카카오톡", bg: "#f7e04b", icon: <BubbleGlyph color="#3b1e1e" />, run: sendImage },
    { id: "sms", label: "메시지", bg: "#4caf62", icon: <BubbleGlyph color="#fff" />, run: sendImage },
    { id: "save", label: "이미지 저장", bg: "#efebe2", icon: <SaveGlyph />, run: saveImage },
    { id: "link", label: "링크 복사", bg: "#efebe2", icon: <LinkGlyph />, run: copyLink },
    { id: "more", label: "더보기", bg: "#efebe2", icon: <MoreGlyph />, run: sendImage },
  ];

  return (
    <View style={{ flex: 1, backgroundColor: INK }}>
      <StatusBar style="light" />
      {/* 리캡 마지막 장이 흐리게 비칩니다. */}
      <View pointerEvents="none" style={[StyleSheet.absoluteFill, { opacity: 0.38, paddingTop: insets.top + 64, paddingBottom: insets.bottom + 24, paddingHorizontal: 28 }]}>
        <NextSlide recap={recap} />
      </View>
      <View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: "rgba(10,9,8,.35)" }]} />

      <View style={{ paddingTop: insets.top + 8, paddingHorizontal: 16, flexDirection: "row", justifyContent: "space-between" }}>
        <Pressable onPress={onBack} hitSlop={12} accessibilityLabel="리캡으로"><Text style={{ fontSize: 22, color: PAPER }}>‹</Text></Pressable>
      </View>

      <ScrollView contentContainerStyle={{ alignItems: "center", paddingTop: 8, paddingBottom: 200 }} showsVerticalScrollIndicator={false}>
        <View ref={cardRef} collapsable={false} style={{ borderRadius: 22 }}>
          <ShareCard recap={recap} photos={photos} />
        </View>
      </ScrollView>

      <View style={[s.sheet, { paddingBottom: insets.bottom + 14 }]}>
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 4 }}>
          <Text style={{ fontFamily: F.sansMd, fontSize: 14, color: INK }}>내 사진 넣기</Text>
          <Toggle label="내 사진 넣기" value={photos} onChange={setPhotos} />
        </View>
        <Pressable onPress={() => setGrid(true)} style={{ marginTop: 14, height: 52, borderRadius: 26, backgroundColor: INK, alignItems: "center", justifyContent: "center" }}>
          <Text style={{ fontFamily: F.sansMd, fontSize: 14, color: C.card }}>공유하기</Text>
        </Pressable>
      </View>

      {grid && (
        <View style={StyleSheet.absoluteFill}>
          <Pressable style={[StyleSheet.absoluteFill, { backgroundColor: "rgba(28,26,23,.4)" }]} onPress={() => setGrid(false)} accessibilityLabel="닫기" />
          <View style={[s.sheet, { paddingBottom: insets.bottom + 18 }]}>
            <Text style={{ fontFamily: F.serif, fontSize: 16, color: INK }}>공유하기</Text>
            <View style={{ marginTop: 18, flexDirection: "row", flexWrap: "wrap", rowGap: 18 }}>
              {targets.map((t) => (
                <Pressable key={t.id} onPress={() => { setGrid(false); t.run(); }} style={{ width: "25%", alignItems: "center", gap: 7 }} accessibilityLabel={t.label}>
                  <View style={{ width: 54, height: 54, borderRadius: 27, backgroundColor: t.bg, alignItems: "center", justifyContent: "center" }}>{t.icon}</View>
                  <Text style={{ fontFamily: F.sans, fontSize: 11, color: "#4d4842" }}>{t.label}</Text>
                </Pressable>
              ))}
            </View>
          </View>
        </View>
      )}

      {toast && (
        <View pointerEvents="none" style={[s.toast, { bottom: insets.bottom + 150 }]}>
          <Text style={{ fontFamily: F.sans, fontSize: 12.5, color: C.card }}>{toast}</Text>
        </View>
      )}
    </View>
  );
}

/* 공유 대상 자리표시 아이콘 — 실제 배포 전 각 서비스의 공식 아이콘으로 바꿉니다. */
const IgGlyph = () => (
  <Svg width={24} height={24} viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth={1.8}>
    <Rect x="4" y="4" width="16" height="16" rx="5" /><Circle cx="12" cy="12" r="3.6" /><Circle cx="16.8" cy="7.2" r="0.6" fill="#fff" />
  </Svg>
);
const BubbleGlyph = ({ color }: { color: string }) => (
  <Svg width={24} height={24} viewBox="0 0 24 24"><Path d="M12 5c-4.7 0-8 2.8-8 6.3 0 2.2 1.4 4.1 3.6 5.2L7 19.5l3.4-2.2c.5.1 1 .1 1.6.1 4.7 0 8-2.8 8-6.1S16.7 5 12 5z" fill={color} /></Svg>
);
const SaveGlyph = () => (
  <Svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke={INK} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round"><Path d="M12 4v11M7.5 10.5L12 15l4.5-4.5M5 19.5h14" /></Svg>
);
const LinkGlyph = () => (
  <Svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke={INK} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
    <Path d="M10 13.5a4.2 4.2 0 0 0 6 .3l3-3a4.2 4.2 0 0 0-6-6l-1.6 1.6" /><Path d="M14 10.5a4.2 4.2 0 0 0-6-.3l-3 3a4.2 4.2 0 0 0 6 6l1.6-1.6" />
  </Svg>
);
const MoreGlyph = () => (
  <Svg width={22} height={22} viewBox="0 0 24 24" fill={INK}><Circle cx="6" cy="12" r="1.7" /><Circle cx="12" cy="12" r="1.7" /><Circle cx="18" cy="12" r="1.7" /></Svg>
);

const s = StyleSheet.create({
  kicker: { fontFamily: F.mono, fontSize: 10.5, letterSpacing: 1.6, color: "#a29a8c" },
  sheet: { position: "absolute", left: 0, right: 0, bottom: 0, borderTopLeftRadius: 26, borderTopRightRadius: 26, backgroundColor: C.paper, paddingTop: 18, paddingHorizontal: 22 },
  toast: { position: "absolute", alignSelf: "center", borderRadius: 16, backgroundColor: "rgba(23,22,20,.85)", paddingVertical: 10, paddingHorizontal: 16 },
});
