import { useQuery } from "@tanstack/react-query";
import { Image, type ImageProps } from "react-native";
import { supabase } from "./supabase";

export const PHOTO_BUCKET = "restaurant-photos";

/** 서명 주소가 살아 있는 시간(초). 캐시는 그보다 조금 일찍 버립니다. */
const TTL = 60 * 60;

const OWN_URL = new RegExp(`/storage/v1/object/(?:public|sign|authenticated)/${PHOTO_BUCKET}/([^?#]+)`);

/**
 * DB 에 든 사진 값 → 버킷 안 경로. 새 기록은 경로를 그대로, 예전 기록은 공개 주소(https://…/public/restaurant-photos/경로)로 들어 있습니다.
 * 우리 버킷 것이 아닌 주소(소셜 로그인 프로필 사진 등)는 null.
 */
export function photoPath(ref: string | null | undefined): string | null {
  if (!ref) return null;
  if (!/^https?:\/\//i.test(ref)) return ref;
  const m = OWN_URL.exec(ref);
  return m ? decodeURIComponent(m[1]) : null;
}

/** 비공개 버킷의 사진을 볼 수 있는 임시 주소로 바꿉니다. 로그인한 사람 중 정책이 허락한 사람에게만 만들어 줍니다. */
async function sign(path: string): Promise<string | null> {
  const { data, error } = await supabase.storage.from(PHOTO_BUCKET).createSignedUrl(path, TTL);
  if (error) return null;
  return data.signedUrl;
}

/** 사진 값(경로 또는 예전 주소) → 화면에 쓸 주소. 서명 전에는 null. 외부 주소는 그대로. */
export function useSignedUri(ref: string | null | undefined): string | null {
  const path = photoPath(ref);
  const { data } = useQuery({
    queryKey: ["signed-photo", path],
    queryFn: () => sign(path!),
    enabled: !!path,
    staleTime: (TTL - 300) * 1000,
    gcTime: TTL * 1000,
    retry: 1,
  });
  if (!ref) return null;
  return path ? data ?? null : ref;
}

/** `<Image source={{ uri }}>` 대신 쓰는 사진 칸. uri 에는 DB 에 든 값을 그대로 넘깁니다. */
export function SignedImage({ uri, ...rest }: Omit<ImageProps, "source"> & { uri: string | null | undefined }) {
  const src = useSignedUri(uri);
  if (!src) return null;
  return <Image {...rest} source={{ uri: src }} />;
}
