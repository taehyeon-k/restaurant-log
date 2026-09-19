import { supabase } from "@/lib/supabase";

const BUCKET = "restaurant-photos";

/**
 * 사진 한 장을 올리고 공개 주소를 돌려줍니다.
 * 웹의 `dataUrlToBlob` 자리에 로컬 파일 uri → ArrayBuffer 가 들어왔습니다 —
 * RN 의 Blob 은 supabase-js 가 바이트를 읽지 못하는 껍데기라 쓸 수 없습니다.
 */
export async function uploadPhotoFromUri(uri: string, filename = "photo.jpg") {
  const safe = filename.replace(/[^\w.-]/g, "_");
  const path = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${safe}`;
  const contentType = safe.toLowerCase().endsWith(".png") ? "image/png" : "image/jpeg";

  const bytes = await fetch(uri).then((r) => r.arrayBuffer());

  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(path, bytes, { contentType });
  if (error) throw new Error(error.message);

  return supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
}
