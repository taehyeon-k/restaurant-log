import { useQuery, useQueryClient } from "@tanstack/react-query";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  adminCreateNotice, adminHideComment, adminHidePost, adminResolveReport, adminSanction, adminSaveTheme, createPost,
  useCurrentTheme, useIsAdmin, useReports, type ReportRow,
} from "@/features/community/api";
import { K, Segmented, timeAgo } from "@/features/community/ui";
import { supabase } from "@/lib/supabase";
import { C, F } from "@/theme";

type Section = "notice" | "reports" | "theme";

/** 운영(HANDOFF-board-v2 §4) — 내계정에서 관리자에게만 보입니다. 서버(is_admin)가 모든 동작을 한 번 더 확인합니다. */
export default function AdminScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { data: isAdmin, isLoading } = useIsAdmin();
  const [section, setSection] = useState<Section>("reports");

  return (
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1, backgroundColor: C.paper }}>
      <View style={{ paddingTop: insets.top + 8, paddingHorizontal: 20, flexDirection: "row", alignItems: "center", gap: 10 }}>
        <Pressable onPress={() => router.back()} hitSlop={10} accessibilityLabel="뒤로"><Text style={{ fontFamily: F.sans, fontSize: 20, color: C.muted }}>‹</Text></Pressable>
        <Text style={{ fontFamily: F.serif, fontSize: 20, color: C.ink }}>운영</Text>
      </View>
      {!isAdmin ? (
        <Text style={{ padding: 40, textAlign: "center", fontFamily: F.sans, fontSize: 12.5, color: C.faint }}>{isLoading ? "" : "운영자만 볼 수 있습니다."}</Text>
      ) : (
        <>
          <Segmented<Section>
            value={section}
            onChange={setSection}
            style={{ marginTop: 14, marginHorizontal: 20 }}
            options={[{ id: "notice", label: "공지 쓰기" }, { id: "reports", label: "신고함" }, { id: "theme", label: "이번 주 주제" }]}
          />
          <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: insets.bottom + 40, gap: 12 }} keyboardShouldPersistTaps="handled">
            {section === "notice" && <NoticeForm />}
            {section === "reports" && <ReportsBox />}
            {section === "theme" && <ThemeForm />}
          </ScrollView>
        </>
      )}
    </KeyboardAvoidingView>
  );
}

const input = { minHeight: 44, borderRadius: 12, borderWidth: 1, borderColor: C.line, backgroundColor: C.card, paddingHorizontal: 13, fontFamily: F.sans, fontSize: 13, color: C.ink } as const;
const label = { fontFamily: F.mono, fontSize: 10, letterSpacing: 1.4, color: C.faint } as const;

function Submit({ text, onPress, disabled }: { text: string; onPress: () => void; disabled?: boolean }) {
  return (
    <Pressable onPress={onPress} disabled={disabled} style={{ marginTop: 4, minHeight: 48, borderRadius: 16, backgroundColor: C.ink, alignItems: "center", justifyContent: "center", opacity: disabled ? 0.4 : 1 }}>
      <Text style={{ fontFamily: F.sansMd, fontSize: 13.5, color: C.card }}>{text}</Text>
    </Pressable>
  );
}

