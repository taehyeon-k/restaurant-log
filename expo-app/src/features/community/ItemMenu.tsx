import { useQueryClient } from "@tanstack/react-query";
import * as Haptics from "expo-haptics";
import { useState } from "react";
import { Alert, Pressable, Text, View } from "react-native";
import { BottomSheetModal } from "@/components/ui";
import { useAccount } from "@/data/profile";
import { C, F } from "@/theme";
import {
  adminHideComment, adminHideGalleryComment, adminHideGalleryPhoto, adminHidePost, adminPinPost, adminSanction, blockUser,
  deleteBoardComment, deleteGalleryComment, deletePost, removeGalleryPhoto, report, useIsAdmin,
  type BoardComment, type BoardPost, type GalleryComment, type GalleryPhoto, type ReportTarget,
} from "./api";
import { K } from "./ui";

export type MenuTarget =
  | { kind: "post"; post: BoardPost }
  | { kind: "comment"; comment: BoardComment }
  | { kind: "gallery_photo"; photo: GalleryPhoto }
  | { kind: "gallery_comment"; comment: GalleryComment };

/** 대상마다 다른 칸을 한 모양으로. */
function describe(t: MenuTarget) {
  switch (t.kind) {
    case "post": return { id: t.post.id, authorId: t.post.author_id, name: t.post.nickname, hidden: !!t.post.hidden_at, what: "글", report: "post" as ReportTarget };
    case "comment": return { id: t.comment.id, authorId: t.comment.author_id, name: t.comment.nickname, hidden: !!t.comment.hidden_at, what: "댓글", report: "board_comment" as ReportTarget };
    case "gallery_photo": return { id: t.photo.id, authorId: t.photo.author_id, name: t.photo.nickname, hidden: !!t.photo.hidden_at, what: "사진", report: "gallery_photo" as ReportTarget };
    case "gallery_comment": return { id: t.comment.id, authorId: t.comment.author_id, name: t.comment.nickname, hidden: !!t.comment.hidden_at, what: "댓글", report: "gallery_comment" as ReportTarget };
  }
}

const REASONS = ["광고", "욕설", "거짓 정보", "기타"];

type Item = { label: string; onPress: () => void; danger?: boolean; muted?: boolean };

/**
 * 글 · 댓글 · 갤러리 사진의 작성자 줄 오른쪽 끝 ⋯ (HANDOFF-board-v2 §3 ⋯ 메뉴, HANDOFF-gallery 02).
 * 남의 것: 신고하기 · 차단하기 / 내 것: 수정(글만) · 삭제(사진은 「갤러리에서 내리기」) / 관리자: 숨기기 · 작성자 정지 · 공지로 고정(글만).
 */
