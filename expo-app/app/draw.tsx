import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { Animated, Easing, Pressable, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, { Circle, Ellipse, Path, Rect } from "react-native-svg";
import { Character } from "@/components/Character";
import { BackButton, Button, Eyebrow } from "@/components/ui";
import { drawCharacter, useAccount, useSetCharacter, useTickets, type DrawResult } from "@/data/profile";
import { RARITY, VERIFIED_PER_TICKET, characterOf } from "@/lib/characters";
import { C, F } from "@/theme";

/* 밥솥 — 260×220 좌표. 층(아래→위): 솥 안쪽 · 캐릭터 · 몸통 · 뚜껑 · 김 */
const W = 260;
const H = 220;
/** 열린 뚜껑과 솟은 캐릭터가 들어갈 위쪽 여백 */
const TOP = 132;
const OUT = "#3a3129";

/** 뚜껑 경첩(뚜껑 기준 30, 86) — RN 은 가운데를 축으로 돌리니 옮겼다 돌리고 되돌립니다. */
const HINGE = { x: 30 - W / 2, y: 86 - H / 2 };
/** 뚜껑을 얼마나 젖히는지. 시제품(-38°)보다 훨씬 크게 열어 뽑은 캐릭터가 다 보이게 합니다. */
const LID_OPEN_DEG = -92;
/** 캐릭터 116×123 — 닫힘은 솥 안(translateY 70, ×0.8), 열림은 솥 위로 완전히 솟음. */
const CH = { w: 116, h: 123, left: (W - 116) / 2, top: 20, fromY: 70, toY: -66, fromScale: 0.8, toScale: 1.12 };

const NO_TICKET = `뽑기권이 없습니다 — 인증 기록 ${VERIFIED_PER_TICKET}건마다 1장`;

type Phase = "closed" | "drawing" | "open" | "closing";

function CookerInside() {
  return (
    <Svg width={W} height={H} viewBox={`0 0 ${W} ${H}`}>
      <Ellipse cx={130} cy={90} rx={92} ry={20} fill="#e4dfd3" stroke={OUT} strokeWidth={4} />
      <Ellipse cx={130} cy={95} rx={78} ry={13} fill="#fbfaf6" />
      <Path d="M86 92q6-3 10 0M150 96q6-3 10 0M118 100q6-3 10 0" stroke="#e4dccc" strokeWidth={2.4} strokeLinecap="round" fill="none" />
    </Svg>
  );
}

function CookerBody({ lit }: { lit: Animated.AnimatedInterpolation<number> }) {
  return (
    <>
      <Svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} style={{ position: "absolute" }}>
        <Rect x={60} y={200} width={28} height={12} rx={5} fill={OUT} />
        <Rect x={172} y={200} width={28} height={12} rx={5} fill={OUT} />
        <Rect x={22} y={112} width={22} height={30} rx={9} fill="#d8d3c8" stroke={OUT} strokeWidth={3.5} />
        <Rect x={216} y={112} width={22} height={30} rx={9} fill="#d8d3c8" stroke={OUT} strokeWidth={3.5} />
        <Path d="M38 90A92 20 0 0 0 222 90L222 176Q222 206 192 206L68 206Q38 206 38 176Z" fill={C.card} stroke={OUT} strokeWidth={4} strokeLinejoin="round" />
        <Path d="M40 190Q42 204 68 204L192 204Q218 204 220 190" stroke={C.brick} strokeWidth={6} fill="none" />
        <Path d="M54 122Q56 160 66 176" stroke="#ffffff" strokeWidth={6} strokeLinecap="round" fill="none" />
        <Rect x={96} y={136} width={68} height={46} rx={11} fill="#2f3a30" stroke={OUT} strokeWidth={3} />
        <Rect x={106} y={145} width={30} height={11} rx={3} fill="#8fa38d" />
        <Rect x={108} y={164} width={18} height={9} rx={4.5} fill="#4c5a4c" />
        <Rect x={132} y={164} width={18} height={9} rx={4.5} fill="#4c5a4c" />
        <Circle cx={150} cy={150} r={5.5} fill="#e8735e" />
      </Svg>
      {/* 열리면 램프가 초록으로 */}
      <Animated.View style={{ position: "absolute", left: 150 - 5.5, top: 150 - 5.5, opacity: lit }}>
        <Svg width={11} height={11}><Circle cx={5.5} cy={5.5} r={5.5} fill="#8fb35a" /></Svg>
      </Animated.View>
    </>
  );
}

