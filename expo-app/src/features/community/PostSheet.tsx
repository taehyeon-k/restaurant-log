import { useQueryClient } from "@tanstack/react-query";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import { FlatList, Image, Modal, Pressable, ScrollView, Text, TextInput, useWindowDimensions, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, { Path } from "react-native-svg";
import { CameraIcon } from "@/components/icons";
import { BottomSheetModal, fieldStyle } from "@/components/ui";
import { usePersonalRows } from "@/data/queries";
import { photosOf } from "@/lib/record";
import { coverPhoto, type Restaurant } from "@/lib/types";
import { C, F, SHADOW } from "@/theme";
import { setCloseFriends, upsertFriendPost, useCloseFriends, type Audience, type FriendPost, type PublicProfile } from "./api";
import { Avatar, K, PhotoOrStripes, Segmented } from "./ui";

const NOTE_MAX = 40;

const Check = ({ size = 11, color = C.card }: { size?: number; color?: string }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Path d="M5 12.5l4.5 4.5L19 7.5" stroke={color} strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" />
  </Svg>
);

/** "2026-10-11T…" → "2026.10.11" (한국 날짜) */
const dotted = (iso: string | null) =>
  iso ? new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul" }).format(new Date(iso)).replace(/-/g, ".") : "";

/**
 * 친구 소식 올리기 시트(HANDOFF-friend-posts §3-3, 시안 1a A2 · A3) — 1단계 기록 고르기 → 2단계 사진 · 한 줄 · 받는 사람.
 * 이미 올린 기록을 고르면 2단계가 기존 값으로 채워지고 「고치기」가 됩니다. startRecordId 가 있으면 바로 2단계.
 */
export default function PostSheet({
  visible, onClose, onPosted, myPosts, friends, startRecordId,
}: {
  visible: boolean;
  onClose: () => void;
  onPosted: () => void;
  myPosts: FriendPost[];
  friends: PublicProfile[];
  startRecordId?: number | null;
}) {
  const qc = useQueryClient();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { height: winH, width: winW } = useWindowDimensions();
  const { data: rows = [] } = usePersonalRows();
  const { data: closeIds = [] } = useCloseFriends();

  const records = useMemo(
    () =>
      rows
        .filter((r) => r.verified && !r.pending)
        .sort((a, b) => ((b.verified_at ?? b.created_at ?? "") > (a.verified_at ?? a.created_at ?? "") ? 1 : -1)),
    [rows],
  );
  const postedBy = useMemo(() => new Map(myPosts.map((p) => [p.record_id, p])), [myPosts]);

  const [step, setStep] = useState<1 | 2>(1);
  const [pickedId, setPickedId] = useState<number | null>(null);
  const [photos, setPhotos] = useState<number[]>([]);
  const [note, setNote] = useState("");
  const [audience, setAudience] = useState<Audience>("friends");
  const [editingClose, setEditingClose] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const picked = records.find((r) => r.id === pickedId) ?? null;
  const existing = pickedId != null ? postedBy.get(pickedId) ?? null : null;

  /** 2단계 값 채우기 — 올린 적 있으면 그 값, 없으면 대표 사진 한 장 · 빈 한 줄 · 친구 전체. */
  function fill(r: Restaurant) {
    const prev = postedBy.get(r.id);
    const count = photosOf(r).length;
    const cover = Math.min(r.cover_index ?? 0, Math.max(0, count - 1));
    const prevPhotos = prev?.photo_index.filter((i) => i < count) ?? [];
    setPhotos(prevPhotos.length ? prevPhotos : count ? [cover] : []);
    setNote(prev?.note ?? "");
    setAudience(prev?.audience ?? "friends");
    setError("");
  }

  useEffect(() => {
    if (!visible) return;
    setError("");
    const start = startRecordId != null ? records.find((r) => r.id === startRecordId) : null;
    if (start) {
      setPickedId(start.id);
      fill(start);
      setStep(2);
    } else {
      setPickedId(null);
      setStep(1);
    }
    // 열릴 때 한 번만 채웁니다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, startRecordId]);

  function togglePhoto(i: number) {
    Haptics.selectionAsync();
    setPhotos((cur) => (cur.includes(i) ? (cur.length > 1 ? cur.filter((x) => x !== i) : cur) : [...cur, i]));
  }

  function pickAudience(a: Audience) {
    setAudience(a);
    if (a === "close" && closeIds.length === 0) setEditingClose(true);
  }

  async function submit() {
    if (!picked) return;
    setBusy(true);
    setError("");
    try {
      await upsertFriendPost(qc, { recordId: picked.id, photoIndex: photos, note, audience });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      onClose();
      onPosted();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const closeFriends = friends.filter((f) => closeIds.includes(f.id));
  const sheetH = Math.min(690, winH - insets.top - 12);
  const tile = Math.floor((winW - 40 - 16) / 3);

  const stepOne = records.length === 0 ? (
    <View style={{ flex: 1, alignItems: "center", justifyContent: "center", gap: 16, paddingBottom: 40 }}>
      <Text style={{ textAlign: "center", fontFamily: F.sans, fontSize: 13, lineHeight: 21, color: C.faint }}>인증 기록이 생기면 올릴 수 있습니다</Text>
      <Pressable
        onPress={() => { onClose(); router.push("/capture"); }}
        accessibilityLabel="카메라 열기"
        style={{ width: 58, height: 58, borderRadius: 29, backgroundColor: C.brick, alignItems: "center", justifyContent: "center" }}
      >
        <CameraIcon size={24} />
      </Pressable>
    </View>
  ) : (
    <>
      <FlatList
        data={records}
        keyExtractor={(r) => String(r.id)}
        numColumns={3}
        style={{ flex: 1, marginTop: 14 }}
        columnWrapperStyle={{ gap: 8 }}
        contentContainerStyle={{ gap: 14, paddingBottom: 12 }}
        showsVerticalScrollIndicator={false}
        renderItem={({ item: r }) => {
          const on = r.id === pickedId;
          const posted = postedBy.has(r.id);
          return (
            <Pressable
              onPress={() => { Haptics.selectionAsync(); setPickedId(r.id); fill(r); }}
              accessibilityState={{ selected: on }}
              accessibilityLabel={`${r.name}${posted ? ", 올린 기록" : ""}`}
              style={{ width: tile }}
            >
              <View style={{ width: tile, height: tile, borderRadius: 14, borderWidth: on ? 2 : 0, borderColor: C.brick, padding: on ? 2 : 0 }}>
                <PhotoOrStripes uri={coverPhoto(r)} height={tile - (on ? 8 : 0)} radius={on ? 11 : 14} />
                {on && (
                  <View style={{ position: "absolute", top: 6, right: 6, width: 20, height: 20, borderRadius: 10, backgroundColor: C.brick, alignItems: "center", justifyContent: "center" }}>
                    <Check />
                  </View>
                )}
                {posted && (
                  <Text style={{ position: "absolute", left: 6, bottom: 6, borderRadius: 6, backgroundColor: "rgba(28,26,23,.7)", paddingHorizontal: 6, paddingVertical: 1, fontFamily: F.sans, fontSize: 10, color: C.card, overflow: "hidden" }}>올림</Text>
                )}
              </View>
              <Text numberOfLines={1} style={{ marginTop: 6, fontFamily: F.serif, fontSize: 12.5, color: C.ink }}>{r.name}</Text>
              <Text style={{ marginTop: 1, fontFamily: F.mono, fontSize: 9.5, color: K.inactive }}>{dotted(r.verified_at ?? r.created_at ?? null)}</Text>
            </Pressable>
          );
        }}
      />
      <Pressable
        onPress={() => setStep(2)}
        disabled={!picked}
        style={{ marginTop: 10, height: 52, borderRadius: 18, backgroundColor: picked ? C.ink : "#d6d0c4", alignItems: "center", justifyContent: "center" }}
      >
        <Text style={{ fontFamily: F.sansMd, fontSize: 14, color: C.card }}>다음</Text>
      </Pressable>
    </>
  );

  const all = picked ? photosOf(picked) : [];
  const stepTwo = picked && (
    <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 12 }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
      <Text style={{ marginTop: 4, fontFamily: F.serif, fontSize: 15, color: C.ink }}>{picked.name}</Text>
      <Text style={{ marginTop: 2, fontFamily: F.mono, fontSize: 10, color: K.inactive }}>✓ 인증 {dotted(picked.verified_at)}</Text>

      <Text style={label}>사진</Text>
      {all.length ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
          {all.map((url, i) => {
            const order = photos.indexOf(i);
            return (
              <Pressable key={url + i} onPress={() => togglePhoto(i)} accessibilityLabel={`사진 ${i + 1}${order >= 0 ? `, ${order + 1}번째` : ""}`}
                style={{ width: 62, height: 62, borderRadius: 12, overflow: "hidden", borderWidth: order >= 0 ? 2 : 1, borderColor: order >= 0 ? C.brick : C.lineSoft }}>
                <Image source={{ uri: url }} style={{ width: "100%", height: "100%", opacity: order >= 0 ? 1 : 0.55 }} />
                {order >= 0 && (
                  <View style={{ position: "absolute", top: 4, right: 4, width: 18, height: 18, borderRadius: 9, backgroundColor: C.brick, alignItems: "center", justifyContent: "center" }}>
                    <Text style={{ fontFamily: F.mono, fontSize: 10, color: C.card }}>{order + 1}</Text>
                  </View>
                )}
              </Pressable>
            );
          })}
        </ScrollView>
      ) : (
        <Text style={{ fontFamily: F.sans, fontSize: 12, color: C.faint }}>사진이 없는 기록입니다</Text>
      )}

      <View style={{ marginTop: 20, flexDirection: "row", alignItems: "baseline", justifyContent: "space-between" }}>
        <Text style={[label, { marginTop: 0 }]}>한 줄</Text>
        <Text style={{ fontFamily: F.mono, fontSize: 10.5, color: note.length >= NOTE_MAX ? C.brick : K.inactive }}>{note.length}/{NOTE_MAX}</Text>
      </View>
      <TextInput
        value={note}
        onChangeText={(t) => setNote(t.slice(0, NOTE_MAX))}
        maxLength={NOTE_MAX}
        placeholder="친구에게 한마디(비워도 됩니다)"
        placeholderTextColor="#a8a196"
        style={[fieldStyle, { fontFamily: F.serif }]}
      />

      <Text style={label}>받는 사람</Text>
      <Segmented<Audience>
        value={audience}
        onChange={pickAudience}
        options={[{ id: "friends", label: `친구 전체 · ${friends.length}` }, { id: "close", label: `친한 친구 · ${closeFriends.length}` }]}
      />
      {audience === "close" && closeFriends.length === 0 && (
        <Pressable onPress={() => setEditingClose(true)} style={{ marginTop: 10, alignSelf: "flex-start" }} hitSlop={6}>
          <Text style={{ fontFamily: F.sans, fontSize: 12, color: C.brick }}>친한 친구를 골라 주세요 ›</Text>
        </Pressable>
      )}
      {audience === "close" && closeFriends.length > 0 && (
        <View style={{ marginTop: 12, flexDirection: "row", alignItems: "center", gap: 10 }}>
          <View style={{ flexDirection: "row" }}>
            {closeFriends.slice(0, 4).map((f, i) => (
              <View key={f.id} style={{ marginLeft: i ? -8 : 0, borderRadius: 14, borderWidth: 2, borderColor: C.paper }}>
                <Avatar name={f.nickname} url={f.avatarUrl} size={24} seed={f.id} />
              </View>
            ))}
          </View>
          <Text numberOfLines={1} style={{ flex: 1, fontFamily: F.sans, fontSize: 12, color: K.text2 }}>{closeFriends.map((f) => f.nickname).join(", ")}</Text>
          <Pressable onPress={() => setEditingClose(true)} hitSlop={8}>
            <Text style={{ fontFamily: F.sans, fontSize: 12, color: C.brick }}>친한친구 수정하기 ›</Text>
          </Pressable>
        </View>
      )}
    </ScrollView>
  );

  const canSubmit = !!picked && !busy && (audience === "friends" || closeFriends.length > 0);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <View style={{ flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(28,26,23,.42)" }}>
        <Pressable style={{ flex: 1 }} onPress={onClose} accessibilityLabel="닫기" />
        <View style={[{ height: sheetH, backgroundColor: C.paper, borderTopLeftRadius: 28, borderTopRightRadius: 28, paddingHorizontal: 20, paddingTop: 10, paddingBottom: insets.bottom + 16 }, SHADOW.sheet]}>
          <View style={{ alignSelf: "center", width: 38, height: 4, borderRadius: 2, backgroundColor: "#d6d0c4" }} />
          <View style={{ marginTop: 14, flexDirection: "row", alignItems: "center", gap: 10 }}>
            {step === 2 && startRecordId == null && (
              <Pressable onPress={() => setStep(1)} hitSlop={10} accessibilityLabel="기록 다시 고르기">
                <Text style={{ fontFamily: F.sans, fontSize: 18, color: C.muted }}>‹</Text>
              </Pressable>
            )}
            <Text style={{ flex: 1, fontFamily: F.serif, fontSize: 19, color: C.ink }}>
              {step === 1 ? "어떤 기록을 올릴까요?" : existing ? "소식 고치기" : "소식 꾸미기"}
            </Text>
            <Text style={{ fontFamily: F.mono, fontSize: 10.5, color: K.inactive }}>{step} / 2</Text>
          </View>

          {step === 1 ? stepOne : stepTwo}

          {step === 2 && (
            <View>
              {!!error && <Text style={{ marginBottom: 8, fontFamily: F.sans, fontSize: 12, color: "#a8412a" }}>{error}</Text>}
              <Pressable
                onPress={submit}
                disabled={!canSubmit}
                style={{ height: 52, borderRadius: 18, backgroundColor: canSubmit ? C.ink : "#d6d0c4", alignItems: "center", justifyContent: "center" }}
              >
                <Text style={{ fontFamily: F.sansMd, fontSize: 14, color: C.card }}>{busy ? "올리는 중…" : existing ? "고치기" : "소식에 올리기"}</Text>
              </Pressable>
              <Text style={{ marginTop: 8, textAlign: "center", fontFamily: F.sans, fontSize: 11, color: K.inactive }}>
                직접 내릴 때까지 보입니다 · 누가 봤는지는 남지 않습니다
              </Text>
            </View>
          )}
        </View>
      </View>
      <CloseFriendsSheet
        visible={editingClose}
        friends={friends}
        selected={closeIds}
        onClose={(saved) => {
          setEditingClose(false);
          // 0명인 채로 닫으면 친구 전체로 되돌립니다.
          if (saved != null ? saved.length === 0 : closeIds.length === 0) setAudience("friends");
        }}
        onSave={(ids) => setCloseFriends(qc, ids)}
      />
    </Modal>
  );
}

const label = { marginTop: 20, marginBottom: 9, fontFamily: F.mono, fontSize: 10, letterSpacing: 1.6, color: C.faint } as const;

/** 친한 친구 고르기 — 친구 목록 체크. 상대에게 알리지 않습니다. */
function CloseFriendsSheet({
  visible, friends, selected, onClose, onSave,
}: { visible: boolean; friends: PublicProfile[]; selected: string[]; onClose: (saved: string[] | null) => void; onSave: (ids: string[]) => Promise<void> }) {
  const [ids, setIds] = useState<string[]>(selected);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => { if (visible) { setIds(selected); setError(""); } }, [visible, selected]);

  async function save() {
    setBusy(true);
    setError("");
    try {
      await onSave(ids);
      onClose(ids);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <BottomSheetModal visible={visible} onClose={() => onClose(null)}>
      <Text style={{ fontFamily: F.serif, fontSize: 19, color: C.ink }}>친한 친구</Text>
      <Text style={{ marginTop: 4, fontFamily: F.sans, fontSize: 11.5, color: C.faint }}>고른 사람에게 알리지 않습니다</Text>
      <ScrollView style={{ marginTop: 12, maxHeight: 340 }}>
        {friends.length === 0 && <Text style={{ paddingVertical: 20, fontFamily: F.sans, fontSize: 12.5, color: C.faint }}>아직 친구가 없습니다.</Text>}
        {friends.map((f) => {
          const on = ids.includes(f.id);
          return (
            <Pressable
              key={f.id}
              onPress={() => { Haptics.selectionAsync(); setIds((cur) => (on ? cur.filter((x) => x !== f.id) : [...cur, f.id])); }}
              accessibilityState={{ checked: on }}
              style={{ minHeight: 52, flexDirection: "row", alignItems: "center", gap: 12, borderBottomWidth: 1, borderBottomColor: "#efeae0" }}
            >
              <Avatar name={f.nickname} url={f.avatarUrl} size={32} seed={f.id} />
              <Text style={{ flex: 1, fontFamily: F.sans, fontSize: 13.5, color: C.ink }}>{f.nickname}</Text>
              <View style={{ width: 22, height: 22, borderRadius: 11, borderWidth: on ? 0 : 1.5, borderColor: C.line, backgroundColor: on ? C.brick : "transparent", alignItems: "center", justifyContent: "center" }}>
                {on && <Check />}
              </View>
            </Pressable>
          );
        })}
      </ScrollView>
      {!!error && <Text style={{ marginTop: 10, fontFamily: F.sans, fontSize: 12, color: "#a8412a" }}>{error}</Text>}
      <Pressable onPress={save} disabled={busy} style={{ marginTop: 16, height: 50, borderRadius: 18, backgroundColor: C.ink, alignItems: "center", justifyContent: "center", opacity: busy ? 0.7 : 1 }}>
        <Text style={{ fontFamily: F.sansMd, fontSize: 13.5, color: C.card }}>{busy ? "저장하는 중…" : `저장 · ${ids.length}명`}</Text>
      </Pressable>
    </BottomSheetModal>
  );
}
