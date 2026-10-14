import { useNavigation, useRouter } from "expo-router";
import * as Haptics from "expo-haptics";
import { Image, Pressable, ScrollView, Text, View, type ViewStyle } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LABELS } from "@/lib/labels";
import { C, F } from "@/theme";

/** 디자인에서 거듭 쓰는 색 — 토큰(src/theme)에 없는 것만. */
export const K = {
  inactive: "#a29a8c",
  text2: "#4d4842",
  brickLine: "#e0c3b1",
  brickInk: "#8f4323",
  seg: "#ebe6db",
  segMap: "#efebe2",
  ivory: "#f3ecdc",
  dashed: "#cdc6b8",
  stripe: "#ece7dc",
} as const;

/** 커뮤니티를 통째로 닫고 원래 탭으로 — 어느 탭 · 어느 깊이에서든 루트 스택에서 한 칸 내립니다. */
export function useExitCommunity() {
  const nav = useNavigation();
  const router = useRouter();
  return () => {
    let root = nav;
    while (root.getParent()) root = root.getParent()!;
    if (root.canGoBack()) root.goBack();
    else router.replace("/");
  };
}

/** 머리 — 왼쪽 알약(기본 「‹ 내 기록」), 오른쪽은 화면마다. 위 안전 영역 아래에 놓입니다. */
export function CommunityHeader({ back, right }: { back?: { label: string; onPress: () => void }; right?: React.ReactNode }) {
  const insets = useSafeAreaInsets();
  const exit = useExitCommunity();
  return (
    <View style={{ paddingTop: insets.top + 8, paddingHorizontal: 20, flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
      <Pill label={back?.label ?? "‹ 내 기록"} onPress={back?.onPress ?? exit} accessibilityLabel={back ? undefined : "내 기록으로 돌아가기"} />
      <View style={{ flexDirection: "row", gap: 6 }}>{right}</View>
    </View>
  );
}

export const Pill = ({ label, onPress, children, accessibilityLabel }: { label?: string; onPress?: () => void; children?: React.ReactNode; accessibilityLabel?: string }) => (
  <Pressable
    onPress={onPress}
    disabled={!onPress}
    hitSlop={6}
    accessibilityRole="button"
    accessibilityLabel={accessibilityLabel ?? label}
    style={{ height: 32, borderRadius: 16, borderWidth: 1, borderColor: C.line, backgroundColor: C.card, paddingLeft: 10, paddingRight: 12, flexDirection: "row", alignItems: "center", gap: 5 }}
  >
    {children}
    {label != null && <Text style={{ fontFamily: F.sans, fontSize: 11.5, color: K.text2 }}>{label}</Text>}
  </Pressable>
);

export const RoundButton = ({ onPress, label, children, dot, borderColor = C.line }: { onPress?: () => void; label: string; children: React.ReactNode; dot?: boolean; borderColor?: string }) => (
  <Pressable
    onPress={onPress}
    accessibilityLabel={label}
    hitSlop={4}
    style={{ width: 36, height: 36, borderRadius: 18, borderWidth: 1, borderColor, backgroundColor: C.card, alignItems: "center", justifyContent: "center" }}
  >
    {children}
    {dot && <View style={{ position: "absolute", top: 6, right: 7, width: 7, height: 7, borderRadius: 4, backgroundColor: C.brick }} />}
  </Pressable>
);

/** 제목 덩어리 — eyebrow · Gowun 22 제목 · 부제(선택). aside 는 제목 줄 오른쪽. */
export function TitleBlock({ eyebrow, title, sub, aside }: { eyebrow: string; title: string; sub?: string; aside?: React.ReactNode }) {
  return (
    <View style={{ paddingTop: 14, paddingHorizontal: 20 }}>
      <Text style={{ fontFamily: F.mono, fontSize: 10, letterSpacing: 2.2, color: C.faint }}>{eyebrow}</Text>
      <View style={{ marginTop: 8, flexDirection: "row", alignItems: "baseline", justifyContent: "space-between" }}>
        <Text style={{ fontFamily: F.serif, fontSize: 22, color: C.ink }}>{title}</Text>
        {aside}
      </View>
      {!!sub && <Text style={{ marginTop: 6, fontFamily: F.sans, fontSize: 12, color: C.faint }}>{sub}</Text>}
    </View>
  );
}

/** 큰 전환(높이 38) — 친구 「소식 | 친구 지도」. */
export function Segmented<T extends string>({ value, options, onChange, style }: { value: T; options: { id: T; label: string }[]; onChange: (v: T) => void; style?: ViewStyle }) {
  return (
    <View style={[{ height: 38, borderRadius: 19, backgroundColor: K.seg, padding: 3, flexDirection: "row", gap: 3 }, style]}>
      {options.map((o) => {
        const on = o.id === value;
        return (
          <Pressable
            key={o.id}
            onPress={() => { if (!on) { Haptics.selectionAsync(); onChange(o.id); } }}
            accessibilityRole="tab"
            accessibilityState={{ selected: on }}
            style={[{ flex: 1, borderRadius: 16, alignItems: "center", justifyContent: "center" }, on && { backgroundColor: C.card, shadowColor: C.ink, shadowOpacity: 0.08, shadowRadius: 3, shadowOffset: { width: 0, height: 1 }, elevation: 1 }]}
          >
            <Text style={{ fontFamily: on ? F.sansMd : F.sans, fontSize: 12.5, color: on ? C.ink : C.muted }}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/** 작은 전환(높이 30) — 랭킹 「친구 | 전체」. */
export function MiniSegment<T extends string>({ value, options, onChange }: { value: T; options: { id: T; label: string }[]; onChange: (v: T) => void }) {
  return (
    <View style={{ height: 30, borderRadius: 15, backgroundColor: K.seg, padding: 3, flexDirection: "row", gap: 2 }}>
      {options.map((o) => {
        const on = o.id === value;
        return (
          <Pressable key={o.id} onPress={() => { if (!on) { Haptics.selectionAsync(); onChange(o.id); } }} accessibilityState={{ selected: on }}
            style={{ borderRadius: 12, paddingHorizontal: 11, justifyContent: "center", backgroundColor: on ? C.card : "transparent" }}>
            <Text style={{ fontFamily: on ? F.sansMd : F.sans, fontSize: 11.5, color: on ? C.ink : C.muted }}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/** 거르기 칩 줄(높이 32) — 켜진 것은 먹색. */
export function FilterChips<T extends string>({ value, options, onChange, trailing }: { value: T; options: { id: T; label: string }[]; onChange: (v: T) => void; trailing?: React.ReactNode }) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 14, flexGrow: 0 }} contentContainerStyle={{ paddingHorizontal: 20, gap: 6 }}>
      {options.map((o) => {
        const on = o.id === value;
        return (
          <Pressable key={o.id} onPress={() => { Haptics.selectionAsync(); onChange(o.id); }} accessibilityState={{ selected: on }}
            style={{ height: 32, borderRadius: 16, paddingHorizontal: 13, justifyContent: "center", backgroundColor: on ? C.ink : C.card, borderWidth: on ? 0 : 1, borderColor: C.line }}>
            <Text style={{ fontFamily: on ? F.sansMd : F.sans, fontSize: 12, color: on ? C.card : K.text2 }}>{o.label}</Text>
          </Pressable>
        );
      })}
      {trailing}
    </ScrollView>
  );
}

/** 기간 탭 — 이번 주 · 이번 달 · 이번 분기. 켜진 것은 먹색 500 + 벽돌 밑줄 2px. */
export function PeriodTabs<T extends string>({ value, options, onChange }: { value: T; options: { id: T; label: string }[]; onChange: (v: T) => void }) {
  return (
    <View style={{ flexDirection: "row", gap: 16 }}>
      {options.map((o) => {
        const on = o.id === value;
        return (
          <Pressable key={o.id} onPress={() => { Haptics.selectionAsync(); onChange(o.id); }} hitSlop={6}
            style={{ paddingBottom: 3, borderBottomWidth: 2, borderBottomColor: on ? C.brick : "transparent" }}>
            <Text style={{ fontFamily: on ? F.sansMd : F.sans, fontSize: 12.5, color: on ? C.ink : C.faint }}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const AVATAR_BG = ["#e9d6c8", "#d9e0cf", "#d8dbe4", "#ecdcb8", "#e4dfd3"];
const tint = (seed: string) => AVATAR_BG[[...seed].reduce((n, ch) => n + ch.charCodeAt(0), 0) % AVATAR_BG.length];

/** 동그란 얼굴 — 사진이 있으면 사진, 없으면 첫 글자(Gowun). ring 이면 2px 벽돌 테두리 + 2px 틈. */
export function Avatar({ name, url, size, ring, seed }: { name: string; url?: string | null; size: number; ring?: boolean; seed?: string }) {
  const inner = (
    <View style={{ width: ring ? size - 8 : size, height: ring ? size - 8 : size, borderRadius: size, overflow: "hidden", backgroundColor: tint(seed ?? name), alignItems: "center", justifyContent: "center" }}>
      {url ? (
        <Image source={{ uri: url }} style={{ width: "100%", height: "100%" }} />
      ) : (
        <Text style={{ fontFamily: F.serif, fontSize: Math.round(size * 0.38), color: C.ink }}>{(name || "?").slice(0, 1)}</Text>
      )}
    </View>
  );
  if (!ring) return inner;
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, borderWidth: 2, borderColor: C.brick, padding: 2, alignItems: "center", justifyContent: "center" }}>{inner}</View>
  );
}

/** 칭호(대표 라벨) 이름. 없으면 null. */
export const titleName = (id: string | null | undefined) => (id ? LABELS.find((l) => l.id === id)?.name ?? null : null);
const titleColor = (id: string | null | undefined) => (id ? LABELS.find((l) => l.id === id)?.color : undefined) ?? C.brick;

/** 이름 옆 칭호 칩 — 내계정과 같은 모양(라벨 색 30%/10%). */
export function TitleChip({ id }: { id: string | null | undefined }) {
  const name = titleName(id);
  if (!name) return null;
  const color = titleColor(id);
  return (
    <Text style={{ borderRadius: 12, borderWidth: 1, borderColor: `${color}4d`, backgroundColor: `${color}1a`, paddingHorizontal: 7, paddingVertical: 2, fontFamily: F.sansBd, fontSize: 10, color, overflow: "hidden" }}>{name}</Text>
  );
}

/** 「✓ 인증」 점선 칩. */
export const VerifiedChip = ({ label = "✓ 인증" }: { label?: string }) => (
  <Text style={{ borderRadius: 9, borderWidth: 1, borderStyle: "dashed", borderColor: C.brick, paddingHorizontal: 7, fontFamily: F.mono, fontSize: 10, color: C.brick, overflow: "hidden" }}>{label}</Text>
);

/** 형식 꼬리표 — 기록 나눔 · 주제 · 어디 가요? */
export const TagChip = ({ label }: { label: string }) => (
  <Text style={{ alignSelf: "flex-start", borderRadius: 6, backgroundColor: K.segMap, paddingHorizontal: 7, paddingVertical: 1, fontFamily: F.mono, fontSize: 10, color: C.muted, overflow: "hidden" }}>{label}</Text>
);

/** 줄무늬 자리(사진이 없을 때). */
export function PhotoOrStripes({ uri, height, width, radius, label }: { uri?: string | null; height: number; width?: number | "100%"; radius: number; label?: string }) {
  return (
    <View style={{ width: width ?? "100%", height, borderRadius: radius, overflow: "hidden", backgroundColor: K.stripe, alignItems: "center", justifyContent: "center" }}>
      {uri ? (
        <Image source={{ uri }} style={{ width: "100%", height: "100%" }} resizeMode="cover" />
      ) : label ? (
        <Text style={{ fontFamily: F.mono, fontSize: 10, letterSpacing: 1.4, color: C.faint }}>{label}</Text>
      ) : null}
    </View>
  );
}

/** "방금" · "40분 전" · "2시간 전" · "3일 전" · "10.11" */
export function timeAgo(iso: string) {
  const min = Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 60000));
  if (min < 1) return "방금";
  if (min < 60) return `${min}분 전`;
  const h = Math.round(min / 60);
  if (h < 24) return `${h}시간 전`;
  const d = Math.round(h / 24);
  if (d < 7) return `${d}일 전`;
  const date = new Date(iso);
  return `${date.getMonth() + 1}.${String(date.getDate()).padStart(2, "0")}`;
}

/** "2026-10-11T…" → "10.11" (한국 날짜) */
export function monthDay(iso: string | null) {
  if (!iso) return "";
  const p = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul", month: "2-digit", day: "2-digit" }).format(new Date(iso));
  return p.replace("-", ".");
}

/** 주소에서 「분식 · 서울 마포구 망원동」 같은 메타 줄의 뒤쪽. */
export const shortAddr = (address: string | null, region: string | null) => {
  const parts = (address ?? "").trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 3) return parts.slice(0, 3).join(" ");
  return region ?? address ?? "";
};
export const metaLine = (...xs: (string | null | undefined)[]) => xs.filter(Boolean).join(" · ");
