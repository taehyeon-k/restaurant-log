import { useQueryClient } from "@tanstack/react-query";
import * as Haptics from "expo-haptics";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { Alert, KeyboardAvoidingView, PanResponder, Platform, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { usePersonalRows } from "@/data/queries";
import {
  createPost, hasContact, updatePost, useBoardPost, useCurrentTheme, useIsAdmin, usePopularTags, usePostsToday, type PostType,
} from "@/features/community/api";
import { BOARD_LABEL, guOf, RecordMini } from "@/features/community/BoardPost";
import { RecordPickerSheet } from "@/features/community/RecordPicker";
import { K, Segmented } from "@/features/community/ui";
import { coverPhoto, type Restaurant } from "@/lib/types";
import { C, F } from "@/theme";

const MIN_VERIFIED = 5;
const DAILY = 3;
const TITLE_MAX = 60;
const BODY_MAX = 2000;
const TAG_MAX = 5;
const MEMO_MAX = 60;
const COURSE_MAX = 5;
const POLL_DAYS = [1, 3, 7];
const TYPES: PostType[] = ["free", "theme", "food", "cafe", "course"];

/** 태그 다듬기 — 서버 norm_tags 와 같게(# · 공백 빼고 소문자, 20자). */
const normTag = (t: string) => t.replace(/[#\s]/g, "").toLowerCase().slice(0, 20);

type Stop = { r: Restaurant; memo: string };

/**
 * 글쓰기(HANDOFF-board-v2 06) — 게시판을 고르고 제목 · 본문을 자유롭게. 맛집 · 카페는 내 기록 하나(필수),
 * 코스는 2~5곳(끌어서 순서 바꾸기 · 가게마다 메모), 자유 · 주제는 기록을 붙여도 되고 안 붙여도 됩니다. 투표는 자유만.
 * ?edit=<id> 면 내 글 고치기 — 제목 · 본문 · 태그만 바꿉니다.
 */
export default function BoardCompose() {
  const router = useRouter();
  const qc = useQueryClient();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ type?: string; edit?: string }>();
  const editId = params.edit ? Number(params.edit) : null;
  const { data: editing } = useBoardPost(editId ?? -1, editId != null);
  const { data: rows = [] } = usePersonalRows();
  const { data: theme } = useCurrentTheme();
  const { data: today = 0 } = usePostsToday();
  const { data: isAdmin } = useIsAdmin();
  const { data: popular = [] } = usePopularTags(20);

  const startType = TYPES.includes(params.type as PostType) ? (params.type as PostType) : "free";
  const [type, setType] = useState<PostType>(startType);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState("");
  const [record, setRecord] = useState<Restaurant | null>(null);
  const [course, setCourse] = useState<Stop[]>([]);
  const [pollOn, setPollOn] = useState(false);
  const [pollOptions, setPollOptions] = useState<string[]>(["", ""]);
  const [pollDays, setPollDays] = useState(3);
  const [pinned, setPinned] = useState(false);
  const [picking, setPicking] = useState<null | "single" | "course">(null);
  const [scrollOn, setScrollOn] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const tagRef = useRef<TextInput>(null);

  // 고치기 — 불러오면 한 번 채웁니다.
  const filled = useRef(false);
  useEffect(() => {
    if (!editing || filled.current) return;
    filled.current = true;
    setType(editing.type);
    setTitle(editing.title ?? editing.place_name ?? "");
    setBody(editing.body ?? "");
    setTags(editing.tags);
  }, [editing]);

  // 맛집 · 카페 — 기록을 먼저 고르기 전이면 고르기 시트를 엽니다.
  useEffect(() => {
    if (editId) return;
    if ((type === "food" || type === "cafe") && !record) setPicking("single");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [type]);

  const verifiedN = useMemo(() => rows.filter((r) => r.verified && !r.pending && r.source_record_id == null && r.copied_at == null).length, [rows]);
  const blocked = editId || isAdmin
    ? null
    : verifiedN < MIN_VERIFIED ? `인증 기록 ${MIN_VERIFIED}건부터 글을 쓸 수 있습니다 · 지금 ${verifiedN}건`
    : today >= DAILY ? "오늘은 3개를 다 올렸습니다" : null;

  const kindFor = type === "food" ? "restaurant" : type === "cafe" ? "cafe" : null;
  const pollFilled = pollOptions.map((o) => o.trim()).filter(Boolean);
  const ready =
    !!title.trim() &&
    (editId != null ||
      ((type !== "food" && type !== "cafe") || !!record) &&
      (type !== "course" || (course.length >= 2 && course.length <= COURSE_MAX)) &&
      (type !== "theme" || !!theme) &&
      (!(type === "free" && pollOn) || pollFilled.length >= 2));
  const contact = hasContact(title) || hasContact(body);

  function pickType(t: PostType) {
    setType(t);
    setError("");
    if (t !== "free") setPollOn(false);
    // 맛집 ↔ 카페를 바꾸면 종류가 다른 기록은 뗍니다.
    if (record && ((t === "food" && record.kind !== "restaurant") || (t === "cafe" && record.kind !== "cafe"))) setRecord(null);
  }

  function addTag(raw: string) {
    const t = normTag(raw);
    setTagInput("");
    if (!t || tags.includes(t) || tags.length >= TAG_MAX) return;
    Haptics.selectionAsync();
    setTags((cur) => [...cur, t]);
  }
  const suggestions = tagInput.trim()
    ? popular.filter((t) => t.startsWith(normTag(tagInput)) && !tags.includes(t)).slice(0, 5)
    : [];

  async function submit() {
    if (!ready || blocked || busy) return;
    setBusy(true);
    setError("");
    try {
      const allTags = tagInput.trim() && tags.length < TAG_MAX ? [...tags, normTag(tagInput)].filter(Boolean) : tags;
      if (editId != null) {
        await updatePost(qc, editId, { title, body, tags: allTags });
      } else {
        await createPost(qc, {
          type,
          title,
          body,
          tags: allTags,
          recordId: type === "course" ? null : record?.id ?? null,
          course: type === "course" ? course.map((s) => ({ record_id: s.r.id, memo: s.memo })) : undefined,
          themeId: type === "theme" ? theme?.id ?? null : null,
          poll: type === "free" && pollOn ? { options: pollFilled, days: pollDays } : null,
          area: type === "course" ? guOf(course[0]?.r.address) : guOf(record?.address),
          pinned: isAdmin ? pinned : false,
        });
      }
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      router.back();
    } catch (e) {
      setError(e instanceof Error ? e.message : "올리지 못했습니다");
    }
    setBusy(false);
  }

  const tool = (label: string, onPress: () => void, disabled = false, on = false) => (
    <Pressable key={label} onPress={onPress} disabled={disabled} style={{ flex: 1, minHeight: 40, alignItems: "center", justifyContent: "center", opacity: disabled ? 0.4 : 1 }}>
      <Text style={{ fontFamily: on ? F.sansMd : F.sans, fontSize: 12, color: on ? C.brick : C.muted }}>{label}</Text>
    </Pressable>
  );

  return (
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1, backgroundColor: C.paper }}>
      <View style={{ paddingTop: Platform.OS === "ios" ? 10 : insets.top + 8, paddingHorizontal: 20 }}>
        {Platform.OS === "ios" && <View style={{ alignSelf: "center", width: 36, height: 4, borderRadius: 2, backgroundColor: C.line }} />}
        <View style={{ marginTop: 10, flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
          <Pressable onPress={() => router.back()} hitSlop={10}>
            <Text style={{ fontFamily: F.sans, fontSize: 13, color: C.muted }}>취소</Text>
          </Pressable>
          <Text style={{ fontFamily: F.sansMd, fontSize: 13, color: C.ink }}>{editId ? "글 고치기" : "글쓰기"}</Text>
          <Pressable onPress={submit} disabled={!ready || !!blocked || busy} hitSlop={10}>
            <Text style={{ fontFamily: F.sansMd, fontSize: 13, color: C.brick, opacity: !ready || blocked || busy ? 0.35 : 1 }}>{busy ? "올리는 중…" : editId ? "저장" : "올리기"}</Text>
          </Pressable>
        </View>
      </View>

      <ScrollView scrollEnabled={scrollOn} contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 16, paddingBottom: 40, gap: 14 }} keyboardShouldPersistTaps="handled">
        {editId == null ? (
          <Segmented<PostType> value={type} onChange={pickType} options={TYPES.map((t) => ({ id: t, label: BOARD_LABEL[t] }))} />
        ) : (
          <Text style={{ fontFamily: F.mono, fontSize: 10.5, letterSpacing: 1.4, color: C.faint }}>{BOARD_LABEL[type]} · 제목 · 본문 · 태그만 고칠 수 있습니다</Text>
        )}

        {!!blocked && (
          <Text style={{ borderRadius: 12, backgroundColor: K.segMap, paddingHorizontal: 12, paddingVertical: 9, fontFamily: F.sans, fontSize: 12, color: C.muted, overflow: "hidden" }}>{blocked}</Text>
        )}

        {editId == null && type === "theme" && (
          <View style={{ borderRadius: 16, backgroundColor: C.ink, paddingVertical: 12, paddingHorizontal: 14, gap: 3 }}>
            <Text style={{ fontFamily: F.mono, fontSize: 10, letterSpacing: 1.4, color: K.brickLine }}>이번 주 주제</Text>
            <Text style={{ fontFamily: F.serif, fontSize: 16, color: C.card }}>{theme?.title ?? "이번 주 주제가 없습니다"}</Text>
          </View>
        )}

        {/* 맛집 · 카페(필수) · 자유 · 주제(선택) — 붙인 기록 한 장 */}
        {editId == null && type !== "course" && record && (
          <View style={{ borderRadius: 16, borderWidth: 1, borderColor: C.lineSoft, backgroundColor: C.card, padding: 12 }}>
            <RecordMini
              name={record.name} photo={coverPhoto(record)} rating={record.rating} category={record.category} address={record.address}
              verifiedAt={record.verified ? record.verified_at : null}
              right={
                <View style={{ gap: 6, alignItems: "flex-end" }}>
                  <Pressable onPress={() => setPicking("single")} hitSlop={6}><Text style={{ fontFamily: F.sans, fontSize: 12, color: C.brick }}>바꾸기</Text></Pressable>
                  {(type === "free" || type === "theme") && <Pressable onPress={() => setRecord(null)} hitSlop={6}><Text style={{ fontFamily: F.sans, fontSize: 11, color: K.inactive }}>떼기</Text></Pressable>}
                </View>
              }
            />
          </View>
        )}
        {editId == null && (type === "food" || type === "cafe") && !record && (
          <Pressable onPress={() => setPicking("single")} style={{ minHeight: 64, borderRadius: 16, borderWidth: 1, borderStyle: "dashed", borderColor: K.dashed, alignItems: "center", justifyContent: "center" }}>
            <Text style={{ fontFamily: F.sans, fontSize: 12.5, color: C.muted }}>+ 내 기록에서 고르기</Text>
          </Pressable>
        )}

        {editId == null && type === "course" && (
          <CourseEditor stops={course} onChange={setCourse} onAdd={() => setPicking("course")} onDragging={(d) => setScrollOn(!d)} />
        )}

        <TextInput
          value={title}
          onChangeText={(t) => setTitle(t.slice(0, TITLE_MAX))}
          maxLength={TITLE_MAX}
          placeholder="제목"
          placeholderTextColor="#a8a196"
          style={{ paddingVertical: 6, fontFamily: F.serif, fontSize: 18, color: C.ink, borderBottomWidth: 1, borderBottomColor: C.lineSoft }}
        />
        <TextInput
          value={body}
          onChangeText={(t) => setBody(t.slice(0, BODY_MAX))}
          maxLength={BODY_MAX}
          multiline
          placeholder="본문"
          placeholderTextColor="#a8a196"
          textAlignVertical="top"
          style={{ minHeight: 140, fontFamily: F.serif, fontSize: 13.5, lineHeight: 23, color: C.ink }}
        />
        {body.length > BODY_MAX - 200 && <Text style={{ textAlign: "right", fontFamily: F.mono, fontSize: 10, color: K.inactive }}>{body.length} / {BODY_MAX}</Text>}
        {contact && <Text style={{ fontFamily: F.sans, fontSize: 11.5, color: C.brick }}>링크 · 연락처는 올릴 때 지워집니다</Text>}

        {/* 태그 — 칩 + 「#태그 추가」 + n / 5, 입력하면 많이 쓰인 태그 자동완성 */}
        <View style={{ gap: 8 }}>
          <View style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 6 }}>
            {tags.map((t) => (
              <Pressable key={t} onPress={() => setTags((cur) => cur.filter((x) => x !== t))} style={{ height: 28, borderRadius: 14, backgroundColor: C.brickSoft, paddingHorizontal: 10, justifyContent: "center" }}>
                <Text style={{ fontFamily: F.sans, fontSize: 12, color: C.brick }}>#{t} ✕</Text>
              </Pressable>
            ))}
            {tags.length < TAG_MAX && (
              <TextInput
                ref={tagRef}
                value={tagInput}
                onChangeText={(t) => (/[\s,]$/.test(t) ? addTag(t) : setTagInput(t.slice(0, 21)))}
                onSubmitEditing={() => addTag(tagInput)}
                blurOnSubmit={false}
                placeholder="#태그 추가"
                placeholderTextColor="#a8a196"
                autoCapitalize="none"
                style={{ minWidth: 90, height: 28, paddingVertical: 0, fontFamily: F.sans, fontSize: 12, color: C.ink }}
              />
            )}
            <View style={{ flex: 1 }} />
            <Text style={{ fontFamily: F.mono, fontSize: 10, color: K.inactive }}>{tags.length} / {TAG_MAX}</Text>
          </View>
          {suggestions.length > 0 && (
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
              {suggestions.map((t) => (
                <Pressable key={t} onPress={() => addTag(t)} style={{ height: 26, borderRadius: 13, borderWidth: 1, borderStyle: "dashed", borderColor: K.dashed, paddingHorizontal: 9, justifyContent: "center" }}>
                  <Text style={{ fontFamily: F.sans, fontSize: 11.5, color: C.muted }}>#{t}</Text>
                </Pressable>
              ))}
            </View>
          )}
        </View>

        {editId == null && type === "free" && pollOn && (
          <PollEditor options={pollOptions} onOptions={setPollOptions} days={pollDays} onDays={setPollDays} onRemove={() => setPollOn(false)} />
        )}

        {editId == null && isAdmin && (
          <Pressable onPress={() => setPinned((v) => !v)} style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <View style={{ width: 20, height: 20, borderRadius: 6, borderWidth: pinned ? 0 : 1.5, borderColor: K.dashed, backgroundColor: pinned ? C.brick : "transparent", alignItems: "center", justifyContent: "center" }}>
              {pinned && <Text style={{ fontSize: 11, color: C.card }}>✓</Text>}
            </View>
            <Text style={{ fontFamily: F.sans, fontSize: 12.5, color: C.ink }}>공지로 고정 · DINARY 운영으로 올라갑니다</Text>
          </Pressable>
        )}

        {!!error && <Text style={{ fontFamily: F.sans, fontSize: 12, color: C.brick }}>{error}</Text>}
      </ScrollView>

      {/* 도구줄 — 내 기록 · 사진 · #태그 · 투표(자유만) */}
      {editId == null && (
        <View style={{ flexDirection: "row", borderTopWidth: 1, borderTopColor: C.lineSoft, backgroundColor: C.paper, paddingHorizontal: 8, paddingBottom: Math.max(insets.bottom, 6) }}>
          {tool("내 기록", () => setPicking(type === "course" ? "course" : "single"), false, !!record || course.length > 0)}
          {/* TODO(사진): 기록 없이 붙이는 사진은 이번 범위 밖입니다. */}
          {tool("사진", () => Alert.alert("곧 열립니다", "지금은 내 기록을 붙이면 대표 사진이 함께 올라갑니다."))}
          {tool("#태그", () => tagRef.current?.focus(), tags.length >= TAG_MAX)}
          {tool(type === "free" ? "투표" : "투표 · 자유만", () => setPollOn((v) => !v), type !== "free", pollOn)}
        </View>
      )}

      <RecordPickerSheet
        visible={picking === "single"}
        onClose={() => setPicking(null)}
        onPick={([r]) => r && setRecord(r)}
        kind={kindFor}
        title={type === "cafe" ? "어느 카페를 올릴까요?" : type === "food" ? "어느 가게를 올릴까요?" : "붙일 기록 고르기"}
      />
      <RecordPickerSheet
        visible={picking === "course"}
        onClose={() => setPicking(null)}
        max={COURSE_MAX}
        selected={course.map((s) => s.r.id)}
        onPick={(rs) => setCourse(rs.map((r) => course.find((s) => s.r.id === r.id) ?? { r, memo: "" }))}
        title="코스 고르기 · 2~5곳"
      />
    </KeyboardAvoidingView>
  );
}