export function MoreButton({ target, onEdit, onDeleted, onBlocked }: { target: MenuTarget; onEdit?: () => void; onDeleted?: () => void; onBlocked?: () => void }) {
  const qc = useQueryClient();
  const { data: account } = useAccount();
  const { data: isAdmin } = useIsAdmin();
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<"main" | "report" | "sanction">("main");

  const isPost = target.kind === "post";
  const isPhoto = target.kind === "gallery_photo";
  const d = describe(target);
  const { id, authorId, hidden, what } = d;
  const authorName = d.name ?? "이 사람";
  const mine = account?.userId === authorId;

  const close = () => { setOpen(false); setStep("main"); };

  async function run(fn: () => Promise<unknown>, done?: string) {
    close();
    try {
      await fn();
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      if (done) later(() => Alert.alert(done));
    } catch (e) {
      later(() => Alert.alert("잠시 뒤 다시 해 주세요", e instanceof Error ? e.message : ""));
    }
  }

  /** iOS 는 시트가 내려가는 중에 띄운 Alert 를 삼킵니다 — 다 내려간 뒤에. */
  const later = (f: () => void) => setTimeout(f, 380);

  function remove() {
    close();
    later(() => Alert.alert(isPhoto ? "갤러리에서 내릴까요?" : `${what}을 지울까요?`, isPhoto ? "기록과 사진은 그대로 남습니다." : undefined, [
      { text: "취소", style: "cancel" },
      {
        text: isPhoto ? "내리기" : "삭제", style: "destructive",
        onPress: () => run(async () => {
          if (target.kind === "post") await deletePost(qc, id);
          else if (target.kind === "comment") await deleteBoardComment(qc, id);
          else if (target.kind === "gallery_photo") await removeGalleryPhoto(qc, id);
          else await deleteGalleryComment(qc, id);
          onDeleted?.();
        }),
      },
    ]));
  }

  function block() {
    close();
    later(() => Alert.alert(`${authorName}님을 차단할까요?`, "이 사람의 글 · 댓글 · 기록이 내 화면에서 빠집니다.", [
      { text: "취소", style: "cancel" },
      { text: "차단하기", style: "destructive", onPress: () => run(async () => { await blockUser(qc, authorId); onBlocked?.(); }) },
    ]));
  }

  const main: Item[] = mine
    ? [...(isPost && onEdit ? [{ label: "수정", onPress: () => { close(); onEdit(); } }] : []), { label: isPhoto ? "갤러리에서 내리기" : "삭제", onPress: remove, danger: true }]
    : [{ label: "신고하기", onPress: () => setStep("report") }, { label: "차단하기", onPress: block, danger: true }];
  if (isAdmin) {
    main.push({
      label: hidden ? "숨김 풀기" : "숨기기",
      onPress: () => run(() => {
        switch (target.kind) {
          case "post": return adminHidePost(qc, id, !hidden);
          case "comment": return adminHideComment(qc, id, !hidden);
          case "gallery_photo": return adminHideGalleryPhoto(qc, id, !hidden);
          case "gallery_comment": return adminHideGalleryComment(qc, id, !hidden);
        }
      }),
      muted: true,
    });
    if (!mine) main.push({ label: "작성자 정지", onPress: () => setStep("sanction"), muted: true });
    if (target.kind === "post") {
      const pinned = target.post.pinned;
      main.push({ label: pinned ? "공지 해제" : "공지로 고정", onPress: () => run(() => adminPinPost(qc, id, !pinned)), muted: true });
    }
  }

  const items: Item[] =
    step === "report"
      ? REASONS.map((reason) => ({
          label: reason,
          onPress: () => run(() => report(d.report, id, reason), "신고했습니다 · 살펴본 뒤 처리합니다"),
        }))
      : step === "sanction"
        ? [
            { label: "7일", onPress: () => run(() => adminSanction(qc, authorId, 7, `${what} ${id}`), `${authorName} · 7일 정지`) },
            { label: "30일", onPress: () => run(() => adminSanction(qc, authorId, 30, `${what} ${id}`), `${authorName} · 30일 정지`) },
            { label: "영구", onPress: () => run(() => adminSanction(qc, authorId, null, `${what} ${id}`), `${authorName} · 영구 정지`), danger: true },
          ]
        : main;

  return (
    <>
      <Pressable onPress={() => { Haptics.selectionAsync(); setOpen(true); }} hitSlop={10} accessibilityLabel={`${what} 메뉴`} style={{ paddingHorizontal: 4 }}>
        <Text style={{ fontFamily: F.sansBd, fontSize: 14, letterSpacing: 1, color: K.inactive }}>⋯</Text>
      </Pressable>
      <BottomSheetModal visible={open} onClose={close}>
        <Text style={{ fontFamily: F.mono, fontSize: 10, letterSpacing: 1.6, color: C.faint }}>
          {step === "report" ? "무엇이 문제인가요?" : step === "sanction" ? `${authorName} 정지 — 글 · 댓글 쓰기만 막습니다` : `${what} · ${authorName}`}
        </Text>
        <View style={{ marginTop: 8, borderRadius: 12, borderWidth: 1, borderColor: C.lineSoft, backgroundColor: C.card, overflow: "hidden" }}>
          {items.map((it, i) => (
            <Pressable key={it.label} onPress={it.onPress} style={{ minHeight: 46, paddingHorizontal: 16, justifyContent: "center", borderTopWidth: i ? 1 : 0, borderTopColor: C.lineSoft }}>
              <Text style={{ fontFamily: F.sans, fontSize: 13.5, color: it.danger ? C.brick : it.muted ? C.muted : C.ink }}>{it.label}</Text>
            </Pressable>
          ))}
        </View>
        <Pressable onPress={step === "main" ? close : () => setStep("main")} style={{ marginTop: 10, minHeight: 44, borderRadius: 14, borderWidth: 1, borderColor: C.line, alignItems: "center", justifyContent: "center" }}>
          <Text style={{ fontFamily: F.sans, fontSize: 13, color: C.muted }}>{step === "main" ? "닫기" : "‹ 뒤로"}</Text>
        </Pressable>
      </BottomSheetModal>
    </>
  );
}
