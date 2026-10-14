import { NaverMapMarkerOverlay } from "@mj-studio/react-native-naver-map";
import { useQueryClient } from "@tanstack/react-query";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import { memo, useMemo, useState } from "react";
import { FlatList, Pressable, ScrollView, Text, View } from "react-native";
import Svg, { Circle } from "react-native-svg";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AddPersonIcon, BellLineIcon } from "@/components/icons";
import { PaperMap } from "@/components/PaperMap";
import { useAppState } from "@/data/store";
import { addWishFrom, toggleCheer, useFriends, useRecordSocial, useSharedRecords, type PublicProfile, type SharedRecord } from "@/features/community/api";
import CommentsSheet from "@/features/community/Comments";
import { Avatar, CommunityHeader, K, metaLine, PhotoOrStripes, RoundButton, Segmented, shortAddr, timeAgo, TitleBlock, VerifiedChip } from "@/features/community/ui";
import { coverPhoto } from "@/lib/types";
import { C, F, SHADOW, TAB_BAR_H } from "@/theme";

type View_ = "feed" | "map";

/** 친구 — 커뮤니티 첫 화면(핸드오프 §5 · 2a). 친구가 「친구에게」 이상으로 공개한 기록이 최신순으로. */
export default function FriendsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { communitySeenSince } = useAppState();
  const { data: fr } = useFriends();
  const { data: shared = [] } = useSharedRecords();
  const [view, setView] = useState<View_>("feed");
  const [only, setOnly] = useState<string | null>(null);
  const [commentsFor, setCommentsFor] = useState<number | null>(null);

  const friends = fr?.friends ?? [];
  const byId = useMemo(() => new Map(friends.map((f) => [f.id, f])), [friends]);
  const feed = useMemo(() => shared.filter((r) => r.by_friend && byId.has(r.user_id)), [shared, byId]);
  const isNew = (r: SharedRecord) => !communitySeenSince || r.created_at > communitySeenSince;
  const fresh = feed.filter(isNew);
  const freshBy = new Set(fresh.map((r) => r.user_id));
  // 새 기록이 있는 친구를 앞으로.
  const row = [...friends].sort((a, b) => Number(freshBy.has(b.id)) - Number(freshBy.has(a.id)));
  const shown = only ? feed.filter((r) => r.user_id === only) : feed;

  const right = (
    <>
      <RoundButton label="친구 추가" onPress={() => router.push("/community/people")}><AddPersonIcon /></RoundButton>
      <RoundButton label="알림" dot={(fr?.incoming.length ?? 0) > 0} onPress={() => router.push({ pathname: "/community/people", params: { tab: "requests" } })}>
        <BellLineIcon />
      </RoundButton>
    </>
  );

  const head = (
    <View>
      <TitleBlock
        eyebrow="COMMUNITY · FRIENDS"
        title="친구"
        aside={<Text style={{ fontFamily: F.sans, fontSize: 12, color: C.faint }}>친구 {friends.length}명 · 새 기록 {fresh.length}</Text>}
      />
      <Segmented<View_>
        value={view}
        onChange={setView}
        options={[{ id: "feed", label: "소식" }, { id: "map", label: "친구 지도" }]}
        style={{ marginTop: 14, marginHorizontal: 20 }}
      />
      {view === "feed" && friends.length > 0 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 14 }} contentContainerStyle={{ paddingHorizontal: 20, gap: 14 }}>
          {row.map((f) => (
            <Pressable
              key={f.id}
              onPress={() => { Haptics.selectionAsync(); setOnly((v) => (v === f.id ? null : f.id)); }}
              accessibilityLabel={`${f.nickname} 기록만 보기`}
              accessibilityState={{ selected: only === f.id }}
              style={{ alignItems: "center", gap: 5, opacity: only && only !== f.id ? 0.45 : 1 }}
            >
              <Avatar name={f.nickname} url={f.avatarUrl} size={48} ring={freshBy.has(f.id)} seed={f.id} />
              <Text numberOfLines={1} style={{ maxWidth: 56, fontFamily: F.sans, fontSize: 10.5, color: K.text2 }}>{f.nickname}</Text>
            </Pressable>
          ))}
        </ScrollView>
      )}
    </View>
  );

  if (view === "map") {
    return (
      <View style={{ flex: 1, backgroundColor: C.paper }}>
        <CommunityHeader right={right} />
        {head}
        <FriendMap records={feed} friends={byId} />
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: C.paper }}>
      <CommunityHeader right={right} />
      <FeedList records={shown} friends={byId} header={head} empty={<Empty hasFriends={friends.length > 0} />} onComments={setCommentsFor} bottom={TAB_BAR_H + insets.bottom + 24} />
      <CommentsSheet recordId={commentsFor} onClose={() => setCommentsFor(null)} />
    </View>
  );
}

