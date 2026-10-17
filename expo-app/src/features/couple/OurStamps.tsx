import { useRouter } from "expo-router";
import { useState } from "react";
import { Alert, Pressable, Text, View } from "react-native";
import Svg, { ClipPath, Defs, Path, Rect } from "react-native-svg";
import { EmptySlot } from "@/features/stamps/Stamp";
import { ME_COLOR, PARTNER_COLOR, type BookMember, type RecordNote } from "@/data/books";
import { currentBoard, nextBowl, stampRows, stampTilt, STAMPS_PER_BOARD } from "@/lib/labels";
import { iGa } from "@/lib/josa";
import { dottedDate, type Restaurant } from "@/lib/types";
import { C, F } from "@/theme";
import { sendPoke } from "./pokes";

const HEART = "M50 90C22 71 5 54 5 33A22 22 0 0 1 50 21A22 22 0 0 1 95 33C95 54 78 71 50 90Z";

/** 한 사람이 그 기록에 한 줄을 남겼는지 — 연인 한 줄(record_notes)이나, 찍은 사람의 별점 · 메모. */
export function wroteLine(r: Restaurant, userId: string | null | undefined, notes: RecordNote[]) {
  if (!userId) return false;
  return notes.some((n) => n.record_id === r.id && n.user_id === userId && (n.rating != null || !!n.note?.trim())) ||
    (r.user_id === userId && (r.rating != null || !!r.review?.trim()));
}

/** 하트 도장 — 왼쪽 반은 나, 오른쪽 반은 상대. 쓰지 않은 쪽은 쓴 쪽 색의 점선 테두리. */
export function HeartStamp({ me, partner, size = 44, tilt = 0, n }: { me: boolean; partner: boolean; size?: number; tilt?: number; n?: number }) {
  const id = `h${size}${me ? 1 : 0}${partner ? 1 : 0}`;
  const dashColor = me && !partner ? ME_COLOR : partner && !me ? PARTNER_COLOR : "#d6c4b8";
  return (
    <View style={{ width: size, height: size, alignItems: "center", justifyContent: "center", transform: [{ rotate: `${tilt}deg` }] }}>
      <Svg width={size} height={size} viewBox="0 0 100 100" style={{ position: "absolute" }}>
        <Defs>
          <ClipPath id={`${id}l`}><Rect x="0" y="0" width="50" height="100" /></ClipPath>
          <ClipPath id={`${id}r`}><Rect x="50" y="0" width="50" height="100" /></ClipPath>
        </Defs>
        {me
          ? <Path d={HEART} fill={ME_COLOR} clipPath={`url(#${id}l)`} />
          : <Path d={HEART} fill="none" stroke={dashColor} strokeWidth={4} strokeDasharray="7 6" clipPath={`url(#${id}l)`} />}
        {partner
          ? <Path d={HEART} fill={PARTNER_COLOR} clipPath={`url(#${id}r)`} />
          : <Path d={HEART} fill="none" stroke={dashColor} strokeWidth={4} strokeDasharray="7 6" clipPath={`url(#${id}r)`} />}
      </Svg>
      {n != null && <Text style={{ marginTop: -size * 0.06, fontFamily: F.mono, fontSize: Math.max(9, size * 0.26), color: me && partner ? "#fff" : C.muted }}>{n}</Text>}
    </View>
  );
}

type Stamp = { row: Restaurant; no: number; me: boolean; partner: boolean };

/**
 * 연인계정 「우리 도장」(지시서 3 §F) — 연인 기록장의 인증 기록 1건 = 하트 도장 1개.
 * 둘 다 한 줄을 쓰면 하트가 다 차고, 한 사람만 쓰면 반쪽. 칸을 누르면 아래 띠에 가게 · 날짜 · 상태.
 * 아래 「함께 ○○ 그릇까지」는 둘 다 쓴 기록만 셉니다.
 */
