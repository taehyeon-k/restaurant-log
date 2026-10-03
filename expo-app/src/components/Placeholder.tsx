import { StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { C, F } from "@/theme";

/** 핸드오프 §10 ③ — 아직 옮기지 않은 화면. 웹의 해당 컴포넌트를 보고 옮깁니다. */
export default function Placeholder({ title, from }: { title: string; from: string }) {
  const insets = useSafeAreaInsets();
  return (
    <View style={[s.root, { paddingTop: insets.top + 24 }]}>
      <Text style={s.title}>{title}</Text>
      <Text style={s.note}>원본: {from}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.paper, paddingHorizontal: 20 },
  title: { fontFamily: F.serif, fontSize: 27, color: C.ink },
  note: { marginTop: 10, fontFamily: F.mono, fontSize: 11, color: C.faint, letterSpacing: 1 },
});