function Empty({ hasFriends }: { hasFriends: boolean }) {
  const router = useRouter();
  return (
    <View style={{ paddingVertical: 44, paddingHorizontal: 28, alignItems: "center", gap: 14 }}>
      <Text style={{ textAlign: "center", fontFamily: F.sans, fontSize: 12.5, lineHeight: 21, color: C.faint }}>
        {hasFriends ? "친구가 아직 공유한 기록이 없습니다." : "아직 친구가 없습니다.\n닉네임으로 찾거나 초대 링크를 보내 보세요."}
      </Text>
      {!hasFriends && (
        <Pressable onPress={() => router.push("/community/people")} style={{ minHeight: 40, borderRadius: 20, backgroundColor: C.ink, paddingHorizontal: 18, justifyContent: "center" }}>
          <Text style={{ fontFamily: F.sansMd, fontSize: 12.5, color: C.card }}>친구 찾기</Text>
        </Pressable>
      )}
    </View>
  );
}

function FeedList({ records, friends, header, empty, onComments, bottom }: {
  records: SharedRecord[]; friends: Map<string, PublicProfile>; header: React.ReactElement; empty: React.ReactElement; onComments: (id: number) => void; bottom: number;
}) {
  const { data: social } = useRecordSocial(records.map((r) => r.id));
  return (
    <FlatList
      data={records}
      keyExtractor={(r) => String(r.id)}
      ListHeaderComponent={<View style={{ marginBottom: 14 }}>{header}</View>}
      ListEmptyComponent={empty}
      ItemSeparatorComponent={() => <View style={{ height: 12 }} />}
      contentContainerStyle={{ paddingBottom: bottom }}
      renderItem={({ item }) => (
        <View style={{ paddingHorizontal: 16 }}>
          <FeedCard r={item} who={friends.get(item.user_id)} social={social?.get(item.id)} onComments={() => onComments(item.id)} />
        </View>
      )}
    />
  );
}