const ROW_H = 64;

/** 코스 편집 — 번호 원 · 가게 · 메모 60자. 왼쪽 ≡ 를 끌어서 순서를 바꿉니다. */
function CourseEditor({ stops, onChange, onAdd, onDragging }: { stops: Stop[]; onChange: (s: Stop[]) => void; onAdd: () => void; onDragging: (d: boolean) => void }) {
  const [drag, setDrag] = useState<{ from: number; dy: number } | null>(null);
  const to = drag ? Math.max(0, Math.min(stops.length - 1, drag.from + Math.round(drag.dy / ROW_H))) : -1;

  function drop(from: number, dy: number) {
    const target = Math.max(0, Math.min(stops.length - 1, from + Math.round(dy / ROW_H)));
    setDrag(null);
    onDragging(false);
    if (target === from) return;
    Haptics.selectionAsync();
    const next = [...stops];
    const [moved] = next.splice(from, 1);
    next.splice(target, 0, moved);
    onChange(next);
  }

  const shift = (i: number) => {
    if (!drag || i === drag.from) return 0;
    if (drag.from < to && i > drag.from && i <= to) return -ROW_H;
    if (drag.from > to && i < drag.from && i >= to) return ROW_H;
    return 0;
  };

  return (
    <View style={{ gap: 8 }}>
      <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
        <Text style={{ fontFamily: F.mono, fontSize: 10, letterSpacing: 1.4, color: C.faint }}>코스 · {stops.length}곳{stops.length < 2 ? " · 2곳부터" : ""}</Text>
        {stops.length > 1 && <Text style={{ fontFamily: F.sans, fontSize: 10.5, color: K.inactive }}>≡ 를 끌어 순서 바꾸기</Text>}
      </View>
      <View style={{ borderRadius: 16, borderWidth: stops.length ? 1 : 0, borderColor: C.lineSoft, backgroundColor: C.card }}>
        {stops.map((s, i) => (
          <CourseRow
            key={s.r.id}
            stop={s}
            index={i}
            last={i === stops.length - 1}
            dragging={drag?.from === i}
            offset={drag?.from === i ? drag.dy : shift(i)}
            onMemo={(memo) => onChange(stops.map((x, j) => (j === i ? { ...x, memo } : x)))}
            onRemove={() => onChange(stops.filter((_, j) => j !== i))}
            onMove={(dy) => { if (!drag) onDragging(true); setDrag({ from: i, dy }); }}
            onDrop={(dy) => drop(i, dy)}
          />
        ))}
      </View>
      {stops.length < COURSE_MAX && (
        <Pressable onPress={onAdd} style={{ minHeight: 48, borderRadius: 14, borderWidth: 1, borderStyle: "dashed", borderColor: K.dashed, alignItems: "center", justifyContent: "center" }}>
          <Text style={{ fontFamily: F.sans, fontSize: 12.5, color: C.muted }}>{stops.length ? "+ 기록 더하기 · 빼기" : "+ 내 기록에서 코스 고르기"}</Text>
        </Pressable>
      )}
    </View>
  );
}

