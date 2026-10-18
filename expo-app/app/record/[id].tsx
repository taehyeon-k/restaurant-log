import { useQueryClient } from "@tanstack/react-query";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { ActivityIndicator, Alert, Dimensions, Image, Modal, Platform, Pressable, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { BookmarkIcon, ShareIcon, ThumbIcon, VerifiedMark } from "@/components/icons";
import { ShareSheet } from "@/components/ShareSheet";
import { BackButton, BottomSheetModal, Button, Eyebrow, MobileStars, PhotoBox, Pigs } from "@/components/ui";
import { copyToPersonal, PARTNER_COLOR, setActiveBook, useActiveBook, useAnniversaryPicks, useRecordNotes, type BookMember } from "@/data/books";
import { refreshAll } from "@/data/invalidate";
import { usePersonalRows, useRows } from "@/data/queries";
import { Pair } from "@/features/couple/Avatars";
import CoupleNotes from "@/features/couple/CoupleNotes";
import { dottedWithDay, mealLabels } from "@/lib/anniversary";
import { iGa } from "@/lib/josa";
import { MAX_PHOTOS, pickAlbumUris, removePhotoObjects, uploadAlbumPhoto } from "@/lib/photos";
import { photosOf, verifiedShotOf } from "@/lib/record";
import { supabase } from "@/lib/supabase";
import { SOURCE_LABEL } from "@/lib/sourceLink";
import { dottedDate, verifiedDateTime, verifiedTime, type Restaurant } from "@/lib/types";
import { C, F } from "@/theme";
import { SignedImage } from "@/lib/signedPhoto";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View>
      <Eyebrow>{label}</Eyebrow>
      <View style={{ marginTop: 7 }}>{children}</View>
    </View>
  );
}

