import { useRouter } from "expo-router";
import { useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Character } from "@/components/Character";
import { ScreenHead } from "@/components/ui";
import { useAccount, useOwnedCharacters, useSetCharacter, useTickets } from "@/data/profile";
import { CHARACTERS, DEFAULT_CHARACTER, RARITY, RARITY_ORDER, VERIFIED_PER_TICKET, type CharacterId } from "@/lib/characters";
import { C, F } from "@/theme";

/** 캐릭터 도감 — 등급별(전설 → 레어 → 보통)로 가진 것과 아직 없는 실루엣을 보여줍니다. 가진 칸을 탭하면 대표로. */
export default function CharactersRoute() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { data: account } = useAccount();
  const { data: owned = [] } = useOwnedCharacters();
  const { tickets, verified } = useTickets();
  const setCharacter = useSetCharacter();
  const [error, setError] = useState("");

  const countOf = (id: CharacterId) => owned.find((o) => o.id === id)?.count ?? 0;

  async function pick(id: CharacterId) {
    if (!account || id === account.characterId) return;
    setError("");
    try {
      await setCharacter(account.userId, id);
    } catch (e) {
      setError(e instanceof Error ? e.message : "대표 캐릭터를 바꾸지 못했습니다");
    }
  }

  return (
    <View style={{ flex: 1, backgroundColor: C.paper }}>
      <ScreenHead
        eyebrow="CHARACTERS"
        title="캐릭터 도감"
        right={<Text style={{ marginRight: 8, fontFamily: F.mono, fontSize: 11, color: C.faint }}>{owned.length} / {CHARACTERS.length}</Text>}
      />
      <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 10, paddingBottom: insets.bottom + 40 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 10, borderRadius: 16, borderWidth: 1, borderColor: "#e0c3b1", backgroundColor: "#f9f0e9", paddingVertical: 10, paddingLeft: 14, paddingRight: 10 }}>
          <Text style={{ flex: 1, fontFamily: F.sans, fontSize: 12, color: C.ink }}>
            뽑기권 {tickets}장 · 인증 기록 {verified % VERIFIED_PER_TICKET} / {VERIFIED_PER_TICKET}
          </Text>
          <Pressable onPress={() => router.push("/draw")} disabled={tickets < 1} style={{ minHeight: 34, borderRadius: 12, backgroundColor: C.ink, paddingHorizontal: 14, justifyContent: "center", opacity: tickets < 1 ? 0.4 : 1 }}>
            <Text style={{ fontFamily: F.sansMd, fontSize: 12, color: C.card }}>뽑기</Text>
          </Pressable>
        </View>

        {!!error && <Text style={{ marginTop: 10, fontFamily: F.sans, fontSize: 11.5, color: C.brick }}>{error}</Text>}

        {RARITY_ORDER.map((rarity) => {
          const tone = RARITY[rarity];
          return (
            <View key={rarity} style={{ marginTop: 22 }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                <Text style={{ fontFamily: F.mono, fontSize: 10, letterSpacing: 1.8, color: tone.ink }}>{tone.name}</Text>
                <View style={{ flex: 1, height: 1, backgroundColor: "#e2ddd2" }} />
              </View>
              <View style={{ marginTop: 10, flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                {CHARACTERS.filter((c) => c.rarity === rarity).map((c) => {
                  const count = countOf(c.id);
                  const have = count > 0;
                  const on = account?.characterId === c.id;
                  const countLine = !have
                    ? null
                    : c.id === DEFAULT_CHARACTER && count === 1
                      ? "×1 · 기본"
                      : count === 2
                        ? "×2 · 1개 더 → 뽑기권"
                        : `×${count}`;
                  return (
                    <Pressable
                      key={c.id}
                      onPress={() => have && pick(c.id)}
                      disabled={!have}
                      accessibilityLabel={have ? `${c.name} 대표로` : "아직 없는 캐릭터"}
                      style={{
                        width: "31.6%", alignItems: "center", borderRadius: 16, paddingTop: 8, paddingHorizontal: 4, paddingBottom: 9,
                        borderWidth: on ? 1.5 : 1, borderColor: on ? C.brick : "#e2ddd2", backgroundColor: have ? C.card : "#f1ede4",
                      }}
                    >
                      {on && (
                        <Text style={{ position: "absolute", top: 6, left: 6, borderRadius: 6, backgroundColor: C.brick, paddingHorizontal: 5, paddingVertical: 1, fontFamily: F.sansMd, fontSize: 9, color: C.card, overflow: "hidden", zIndex: 1 }}>대표</Text>
                      )}
                      <Character id={c.id} size={64} locked={!have} />
                      <Text numberOfLines={1} style={{ marginTop: 4, fontFamily: F.sans, fontSize: 11.5, color: have ? C.ink : "#a29a8c" }}>{have ? c.name : "???"}</Text>
                      {countLine && (
                        <Text style={{ marginTop: 2, fontFamily: F.mono, fontSize: 9.5, color: count === 2 ? C.brick : C.faint }}>{countLine}</Text>
                      )}
                    </Pressable>
                  );
                })}
              </View>
            </View>
          );
        })}
      </ScrollView>
    </View>
  );
}