function CourseRow({
  stop, index, last, dragging, offset, onMemo, onRemove, onMove, onDrop,
}: {
  stop: Stop; index: number; last: boolean; dragging: boolean; offset: number;
  onMemo: (m: string) => void; onRemove: () => void; onMove: (dy: number) => void; onDrop: (dy: number) => void;
}) {
  // 핸들러가 늘 지금 줄의 콜백을 부르도록 ref 로.
  const cb = useRef({ onMove, onDrop });
  cb.current = { onMove, onDrop };
  const pan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: () => Haptics.selectionAsync(),
      onPanResponderMove: (_, g) => cb.current.onMove(g.dy),
      onPanResponderRelease: (_, g) => cb.current.onDrop(g.dy),
      onPanResponderTerminate: (_, g) => cb.current.onDrop(g.dy),
    }),
  ).current;

  return (
    <View
      style={{
        height: ROW_H, flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 10,
        borderBottomWidth: last ? 0 : 1, borderBottomColor: C.lineSoft, backgroundColor: C.card,
        transform: [{ translateY: offset }], zIndex: dragging ? 2 : 0,
        ...(dragging ? { shadowColor: C.ink, shadowOpacity: 0.15, shadowRadius: 10, shadowOffset: { width: 0, height: 4 }, elevation: 6, borderRadius: 12 } : null),
      }}
    >
      <View {...pan.panHandlers} hitSlop={8} accessibilityLabel={`${stop.r.name} 순서 바꾸기`} style={{ paddingVertical: 10, paddingRight: 2 }}>
        <Text style={{ fontFamily: F.sans, fontSize: 16, color: K.inactive }}>≡</Text>
      </View>
      <View style={{ width: 22, height: 22, borderRadius: 11, backgroundColor: C.brick, alignItems: "center", justifyContent: "center" }}>
        <Text style={{ fontFamily: F.mono, fontSize: 11, color: C.card }}>{index + 1}</Text>
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text numberOfLines={1} style={{ fontFamily: F.serif, fontSize: 13.5, color: C.ink }}>
          {stop.r.name}{stop.r.verified ? <Text style={{ fontFamily: F.mono, fontSize: 10, color: C.brick }}>  ✓ 인증</Text> : null}
        </Text>
        <TextInput
          value={stop.memo}
          onChangeText={(t) => onMemo(t.slice(0, MEMO_MAX))}
          maxLength={MEMO_MAX}
          placeholder="한 줄 메모(60자)"
          placeholderTextColor="#b3ac9f"
          style={{ paddingVertical: 2, fontFamily: F.sans, fontSize: 12, color: K.text2 }}
        />
      </View>
      <Pressable onPress={onRemove} hitSlop={8} accessibilityLabel={`${stop.r.name} 빼기`}>
        <Text style={{ fontFamily: F.sans, fontSize: 13, color: K.inactive }}>✕</Text>
      </Pressable>
    </View>
  );
}