/** 소식 카드 — 인증 기록은 사진과 함께 크게, 인증 없는 기록은 한 줄로 접습니다. */
const FeedCard = memo(function FeedCard({ r, who, social, onComments }: {
  r: SharedRecord; who?: PublicProfile; social?: { cheers: number; mine: boolean; comments: number }; onComments: () => void;
}) {
  const qc = useQueryClient();
  const [wish, setWish] = useState<"idle" | "added" | "exists">("idle");
  const name = who?.nickname ?? "";
  const meta = metaLine(r.category, shortAddr(r.address, r.region));

  async function addWish() {
    try {
      setWish(await addWishFrom(qc, { name: r.name, where_text: r.address ?? r.region, category: r.category, lat: r.lat, lng: r.lng, source: `${name}의 기록` }));
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch {
      setWish("idle");
    }
  }
  const wishLabel = wish === "added" ? "✓ 위시에 담음" : wish === "exists" ? "이미 담아둔 곳" : "+ 위시에 담기";

  if (!r.verified) {
    return (
      <View style={{ borderRadius: 20, borderWidth: 1, borderColor: C.lineSoft, backgroundColor: C.card, paddingVertical: 11, paddingHorizontal: 14, flexDirection: "row", alignItems: "center", gap: 9 }}>
        <Avatar name={name} url={who?.avatarUrl} size={24} seed={r.user_id} />
        <Text numberOfLines={1} style={{ flex: 1, fontFamily: F.sans, fontSize: 12.5, color: K.text2 }}>
          <Text style={{ fontFamily: F.sansMd, color: C.ink }}>{name}</Text> · <Text style={{ fontFamily: F.serif, color: C.ink }}>{r.name}</Text>
          {r.rating != null ? <Text style={{ color: C.brick }}>  ★ {r.rating}</Text> : null}
        </Text>
        <Text style={{ fontFamily: F.mono, fontSize: 10, color: K.inactive }}>{timeAgo(r.created_at)}</Text>
        <Pressable onPress={addWish} disabled={wish !== "idle"} accessibilityLabel="위시에 담기" hitSlop={6}>
          <Text style={{ fontFamily: F.sans, fontSize: 11.5, color: C.brick }}>{wish === "idle" ? "+ 위시" : "✓"}</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={{ borderRadius: 20, borderWidth: 1, borderColor: C.lineSoft, backgroundColor: C.card, padding: 14 }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 9 }}>
        <Avatar name={name} url={who?.avatarUrl} size={30} seed={r.user_id} />
        <Text style={{ fontFamily: F.sansMd, fontSize: 13, color: C.ink }}>{name}</Text>
        <Text style={{ fontFamily: F.mono, fontSize: 10, color: K.inactive }}>{timeAgo(r.created_at)}</Text>
        <View style={{ marginLeft: "auto" }}><VerifiedChip /></View>
      </View>
      <View style={{ marginTop: 12 }}><PhotoOrStripes uri={coverPhoto(r)} height={150} radius={14} label="인증 사진" /></View>
      <View style={{ marginTop: 12, flexDirection: "row", alignItems: "baseline", gap: 8 }}>
        <Text style={{ flexShrink: 1, fontFamily: F.serif, fontSize: 16, color: C.ink }}>{r.name}</Text>
        {r.rating != null && <Text style={{ fontFamily: F.sans, fontSize: 12, color: C.brick }}>★ {r.rating}</Text>}
      </View>
      {!!meta && <Text style={{ marginTop: 3, fontFamily: F.sans, fontSize: 11, color: C.faint }}>{meta}</Text>}
      {!!r.review && <Text numberOfLines={4} style={{ marginTop: 8, fontFamily: F.serif, fontSize: 12.5, lineHeight: 21, color: K.text2 }}>{r.review}</Text>}
      <View style={{ marginTop: 10, flexDirection: "row", alignItems: "center", gap: 14 }}>
        <Pressable onPress={() => { Haptics.selectionAsync(); toggleCheer(qc, r.id, !social?.mine); }} hitSlop={8}>
          <Text style={{ fontFamily: social?.mine ? F.sansMd : F.sans, fontSize: 11.5, color: social?.mine ? C.brick : C.muted }}>공감 {social?.cheers ?? 0}</Text>
        </Pressable>
        <Pressable onPress={onComments} hitSlop={8}>
          <Text style={{ fontFamily: F.sans, fontSize: 11.5, color: C.muted }}>댓글 {social?.comments ?? 0}</Text>
        </Pressable>
        <Pressable
          onPress={addWish}
          disabled={wish !== "idle"}
          style={{ marginLeft: "auto", minHeight: 30, borderRadius: 15, borderWidth: 1, borderColor: K.brickLine, paddingHorizontal: 11, justifyContent: "center", backgroundColor: wish === "idle" ? "transparent" : C.brickSoft }}
        >
          <Text style={{ fontFamily: F.sans, fontSize: 11.5, color: C.brick }}>{wishLabel}</Text>
        </Pressable>
      </View>
    </View>
  );
});

/* ───────────── 친구 지도 ───────────── */

type Spot = { place: string; name: string; lat: number; lng: number; who: string[]; record: SharedRecord };

/** 친구들의 인증 핀을 한 지도에. 여러 친구가 간 곳일수록 핀이 진해집니다. */
function FriendMap({ records, friends }: { records: SharedRecord[]; friends: Map<string, PublicProfile> }) {
  const qc = useQueryClient();
  const insets = useSafeAreaInsets();
  const [picked, setPicked] = useState<Spot | null>(null);
  const [wish, setWish] = useState<"idle" | "added" | "exists">("idle");
  const spots = useMemo(() => {
    const m = new Map<string, Spot>();
    for (const r of records) {
      if (!r.verified || r.lat == null || r.lng == null) continue;
      const s = m.get(r.place);
      if (s) { if (!s.who.includes(r.user_id)) s.who.push(r.user_id); } else m.set(r.place, { place: r.place, name: r.name, lat: r.lat, lng: r.lng, who: [r.user_id], record: r });
    }
    return [...m.values()];
  }, [records]);
  const center = spots[0] ?? { lat: 37.5605, lng: 126.982 };

  return (
    <View style={{ flex: 1, marginTop: 14, overflow: "hidden" }}>
      <PaperMap
        initialCamera={{ latitude: center.lat, longitude: center.lng, zoom: spots.length ? 12.5 : 11 }}
        mapPadding={{ top: 0, bottom: TAB_BAR_H + insets.bottom, left: 20, right: 20 }}
        onTapMap={() => setPicked(null)}
      >
        {spots.map((s) => (
          <FriendPin key={s.place} lat={s.lat} lng={s.lng} n={s.who.length} onTap={() => { Haptics.selectionAsync(); setWish("idle"); setPicked(s); }} />
        ))}
      </PaperMap>
      {spots.length === 0 && (
        <View pointerEvents="none" style={{ position: "absolute", top: 18, left: 20, right: 20, borderRadius: 16, backgroundColor: "rgba(251,250,246,.95)", padding: 12 }}>
          <Text style={{ textAlign: "center", fontFamily: F.sans, fontSize: 12, color: C.faint }}>친구가 공유한 인증 기록이 아직 없습니다.</Text>
        </View>
      )}
      {picked && (
        <View style={[{ position: "absolute", left: 16, right: 16, bottom: TAB_BAR_H + insets.bottom + 14, borderRadius: 20, borderWidth: 1, borderColor: C.lineSoft, backgroundColor: C.card, padding: 14, gap: 4 }, SHADOW.card]}>
          <Text style={{ fontFamily: F.serif, fontSize: 16, color: C.ink }}>{picked.name}</Text>
          <Text style={{ fontFamily: F.sans, fontSize: 11, color: C.faint }}>{metaLine(picked.record.category, shortAddr(picked.record.address, picked.record.region))}</Text>
          <Text style={{ fontFamily: F.sans, fontSize: 11.5, color: C.brick }}>{picked.who.map((id) => friends.get(id)?.nickname).filter(Boolean).join(" · ")} 인증</Text>
          <Pressable
            disabled={wish !== "idle"}
            onPress={async () => setWish(await addWishFrom(qc, { name: picked.name, where_text: picked.record.address, category: picked.record.category, lat: picked.lat, lng: picked.lng, source: `${friends.get(picked.who[0])?.nickname ?? "친구"}의 기록` }))}
            style={{ marginTop: 6, alignSelf: "flex-start", minHeight: 30, borderRadius: 15, borderWidth: 1, borderColor: K.brickLine, paddingHorizontal: 11, justifyContent: "center" }}
          >
            <Text style={{ fontFamily: F.sans, fontSize: 11.5, color: C.brick }}>{wish === "added" ? "✓ 위시에 담음" : wish === "exists" ? "이미 담아둔 곳" : "+ 위시에 담기"}</Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}

const FriendPin = memo(function FriendPin({ lat, lng, n, onTap }: { lat: number; lng: number; n: number; onTap: () => void }) {
  // 한 명 .45 → 넷 이상 1. 숫자가 둘 이상이면 가운데에 적습니다.
  const alpha = Math.min(1, 0.45 + (n - 1) * 0.18);
  const size = n > 1 ? 26 : 20;
  return (
    <NaverMapMarkerOverlay latitude={lat} longitude={lng} width={size + 4} height={size + 4} anchor={{ x: 0.5, y: 0.5 }} onTap={onTap} zIndex={n}>
      <View key={`${n}`} collapsable={false} style={{ width: size + 4, height: size + 4, alignItems: "center", justifyContent: "center" }}>
        <Svg width={size + 4} height={size + 4}>
          <Circle cx={(size + 4) / 2} cy={(size + 4) / 2} r={size / 2} fill={C.brick} fillOpacity={alpha} stroke={C.card} strokeWidth={2} />
        </Svg>
        {n > 1 && <Text style={{ position: "absolute", fontFamily: F.mono, fontSize: 10.5, color: C.card }}>{n}</Text>}
      </View>
    </NaverMapMarkerOverlay>
  );
});
