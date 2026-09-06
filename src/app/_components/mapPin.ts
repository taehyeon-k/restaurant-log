type PinRow = { category?: string | null; revisit?: boolean | null };

const CATEGORY_COLORS: Record<string, string> = {
  한식: "#b4552d", 중식: "#9a4a52", 일식: "#5f7a8a", 양식: "#7a6a9a",
  아시안: "#6f8455", 분식: "#c07a2e", 커피: "#7a5c42", 디저트: "#b06a86",
  베이커리: "#a8853f", 차: "#4f7a6a",
};
const pinColor = (category?: string | null) => (category && CATEGORY_COLORS[category]) || "#8a8377";
const escapeHtml = (value: string) => value.replace(/[&<>'"]/g, (char) => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;",
})[char]!);

const labelHtml = (name: string, rating?: number | null, cta?: string) =>
  '<div data-label style="position:absolute;left:50%;bottom:42px;transform:translateX(-50%);display:block;min-width:max-content;padding:7px 12px 6px;border:1px solid #d8d3c8;border-radius:14px 14px 14px 3px;background:#fbfaf6;color:#1c1a17;box-shadow:0 4px 12px rgba(28,26,23,.09);font-family:inherit;font-size:13px;line-height:1.25;text-align:left;white-space:nowrap;pointer-events:none">' +
  '<div style="font-weight:600">' + escapeHtml(name) + "</div>" +
  (rating !== undefined ? '<div style="font-size:11px;opacity:.65">★ ' + (rating == null ? "—" : rating.toFixed(1)) + "</div>" : "") +
  (cta ? '<div style="margin-top:1px;font-size:11px;color:#b4552d">' + escapeHtml(cta) + "</div>" : "") +
  "</div>";

const pinHtml = (row: PinRow) => {
  const base = pinColor(row.category);
  const fill = row.revisit ? base : "#fbfaf6";
  const stroke = row.revisit ? "#fbfaf6" : base;
  const core = row.revisit ? "#fbfaf6" : base;
  return '<div data-pin style="position:absolute;left:50%;bottom:8px;width:24px;height:24px;box-sizing:border-box;transform:translateX(-50%) rotate(-45deg);border-radius:50% 50% 50% 0;background:' + fill + ';border:1.5px solid ' + stroke + ';box-shadow:1px -1px 5px rgba(28,26,23,.16);display:flex;align-items:center;justify-content:center;transition:width .16s ease,height .16s ease,border-width .16s ease"><div data-core style="width:8px;height:8px;border-radius:50%;background:' + core + ';transform:rotate(45deg);transition:width .16s ease,height .16s ease"></div></div><div data-shadow style="position:absolute;left:50%;bottom:4px;width:9px;height:3px;transform:translateX(-50%);border-radius:50%;background:rgba(28,26,23,.16);transition:width .16s ease,height .16s ease"></div>';
};

const icon = (content: string): naver.maps.HtmlIcon => ({
  content, size: new naver.maps.Size(48, 48), anchor: new naver.maps.Point(24, 40),
});

export function pinIcon(_maps: typeof naver.maps, row: PinRow, details?: { name: string; rating: number | null }): naver.maps.HtmlIcon {
  const content = '<div class="restaurant-map-pin" style="position:relative;width:48px;height:48px">' +
    (details ? labelHtml(details.name, details.rating) : "") + pinHtml(row) + "</div>";
  return icon(content);
}

export function ghostIcon(_maps: typeof naver.maps, details?: { name: string; cta: string }): naver.maps.HtmlIcon {
  const content = '<div class="restaurant-map-pin" style="position:relative;width:48px;height:48px">' +
    (details ? labelHtml(details.name, undefined, details.cta) : "") +
    '<div data-pin style="position:absolute;left:50%;bottom:8px;width:24px;height:24px;box-sizing:border-box;transform:translateX(-50%) rotate(-45deg);border-radius:50% 50% 50% 0;background:rgba(138,131,119,.15);border:1.5px dashed #8a8377"></div><div data-shadow style="position:absolute;left:50%;bottom:4px;width:9px;height:3px;transform:translateX(-50%);border-radius:50%;background:rgba(28,26,23,.1)"></div></div>'
  return icon(content);
}

export function applyActive(marker: naver.maps.Marker, active: boolean) {
  const el = marker.getElement();
  const pin = el?.querySelector<HTMLElement>("[data-pin]");
  const core = el?.querySelector<HTMLElement>("[data-core]");
  const shadow = el?.querySelector<HTMLElement>("[data-shadow]");
  if (!pin) return;
  pin.style.width = pin.style.height = active ? "32px" : "24px";
  pin.style.borderWidth = active ? "2px" : "1.5px";
  pin.style.boxShadow = active ? "2px -2px 9px rgba(28,26,23,.22)" : "1px -1px 5px rgba(28,26,23,.16)";
  if (core) core.style.width = core.style.height = active ? "10px" : "8px";
  if (shadow) { shadow.style.width = active ? "12px" : "9px"; shadow.style.height = active ? "4px" : "3px"; }
  marker.setZIndex(active ? 1000 : 0);
}

export function setLabelVisible(marker: naver.maps.Marker, visible: boolean) {
  const label = marker.getElement()?.querySelector<HTMLElement>("[data-label]");
  if (label) label.style.display = visible ? "block" : "none";
}