/** 투표 — 선택지 2~5개(40자) · 기간 1 · 3 · 7일. */
function PollEditor({ options, onOptions, days, onDays, onRemove }: { options: string[]; onOptions: (o: string[]) => void; days: number; onDays: (d: number) => void; onRemove: () => void }) {
  return (
    <View style={{ borderRadius: 16, borderWidth: 1, borderColor: K.brickLine, backgroundColor: C.card, padding: 12, gap: 8 }}>
      <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
        <Text style={{ fontFamily: F.mono, fontSize: 10, letterSpacing: 1.4, color: C.brick }}>투표 · 선택지 2~5개</Text>
        <Pressable onPress={onRemove} hitSlop={8}><Text style={{ fontFamily: F.sans, fontSize: 11.5, color: K.inactive }}>투표 제거</Text></Pressable>
      </View>
      {options.map((o, i) => (
        <View key={i} style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          <TextInput
            value={o}
            onChangeText={(t) => onOptions(options.map((x, j) => (j === i ? t.slice(0, 40) : x)))}
            maxLength={40}
            placeholder={`선택지 ${i + 1}`}
            placeholderTextColor="#b3ac9f"
            style={{ flex: 1, minHeight: 40, borderRadius: 12, borderWidth: 1, borderColor: C.line, paddingHorizontal: 12, fontFamily: F.sans, fontSize: 12.5, color: C.ink }}
          />
          {options.length > 2 && (
            <Pressable onPress={() => onOptions(options.filter((_, j) => j !== i))} hitSlop={8}>
              <Text style={{ fontFamily: F.sans, fontSize: 13, color: K.inactive }}>✕</Text>
            </Pressable>
          )}
        </View>
      ))}
      {options.length < 5 && (
        <Pressable onPress={() => onOptions([...options, ""])} hitSlop={6} style={{ alignSelf: "flex-start" }}>
          <Text style={{ fontFamily: F.sans, fontSize: 12, color: C.brick }}>+ 선택지 추가</Text>
        </Pressable>
      )}
      <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
        <Text style={{ fontFamily: F.sans, fontSize: 12, color: C.muted, marginRight: 4 }}>투표 기간</Text>
        {POLL_DAYS.map((d) => {
          const on = d === days;
          return (
            <Pressable key={d} onPress={() => onDays(d)} style={{ height: 28, borderRadius: 14, paddingHorizontal: 12, justifyContent: "center", backgroundColor: on ? C.ink : "transparent", borderWidth: on ? 0 : 1, borderColor: C.line }}>
              <Text style={{ fontFamily: F.sans, fontSize: 12, color: on ? C.card : K.text2 }}>{d}일</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}
