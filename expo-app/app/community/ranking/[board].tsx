import { useLocalSearchParams, useRouter } from "expo-router";
import { useState } from "react";
import { FlatList, Text, View } from "react-native";
import { Character } from "@/components/Character";
import { useAccount } from "@/data/profile";
import { useFriends, useLeaderboard, type Period, type RankRow, type Scope } from "@/features/community/api";
import { boardMeta, periodLabel, PERIODS, SCOPES } from "@/features/community/boards";
import { Avatar, CommunityHeader, K, MiniSegment, PeriodTabs, TitleBlock, titleName } from "@/features/community/ui";
import { DEFAULT_CHARACTER, isCharacterId } from "@/lib/characters";
import { C, F } from "@/theme";

/** 이만큼까지 펼쳐 보이고, 내가 그 밖이면 아래에 붙여 둡니다. */
const VISIBLE = 30;

/** 랭킹 상세(3c) — 순위 · 얼굴 · 닉네임 + 대표 캐릭터, 그 아래 칭호, 오른쪽에 숫자. */
export default function RankingDetail() {
  const params = useLocalSearchParams<{ board: string; period?: Period; scope?: Scope }>();
  const router = useRouter();
  const board = boardMeta(params.board);
  const [period, setPeriod] = useState<Period>(params.period ?? "month");
  const [scope, setScope] = useState<Scope>(params.scope ?? "friends");
  const { data: account } = useAccount();
  const { data: fr } = useFriends();
  const { data: rows = [], isPending } = useLeaderboard(board.id, period, scope);

  const me = account?.leaderboardOptIn ? account.userId : null;
  const shown = rows.slice(0, VISIBLE);
  const mine = me ? rows.find((r) => r.user_id === me) : undefined;
  const pinMine = mine && !shown.includes(mine);
  const notJoined = (fr?.friends ?? []).filter((f) => !f.leaderboardOptIn).length;
  const sub = `${board.perPeriod ? `${periodLabel(period)} ` : ""}${board.rule} · 인증된 방문만 셉니다`;

  const row = (r: RankRow, pinned = false) => {
    const isMe = r.user_id === me;
    const title = titleName(r.title_label_id);
    return (
      <View
        key={`${r.user_id}${pinned ? "-pin" : ""}`}
        style={{
          flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 10, paddingHorizontal: 8,
          borderBottomWidth: 1, borderBottomColor: C.lineSoft, ...(isMe ? { backgroundColor: C.brickSoft, borderRadius: 12 } : null),
        }}
      >
        <Text style={{ width: 18, fontFamily: F.mono, fontSize: 13, color: r.rank <= 3 ? C.brick : C.faint }}>{r.rank}</Text>
        <Avatar name={r.nickname} url={r.avatar_url} size={34} seed={r.user_id} />
        <View style={{ flex: 1, minWidth: 0, gap: 1 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 5 }}>
            <Text numberOfLines={1} style={{ flexShrink: 1, fontFamily: F.sansMd, fontSize: 13.5, color: C.ink }}>{isMe ? `${r.nickname} · 나` : r.nickname}</Text>
            <Character id={isCharacterId(r.character_id) ? r.character_id : DEFAULT_CHARACTER} size={22} />
          </View>
          <Text numberOfLines={1} style={{ fontFamily: F.sans, fontSize: 10.5, color: C.faint }}>{title ?? "칭호 없음"}</Text>
        </View>
        <View style={{ flexDirection: "row", alignItems: "baseline", gap: 3 }}>
          <Text style={{ fontFamily: F.serif, fontSize: 18, color: C.ink }}>{r.value}</Text>
          <Text style={{ fontFamily: F.mono, fontSize: 9.5, color: K.inactive }}>{board.unit}</Text>
        </View>
      </View>
    );
  };

  return (
    <View style={{ flex: 1, backgroundColor: C.paper }}>
      <CommunityHeader back={{ label: "랭킹", onPress: () => router.back() }} right={<MiniSegment value={scope} options={SCOPES} onChange={setScope} />} />
      <FlatList
        data={shown}
        keyExtractor={(r) => r.user_id}
        renderItem={({ item }) => row(item)}
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 16 }}
        ListHeaderComponent={
          <View style={{ marginHorizontal: -20, marginBottom: 8 }}>
            <TitleBlock eyebrow={`RANKING · ${board.en}`} title={board.name} sub={sub} />
            {board.perPeriod && <View style={{ marginTop: 14, paddingHorizontal: 20 }}><PeriodTabs value={period} options={PERIODS} onChange={setPeriod} /></View>}
          </View>
        }
        ListEmptyComponent={isPending ? null : <Text style={{ paddingVertical: 36, textAlign: "center", fontFamily: F.sans, fontSize: 12.5, color: C.faint }}>아직 이 랭킹에 오른 사람이 없습니다.</Text>}
        ListFooterComponent={
          <View>
            {!me && <Text style={{ marginTop: 14, fontFamily: F.sans, fontSize: 11.5, color: K.inactive }}>구경 중이라 내 자리는 비어 있습니다</Text>}
            {scope === "friends" && notJoined > 0 && (
              <Text style={{ marginTop: 14, fontFamily: F.sans, fontSize: 11.5, color: K.inactive }}>참여하지 않은 친구 {notJoined}명은 이 목록에 없습니다</Text>
            )}
          </View>
        }
      />
      {pinMine && (
        <View style={{ paddingHorizontal: 20, paddingTop: 6, paddingBottom: 8, borderTopWidth: 1, borderTopColor: C.lineSoft, backgroundColor: C.paper }}>
          {row(mine!, true)}
        </View>
      )}
    </View>
  );
}