function CookerLid() {
  return (
    <Svg width={W} height={H} viewBox={`0 0 ${W} ${H}`}>
      <Path d="M30 86Q32 40 130 38Q228 40 230 86Z" fill="#f1ede4" stroke={OUT} strokeWidth={4} strokeLinejoin="round" />
      <Path d="M62 70Q72 54 102 49" stroke="#ffffff" strokeWidth={5} strokeLinecap="round" fill="none" />
      <Circle cx={184} cy={62} r={4.5} fill="#d8d3c8" stroke={OUT} strokeWidth={2.4} />
      <Rect x={24} y={80} width={212} height={14} rx={7} fill="#f1ede4" stroke={OUT} strokeWidth={4} />
      <Rect x={112} y={25} width={36} height={17} rx={8.5} fill={C.brick} stroke={OUT} strokeWidth={3.5} />
      <Circle cx={30} cy={86} r={5} fill="#d8d3c8" stroke={OUT} strokeWidth={3} />
    </Svg>
  );
}

function Steam() {
  return (
    <Svg width={W} height={H} viewBox={`0 0 ${W} ${H}`}>
      {[64, 196, 218].map((x, i) => (
        <Path
          key={x}
          d={`M${x} ${84 - i * 4}q-9-12 0-24t0-24q-6-8 0-16`}
          stroke="#cfc8ba" strokeWidth={5} strokeLinecap="round" fill="none"
        />
      ))}
    </Svg>
  );
}

