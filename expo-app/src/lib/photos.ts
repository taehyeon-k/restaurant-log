import { supabase } from "./supabase";

const BUCKET = "restaurant-photos";

/** 로컬 파일(uri) 한 장을 올리고 공개 주소를 돌려줍니다. dataUrlToBlob 대신 arrayBuffer 를 씁니다. */
export async function uploadPhoto(uri: string, filename: string) {
  const safe = filename.replace(/[^\w.-]/g, "_");
  const path = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${safe}`;
  const body = await fetch(uri).then((r) => r.arrayBuffer());

  const { error } = await supabase.storage.from(BUCKET).upload(path, body, { contentType: "image/jpeg" });
  if (error) throw new Error(error.message);

  return supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
}
