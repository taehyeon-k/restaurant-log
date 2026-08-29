import type { DivIcon, Marker } from "leaflet";

/**
 * 물방울 핀 (teardrop pin).
 * - 재방문한 곳: 카테고리 색으로 꽉 찬 핀 + 종이색 테두리
 * - 한 번만 간 곳: 종이색 핀 + 카테고리 색 테두리
 *
 * 아이콘 박스는 48×48 고정, 앵커는 핀 끝점(24, 40) — 크기가 바뀌어도 좌표는 흔들리지 않습니다.
 * 이 파일은 다른 모듈에 의존하지 않습니다. `@/lib/types` 에 이미 pinColor 가 있으면
 * 아래 CATEGORY_COLORS / pinColor 를 지우고 `import { pinColor } from "@/lib/types"` 로 바꿔도 됩니다.
 */

const CATEGORY_COLORS: Record<string, string> = {
  한식: "#b4552d",
  중식: "#9a4a52",
  일식: "#5f7a8a",
  양식: "#7a6a9a",
  아시안: "#6f8455",
  분식: "#c07a2e",
  커피: "#7a5c42",
  디저트: "#b06a86",
  베이커리: "#a8853f",
  차: "#4f7a6a",
};

const pinColor = (category?: string | null) =>
  (category && CATEGORY_COLORS[category]) || "#8a8377";

/** 핀에 필요한 필드만 받습니다 — Restaurant 를 그대로 넘겨도 맞습니다. */
type PinRow = { category?: string | null; revisit?: boolean | null };

const SHELL_OPEN =
  '<div style="position:absolute; left:50%; bottom:8px; transform:translateX(-50%); display:flex; flex-direction:column; align-items:center; gap:2px">';

const ICON_BOX = {
  className: "restaurant-map-pin",
  iconSize: [48, 48] as [number, number],
  iconAnchor: [24, 40] as [number, number],
  tooltipAnchor: [0, -34] as [number, number],
};

export function pinIcon(L: typeof import("leaflet"), row: PinRow): DivIcon {
  const base = pinColor(row.category);
  const fill = row.revisit ? base : "#fbfaf6";
  const stroke = row.revisit ? "#fbfaf6" : base;
  const core = row.revisit ? "#fbfaf6" : base;

  const html =
    SHELL_OPEN +
    '<div data-pin style="width:24px; height:24px; box-sizing:border-box;' +
    " border-radius:50% 50% 50% 0; transform:rotate(-45deg); background:" +
    fill +
    "; border:1.5px solid " +
    stroke +
    "; box-shadow:1px -1px 5px rgba(28,26,23,.16); display:flex; align-items:center;" +
    ' justify-content:center; transition:width .16s ease, height .16s ease, border-width .16s ease">' +
    '<div data-core style="width:8px; height:8px; border-radius:50%; background:' +
    core +
    '; transform:rotate(45deg); transition:width .16s ease, height .16s ease"></div>' +
    "</div>" +
    '<div data-shadow style="width:9px; height:3px; border-radius:50%; background:rgba(28,26,23,.16); transition:width .16s ease, height .16s ease"></div>' +
    "</div>";

  return L.divIcon({ ...ICON_BOX, html });
}

/** 기록이 없는 지역을 검색했을 때 찍히는 점선 핀. (geocode 기능이 있는 버전에서만 씁니다) */
export function ghostIcon(L: typeof import("leaflet")): DivIcon {
  const html =
    SHELL_OPEN +
    '<div data-pin style="width:24px; height:24px; box-sizing:border-box; border-radius:50% 50% 50% 0;' +
    ' transform:rotate(-45deg); background:rgba(138,131,119,.15); border:1.5px dashed #8a8377"></div>' +
    '<div data-shadow style="width:9px; height:3px; border-radius:50%; background:rgba(28,26,23,.1)"></div>' +
    "</div>";

  return L.divIcon({ ...ICON_BOX, html });
}

/** 호버·선택은 크기만 키웁니다 — 아이콘을 갈아끼우지 않아 전환이 이어집니다. */
export function applyActive(marker: Marker, active: boolean) {
  const el = marker.getElement();
  if (!el) return;

  const pin = el.querySelector<HTMLElement>("[data-pin]");
  const core = el.querySelector<HTMLElement>("[data-core]");
  const shadow = el.querySelector<HTMLElement>("[data-shadow]");
  if (!pin) return;

  pin.style.width = pin.style.height = active ? "32px" : "24px";
  pin.style.borderWidth = active ? "2px" : "1.5px";
  pin.style.boxShadow = active
    ? "2px -2px 9px rgba(28,26,23,.22)"
    : "1px -1px 5px rgba(28,26,23,.16)";

  if (core) core.style.width = core.style.height = active ? "10px" : "8px";
  if (shadow) {
    shadow.style.width = active ? "12px" : "9px";
    shadow.style.height = active ? "4px" : "3px";
  }

  el.style.zIndex = active ? "900" : "";
}
