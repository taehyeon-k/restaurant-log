import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { useState } from "react";
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { BackButton, Button, Eyebrow, fieldStyle } from "@/components/ui";
import { cleanCode, joinBook, peekInvite, useActiveBook, type InvitePeek } from "@/data/books";
import { Pair } from "@/features/couple/Avatars";
import { dayCount } from "@/lib/anniversary";
import { dottedDate } from "@/lib/types";
import { C, F } from "@/theme";

/**
 * 받은 쪽(HANDOFF-couple §3-4, 시안 1e) — 코드를 넣으면 누가 언제부터인지 보여주고,
 * 「함께 쓰기 시작」으로 그 기록장에 들어갑니다. 만료·사용됨·이미 2명·이미 다른 연인 기록장은 서버가 막습니다.
 */
export default function CoupleJoin() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const qc = useQueryClient();
  const { me } = useActiveBook();
  const [code, setCode] = useState("");
  const [peek, setPeek] = useState<InvitePeek | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const ready = cleanCode(code).length === 6;

  async function check() {
    if (!ready || busy) return;
    setBusy(true);
    setError("");
    try {
      setPeek(await peekInvite(code));
    } catch (e) {
      setError(e instanceof Error ? e.message : "코드를 확인하지 못했어요");
    } finally {
      setBusy(false);
    }
  }

  async function join() {
    if (!peek || busy) return;
    setBusy(true);
    setError("");
    try {
      await joinBook(qc, peek.code);
      router.dismissAll();
    } catch (e) {
      setError(e instanceof Error ? e.message : "함께 쓰기를 시작하지 못했어요");
      setBusy(false);
    }
  }

  const inviterName = peek?.inviter.nickname?.trim() || "상대";

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: C.paper }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <View style={{ paddingTop: insets.top + 6, paddingHorizontal: 14 }}>
        <BackButton />
      </View>
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingHorizontal: 22, paddingTop: 6, paddingBottom: insets.bottom + 40 }}>
        <Eyebrow wide>COUPLE BOOK</Eyebrow>

        {!peek ? (
          <>
            <Text style={{ marginTop: 8, fontFamily: F.serif, fontSize: 26, color: C.ink }}>초대 코드를 넣어 주세요</Text>
            <Text style={{ marginTop: 6, fontFamily: F.sans, fontSize: 12, lineHeight: 19, color: C.faint }}>상대에게 받은 6자리 코드예요.</Text>
            <TextInput
              value={code}
              onChangeText={(v) => { setCode(v.toUpperCase()); setError(""); }}
              placeholder="4K7Q·2M"
              placeholderTextColor="#c4bcae"
              autoCapitalize="characters"
              autoCorrect={false}
              autoFocus
              maxLength={8}
              onSubmitEditing={check}
              style={[fieldStyle, { marginTop: 20, minHeight: 64, textAlign: "center", fontFamily: F.mono, fontSize: 26, letterSpacing: 4 }]}
            />
            {!!error && <Text style={{ marginTop: 12, fontFamily: F.sans, fontSize: 12, color: "#a8412a" }}>{error}</Text>}
            <Button style={{ marginTop: 18 }} label={busy ? "확인하는 중…" : "확인"} disabled={!ready || busy} onPress={check} />
          </>
        ) : (
          <>
            <View style={{ marginTop: 34, alignItems: "center" }}>
              <Pair
                me={me}
                partner={{ userId: peek.inviter.id, nickname: inviterName, avatarUrl: null }}
                size={64}
                overlap={16}
              />
              <Text style={{ marginTop: 20, textAlign: "center", fontFamily: F.serif, fontSize: 21, lineHeight: 31, color: C.ink }}>
                {inviterName}님이 함께 쓰자고 했어요
              </Text>
              <Text style={{ marginTop: 8, fontFamily: F.mono, fontSize: 12.5, color: C.brick }}>
                {dottedDate(peek.started_on)}부터 · D+{dayCount(peek.started_on)}
              </Text>
              <Text style={{ marginTop: 16, textAlign: "center", fontFamily: F.sans, fontSize: 11.5, lineHeight: 18, color: C.faint }}>
                연인 기록장은 개인 기록과 따로 저장돼요.{"\n"}내 개인 기록은 상대에게 보이지 않아요.
              </Text>
            </View>
            {!!error && <Text style={{ marginTop: 14, textAlign: "center", fontFamily: F.sans, fontSize: 12, color: "#a8412a" }}>{error}</Text>}
            <Button style={{ marginTop: 26 }} kind="brick" label={busy ? "시작하는 중…" : "함께 쓰기 시작"} disabled={busy} onPress={join} />
            <Pressable onPress={() => router.back()} disabled={busy} style={{ marginTop: 10, minHeight: 46, alignItems: "center", justifyContent: "center" }}>
              <Text style={{ fontFamily: F.sans, fontSize: 13, color: C.faint }}>거절하기</Text>
            </Pressable>
          </>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
