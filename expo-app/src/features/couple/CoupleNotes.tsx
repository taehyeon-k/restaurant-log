import { useState } from "react";
import { Pressable, Text, TextInput, View } from "react-native";
import { Button, BottomSheetModal, Eyebrow, fieldStyle, MobileStars } from "@/components/ui";
import { ME_COLOR, PARTNER_COLOR, useSaveNote, type BookMember, type RecordNote } from "@/data/books";
import type { Restaurant } from "@/lib/types";
import { C, F } from "@/theme";
import { Avatar } from "./Avatars";

type Line = { rating: number | null; note: string | null };

/** 그 사람의 한 줄 — record_notes 가 먼저, 없으면 찍은 사람은 기록 자체의 별점·메모. */
export function lineOf(record: Restaurant, notes: RecordNote[], userId: string | undefined): Line | null {
  if (!userId) return null;
  const n = notes.find((x) => x.record_id === record.id && x.user_id === userId);
  if (n && (n.rating != null || n.note)) return { rating: n.rating, note: n.note };
  if (record.user_id === userId && (record.rating != null || record.review)) return { rating: record.rating, note: record.review };
  return null;
}

/**
 * 함께 쓴 기록의 사람별 카드 두 장(HANDOFF-couple §3-6, 시안 2c) — 아바타·이름·★별점·한 줄.
 * 내 카드만 고칠 수 있고, 상대가 아직 안 썼으면 빈 카드.
 */
export default function CoupleNotes({
  record, notes, me, partner, readOnly,
}: { record: Restaurant; notes: RecordNote[]; me: BookMember | null; partner: BookMember | null; readOnly: boolean }) {
  const [editing, setEditing] = useState(false);
  const mine = lineOf(record, notes, me?.userId);
  const theirs = lineOf(record, notes, partner?.userId);

  const card = (who: BookMember | null, line: Line | null, color: string, isMe: boolean) => {
    const name = who?.nickname ?? (isMe ? "나" : "상대");
    const canEdit = isMe && !readOnly;
    return (
      <Pressable
        disabled={!canEdit}
        onPress={() => setEditing(true)}
        accessibilityLabel={canEdit ? "내 한 줄 쓰기" : undefined}
        style={{
          borderRadius: 18, padding: 14, gap: 8, backgroundColor: line ? C.card : "transparent",
          borderWidth: 1, borderStyle: line ? "solid" : "dashed", borderColor: line ? C.lineSoft : "#cdc6b8",
        }}
      >
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          <Avatar name={name} color={color} size={26} empty={!line} />
          <Text style={{ fontFamily: F.sansMd, fontSize: 13, color: C.ink }}>{name}</Text>
          {line?.rating != null && (
            <View style={{ flexDirection: "row", alignItems: "center", gap: 5 }}>
              <MobileStars rating={line.rating} size={11.5} />
              <Text style={{ fontFamily: F.mono, fontSize: 10.5, color: C.muted }}>{line.rating.toFixed(1)}</Text>
            </View>
          )}
          {canEdit && <Text style={{ marginLeft: "auto", fontFamily: F.sans, fontSize: 11.5, color: C.brick }}>{line ? "고치기" : "쓰기"}</Text>}
        </View>
        <Text style={{ fontFamily: line?.note ? F.serif : F.sans, fontSize: line?.note ? 14.5 : 12, lineHeight: line?.note ? 25 : 19, color: line?.note ? "#2e2a25" : C.faint }}>
          {line?.note || (line ? "별점만 남겼어요" : isMe ? "아직 한 줄을 쓰지 않았어요" : `${name}의 한 줄을 기다리는 중`)}
        </Text>
      </Pressable>
    );
  };

  return (
    <View>
      <Eyebrow>우리의 한 줄</Eyebrow>
      <View style={{ marginTop: 9, gap: 8 }}>
        {card(me, mine, ME_COLOR, true)}
        {card(partner, theirs, PARTNER_COLOR, false)}
      </View>
      {me && editing && (
        <NoteSheet
          visible
          onClose={() => setEditing(false)}
          record={record}
          userId={me.userId}
          initial={mine}
        />
      )}
    </View>
  );
}

/** 내 한 줄 쓰기 — 별점(반 별 단위) + 한 줄. 찍은 사람이면 기록의 별점·메모도 함께 맞춥니다. */
function NoteSheet({
  visible, onClose, record, userId, initial,
}: { visible: boolean; onClose: () => void; record: Restaurant; userId: string; initial: Line | null }) {
  const save = useSaveNote();
  const [rating, setRating] = useState(initial?.rating ?? 0);
  const [note, setNote] = useState(initial?.note ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit() {
    setBusy(true);
    setError("");
    try {
      await save(userId, record.id, rating || null, note.trim() || null, record.user_id === userId);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "저장하지 못했어요");
    } finally {
      setBusy(false);
    }
  }

  return (
    <BottomSheetModal visible={visible} onClose={onClose}>
      <Text style={{ fontFamily: F.serif, fontSize: 19, color: C.ink }}>내 한 줄</Text>
      <Text style={{ marginTop: 4, fontFamily: F.sans, fontSize: 11.5, color: C.faint }}>{record.name}</Text>

      <View style={{ marginTop: 16, flexDirection: "row", alignItems: "center", gap: 10 }}>
        <View style={{ flexDirection: "row" }}>
          {[1, 2, 3, 4, 5].map((n) => {
            const pct = rating >= n ? 1 : rating >= n - 0.5 ? 0.5 : 0;
            const pick = (v: number) => () => setRating(v === rating ? 0 : v);
            return (
              <View key={n} style={{ width: 34, height: 34 }}>
                <Text style={star}>★</Text>
                <View style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 34 * pct, overflow: "hidden" }}>
                  <Text style={[star, { color: C.brick }]}>★</Text>
                </View>
                <Pressable onPress={pick(n - 0.5)} accessibilityLabel="반 별" style={{ position: "absolute", left: 0, top: 0, width: 17, height: 34 }} />
                <Pressable onPress={pick(n)} accessibilityLabel="한 별" style={{ position: "absolute", right: 0, top: 0, width: 17, height: 34 }} />
              </View>
            );
          })}
        </View>
        <Text style={{ fontFamily: F.mono, fontSize: 12, color: C.muted }}>{rating ? rating.toFixed(1) : "고르지 않음"}</Text>
      </View>

      <TextInput
        value={note}
        onChangeText={setNote}
        placeholder="오늘 이 집은 어땠어요?"
        placeholderTextColor="#a8a196"
        multiline
        maxLength={200}
        style={[fieldStyle, { marginTop: 14, minHeight: 90, paddingTop: 13, textAlignVertical: "top" }]}
      />
      {!!error && <Text style={{ marginTop: 10, fontFamily: F.sans, fontSize: 12, color: "#a8412a" }}>{error}</Text>}
      <Button style={{ marginTop: 16 }} label={busy ? "저장하는 중…" : "저장"} disabled={busy} onPress={submit} />
    </BottomSheetModal>
  );
}

const star = { fontSize: 27, lineHeight: 34, width: 34, textAlign: "center" as const, color: "#dcd6ca" };
