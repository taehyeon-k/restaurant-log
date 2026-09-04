import { supabase } from "@/lib/supabase";

const BUCKET = "restaurant-photos";

/** 사진 한 장을 올리고 공개 주소를 돌려줍니다. */
export async function uploadPhoto(file: Blob, filename: string) {
  const safe = filename.replace(/[^\w.-]/g, "_");
  const path = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${safe}`;

  const { error } = await supabase.storage.from(BUCKET).upload(path, file, {
    contentType: file.type || "image/jpeg",
  });
  if (error) throw new Error(error.message);

  return supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
}

/** 카메라가 만든 dataURL 을 업로드할 수 있는 Blob 으로 바꿉니다. */
export function dataUrlToBlob(dataUrl: string): Blob {
  const [head, body] = dataUrl.split(",");
  const type = /:(.*?);/.exec(head)?.[1] ?? "image/jpeg";
  const bin = atob(body);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type });
}