/** 「내 기록에도 남기시겠습니까?」 — 가운데 뜨는 창(HANDOFF-copy-to-personal §2), 확인하면 복사본을 남깁니다. */
function KeepDialog({
  visible, record, partner, onClose, onDone,
}: { visible: boolean; record: Restaurant; partner: BookMember | null; onClose: () => void; onDone: (copyId: number) => void }) {
  const qc = useQueryClient();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => { if (visible) setError(""); }, [visible]);

  async function save() {
    setSaving(true);
    setError("");
    try {
      const copyId = await copyToPersonal(qc, record.id);
      onDone(copyId);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  const close = saving ? () => {} : onClose;
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={close} statusBarTranslucent>
      <Pressable onPress={close} style={{ flex: 1, backgroundColor: "rgba(28,26,23,.38)", justifyContent: "center", paddingHorizontal: 36 }}>
        <Pressable onPress={() => {}} style={{ borderRadius: 22, backgroundColor: C.card, paddingHorizontal: 20, paddingTop: 24, paddingBottom: 18 }}>
          <Text style={{ textAlign: "center", fontFamily: F.serif, fontSize: 18, fontWeight: "bold", color: C.ink }}>내 기록에도 남기시겠습니까?</Text>
          <Text style={{ marginTop: 10, textAlign: "center", fontFamily: F.sans, fontSize: 12, lineHeight: 19, color: C.muted }}>
            사진·인증마크·메뉴·내 별점과 한 줄이 개인 기록에 복사됩니다. {partner?.nickname ?? "상대"}의 한 줄은 옮기지 않아요.
          </Text>
          {!!error && <Text style={{ marginTop: 10, textAlign: "center", fontFamily: F.sans, fontSize: 12, color: "#a8412a" }}>{error}</Text>}
          <View style={{ marginTop: 20, flexDirection: "row", gap: 8 }}>
            <Pressable onPress={onClose} disabled={saving} style={{ flex: 1, height: 48, borderRadius: 16, borderWidth: 1, borderColor: "#ded8cb", alignItems: "center", justifyContent: "center", opacity: saving ? 0.5 : 1 }}>
              <Text style={{ fontFamily: F.sans, fontSize: 13.5, color: C.muted }}>취소</Text>
            </Pressable>
            <Pressable onPress={save} disabled={saving} style={{ flex: 1, height: 48, borderRadius: 16, backgroundColor: C.ink, alignItems: "center", justifyContent: "center", opacity: saving ? 0.7 : 1 }}>
              <Text style={{ fontFamily: F.sansMd, fontSize: 13.5, color: C.card }}>{saving ? "남기는 중…" : "내 기록에 추가"}</Text>
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

export default function RecordRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const qc = useQueryClient();
  const { data: rows = [] } = useRows();
  const record = rows.find((r) => r.id === Number(id));
  const photos = record ? photosOf(record) : [];
  const cover = record ? Math.min(record.cover_index ?? 0, Math.max(0, photos.length - 1)) : 0;
  const [shown, setShown] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [sharing, setSharing] = useState(false);
  // 앨범에서 막 고른 사진 — 올리는 동안 썸네일 줄 끝에 어둡게 보입니다.
  const [pending, setPending] = useState<string[]>([]);
  const [sheetIdx, setSheetIdx] = useState<number | null>(null);
  // 연인 기록(HANDOFF-couple §3-6) — 사람별 한 줄, 「태현이 인증」, 기념일 라벨. 기록 자체는 찍은 사람만 고칩니다.
  const { book, books, isCouple, readOnly, me, partner } = useActiveBook();
  const { data: notes = [] } = useRecordNotes();
  const { data: picks = [] } = useAnniversaryPicks();
  // 내 기록에도 남기기(HANDOFF-copy-to-personal) — 개인 기록장에 이미 남긴 복사본이 있는지
  const { data: personalRows = [] } = usePersonalRows();
  const [keeping, setKeeping] = useState(false);
  const [keptId, setKeptId] = useState<number | null>(null);
  useEffect(() => {
    if (keptId == null) return;
    const t = setTimeout(() => setKeptId(null), 3000);
    return () => clearTimeout(t);
  }, [keptId]);

  if (!record) {
    return (
      <View style={{ flex: 1, backgroundColor: C.paper, paddingTop: insets.top }}>
        <BackButton />
      </View>
    );
  }

  const mineRecord = !isCouple || record.user_id === me?.userId;
  const canEdit = mineRecord && !readOnly;
  const verifier = isCouple ? [me, partner].find((m) => m?.userId === record.user_id)?.nickname ?? "상대" : null;
  const anniversary =
    isCouple && book?.startedOn ? mealLabels(book.startedOn, picks, rows.filter((r) => !r.pending)).get(record.id) ?? null : null;

  // 내가 찍어 인증한 기록일 때만, 읽기 전용 기록장이면 숨김(§1)
  const canKeep = isCouple && !readOnly && record.user_id === me?.userId && record.verified && !record.pending;
  const copy = canKeep ? personalRows.find((r) => r.source_record_id === record.id) ?? null : null;
  const openCopy = (copyId: number) => {
    if (!books?.personal) return;
    setActiveBook(books.personal.id);
    router.replace({ pathname: "/record/[id]", params: { id: String(copyId) } });
  };
  // 개인 기록장에서 본 복사본 — 상대는 연인 기록장 멤버에서 찾고, 없으면 빈 원
  const copiedFrom = book?.kind === "personal" && !!record.copied_at;
  const copyPartner = copiedFrom ? books?.couple?.members.find((m) => m.userId !== me?.userId) ?? null : null;

  const idx = shown ?? cover;
  const current = photos[idx] ?? null;
  const verifiedShot = verifiedShotOf(record);
  // 연인 기록은 둘 다 사진을 더할 수 있습니다. 인증·인증 사진은 그대로 둡니다.
  const canAddPhotos = !readOnly && !record.pending;
  const room = MAX_PHOTOS - photos.length - pending.length;

  /** 사진 목록을 한꺼번에 바꿔 저장합니다(photo_url 은 늘 대표와 맞춥니다). verified · verified_at 은 건드리지 않습니다. */
  async function savePhotos(list: string[], coverAt: number) {
    const at = Math.min(coverAt, Math.max(0, list.length - 1));
    const { error } = await supabase
      .from("restaurants")
      .update({ photo_urls: list, cover_index: at, photo_url: list[at] ?? null, updated_at: new Date().toISOString() })
      .eq("id", record!.id);
    if (error) throw new Error(error.message);
    await refreshAll(qc);
  }

  async function addAlbum() {
    if (room <= 0) return setError(`사진은 최대 ${MAX_PHOTOS}장이에요`);
    const uris = await pickAlbumUris(room);
    if (!uris.length) return;
    setError("");
    setPending((l) => [...l, ...uris]);
    const uploaded: string[] = [];
    try {
      for (const uri of uris) uploaded.push(await uploadAlbumPhoto(uri));
      // 그 사이 다른 쪽(연인)이 더했을 수 있어 DB 의 지금 목록 뒤에 붙입니다.
      const { data, error } = await supabase.from("restaurants").select("photo_urls, photo_url, cover_index").eq("id", record!.id).single();
      if (error) throw new Error(error.message);
      const now = photosOf(data as Restaurant);
      await savePhotos([...now, ...uploaded].slice(0, MAX_PHOTOS), (data as Restaurant).cover_index ?? 0);
    } catch (e) {
      await removePhotoObjects(uploaded);
      setError(e instanceof Error ? e.message : "사진을 올리지 못했어요");
    } finally {
      setPending((l) => l.filter((u) => !uris.includes(u)));
    }
  }

  async function setCoverAt(i: number) {
    setSheetIdx(null);
    setBusy(true);
    try { await savePhotos(photos, i); } catch (e) { setError((e as Error).message); }
    setBusy(false);
  }

  function deleteAt(i: number) {
    setSheetIdx(null);
    Alert.alert(`사진 ${i + 1}을 지울까요?`, undefined, [
      { text: "취소", style: "cancel" },
      {
        text: "지우기",
        style: "destructive",
        onPress: async () => {
          setBusy(true);
          try {
            await savePhotos(photos.filter((_, n) => n !== i), i < cover ? cover - 1 : i === cover ? 0 : cover);
            await removePhotoObjects([photos[i]]);
            setShown(null);
          } catch (e) {
            setError((e as Error).message);
          }
          setBusy(false);
        },
      },
    ]);
  }

  async function makeCover() {
    setBusy(true);
    const { error } = await supabase
      .from("restaurants")
      .update({ cover_index: idx, photo_url: photos[idx] ?? null, updated_at: new Date().toISOString() })
      .eq("id", record!.id);
    setBusy(false);
    if (error) return setError(error.message);
    refreshAll(qc);
  }

  function remove() {
    Alert.alert(`"${record!.name}" 기록을 지울까요?`, undefined, [
      { text: "취소", style: "cancel" },
      {
        text: "지우기",
        style: "destructive",
        onPress: async () => {
          setBusy(true);
          const { error } = await supabase.from("restaurants").delete().eq("id", record!.id);
          setBusy(false);
          if (error) return setError(error.message);
          await refreshAll(qc);
          router.back();
        },
      },
    ]);
  }

  const revisit = () =>
    router.push({
      pathname: "/record/edit",
      params: {
        kind: record.kind, name: record.name, address: record.address ?? "", lat: String(record.lat ?? ""),
        lng: String(record.lng ?? ""), category: record.category ?? "", revisit: "1",
      },
    });
  const addWish = () =>
    router.push({
      pathname: "/wish/new",
      params: {
        name: record.name, where_text: record.address ?? record.region ?? "", category: record.category ?? "",
        lat: String(record.lat ?? ""), lng: String(record.lng ?? ""),
      },
    });

  const verifyNote =
    "그 자리에서 찍은 사진으로 인증되었습니다." +
    (record.acc ? ` 촬영 시 위치 정확도 약 ${record.acc}m.` : "") +
    " 좌표는 기록에 남지 않습니다.";

  return (
    <View style={{ flex: 1, backgroundColor: C.paper }}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: insets.bottom + 40 }}>
        {/* 가로 5 : 세로 4 — 268 고정 높이보다 덜 잘립니다. 뒤로 · 공유 버튼은 사진 위에 겹쳐 둡니다. */}
        <PhotoBox src={current} category={record.category} radius={0} style={{ width: Dimensions.get("window").width, height: current ? Dimensions.get("window").width * 0.8 : 268, ...(!current && { backgroundColor: "#efeade" }) }}>
          {!current && canAddPhotos && (
            <Pressable onPress={addAlbum} disabled={pending.length > 0} accessibilityLabel="앨범에서 사진 추가"
              style={{ width: 220, height: 118, borderRadius: 20, borderWidth: 1.5, borderStyle: "dashed", borderColor: "#cdc6b8", alignItems: "center", justifyContent: "center", gap: 4 }}>
              {pending.length > 0 ? <ActivityIndicator color={C.brick} /> : (
                <>
                  <Text style={{ fontFamily: F.sans, fontSize: 24, color: C.muted }}>+</Text>
                  <Text style={{ fontFamily: F.sansMd, fontSize: 13.5, color: C.ink }}>앨범에서 사진 추가</Text>
                  <Text style={{ fontFamily: F.sans, fontSize: 11, color: C.faint }}>최대 {MAX_PHOTOS}장</Text>
                </>
              )}
            </Pressable>
          )}
          {!current && !canAddPhotos && (
            <Text style={{ fontFamily: F.mono, fontSize: 10, letterSpacing: 1.4, color: C.faint }}>사진 없음</Text>
          )}
          {!!current && current === verifiedShot && (
            <View style={{ position: "absolute", right: 16, bottom: 16 }}>
              <VerifiedMark size={52} />
            </View>
          )}
          {anniversary && (
            <Text style={{ position: "absolute", right: 16, top: insets.top + 14, borderRadius: 10, backgroundColor: C.brick, paddingHorizontal: 9, paddingVertical: 4, fontFamily: F.mono, fontSize: 11, color: C.card, overflow: "hidden" }}>
              {anniversary}
            </Text>
          )}
        </PhotoBox>

        {photos.length > 0 && (photos.length > 1 || canAddPhotos || pending.length > 0) && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 7, paddingHorizontal: 16, paddingVertical: 10, alignItems: "center" }} style={{ borderBottomWidth: 1, borderBottomColor: "#e6e0d3" }}>
            {photos.map((url, i) => (
              <Pressable key={url} onPress={() => setShown(i)} onLongPress={canAddPhotos ? () => setSheetIdx(i) : undefined} accessibilityLabel={`사진 ${i + 1}`}
                style={{ width: 54, height: 54, borderRadius: 14, overflow: "hidden", backgroundColor: "#eae5da", borderWidth: i === cover ? 1.5 : 1, borderColor: i === cover ? C.brick : "#ded8cb" }}>
                <SignedImage uri={url} style={{ width: "100%", height: "100%" }} />
                {i === cover && (
                  <Text style={{ position: "absolute", left: 3, top: 3, borderRadius: 5, backgroundColor: C.brick, paddingHorizontal: 3, fontFamily: F.mono, fontSize: 8, color: C.card, overflow: "hidden" }}>대표</Text>
                )}
                {url === verifiedShot && <View style={{ position: "absolute", right: 2, bottom: 2 }}><VerifiedMark size={18} /></View>}
              </Pressable>
            ))}
            {pending.map((uri) => (
              <View key={uri} style={{ width: 54, height: 54, borderRadius: 14, overflow: "hidden", backgroundColor: "#eae5da" }}>
                <Image source={{ uri }} style={{ width: "100%", height: "100%" }} />
                <View style={{ position: "absolute", left: 0, right: 0, top: 0, bottom: 0, backgroundColor: "rgba(28,26,23,.45)", alignItems: "center", justifyContent: "center", gap: 2 }}>
                  <ActivityIndicator size="small" color={C.card} />
                  <Text style={{ fontFamily: F.mono, fontSize: 9, color: C.card }}>올리는 중</Text>
                </View>
              </View>
            ))}
            {canAddPhotos && room > 0 && (
              <Pressable onPress={addAlbum} accessibilityLabel="앨범에서 사진 더하기"
                style={{ width: 54, height: 54, borderRadius: 14, borderWidth: 1.5, borderStyle: "dashed", borderColor: "#cdc6b8", alignItems: "center", justifyContent: "center" }}>
                <Text style={{ fontFamily: F.sansMd, fontSize: 11, color: C.muted }}>+ 앨범</Text>
              </Pressable>
            )}
            {idx !== cover && canEdit && (
              <Pressable onPress={makeCover} disabled={busy} style={{ minHeight: 44, borderRadius: 14, borderWidth: 1, borderStyle: "dashed", borderColor: C.line, paddingHorizontal: 13, justifyContent: "center" }}>
                <Text style={{ fontFamily: F.sans, fontSize: 11.5, color: C.muted }}>대표사진으로</Text>
              </Pressable>
            )}
          </ScrollView>
        )}

        <View style={{ paddingHorizontal: 22, paddingTop: 20 }}>
          <Eyebrow>NO. {String(record.id).padStart(3, "0")}</Eyebrow>
          <Text style={{ marginTop: 8, fontFamily: F.serif, fontSize: 25, color: C.ink }}>{record.name}</Text>
          <Text style={{ marginTop: 7, fontFamily: F.sans, fontSize: 12, color: C.faint }}>
            {[record.category, record.region].filter(Boolean).join(" · ")}
          </Text>
          {copiedFrom && (
            <View style={{ marginTop: 12, alignSelf: "flex-start", flexDirection: "row", alignItems: "center", gap: 7, borderRadius: 12, backgroundColor: "#e3e9ec", paddingVertical: 5, paddingLeft: 5, paddingRight: 10 }}>
              <Pair me={me} partner={copyPartner} size={18} overlap={6} ring="#e3e9ec" />
              <Text style={{ fontFamily: F.sans, fontSize: 11.5, color: PARTNER_COLOR }}>연인 기록에서 가져옴</Text>
            </View>
          )}
          <View style={{ marginTop: 14, flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
            <MobileStars rating={record.rating} size={15} />
            <Text style={{ fontFamily: F.mono, fontSize: 12, color: C.muted }}>{record.rating?.toFixed(1) ?? "—"}</Text>
            <View style={{ width: 1, height: 13, backgroundColor: "#ded8cb" }} />
            <Pigs row={record} w={18} h={17} />
          </View>

          <View style={{ marginTop: 22, paddingTop: 18, borderTopWidth: 1, borderTopColor: "#ded8cb", gap: 18 }}>
            <Field label="방문">
              {isCouple && record.verified && record.verified_at && record.visited_at ? (
                <View style={{ flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 6 }}>
                  <Text style={{ fontFamily: F.mono, fontSize: 13, color: C.ink }}>{dottedWithDay(record.visited_at)} {verifiedTime(record.verified_at)}</Text>
                  <Text style={{ fontFamily: F.sans, fontSize: 12.5, color: C.muted }}>· {iGa(verifier ?? "상대")} 인증</Text>
                  <VerifiedMark size={14} />
                </View>
              ) : record.verified && record.verified_at ? (
                <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                  <Text style={{ fontFamily: F.mono, fontSize: 13.5, color: C.ink }}>{verifiedDateTime(record.verified_at)}</Text>
                  <VerifiedMark size={14} />
                </View>
              ) : (
                <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                  <Text style={{ fontFamily: F.sans, fontSize: 13.5, color: C.ink }}>{dottedDate(record.visited_at) || "날짜를 쓰지 않았습니다"}</Text>
                  <Text style={{ borderRadius: 10, borderWidth: 1, borderColor: C.line, paddingHorizontal: 8, paddingVertical: 2, fontFamily: F.sans, fontSize: 10.5, color: C.faint, overflow: "hidden" }}>인증 없음</Text>
                </View>
              )}
            </Field>
            <Field label="메뉴">
              {record.menus.some((m) => m.name.trim()) ? (
                <View style={{ gap: 5 }}>
                  {record.menus.filter((m) => m.name.trim()).map((m, i) => (
                    <View key={i} style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                      {m.vote === 1 && <ThumbIcon size={13} stroke={C.brick} />}
                      {m.vote === -1 && <ThumbIcon size={13} stroke={C.faint} down />}
                      <Text style={{ fontFamily: F.sans, fontSize: 13.5, color: C.ink }}>{m.name}</Text>
                    </View>
                  ))}
                </View>
              ) : (
                <Text style={{ fontFamily: F.sans, fontSize: 13.5, lineHeight: 22, color: C.ink }}>{record.menu || "아직 쓰지 않았습니다"}</Text>
              )}
            </Field>
            {isCouple ? (
              <CoupleNotes
                record={record} notes={notes} me={me} partner={partner} readOnly={readOnly}
                keep={canKeep ? { kept: !!copy, onPress: () => (copy ? openCopy(copy.id) : setKeeping(true)) } : null}
              />
            ) : (
              <Field label="메모">
                <Text style={{ fontFamily: F.serif, fontSize: 16, lineHeight: 31, color: "#2e2a25" }}>{record.review || "메모가 비어 있습니다."}</Text>
              </Field>
            )}
            <Field label="주소">
              <Text style={{ fontFamily: F.sans, fontSize: 12.5, color: "#4d4842" }}>{record.address ?? record.region ?? "주소 미등록"}</Text>
            </Field>
          </View>

          {record.keywords.length > 0 && (
            <View style={{ marginTop: 16, flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
              {record.keywords.map((k) => (
                <Text key={k} style={{ borderRadius: 14, borderWidth: 1, borderColor: "#e2dccf", paddingHorizontal: 10, paddingVertical: 4, fontFamily: F.sans, fontSize: 11, color: C.muted, overflow: "hidden" }}>{k}</Text>
              ))}
            </View>
          )}

          {record.verified && (
            <View style={{ marginTop: 20, borderRadius: 18, borderWidth: 1, borderColor: "#e4dfd3", backgroundColor: C.card, paddingHorizontal: 16, paddingVertical: 14 }}>
              <Text style={{ fontFamily: F.sans, fontSize: 11.5, lineHeight: 20, color: C.muted }}>{verifyNote}</Text>
            </View>
          )}

          {record.from_wish && (
            <View style={{ marginTop: 20, borderRadius: 20, borderWidth: 1, borderColor: "#e0c3b1", backgroundColor: "#f9f0e9", paddingHorizontal: 16, paddingVertical: 15 }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                <BookmarkIcon size={17} fill={C.brick} stroke={C.brick} />
                <Text style={{ fontFamily: F.mono, fontSize: 9.5, letterSpacing: 1.8, color: C.brick }}>WISH MET</Text>
              </View>
              <Text style={{ marginTop: 8, fontFamily: F.serif, fontSize: 14, lineHeight: 25, color: "#2e2a25" }}>
                {record.from_wish.source_kind
                  ? record.from_wish.days === 0
                    ? `${SOURCE_LABEL[record.from_wish.source_kind]}에서 보고 바로 다녀오셨네요.`
                    : `${SOURCE_LABEL[record.from_wish.source_kind]}에서 본 지 ${record.from_wish.days}일 만에 다녀오셨네요.`
                  : record.from_wish.days === 0
                  ? `${dottedDate(record.from_wish.saved_at)}에 담아두고 바로 다녀오셨네요.`
                  : `${dottedDate(record.from_wish.saved_at)}에 담아둔 곳입니다. ${record.from_wish.days}일 만에 드디어 다녀오셨네요.`}
              </Text>
            </View>
          )}

          {!!error && <Text style={{ marginTop: 16, fontFamily: F.sans, fontSize: 12, color: "#a8412a" }}>{error}</Text>}

          {!readOnly && <View style={{ marginTop: 20, gap: 8 }}>
            <Button label="여기 또 왔어요 · 기록 추가" onPress={revisit} />
            <Pressable onPress={addWish} style={{ minHeight: 50, borderRadius: 18, borderWidth: 1, borderColor: "#ded8cb", flexDirection: "row", gap: 8, alignItems: "center", justifyContent: "center" }}>
              <BookmarkIcon size={14} fill={C.brick} stroke={C.brick} />
              <Text style={{ fontFamily: F.sans, fontSize: 13.5, color: C.ink }}>또 갈 예정으로 담기</Text>
            </Pressable>
            {canEdit && <View style={{ flexDirection: "row", gap: 8 }}>
              <Button style={{ flex: 1, borderColor: "#e4dfd3" }} kind="line" label="기록 수정" onPress={() => router.push({ pathname: "/record/edit", params: { id: String(record.id) } })} />
              <Pressable onPress={remove} disabled={busy} style={{ minHeight: 50, borderRadius: 18, borderWidth: 1, borderColor: "#e4dfd3", paddingHorizontal: 18, justifyContent: "center", opacity: busy ? 0.5 : 1 }}>
                <Text style={{ fontFamily: F.sans, fontSize: 12.5, color: C.faint }}>지우기</Text>
              </Pressable>
            </View>}
          </View>}
        </View>
      </ScrollView>
      <View style={{ position: "absolute", left: 16, top: insets.top + 8, backgroundColor: "rgba(251,250,246,.92)", borderRadius: 22 }}>
        <BackButton />
      </View>
      {!record.pending && (
        <>
          <Pressable
            onPress={() => setSharing(true)}
            accessibilityLabel="기록 공유"
            style={[
              { position: "absolute", right: 16, top: insets.top + 8, width: 44, height: 44, borderRadius: 22, backgroundColor: "rgba(251,250,246,.92)", alignItems: "center", justifyContent: "center" },
              Platform.select({ ios: { shadowColor: C.ink, shadowOpacity: 0.14, shadowRadius: 4, shadowOffset: { width: 0, height: 2 } }, default: { elevation: 3 } }),
            ]}
          >
            <ShareIcon size={18} stroke={C.ink} />
          </Pressable>
          <ShareSheet record={record} visible={sharing} onClose={() => setSharing(false)} />
        </>
      )}
      {canKeep && (
        <KeepDialog
          visible={keeping}
          record={record}
          partner={partner}
          onClose={() => setKeeping(false)}
          onDone={(copyId) => { setKeeping(false); setKeptId(copyId); }}
        />
      )}
      {sheetIdx != null && photos[sheetIdx] && (() => {
        const i = sheetIdx;
        const locked = photos[i] === verifiedShot;
        const isCover = i === cover;
        const rows: { label: string; sub: string; disabled?: boolean; danger?: boolean; onPress: () => void }[] = [
          isCover
            ? { label: "대표 사진", sub: "지금 대표 사진이에요", disabled: true, onPress: () => {} }
            : { label: locked ? "대표 사진" : "대표 사진으로", sub: "상세 맨 위와 목록에 보여요", onPress: () => setCoverAt(i) },
          locked
            ? { label: "사진 지우기", sub: "인증 사진은 방문의 근거라 지울 수 없어요", disabled: true, onPress: () => {} }
            : { label: "사진 지우기", sub: "기록에서 이 사진을 빼요", danger: true, onPress: () => deleteAt(i) },
        ];
        return (
          <BottomSheetModal visible onClose={() => setSheetIdx(null)}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 12, paddingBottom: 14 }}>
              <View style={{ width: 54, height: 54, borderRadius: 14, overflow: "hidden", backgroundColor: "#eae5da" }}>
                <SignedImage uri={photos[i]} style={{ width: "100%", height: "100%" }} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontFamily: F.serif, fontSize: 17, color: C.ink }}>{locked ? "인증 사진" : `사진 ${i + 1}`}</Text>
                <Text style={{ marginTop: 2, fontFamily: F.sans, fontSize: 11.5, color: C.faint }}>
                  {locked && record.verified_at ? `${verifiedDateTime(record.verified_at)} · 가게 앞에서 촬영` : "앨범에서 더한 사진"}
                </Text>
              </View>
            </View>
            {rows.map((r) => (
              <Pressable key={r.label} onPress={r.onPress} disabled={r.disabled} style={{ paddingVertical: 13, borderTopWidth: 1, borderTopColor: "#e6e0d3" }}>
                <Text style={{ fontFamily: F.sansMd, fontSize: 14, color: r.disabled ? "#b3ada1" : r.danger ? "#a8412a" : C.ink }}>{r.label}</Text>
                <Text style={{ marginTop: 2, fontFamily: F.sans, fontSize: 11.5, color: r.disabled ? "#b3ada1" : C.faint }}>{r.sub}</Text>
              </Pressable>
            ))}
          </BottomSheetModal>
        );
      })()}
      {keptId != null && (
        <View style={{ position: "absolute", left: 24, right: 24, bottom: insets.bottom + 16, borderRadius: 16, backgroundColor: C.ink, paddingVertical: 13, paddingHorizontal: 16, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
          <Text style={{ fontFamily: F.sans, fontSize: 12.5, color: C.card }}>개인 기록에 남겼어요</Text>
          <Pressable onPress={() => openCopy(keptId)} hitSlop={10}>
            <Text style={{ fontFamily: F.sans, fontSize: 12, color: "#e7b79f" }}>개인 기록 열기</Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}
