// Claude Design 미리보기용 expo-router 대용품 — 화면은 이동하지 않고, 라우트 파라미터만 AppScreen 이 넣어 줍니다.
import * as React from "react";

export const RouteContext = React.createContext<{ params: Record<string, string>; segments: string[] }>({ params: {}, segments: [] });

const noop = () => {};
export const router = { push: noop, replace: noop, back: noop, navigate: noop, setParams: noop, dismiss: noop, dismissAll: noop, canGoBack: () => true };

export const useRouter = () => router;
export const useLocalSearchParams = <T,>() => React.useContext(RouteContext).params as unknown as T;
export const useGlobalSearchParams = useLocalSearchParams;
export const useSegments = () => React.useContext(RouteContext).segments;
export const usePathname = () => "/";
export const useFocusEffect = (cb: () => void | (() => void)) => React.useEffect(cb, []);
export const Link = ({ children }: { children?: React.ReactNode }) => <>{children}</>;
export const Redirect = () => null;

const Screen = () => null;
export const Stack: any = ({ children }: { children?: React.ReactNode }) => <>{children}</>;
Stack.Screen = Screen;
export const Tabs: any = ({ children }: { children?: React.ReactNode }) => <>{children}</>;
Tabs.Screen = Screen;
