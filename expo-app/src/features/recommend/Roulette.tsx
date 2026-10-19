import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Haptics from "expo-haptics";
import { useEffect, useMemo, useRef, useState } from "react";
import { Animated, Easing, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import Svg, { Circle, G, Line, Path, Text as SvgText } from "react-native-svg";
import { REC_CATEGORIES, type RecCategory } from "@/lib/recommend";
import type { Scored } from "@/lib/rec/score";
import { C, F } from "@/theme";
import { REC, SectionHead } from "./ui";

const SIZE = 252;
const R = SIZE / 2;
/** 검정 테두리 두께 · 안쪽 바퀴 반지름 · 테두리 점 수 · 가운데 단추 지름. */
const RIM = 14;
const RI = R - RIM;
const BULBS = 20;
const HUB = 66;
const SPIN_MS = 3400;
/** 칸 색 — 벽돌 · 살구 · 종이 · 모래를 돌려 씁니다. 글자색은 바탕마다. */
const TONES = [
  { bg: C.brick, ink: "#fbf3ec" },
  { bg: "#f2ddcf", ink: "#8f4323" },
  { bg: "#fbf8f2", ink: C.ink },
  { bg: "#e9dcc8", ink: "#4d4842" },
];
/** 이웃 칸(처음 · 끝 포함)이 같은 색이 되지 않게 칸마다 톤을 고릅니다. */
function tonesFor(n: number) {
  const out = Array.from({ length: n }, (_, i) => i % TONES.length);
  if (n > 1 && out[n - 1] === out[0]) out[n - 1] = [1, 2, 3].find((t) => t !== out[n - 2] && t !== out[0]) ?? 2;
  return out.map((t) => TONES[t]);
}
/** 칸 수 · 적어 넣는 글자 수 · 직접 선택을 기기에 남겨 두는 키. */
const CUSTOM_MAX = 12;
const CUSTOM_LEN = 12;
const CUSTOM_KEY = "rec.roulette.custom";

type Tab = "place" | "category" | "custom";
type Option = { key: string; label: string };

const TABS: { id: Tab; label: string }[] = [
  { id: "place", label: "추천된 가게" },
  { id: "category", label: "카테고리" },
  { id: "custom", label: "직접 선택" },
];

/** 「면으로」 · 「한식으로」 — 받침(ㄹ 빼고) 있으면 「으로」. */
const euro = (w: string) => {
  const code = w.charCodeAt(w.length - 1) - 0xac00;
  if (code < 0 || code > 11171) return "로";
  const jong = code % 28;
  return jong === 0 || jong === 8 ? "로" : "으로";
};

const short = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

/** 0° = 위, 시계 방향. */
const pointAt = (a: number, r: number) => {
  const t = ((a - 90) * Math.PI) / 180;
  return { x: R + r * Math.cos(t), y: R + r * Math.sin(t) };
};
function slicePath(a0: number, a1: number, r: number) {
  const p0 = pointAt(a0, r), p1 = pointAt(a1, r);
  return `M${R} ${R} L${p0.x} ${p0.y} A${r} ${r} 0 ${a1 - a0 > 180 ? 1 : 0} 1 ${p1.x} ${p1.y} Z`;
}

/**
 * 「결정을 하지 못하시겠다면?」 — 돌려서 정하는 룰렛. 추천된 가게 · 카테고리 · 직접 선택 셋 중에서 고르고,
 * 칸 옆 − 로 빼고, + 로 원하는 가게 · 카테고리 · 메뉴를 적어 넣습니다. 카테고리가 나오면 그 종류로 다시 추천받을 수 있습니다. 직접 입력한 것은 기기에 남깁니다.
 */
export function Roulette({ picks, exclude, onPlace, onCategory }: {
  picks: Scored[]; exclude: readonly string[];
  onPlace: (i: number) => void; onCategory: (cat: RecCategory) => void;
}) {
  const [tab, setTab] = useState<Tab>(picks.length >= 2 ? "place" : "category");
  // 탭마다 뺀 칸(removed: 기본 칸의 key)과 더한 칸(added: 적어 넣은 이름). 직접 선택은 더한 칸만 있고 기기에 남깁니다.
  const [removed, setRemoved] = useState<Record<Tab, string[]>>({ place: [], category: [], custom: [] });
  const [added, setAdded] = useState<Record<Tab, string[]>>({ place: [], category: [], custom: [] });
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState("");

  useEffect(() => {
    AsyncStorage.getItem(CUSTOM_KEY).then((v) => {
      const list = v ? (JSON.parse(v) as unknown) : null;
      if (Array.isArray(list)) setAdded((cur) => ({ ...cur, custom: list.filter((x): x is string => typeof x === "string").slice(0, CUSTOM_MAX) }));
    }).catch(() => {});
  }, []);
  const setAddedFor = (t: Tab, next: string[]) => {
    setAdded((cur) => ({ ...cur, [t]: next }));
    if (t === "custom") AsyncStorage.setItem(CUSTOM_KEY, JSON.stringify(next)).catch(() => {});
  };
  useEffect(() => { setAdding(false); setDraft(""); }, [tab]);

  // 기본 칸 — 추천된 가게 / 카테고리(필터에서 뺀 종류 빼고). 직접 선택은 없음.
  const base: Option[] = useMemo(() => {
    if (tab === "place") return picks.map((p) => ({ key: p.c.key, label: p.c.name }));
    if (tab === "category") return REC_CATEGORIES.filter((c) => !exclude.includes(c)).map((c) => ({ key: c, label: c }));
    return [];
  }, [tab, picks, exclude]);
  const live: Option[] = [
    ...base.filter((o) => !removed[tab].includes(o.key)),
    ...added[tab].map((l) => ({ key: `+${l}`, label: l })),
  ];
  /** 뺐던 기본 칸 — 「+」를 누르면 다시 넣을 수 있게 보여 줍니다. */
  const restorable = base.filter((o) => removed[tab].includes(o.key));

  function removeOption(o: Option) {
    Haptics.selectionAsync();
    if (o.key.startsWith("+")) setAddedFor(tab, added[tab].filter((l) => `+${l}` !== o.key));
    else setRemoved((cur) => ({ ...cur, [tab]: [...cur[tab], o.key] }));
  }
  function restore(o: Option) {
    Haptics.selectionAsync();
    setRemoved((cur) => ({ ...cur, [tab]: cur[tab].filter((k) => k !== o.key) }));
  }
  function addDraft() {
    const v = draft.trim().slice(0, CUSTOM_LEN);
    if (!v) return;
    setDraft("");
    // 뺐던 기본 칸과 이름이 같으면 그걸 되살립니다.
    const back = restorable.find((o) => o.label === v);
    if (back) return restore(back);
    if (live.some((o) => o.label === v) || live.length >= CUSTOM_MAX) return;
    Haptics.selectionAsync();
    setAddedFor(tab, [...added[tab], v]);
  }

  const seg = 360 / Math.max(1, live.length);
  const rot = useRef(new Animated.Value(0)).current;
  const deg = useRef(0);
  const [spinning, setSpinning] = useState(false);
  const [won, setWon] = useState<Option | null>(null);
  // 칸이 바뀌면(탭 · 빼고 넣기 · 다시 추천) 바퀴를 처음으로.
  const sig = `${tab}|${live.map((o) => o.key).join("|")}`;
  useEffect(() => { setWon(null); deg.current = 0; rot.setValue(0); }, [sig, rot]);

  const spin = () => {
    if (spinning || live.length < 2) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const i = Math.floor(Math.random() * live.length);
    // 바늘(위) 밑에 i 칸의 가운데 언저리가 오게 — 돌린 각이 a 면 위에 오는 건 바퀴의 (-a) 자리.
    const at = (i + 0.5) * seg + (Math.random() - 0.5) * seg * 0.6;
    const want = (360 - at + 360) % 360;
    const to = deg.current + 360 * 5 + ((want - (deg.current % 360)) + 360) % 360;
    deg.current = to;
    setWon(null);
    setSpinning(true);
    const pick = live[i];
    Animated.timing(rot, { toValue: to, duration: SPIN_MS, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start(() => {
      setSpinning(false);
      setWon(pick);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    });
  };

  const ready = live.length >= 2;
  const fills = tonesFor(live.length);
  const fontSize = live.length > 8 ? 11.5 : 13.5;
  const maxChars = live.length > 8 ? 5 : 6;
  const empty =
    tab === "custom" && live.length === 0 ? "+ 를 눌러 메뉴나 가게를 넣어 보세요"
    : live.length < 2 ? "두 칸 넘게 있어야 돌릴 수 있어요"
    : null;

  return (
    <View style={{ marginTop: 34 }}>
      <SectionHead title="결정을 하지 못하시겠다면?" />

      <View style={{ marginTop: 12, borderRadius: 24, borderWidth: 1, borderColor: C.lineSoft, backgroundColor: REC.paper, padding: 16 }}>
        {/* 고를 거리 — 세 칸 전환 */}
        <View style={{ height: 38, borderRadius: 19, backgroundColor: "#efebe2", padding: 3, flexDirection: "row", gap: 3 }}>
          {TABS.map((t) => {
            const on = tab === t.id;
            return (
              <Pressable
                key={t.id}
                disabled={spinning}
                onPress={() => { if (!on) { Haptics.selectionAsync(); setTab(t.id); } }}
                accessibilityRole="tab"
                accessibilityState={{ selected: on }}
                style={{ flex: 1, borderRadius: 16, alignItems: "center", justifyContent: "center", backgroundColor: on ? C.ink : "transparent" }}
              >
                <Text style={{ fontFamily: on ? F.sansMd : F.sans, fontSize: 12.5, color: on ? C.card : C.muted }}>{t.label}</Text>
              </Pressable>
            );
          })}
        </View>

        {/* 칸 — 옆의 − 로 빼고, 끝의 + 로 더합니다(적어 넣거나 뺐던 칸 되살리기). */}
        <View style={{ marginTop: 12, flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
          {live.map((o) => (
            <View key={o.key} style={{ height: 32, borderRadius: 16, paddingLeft: 12, paddingRight: 4, flexDirection: "row", alignItems: "center", gap: 6, borderWidth: 1, borderColor: C.line, backgroundColor: C.card }}>
              <Text numberOfLines={1} style={{ maxWidth: 140, fontFamily: F.sansMd, fontSize: 12, color: C.ink }}>{o.label}</Text>
              <Pressable onPress={() => removeOption(o)} disabled={spinning} hitSlop={6} accessibilityLabel={`${o.label} 빼기`} style={s.minus}>
                <Text style={{ fontFamily: F.sansMd, fontSize: 13, lineHeight: 15, color: C.muted }}>−</Text>
              </Pressable>
            </View>
          ))}
          {!adding && live.length < CUSTOM_MAX && (
            <Pressable onPress={() => { Haptics.selectionAsync(); setAdding(true); }} disabled={spinning} accessibilityLabel="칸 더하기" style={s.plus}>
              <Text style={{ fontFamily: F.sansMd, fontSize: 16, lineHeight: 18, color: C.brick }}>+</Text>
            </Pressable>
          )}
        </View>
        {adding && (
          <View style={{ marginTop: 10 }}>
            <View style={{ height: 42, borderRadius: 14, borderWidth: 1.5, borderColor: C.brick, backgroundColor: C.card, paddingLeft: 14, paddingRight: 5, flexDirection: "row", alignItems: "center", gap: 6 }}>
              <TextInput
                autoFocus
                value={draft}
                onChangeText={(t) => setDraft(t.slice(0, CUSTOM_LEN))}
                onSubmitEditing={addDraft}
                maxLength={CUSTOM_LEN}
                placeholder={tab === "place" ? "가게 이름" : tab === "category" ? "예: 샐러드" : "예: 김치찌개"}
                placeholderTextColor="#b3ada1"
                returnKeyType="done"
                style={{ flex: 1, height: "100%", fontFamily: F.sans, fontSize: 13, color: C.ink }}
              />
              <Pressable onPress={addDraft} disabled={!draft.trim()} style={{ height: 32, borderRadius: 11, paddingHorizontal: 12, justifyContent: "center", backgroundColor: draft.trim() ? C.ink : "#d8d3c8" }}>
                <Text style={{ fontFamily: F.sansMd, fontSize: 12, color: C.card }}>추가</Text>
              </Pressable>
              <Pressable onPress={() => { setAdding(false); setDraft(""); }} hitSlop={6} accessibilityLabel="닫기" style={{ width: 30, height: 32, alignItems: "center", justifyContent: "center" }}>
                <Text style={{ fontSize: 12, color: "#a29a8c" }}>✕</Text>
              </Pressable>
            </View>
            {restorable.length > 0 && (
              <View style={{ marginTop: 8, flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
                {restorable.map((o) => (
                  <Pressable key={o.key} onPress={() => restore(o)} accessibilityLabel={`${o.label} 다시 넣기`} style={{ height: 30, borderRadius: 15, paddingHorizontal: 11, justifyContent: "center", borderWidth: 1, borderStyle: "dashed", borderColor: "#cdc6b8" }}>
                    <Text numberOfLines={1} style={{ maxWidth: 140, fontFamily: F.sans, fontSize: 12, color: C.muted }}>+ {o.label}</Text>
                  </Pressable>
                ))}
              </View>
            )}
          </View>
        )}

        {/* 바퀴 — 검정 테두리에 작은 점(전구)들, 안쪽은 벽돌 · 살구 · 종이 · 모래 네 톤. 바늘은 위에 고정. */}
        <View style={{ marginTop: 22, alignItems: "center" }}>
          <View style={{ width: SIZE, height: SIZE + 10 }}>
            <Pressable onPress={spin} disabled={!ready} accessibilityRole="button" accessibilityLabel="룰렛 돌리기" style={{ marginTop: 10 }}>
              <View style={{ width: SIZE, height: SIZE, borderRadius: R, backgroundColor: C.ink, shadowColor: C.ink, shadowOpacity: 0.22, shadowRadius: 16, shadowOffset: { width: 0, height: 8 }, elevation: 8 }}>
                <Animated.View style={{ width: SIZE, height: SIZE, transform: [{ rotate: rot.interpolate({ inputRange: [0, 360], outputRange: ["0deg", "360deg"] }) }] }}>
                  <Svg width={SIZE} height={SIZE}>
                    <Circle cx={R} cy={R} r={R} fill={C.ink} />
                    {Array.from({ length: BULBS }, (_, i) => {
                      const p = pointAt((360 / BULBS) * i + 360 / BULBS / 2, R - RIM / 2);
                      return <Circle key={`b${i}`} cx={p.x} cy={p.y} r={2.3} fill={i % 2 ? "#f2ddcf" : "#e08a63"} />;
                    })}
                    {ready ? live.map((o, i) => (
                      <Path key={o.key} d={slicePath(i * seg, (i + 1) * seg, RI)} fill={fills[i].bg} />
                    )) : <Circle cx={R} cy={R} r={RI} fill="#efe9df" />}
                    {ready && live.map((o, i) => {
                      const p = pointAt(i * seg, RI);
                      return <Line key={`l${o.key}`} x1={R} y1={R} x2={p.x} y2={p.y} stroke={REC.paper} strokeWidth={1.5} />;
                    })}
                    {ready && live.map((o, i) => (
                      <G key={`t${o.key}`} transform={`rotate(${(i + 0.5) * seg} ${R} ${R})`}>
                        <SvgText x={R} y={R - RI * 0.66} textAnchor="middle" alignmentBaseline="middle" fontFamily={F.serif} fontSize={fontSize} fill={fills[i].ink}>
                          {short(o.label, maxChars)}
                        </SvgText>
                      </G>
                    ))}
                    <Circle cx={R} cy={R} r={RI} fill="none" stroke={REC.paper} strokeWidth={1.5} />
                  </Svg>
                </Animated.View>
              </View>
              {/* 가운데 단추 — 바퀴와 같이 돌지 않게 위에 따로 */}
              <View pointerEvents="none" style={{ position: "absolute", left: R - HUB / 2, top: R - HUB / 2, width: HUB, height: HUB, borderRadius: HUB / 2, backgroundColor: ready ? C.ink : "#a8a196", borderWidth: 3, borderColor: REC.paper, alignItems: "center", justifyContent: "center", shadowColor: C.ink, shadowOpacity: 0.25, shadowRadius: 6, shadowOffset: { width: 0, height: 2 } }}>
                <Text style={{ fontFamily: F.serif, fontSize: 13.5, color: REC.paper }}>{spinning ? "· · ·" : "돌리기"}</Text>
              </View>
            </Pressable>
            {/* 바늘 — 검정 물방울 + 벽돌 점, 테두리에 걸쳐 아래를 가리킵니다. */}
            <View pointerEvents="none" style={{ position: "absolute", top: 0, left: R - 13, shadowColor: C.ink, shadowOpacity: 0.25, shadowRadius: 3, shadowOffset: { width: 0, height: 2 } }}>
              <Svg width={26} height={34} viewBox="0 0 26 34">
                <Path d="M13 33 C9 26 2 20 2 12.5 A11 11 0 0 1 24 12.5 C24 20 17 26 13 33 Z" fill={C.ink} stroke={REC.paper} strokeWidth={2} />
                <Circle cx={13} cy={12.5} r={4.2} fill={C.brick} />
              </Svg>
            </View>
          </View>
        </View>

        {/* 결과 */}
        <View style={{ marginTop: 18, minHeight: 70, alignItems: "center", justifyContent: "center" }}>
          {empty ? (
            <Text style={{ fontFamily: F.sans, fontSize: 12.5, color: C.faint }}>{empty}</Text>
          ) : won ? (
            <View style={{ alignItems: "center", gap: 10 }}>
              <View style={{ alignItems: "center", gap: 4 }}>
                <Text style={{ fontFamily: F.mono, fontSize: 10, letterSpacing: 2, color: C.brick }}>오늘은 이걸로</Text>
                <Text style={{ fontFamily: F.serif, fontSize: 24, color: C.ink, textAlign: "center" }}>{won.label}</Text>
              </View>
              {((tab === "place" && !won.key.startsWith("+")) || (tab === "category" && (REC_CATEGORIES as readonly string[]).includes(won.label))) && (
                <Pressable
                  onPress={() => {
                    Haptics.selectionAsync();
                    if (tab === "place") onPlace(picks.findIndex((p) => p.c.key === won.key));
                    else onCategory(won.key as RecCategory);
                  }}
                  accessibilityRole="button"
                  style={{ height: 36, borderRadius: 18, backgroundColor: C.brick, paddingHorizontal: 16, justifyContent: "center" }}
                >
                  <Text style={{ fontFamily: F.sansMd, fontSize: 12.5, color: C.card }}>{tab === "place" ? "카드에서 보기" : `${won.label}${euro(won.label)} 추천받기`}</Text>
                </Pressable>
              )}
            </View>
          ) : (
            <Text style={{ fontFamily: F.sans, fontSize: 12, color: C.faint }}>가운데를 눌러 돌려 보세요</Text>
          )}
        </View>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  minus: { width: 22, height: 22, borderRadius: 11, backgroundColor: "#efebe2", alignItems: "center", justifyContent: "center" },
  plus: { width: 44, height: 32, borderRadius: 16, borderWidth: 1, borderStyle: "dashed", borderColor: C.brick, alignItems: "center", justifyContent: "center" },
});
