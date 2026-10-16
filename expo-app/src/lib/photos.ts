import * as ImageManipulator from "expo-image-manipulator";
import * as ImagePicker from "expo-image-picker";
import { photoPath } from "./signedPhoto";
import { supabase } from "./supabase";

const BUCKET = "restaurant-photos";

/**
 * 로컬 파일(uri) 한 장을 비공개 버킷에 올리고 버킷 안 경로를 돌려줍니다(주소가 아님).
 * 보여 줄 때는 SignedImage 가 그때그때 서명 주소를 만듭니다. dataUrlToBlob 대신 arrayBuffer 를 씁니다.
 */
export async function uploadPhoto(uri: string, filename: string) {
  const safe = filename.replace(/[^\w.-]/g, "_");
  const path = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${safe}`;
  const body = await fetch(uri).then((r) => r.arrayBuffer());

  const { error } = await supabase.storage.from(BUCKET).upload(path, body, { contentType: "image/jpeg" });
  if (error) throw new Error(error.message);

  return path;
}

/** 기록 하나에 붙일 수 있는 사진 수 */
export const MAX_PHOTOS = 10;

/** 앨범 사진 한 장을 인증 사진과 같은 900px JPEG 로 줄여 올리고 버킷 안 경로를 돌려줍니다. */
export async function uploadAlbumPhoto(uri: string) {
  const out = await ImageManipulator.manipulateAsync(uri, [{ resize: { width: 900 } }], {
    compress: 0.72,
    format: ImageManipulator.SaveFormat.JPEG,
  });
  return uploadPhoto(out.uri, "album.jpg");
}

/** 버킷에서 사진 파일을 지웁니다. 못 지워도 기록은 이미 바뀐 뒤라 조용히 넘어갑니다. */
export async function removePhotoObjects(refs: string[]) {
  const paths = refs.map(photoPath).filter((p): p is string => !!p);
  if (paths.length) await supabase.storage.from(BUCKET).remove(paths).catch(() => {});
}

/** 앨범에서 최대 `limit` 장을 고릅니다. 취소하면 빈 배열. */
export async function pickAlbumUris(limit: number): Promise<string[]> {
  if (limit <= 0) return [];
  const res = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ["images"], quality: 0.9, allowsMultipleSelection: true, selectionLimit: limit,
  });
  return res.canceled ? [] : res.assets.slice(0, limit).map((a) => a.uri);
}
