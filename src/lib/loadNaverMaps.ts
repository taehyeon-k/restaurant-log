let loadingPromise: Promise<void> | null = null;

export function loadNaverMaps(): Promise<void> {
  if (typeof window === "undefined") {
    return Promise.reject(
      new Error("Naver Maps can only be loaded in the browser.")
    );
  }

  if (typeof naver !== "undefined" && naver.maps) {
    return Promise.resolve();
  }

  if (loadingPromise) {
    return loadingPromise;
  }

  const clientId =
    process.env.NEXT_PUBLIC_NAVER_MAP_CLIENT_ID?.trim();

  if (!clientId) {
    return Promise.reject(
      new Error(
        "NEXT_PUBLIC_NAVER_MAP_CLIENT_ID is not configured."
      )
    );
  }

  loadingPromise = new Promise<void>((resolve, reject) => {
    const existing =
      document.querySelector<HTMLScriptElement>(
        'script[data-naver-maps-sdk="true"]'
      );

    const finish = () => {
      if (typeof naver !== "undefined" && naver.maps) {
        resolve();
      } else {
        reject(
          new Error("Naver Maps SDK loaded, but naver.maps is unavailable.")
        );
      }
    };

    if (existing) {
      if (typeof naver !== "undefined" && naver.maps) {
        resolve();
        return;
      }

      existing.addEventListener("load", finish, { once: true });
      existing.addEventListener(
        "error",
        () => reject(new Error("Failed to load Naver Maps SDK.")),
        { once: true }
      );

      return;
    }

    const script = document.createElement("script");

    script.dataset.naverMapsSdk = "true";
    script.async = true;

    script.src =
      "https://oapi.map.naver.com/openapi/v3/maps.js" +
      `?ncpKeyId=${encodeURIComponent(clientId)}`;

    script.onload = finish;

    script.onerror = () => {
      loadingPromise = null;
      reject(new Error("Failed to load Naver Maps SDK."));
    };

    document.head.appendChild(script);
  });

  return loadingPromise;
}