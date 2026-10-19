import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Haptics from "expo-haptics";
import { useEffect, useMemo, useRef, useState } from "react";
import { Animated, Easing, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import Svg, { Circle, G, Line, Path, Text as SvgText } from "react-native-svg";
import { REC_CATEGORIES, type RecCategory } from "@/lib/recommend";
import type { Scored } from "@/lib/rec/score";
import { C, F } from "@/theme";
import { REC, SectionHead } from "./ui";

const SIZE = 236;
const R = SIZE / 2;
const SPIN_MS = 3200;
/** 칸 색 — 종이 · 연벽돌을 번갈아, 칸이 홀수면 마지막 칸만 한 톤 다르게(같은 색이 맞붙지 않게). */
const FILLS = [C.card, C.brickSoft];
const ODD_FILL = "#f1ece3";
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
const pointAt = (a: number, r = R) => {
  const t = ((a - 90) * Math.PI) / 180;
  return { x: R + r * Math.cos(t), y: R + r * Math.sin(t) };
};
function slicePath(a0: number, a1: number) {
  const p0 = pointAt(a0), p1 = pointAt(a1);
  return `M${R} ${R} L${p0.x} ${p0.y} A${R} ${R} 0 ${a1 - a0 > 180 ? 1 : 0} 1 ${p1.x} ${p1.y} Z`;
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

  const fontSize = live.length > 8 ? 11 : 12.5;
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

        {/* 바퀴 */}
        <View style={{ marginTop: 20, alignItems: "center" }}>
          <Svg width={18} height={14} viewBox="0 0 18 14" style={{ marginBottom: -6, zIndex: 2 }}>
            <Path d="M1.5 1.5 H16.5 L9 12.5 Z" fill={C.brick} stroke={REC.paper} strokeWidth={1.5} strokeLinejoin="round" />
          </Svg>
          <Pressable onPress={spin} disabled={live.length < 2} accessibilityRole="button" accessibilityLabel="룰렛 돌리기">
            <Animated.View style={{ width: SIZE, height: SIZE, opacity: live.length < 2 ? 0.45 : 1, transform: [{ rotate: rot.interpolate({ inputRange: [0, 360], outputRange: ["0deg", "360deg"] }) }] }}>
              <Svg width={SIZE} height={SIZE}>
                {live.length < 2 ? (
                  <Circle cx={R} cy={R} r={R - 1} fill={C.card} />
                ) : live.map((o, i) => {
                  const fill = live.length % 2 === 1 && i === live.length - 1 ? ODD_FILL : FILLS[i % 2];
                  return <Path key={o.key} d={slicePath(i * seg, (i + 1) * seg)} fill={fill} />;
                })}
                {live.length >= 2 && live.map((o, i) => {
                  const p = pointAt(i * seg, R - 1);
                  return <Line key={`l${o.key}`} x1={R} y1={R} x2={p.x} y2={p.y} stroke={C.lineSoft} strokeWidth={1} />;
                })}
                {live.length >= 2 && live.map((o, i) => (
                  <G key={`t${o.key}`} transform={`rotate(${(i + 0.5) * seg} ${R} ${R})`}>
                    <SvgText x={R} y={R - R * 0.66} textAnchor="middle" alignmentBaseline="middle" fontFamily={F.sansMd} fontSize={fontSize} fill={C.ink}>
                      {short(o.label, maxChars)}
                    </SvgText>
                  </G>
                ))}
                <Circle cx={R} cy={R} r={R - 1} fill="none" stroke={C.brick} strokeWidth={1.5} />
              </Svg>
            </Animated.View>
            {/* 가운데 단추 — 바퀴와 같이 돌지 않게 위에 따로 */}
            <View pointerEvents="none" style={{ position: "absolute", left: R - 29, top: R - 29, width: 58, height: 58, borderRadius: 29, backgroundColor: live.length < 2 ? "#bdb6a9" : C.brick, borderWidth: 4, borderColor: REC.paper, alignItems: "center", justifyContent: "center" }}>
              <Text style={{ fontFamily: F.sansMd, fontSize: 12.5, color: C.card }}>{spinning ? "…" : "돌리기"}</Text>
            </View>
          </Pressable>
        </View>

        {/* 결과 */}
        <View style={{ marginTop: 16, minHeight: 62, alignItems: "center", justifyContent: "center" }}>
          {empty ? (
            <Text style={{ fontFamily: F.sans, fontSize: 12.5, color: C.faint }}>{empty}</Text>
          ) : won ? (
            <View style={{ alignItems: "center", gap: 10 }}>
              <Text style={{ fontFamily: F.serif, fontSize: 22, color: C.ink, textAlign: "center" }}>{won.label}</Text>
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
            <Text style={{ fontFamily: F.mono, fontSize: 10.5, letterSpacing: 1, color: C.faint }}>{live.length}칸</Text>
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