/** 오늘의 밥솥 — 뽑기권 한 장으로 밥솥을 열어 캐릭터를 뽑습니다(HANDOFF-characters.md §6). */
export default function DrawRoute() {
  const insets = useSafeAreaInsets();
  const qc = useQueryClient();
  const { data: account } = useAccount();
  const { tickets, labelCount } = useTickets();
  const setCharacter = useSetCharacter();

  const [phase, setPhase] = useState<Phase>("closed");
  const [result, setResult] = useState<DrawResult | null>(null);
  const [left, setLeft] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [picked, setPicked] = useState(false);

  const lid = useRef(new Animated.Value(0)).current;
  const rise = useRef(new Animated.Value(0)).current;
  const steam = useRef(new Animated.Value(0)).current;
  const reveal = useRef(new Animated.Value(0)).current;
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  const shown = left ?? tickets;
  const def = result ? characterOf(result.character_id) : null;
  const tone = def ? RARITY[def.rarity] : null;

  /** again 은 닫는 중(phase "closing")에 다시 여니 phase 검사를 건너뜁니다. */
  async function open(again = false) {
    if (!again && phase !== "closed") return;
    if (shown < 1) return setError(NO_TICKET);
    setError("");
    setPhase("drawing");
    let res: DrawResult;
    try {
      res = await drawCharacter(labelCount);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "뽑지 못했습니다";
      setError(msg === "no_ticket" ? NO_TICKET : msg);
      setPhase("closed");
      return;
    }
    // 응답이 온 뒤에 엽니다.
    setResult(res);
    setLeft(res.tickets_left);
    setPicked(false);
    void qc.invalidateQueries({ queryKey: ["characters"] });
    const bounce = Easing.out(Easing.back(1.4));
    Animated.parallel([
      Animated.timing(lid, { toValue: 1, duration: 600, easing: bounce, useNativeDriver: true }),
      Animated.timing(rise, { toValue: 1, duration: 700, delay: 250, easing: Easing.out(Easing.back(1.7)), useNativeDriver: true }),
      Animated.timing(steam, { toValue: 1, duration: 500, delay: 200, useNativeDriver: true }),
      Animated.timing(reveal, { toValue: 1, duration: 400, delay: 700, useNativeDriver: true }),
    ]).start(() => setPhase("open"));
  }

  function again() {
    if (phase !== "open" || shown < 1) return;
    setPhase("closing");
    const ease = Easing.inOut(Easing.quad);
    Animated.parallel([
      Animated.timing(reveal, { toValue: 0, duration: 200, useNativeDriver: true }),
      Animated.timing(steam, { toValue: 0, duration: 250, useNativeDriver: true }),
      Animated.timing(rise, { toValue: 0, duration: 450, easing: ease, useNativeDriver: true }),
      Animated.timing(lid, { toValue: 0, duration: 500, delay: 150, easing: ease, useNativeDriver: true }),
    ]).start();
    timer.current = setTimeout(() => {
      setResult(null);
      void open(true);
    }, 650);
  }

  async function makeMain() {
    if (!account || !result) return;
    try {
      await setCharacter(account.userId, result.character_id);
      setPicked(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "대표 캐릭터를 바꾸지 못했습니다");
    }
  }

  const hint = error || (phase === "open" ? "뚜껑이 열렸습니다" : shown < 1 && !result ? NO_TICKET : "밥솥을 눌러 뚜껑을 여세요");
  const isMain = picked || (!!result && account?.characterId === result.character_id);

  const lidStyle = {
    transform: [
      { translateX: lid.interpolate({ inputRange: [0, 1], outputRange: [0, -4] }) },
      { translateY: lid.interpolate({ inputRange: [0, 1], outputRange: [0, -6] }) },
      { translateX: HINGE.x },
      { translateY: HINGE.y },
      { rotate: lid.interpolate({ inputRange: [0, 1], outputRange: ["0deg", `${LID_OPEN_DEG}deg`] }) },
      { translateX: -HINGE.x },
      { translateY: -HINGE.y },
    ],
  };
  const charStyle = {
    transform: [
      { translateY: rise.interpolate({ inputRange: [0, 1], outputRange: [CH.fromY, CH.toY] }) },
      { scale: rise.interpolate({ inputRange: [0, 1], outputRange: [CH.fromScale, CH.toScale] }) },
    ],
  };

  return (
    <View style={{ flex: 1, backgroundColor: C.paper }}>
      <ScrollView contentContainerStyle={{ paddingTop: insets.top + 6, paddingBottom: insets.bottom + 28, paddingHorizontal: 20, flexGrow: 1 }}>
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginLeft: -6 }}>
          <BackButton />
          <Text style={{ borderRadius: 12, borderWidth: 1, borderColor: "#e0c3b1", backgroundColor: "#f9f0e9", paddingHorizontal: 10, paddingVertical: 4, fontFamily: F.sansMd, fontSize: 11.5, color: C.brick, overflow: "hidden" }}>
            뽑기권 {shown}장
          </Text>
        </View>

        <View style={{ marginTop: 6, paddingHorizontal: 2 }}>
          <Eyebrow wide>RICE COOKER</Eyebrow>
          <Text style={{ marginTop: 8, fontFamily: F.serif, fontSize: 26, color: C.ink }}>오늘의 밥솥</Text>
          <Text style={{ marginTop: 6, fontFamily: F.sans, fontSize: 12, color: error ? C.brick : C.faint }}>{hint}</Text>
        </View>

        <Pressable
          onPress={() => open()}
          disabled={phase !== "closed"}
          accessibilityRole="button"
          accessibilityLabel="밥솥 열기"
          style={{ alignSelf: "center", width: W, height: H + TOP, marginTop: 4 }}
        >
          <View style={{ position: "absolute", top: TOP, left: 0 }}>
            <CookerInside />
          </View>
          {result && (
            <Animated.View style={[{ position: "absolute", top: TOP + CH.top, left: CH.left, width: CH.w, height: CH.h }, charStyle]}>
              <Character id={result.character_id} size={CH.w} />
            </Animated.View>
          )}
          <View style={{ position: "absolute", top: TOP, left: 0, width: W, height: H }}>
            <CookerBody lit={lid.interpolate({ inputRange: [0, 1], outputRange: [0, 1], extrapolate: "clamp" })} />
          </View>
          <Animated.View style={[{ position: "absolute", top: TOP, left: 0 }, lidStyle]}>
            <CookerLid />
          </Animated.View>
          <Animated.View pointerEvents="none" style={{ position: "absolute", top: TOP - 30, left: 0, opacity: steam }}>
            <Steam />
          </Animated.View>
        </Pressable>

        {result && def && tone && (
          <Animated.View style={{ marginTop: 14, alignItems: "center", opacity: reveal }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
              <Text style={{ borderRadius: 10, borderWidth: 1, borderColor: `${tone.ink}55`, backgroundColor: tone.bg, paddingHorizontal: 8, paddingVertical: 2, fontFamily: F.mono, fontSize: 10, color: tone.ink, overflow: "hidden" }}>{tone.name}</Text>
              <Text style={{ borderRadius: 10, backgroundColor: "#8f3f1f", paddingHorizontal: 8, paddingVertical: 2, fontFamily: F.mono, fontSize: 10, color: C.card, overflow: "hidden" }}>
                {result.is_new ? "NEW" : `×${result.count}`}
              </Text>
            </View>
            <Text style={{ marginTop: 8, fontFamily: F.serif, fontSize: 24, color: C.ink }}>{def.name}</Text>
            <Text style={{ marginTop: 6, textAlign: "center", fontFamily: F.sans, fontSize: 12, color: C.faint }}>
              {result.is_new
                ? "도감에 새로 들어갔습니다"
                : result.converted
                  ? "같은 캐릭터 3개 — 1개만 남기고 뽑기권 1장으로 바뀌었어요"
                  : `이미 있는 캐릭터 · ${3 - result.count}개 더 모으면 뽑기권`}
            </Text>
            <View style={{ marginTop: 16, alignSelf: "stretch", gap: 8 }}>
              <Button label={isMain ? "대표 캐릭터예요 ✓" : "대표 캐릭터로 쓰기"} onPress={makeMain} disabled={isMain || phase !== "open"} />
              <Button kind="line" label={shown < 1 ? "뽑기권이 없습니다" : `한 번 더 · 뽑기권 ${shown}장`} onPress={again} disabled={shown < 1 || phase !== "open"} />
            </View>
          </Animated.View>
        )}

        <View style={{ flex: 1 }} />
        {phase === "closed" && !result && (
          <Text style={{ marginTop: 18, textAlign: "center", fontFamily: F.mono, fontSize: 10, color: "#a29a8c" }}>
            {(["common", "rare", "legend"] as const).map((r) => `${RARITY[r].name} ${RARITY[r].percent}`).join(" · ")}
          </Text>
        )}
      </ScrollView>
    </View>
  );
}
