import { useQueryClient } from "@tanstack/react-query";
import * as Haptics from "expo-haptics";
import { useCallback, useRef, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { BottomSheetModal } from "@/components/ui";
import { useActiveBook } from "@/data/books";
import { Pair } from "@/features/couple/Avatars";
import { waGwa } from "@/lib/josa";
import { C, F } from "@/theme";
import { addWishFrom, type WishSeed } from "./api";
import { Avatar, K } from "./ui";

export type WishResult = "added" | "exists";

/**
 * 커뮤니티 「위시에 담기」 — 열린 연인 기록장이 있으면 「내 위시리스트 / 우리 위시리스트」를 한 번 묻고 그쪽에 담습니다.
 * 없으면 바로 개인 기록장에. add 는 고르지 않고 닫으면 null 을 돌려줍니다. sheet 를 화면 어딘가에 함께 그려 주세요.
 */
export function useAddWish() {
  const qc = useQueryClient();
  const { books, me } = useActiveBook();
  const couple = books?.couple && !books.couple.closedAt ? books.couple : null;
  const personalId = books?.personal?.id ?? null;
  const [asking, setAsking] = useState<WishSeed | null>(null);
  const resolver = useRef<((bookId: string | null | undefined) => void) | null>(null);

  /** 연인 기록장이 있으면 어느 쪽에 담을지 묻습니다. 고르지 않고 닫으면 undefined. */
  const pickTarget = useCallback(
    async (seed: WishSeed): Promise<string | null | undefined> => {
      if (!couple) return personalId;
      return new Promise<string | null | undefined>((resolve) => {
        resolver.current = resolve;
        setAsking(seed);
      });
    },
    [couple, personalId],
  );

  const add = useCallback(
    async (seed: WishSeed): Promise<WishResult | null> => {
      const target = await pickTarget(seed);
      if (target === undefined) return null;
      const res = await addWishFrom(qc, seed, target);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      return res;
    },
    [qc, pickTarget],
  );

  /** 여러 곳을 한 번에(코스 통째로 담기) — 어느 위시리스트인지는 한 번만 묻습니다. 새로 담은 수를 돌려줍니다. */
  const addMany = useCallback(
    async (seeds: WishSeed[]): Promise<number | null> => {
      if (!seeds.length) return 0;
      const target = await pickTarget({ ...seeds[0], name: `${seeds[0].name} 외 ${seeds.length - 1}곳` });
      if (target === undefined) return null;
      let added = 0;
      for (const seed of seeds) if ((await addWishFrom(qc, seed, target)) === "added") added += 1;
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      return added;
    },
    [qc, pickTarget],
  );

  const finish = (bookId: string | null | undefined) => {
    setAsking(null);
    resolver.current?.(bookId);
    resolver.current = null;
  };

  const partner = couple?.members.find((m) => m.userId !== me?.userId) ?? null;
  const meInCouple = couple?.members.find((m) => m.userId === me?.userId) ?? me;

  const row = (label: string, sub: string, face: React.ReactNode, onPress: () => void, first?: boolean) => (
    <Pressable
      onPress={() => { Haptics.selectionAsync(); onPress(); }}
      style={{ minHeight: 60, flexDirection: "row", alignItems: "center", gap: 12, borderTopWidth: first ? 0 : 1, borderTopColor: "#efeae0" }}
    >
      <View style={{ width: 52, alignItems: "center" }}>{face}</View>
      <View style={{ flex: 1 }}>
        <Text style={{ fontFamily: F.sansMd, fontSize: 14, color: C.ink }}>{label}</Text>
        <Text style={{ marginTop: 2, fontFamily: F.sans, fontSize: 11.5, color: C.faint }}>{sub}</Text>
      </View>
      <Text style={{ fontFamily: F.sans, fontSize: 16, color: K.inactive }}>›</Text>
    </Pressable>
  );

  const sheet = (
    <BottomSheetModal visible={!!asking} onClose={() => finish(undefined)}>
      <Text style={{ fontFamily: F.serif, fontSize: 19, color: C.ink }}>어느 위시리스트에 담을까요?</Text>
      {!!asking && <Text style={{ marginTop: 4, fontFamily: F.sans, fontSize: 11.5, color: C.faint }}>{asking.name}</Text>}
      <View style={{ marginTop: 12 }}>
        {row("내 위시리스트", "개인 기록장", <Avatar name={me?.nickname ?? "나"} url={me?.avatarUrl} size={30} seed={me?.userId} />, () => finish(personalId), true)}
        {couple && row("우리 위시리스트", `${waGwa(partner?.nickname ?? "연인")} 함께 쓰는 연인 기록장`, <Pair me={meInCouple} partner={partner} size={26} overlap={8} ring={C.paper} />, () => finish(couple.id))}
      </View>
      <Pressable onPress={() => finish(undefined)} style={{ marginTop: 10, minHeight: 46, borderRadius: 16, borderWidth: 1, borderColor: "#ded8cb", alignItems: "center", justifyContent: "center" }}>
        <Text style={{ fontFamily: F.sans, fontSize: 13, color: C.muted }}>취소</Text>
      </Pressable>
    </BottomSheetModal>
  );

  return { add, addMany, sheet };
}