/** 공지 쓰기 — 게시판 고정 공지(글) 또는 앱 전체 공지(상단 배너). */
function NoticeForm() {
  const qc = useQueryClient();
  const [kind, setKind] = useState<"board" | "app">("board");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [days, setDays] = useState<number | null>(7);
  const [busy, setBusy] = useState(false);

  async function send() {
    setBusy(true);
    try {
      if (kind === "board") await createPost(qc, { type: "free", title, body, pinned: true });
      else await adminCreateNotice(qc, title, body, days);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert(kind === "board" ? "게시판에 공지를 올렸습니다" : "앱 공지를 걸었습니다");
      setTitle("");
      setBody("");
    } catch (e) {
      Alert.alert("올리지 못했습니다", e instanceof Error ? e.message : "");
    }
    setBusy(false);
  }

  return (
    <>
      <Segmented<"board" | "app"> value={kind} onChange={setKind} options={[{ id: "board", label: "게시판 고정 공지" }, { id: "app", label: "앱 전체 공지" }]} />
      <Text style={label}>제목 · 60자</Text>
      <TextInput value={title} onChangeText={(t) => setTitle(t.slice(0, 60))} style={input} placeholder="제목" placeholderTextColor={K.inactive} />
      <Text style={label}>내용{kind === "app" ? " · 500자" : ""}</Text>
      <TextInput value={body} onChangeText={(t) => setBody(t.slice(0, kind === "app" ? 500 : 2000))} multiline style={[input, { minHeight: 110, paddingTop: 12, textAlignVertical: "top" }]} placeholder="내용(선택)" placeholderTextColor={K.inactive} />
      {kind === "app" && (
        <>
          <Text style={label}>기간 — 앱을 열 때 상단 배너로, 닫으면 다시 안 보입니다</Text>
          <View style={{ flexDirection: "row", gap: 6 }}>
            {[1, 3, 7, null].map((d) => {
              const on = d === days;
              return (
                <Pressable key={String(d)} onPress={() => setDays(d)} style={{ height: 32, borderRadius: 16, paddingHorizontal: 13, justifyContent: "center", backgroundColor: on ? C.ink : C.card, borderWidth: on ? 0 : 1, borderColor: C.line }}>
                  <Text style={{ fontFamily: F.sans, fontSize: 12, color: on ? C.card : K.text2 }}>{d == null ? "끝 없음" : `${d}일`}</Text>
                </Pressable>
              );
            })}
          </View>
          {/* TODO(푸시): 앱 전체 공지 푸시 알림 발송은 이번 범위 밖입니다. */}
        </>
      )}
      <Submit text={busy ? "올리는 중…" : "올리기"} onPress={send} disabled={!title.trim() || busy} />
    </>
  );
}

type Preview = { title: string; text: string | null; authorId: string | null; authorName: string | null; hidden: boolean };

/** 신고 대상 미리보기 — 글 · 게시판 댓글 · 사람. 그 밖(옛 답 · 투어)은 id 만. */
function useReportPreview(r: ReportRow) {
  return useQuery({
    queryKey: ["community", "admin", "preview", r.target_type, r.target_id],
    queryFn: async (): Promise<Preview> => {
      if (r.target_type === "post") {
        const { data } = await supabase.from("board_feed").select("title, body, place_name, author_id, nickname, hidden_at").eq("id", Number(r.target_id)).maybeSingle();
        return data
          ? { title: data.title || data.place_name || "(제목 없음)", text: data.body, authorId: data.author_id, authorName: data.nickname, hidden: !!data.hidden_at }
          : { title: "지워진 글", text: null, authorId: null, authorName: null, hidden: false };
      }
      if (r.target_type === "board_comment") {
        const { data } = await supabase.from("board_comment_rows").select("body, author_id, nickname, hidden_at").eq("id", Number(r.target_id)).maybeSingle();
        return data
          ? { title: "댓글", text: data.body, authorId: data.author_id, authorName: data.nickname, hidden: !!data.hidden_at }
          : { title: "지워진 댓글", text: null, authorId: null, authorName: null, hidden: false };
      }
      if (r.target_type === "user") {
        const { data } = await supabase.from("public_profiles").select("id, nickname").eq("id", r.target_id).maybeSingle();
        return { title: "사람", text: null, authorId: data?.id ?? null, authorName: data?.nickname ?? null, hidden: false };
      }
      return { title: `${r.target_type} #${r.target_id}`, text: null, authorId: null, authorName: null, hidden: false };
    },
  });
}

