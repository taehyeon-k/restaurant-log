// Claude Design 미리보기용 supabase 대용품 — 네트워크 없이 항상 "빈 성공"을 돌려줍니다(화면 데이터는 AppScreen 이 쿼리 캐시에 미리 넣어 둡니다).
const ok = { data: [] as unknown[], error: null };

function chain(): any {
  const target = function () {};
  return new Proxy(target, {
    get(_t, prop) {
      if (prop === "then") return (resolve: (v: unknown) => unknown) => Promise.resolve(ok).then(resolve);
      return () => chain();
    },
    apply: () => chain(),
  });
}

const user = {
  id: "preview-user",
  created_at: "2026-03-02T09:00:00Z",
  identities: [{ provider: "kakao" }, { provider: "google" }],
};

export const supabase: any = {
  from: () => chain(),
  rpc: () => chain(),
  auth: {
    getUser: async () => ({ data: { user }, error: null }),
    getSession: async () => ({ data: { session: null }, error: null }),
    signInWithOAuth: async () => ({ data: { url: null }, error: { message: "미리보기에서는 로그인할 수 없습니다" } }),
    setSession: async () => ({ data: {}, error: null }),
    updateUser: async () => ({ data: { user }, error: null }),
    signOut: async () => ({ error: null }),
    onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
    startAutoRefresh: () => {},
    stopAutoRefresh: () => {},
  },
  storage: { from: () => ({ upload: async () => ({ data: { path: "preview" }, error: null }), getPublicUrl: () => ({ data: { publicUrl: "" } }) }) },
  functions: { invoke: async () => ({ data: {}, error: null }) },
};
