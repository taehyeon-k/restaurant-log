import { Text, View } from "react-native";
import { sourceIcon, type SourceKind } from "@/lib/sourceLink";
import { C, F } from "@/theme";
import { DocIcon } from "./icons";

/** 출처 네모(검정) — 영상은 ▶, 블로그 · 인스타 게시물 · 링크는 문서 아이콘. 링크 카드 36 · 출처 띠 26. */
export function SourceIcon({ kind, size = 36 }: { kind: SourceKind | null | undefined; size?: number }) {
  return (
    <View style={{ width: size, height: size, borderRadius: Math.round(size * 0.28), backgroundColor: C.ink, alignItems: "center", justifyContent: "center" }}>
      {sourceIcon(kind) === "play"
        ? <Text style={{ fontFamily: F.sansMd, fontSize: Math.max(10, Math.round(size * 0.36)), color: "#fff" }}>▶</Text>
        : <DocIcon size={Math.round(size * 0.55)} />}
    </View>
  );
}