/** 신고함 — 안 본 것이 위. 숨기기 · 정지 · 무시(처리 끝). */
function ReportsBox() {
  const { data: reports = [], refetch, isRefetching } = useReports(true);
  const open = reports.filter((r) => !r.resolved_at).length;
  return (
    <>
      <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
        <Text style={label}>안 본 신고 {open} · 전체 {reports.length}</Text>
        <Pressable onPress={() => refetch()} hitSlop={8}><Text style={{ fontFamily: F.sans, fontSize: 11.5, color: C.brick }}>{isRefetching ? "불러오는 중…" : "새로고침"}</Text></Pressable>
      </View>
      {reports.length === 0 && <Text style={{ paddingVertical: 30, textAlign: "center", fontFamily: F.sans, fontSize: 12.5, color: C.faint }}>신고가 없습니다.</Text>}
      {reports.map((r) => <ReportCard key={r.id} r={r} />)}
    </>
  );
}

function ReportCard({ r }: { r: ReportRow }) {
  const qc = useQueryClient();
  const router = useRouter();
  const { data: p } = useReportPreview(r);
  const [busy, setBusy] = useState(false);
  const done = !!r.resolved_at;

  async function act(fn: () => Promise<unknown>, note: string) {
    setBusy(true);
    try {
      await fn();
      await adminResolveReport(qc, r.id, note);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (e) {
      Alert.alert("처리하지 못했습니다", e instanceof Error ? e.message : "");
    }
    setBusy(false);
  }

  function sanction() {
    if (!p?.authorId) return;
    const uid = p.authorId;
    Alert.alert(`${p.authorName ?? "작성자"} 정지`, "글 · 댓글 쓰기만 막습니다.", [
      { text: "7일", onPress: () => act(() => adminSanction(qc, uid, 7, r.reason ?? undefined), "sanction 7d") },
      { text: "30일", onPress: () => act(() => adminSanction(qc, uid, 30, r.reason ?? undefined), "sanction 30d") },
      { text: "영구", style: "destructive", onPress: () => act(() => adminSanction(qc, uid, null, r.reason ?? undefined), "sanction forever") },
      { text: "취소", style: "cancel" },
    ]);
  }

  const canHide = (r.target_type === "post" || r.target_type === "board_comment") && p && !p.hidden && !p.title.startsWith("지워진");
  const hide = () => act(() => (r.target_type === "post" ? adminHidePost(qc, Number(r.target_id), true) : adminHideComment(qc, Number(r.target_id), true)), "hide");

  return (
    <View style={{ borderRadius: 16, borderWidth: 1, borderColor: done ? C.lineSoft : K.brickLine, backgroundColor: C.card, padding: 13, gap: 7, opacity: done ? 0.6 : 1 }}>
      <View style={{ flexDirection: "row", gap: 8, alignItems: "center" }}>
        <Text style={{ fontFamily: F.mono, fontSize: 10, color: done ? C.faint : C.brick }}>{done ? "처리함" : "안 봄"} · {r.reason ?? "사유 없음"}</Text>
        <View style={{ flex: 1 }} />
        <Text style={{ fontFamily: F.mono, fontSize: 10, color: K.inactive }}>{timeAgo(r.created_at)}</Text>
      </View>
      <Pressable
        onPress={r.target_type === "post" ? () => router.push({ pathname: "/community/board/[id]", params: { id: r.target_id } }) : undefined}
        disabled={r.target_type !== "post"}
      >
        <Text numberOfLines={1} style={{ fontFamily: F.serif, fontSize: 14, color: C.ink }}>{p?.title ?? "…"}{p?.hidden ? " · 숨김" : ""}</Text>
        {!!p?.text && <Text numberOfLines={3} style={{ marginTop: 3, fontFamily: F.sans, fontSize: 12, lineHeight: 18, color: K.text2 }}>{p.text}</Text>}
        {!!p?.authorName && <Text style={{ marginTop: 3, fontFamily: F.sans, fontSize: 11, color: C.faint }}>작성자 {p.authorName}</Text>}
      </Pressable>
      {!done && (
        <View style={{ flexDirection: "row", gap: 6 }}>
          {canHide && <Btn label="숨기기" onPress={hide} disabled={busy} />}
          {!!p?.authorId && <Btn label="정지" onPress={sanction} disabled={busy} />}
          <Btn label="무시" onPress={() => act(async () => {}, "dismiss")} disabled={busy} muted />
        </View>
      )}
    </View>
  );
}

const Btn = ({ label: text, onPress, disabled, muted }: { label: string; onPress: () => void; disabled?: boolean; muted?: boolean }) => (
  <Pressable onPress={onPress} disabled={disabled} style={{ minHeight: 30, borderRadius: 15, borderWidth: 1, borderColor: muted ? C.line : C.brick, paddingHorizontal: 12, justifyContent: "center", opacity: disabled ? 0.5 : 1 }}>
    <Text style={{ fontFamily: F.sans, fontSize: 11.5, color: muted ? C.muted : C.brick }}>{text}</Text>
  </Pressable>
);

const seoulDate = (offsetDays = 0) => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul" }).format(new Date(Date.now() + offsetDays * 86400000));

/** 이번 주 주제 — 제목 · 설명 · 기간(YYYY-MM-DD). 지금 열린 주제가 있으면 고치기로 채웁니다. */
function ThemeForm() {
  const qc = useQueryClient();
  const { data: current } = useCurrentTheme();
  const [editId, setEditId] = useState<number | null>(null);
  const [title, setTitle] = useState("");
  const [desc, setDesc] = useState("");
  const [starts, setStarts] = useState(seoulDate());
  const [ends, setEnds] = useState(seoulDate(6));
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!current || editId != null) return;
    setEditId(current.id);
    setTitle(current.title);
    setDesc(current.description ?? "");
    setStarts(current.starts_on.slice(0, 10));
    setEnds(current.ends_on.slice(0, 10));
  }, [current]); // eslint-disable-line react-hooks/exhaustive-deps

  const valid = !!title.trim() && /^\d{4}-\d{2}-\d{2}$/.test(starts) && /^\d{4}-\d{2}-\d{2}$/.test(ends) && ends >= starts;

  async function save() {
    setBusy(true);
    try {
      await adminSaveTheme(qc, { id: editId, title, description: desc, startsOn: starts, endsOn: ends });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert(editId ? "주제를 고쳤습니다" : "새 주제를 열었습니다");
    } catch (e) {
      Alert.alert("저장하지 못했습니다", e instanceof Error ? e.message : "");
    }
    setBusy(false);
  }

  function fresh() {
    setEditId(null);
    setTitle("");
    setDesc("");
    setStarts(seoulDate(1));
    setEnds(seoulDate(7));
  }

  return (
    <>
      <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
        <Text style={label}>{editId ? "지금 열린 주제 고치기" : "새 주제 열기"}</Text>
        {editId != null && <Pressable onPress={fresh} hitSlop={8}><Text style={{ fontFamily: F.sans, fontSize: 11.5, color: C.brick }}>+ 다음 주제 새로</Text></Pressable>}
      </View>
      <TextInput value={title} onChangeText={setTitle} style={input} placeholder="제목 — 비 오는 날의 국물" placeholderTextColor={K.inactive} />
      <TextInput value={desc} onChangeText={(t) => setDesc(t.slice(0, 200))} multiline style={[input, { minHeight: 80, paddingTop: 12, textAlignVertical: "top" }]} placeholder="설명(선택, 200자)" placeholderTextColor={K.inactive} />
      <Text style={label}>기간 · 한국 날짜</Text>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
        <TextInput value={starts} onChangeText={setStarts} style={[input, { flex: 1 }]} placeholder="YYYY-MM-DD" placeholderTextColor={K.inactive} keyboardType="numbers-and-punctuation" />
        <Text style={{ fontFamily: F.sans, color: C.muted }}>–</Text>
        <TextInput value={ends} onChangeText={setEnds} style={[input, { flex: 1 }]} placeholder="YYYY-MM-DD" placeholderTextColor={K.inactive} keyboardType="numbers-and-punctuation" />
      </View>
      <Submit text={busy ? "저장하는 중…" : editId ? "고치기" : "열기"} onPress={save} disabled={!valid || busy} />
    </>
  );
}
