// Claude Design 미리보기용 @gorhom/bottom-sheet 대용품 — 첫 스냅 지점을 골라 화면 아래에 고정한 시트로 그립니다.
import * as React from "react";
import { FlatList, TextInput, View } from "react-native";
import { C, SHADOW } from "../../src/theme";

const BottomSheet = React.forwardRef<unknown, any>(function BottomSheet({ children, snapPoints = ["50%"], index = 0, backgroundStyle, handleIndicatorStyle }, ref) {
  const [i, setI] = React.useState(Math.max(0, index));
  React.useImperativeHandle(ref, () => ({ snapToIndex: (n: number) => setI(n), expand() {}, collapse() {}, close() {} }), []);
  return (
    <View
      style={[
        { position: "absolute", left: 0, right: 0, bottom: 0, height: snapPoints[Math.min(i, snapPoints.length - 1)], borderTopLeftRadius: 28, borderTopRightRadius: 28, backgroundColor: C.paper, overflow: "hidden" },
        SHADOW.sheet,
        backgroundStyle,
      ]}
    >
      <View style={[{ alignSelf: "center", width: 38, height: 4, borderRadius: 2, marginTop: 9, marginBottom: 4, backgroundColor: "#cfc7b6" }, handleIndicatorStyle]} />
      {children}
    </View>
  );
});

export default BottomSheet;
export const BottomSheetFlatList = FlatList;
export const BottomSheetTextInput = TextInput;