export function OurStamps({ rows, notes, me, partner, bookId, readOnly }: {
  rows: Restaurant[]; notes: RecordNote[]; me: BookMember | null; partner: BookMember | null; bookId: string; readOnly: boolean;
}) {
  const router = useRouter();
  const [picked, setPicked] = useState<number | null>(null);
  const [sent, setSent] = useState<Set<number>>(new Set());

  const stamps: Stamp[] = stampRows(rows).map((row, i) => ({
    row, no: i + 1, me: wroteLine(row, me?.userId, notes), partner: wroteLine(row, partner?.userId, notes),
  }));
  const board = currentBoard(stamps.length);
  const first = (board.board - 1) * STAMPS_PER_BOARD;
  const onBoard = stamps.slice(first, first + STAMPS_PER_BOARD);
  const both = stamps.filter((s) => s.me && s.partner).length;
  const bowl = nextBowl(both);
  const sel = picked != null ? stamps.find((s) => s.no === picked) ?? null : null;
  const partnerName = partner?.nickname ?? "상대";

  async function poke(s: Stamp) {
    if (!partner) return;
    try {
      await sendPoke(bookId, s.row.id, partner.userId);
      setSent((v) => new Set(v).add(s.row.id));
    } catch (e) {
      Alert.alert("콕 찌르지 못했어요", e instanceof Error ? e.message : undefined);
    }
  }

  const SIZE = 44;
  const GAP = 11;
  return (
    <>
      <View style={{ marginTop: 14, borderRadius: 20, borderWidth: 1, borderColor: C.lineSoft, backgroundColor: C.card, paddingVertical: 16, paddingHorizontal: 16 }}>
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "baseline" }}>
          <Text style={{ fontFamily: F.serif, fontSize: 15, color: C.ink }}>우리 도장</Text>
          <Text style={{ fontFamily: F.mono, fontSize: 11, color: C.faint }}>{board.board}장째 · {board.filled} / {STAMPS_PER_BOARD}</Text>
        </View>
        <View style={{ marginTop: 14, alignSelf: "center", width: SIZE * 5 + GAP * 4, flexDirection: "row", flexWrap: "wrap", gap: GAP }}>
          {Array.from({ length: STAMPS_PER_BOARD }, (_, k) => onBoard[k]).map((s, k) =>
            s ? (
              <Pressable key={k} onPress={() => setPicked((v) => (v === s.no ? null : s.no))} accessibilityLabel={`${s.no}번째 도장 · ${s.row.name}`}
                style={{ borderRadius: 12, backgroundColor: picked === s.no ? C.brickSoft : "transparent" }}>
                <HeartStamp me={s.me} partner={s.partner} n={s.no} size={SIZE} tilt={stampTilt(k)} />
              </Pressable>
            ) : (
              <EmptySlot key={k} size={SIZE} />
            )
          )}
        </View>
        <View style={{ marginTop: 14, flexDirection: "row", justifyContent: "center", gap: 16 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
            <HeartStamp me partner size={16} />
            <Text style={{ fontFamily: F.sans, fontSize: 11, color: C.muted }}>둘 다 씀</Text>
          </View>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
            <HeartStamp me partner={false} size={16} />
            <Text style={{ fontFamily: F.sans, fontSize: 11, color: C.muted }}>한 줄 기다리는 중</Text>
          </View>
        </View>

        {sel && (
          <View style={{ marginTop: 14, flexDirection: "row", alignItems: "center", gap: 10, borderRadius: 14, backgroundColor: "#f3efe6", paddingVertical: 10, paddingHorizontal: 12 }}>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text numberOfLines={1} style={{ fontFamily: F.sansMd, fontSize: 13, color: C.ink }}>{sel.row.name}</Text>
              <Text style={{ marginTop: 2, fontFamily: F.mono, fontSize: 10.5, color: C.faint }}>
                {dottedDate(sel.row.visited_at)} · {sel.me && sel.partner ? "둘 다 씀" : sel.me ? `${partnerName}의 한 줄 기다리는 중` : sel.partner ? "내 한 줄 기다리는 중" : "아직 둘 다 안 씀"}
              </Text>
            </View>
            {!readOnly && sel.me && !sel.partner && partner && (
              <Pressable onPress={() => poke(sel)} disabled={sent.has(sel.row.id)} style={{ minHeight: 34, borderRadius: 12, backgroundColor: C.ink, paddingHorizontal: 12, justifyContent: "center", opacity: sent.has(sel.row.id) ? 0.45 : 1 }}>
                <Text style={{ fontFamily: F.sansMd, fontSize: 12, color: C.card }}>{sent.has(sel.row.id) ? "찔렀어요" : "콕 찌르기"}</Text>
              </Pressable>
            )}
            {!readOnly && !sel.me && (
              <Pressable onPress={() => router.push({ pathname: "/record/[id]", params: { id: String(sel.row.id) } })} style={{ minHeight: 34, borderRadius: 12, backgroundColor: C.ink, paddingHorizontal: 12, justifyContent: "center" }}>
                <Text style={{ fontFamily: F.sansMd, fontSize: 12, color: C.card }}>한 줄 쓰기</Text>
              </Pressable>
            )}
          </View>
        )}
        {sent.size > 0 && sel && sent.has(sel.row.id) && (
          <Text style={{ marginTop: 6, fontFamily: F.sans, fontSize: 10.5, color: C.faint }}>{iGa(partnerName)} 앱을 열면 알려 줘요</Text>
        )}
      </View>

      {bowl && (
        <View style={{ marginTop: 10, borderRadius: 20, borderWidth: 1, borderColor: C.lineSoft, backgroundColor: C.card, paddingVertical: 14, paddingHorizontal: 16 }}>
          <Text style={{ fontFamily: F.serif, fontSize: 15, color: C.ink }}>함께 {bowl.tier.name}까지 <Text style={{ color: C.brick }}>{bowl.left}</Text></Text>
          <View style={{ marginTop: 12, flexDirection: "row", alignItems: "center", gap: 8 }}>
            <Text style={{ fontFamily: F.mono, fontSize: 10.5, color: C.faint }}>{bowl.from}</Text>
            <View style={{ flex: 1, height: 5, borderRadius: 3, backgroundColor: "#ece7dc", overflow: "hidden", flexDirection: "row" }}>
              {/* 반반 색 — 둘이 함께 채운 막대 */}
              <View style={{ width: `${((both - bowl.from) / (bowl.tier.need - bowl.from)) * 50}%`, height: 5, backgroundColor: ME_COLOR }} />
              <View style={{ width: `${((both - bowl.from) / (bowl.tier.need - bowl.from)) * 50}%`, height: 5, backgroundColor: PARTNER_COLOR }} />
            </View>
            <Text style={{ fontFamily: F.mono, fontSize: 10.5, color: C.faint }}>{bowl.tier.need}</Text>
          </View>
          <Text style={{ marginTop: 8, fontFamily: F.sans, fontSize: 11, color: C.faint }}>반쪽 도장은 상대가 한 줄을 쓰면 채워져요</Text>
        </View>
      )}
    </>
  );
}
