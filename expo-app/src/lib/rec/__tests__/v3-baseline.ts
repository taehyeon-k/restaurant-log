/** Original tracked v3 code run against scenarios.ts in isolation. Synthetic, not user outcomes. */
export const V3_BASELINE = {
  "version": "hybrid-v3.1",
  "cases": [
    {
      "name": "cold-start",
      "keys": [
        "kakao:1000",
        "kakao:1001",
        "kakao:1002",
        "kakao:1003",
        "kakao:1004"
      ]
    },
    {
      "name": "sushi-liked-ramen-disliked",
      "keys": [
        "kakao:1000",
        "kakao:1001",
        "kakao:1003",
        "kakao:2002",
        "kakao:1002"
      ]
    },
    {
      "name": "generous-rater",
      "keys": [
        "kakao:1000",
        "kakao:1001",
        "kakao:1002",
        "kakao:1003",
        "kakao:1004"
      ]
    },
    {
      "name": "wishlist-800m-vs-neutral-300m",
      "keys": [
        "kakao:1000",
        "kakao:1001",
        "kakao:1002",
        "kakao:1003",
        "kakao:1004"
      ]
    },
    {
      "name": "happy-regular",
      "keys": [
        "kakao:1001",
        "kakao:1002",
        "kakao:1000",
        "kakao:1003",
        "kakao:1004"
      ]
    }
  ],
  "commit": "a4497b76349a63aad28b3f5e47517fc1e549a6ca",
  "scenarioSha256": "cfbc42c390adb0384897419e3f9869ed7d0d78594dd72506a530811a8595a076"
} as const;
