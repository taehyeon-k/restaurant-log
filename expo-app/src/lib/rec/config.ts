/**
 * 「지금 뭐 먹지」 하이브리드 추천(비 AI) — 가중치 · 하이퍼파라미터를 한 곳에.
 * 숫자는 검증된 최적값이 아니라 출발 가설입니다. 바꾸면 version 을 올려 로그(rec_sessions.algo_version)와 맞춥니다.
 * Rationale and calibration: docs/recommendation-hybrid-v4.md.
 */
export const REC_CONFIG = {
  version: "hybrid-v4.0",

  /** Stage A — 후보 반경(m). 1.5km 에서 시작해, 걸러진 뒤 후보가 minPool 보다 적으면 3km. */
  radii: [1500, 3000] as const,
  minPool: 15,
  /** 그래도 5곳이 안 차면 이 반경 안의 내 위시 · 다시 간 곳으로 채웁니다(남의 숫자 없이). */
  mineRadius: 10000,
  /** 같은 이름이 이만큼 안이면 같은 가게, 넘으면 다른 지점(geo.ts SAME_BRANCH_M 과 같은 값). */
  sameBranchM: 100,

  /** Stage B — 가중치(합 1). 결측 피처는 neutral 값을 넣어 순위를 흔들지 않게 합니다. */
  weights: {
    taste: 0.36,
    distance: 0.20,
    wish: 0.12,
    favorite: 0.14,
    community: 0.08,
    meal: 0.06,
    novelty: 0.04,
    // Kept in snapshots for backwards compatibility; weather modifies distance only.
    context: 0,
  },
  neutral: { taste: 0.5, distance: 0, wish: 0, favorite: 0.5, community: 0.5, meal: 0.5, novelty: 0, context: 0.5 },

  /** Algorithm A — 베이지안 수축. T = (κ·μ0 + Σ w·y) / (κ + Σ w). */
  taste: {
    prior: 0.5,
    kappa: 3,
    absoluteRatingMix: 0.65,
    maxWeightPerPlace: 1,
    dishKappa: 2,
    dishVote: { positive: 0.8, negative: 0.2, weight: 0.6 },
    explanationMinPlaces: 2,
    /** 사용자 평균 별점을 이 값 쪽으로 이만큼(가상 관측 수) 당겨 「평소보다 좋았나」를 봅니다. */
    ratingPrior: 3.5,
    ratingPriorN: 5,
    /** 최근성 반감 — w = max(floor, exp(-age/τ)). */
    recencyTauDays: 180,
    recencyFloor: 0.25,
    /** 관측 신뢰도 — 위치 인증 기록 1, 아닌 기록 0.8. */
    unverifiedConfidence: 0.8,
    /** 별점 없는 기록: 다시 가고 싶다고 표시했으면 약한 긍정, 아니면 거의 중립(불확실)인 약한 관측. */
    revisitOnly: { y: 0.7, w: 0.6 },
    unrated: { y: 0.54, w: 0.3 },
    /** 위시에 담은 종류는 관심 — 아주 약한 관측(한 종류당 최대 maxPerCat 개). */
    wish: { y: 0.65, w: 0.10, maxPerCat: 2 },
  },

  /**
   * Algorithm B — D = exp(−max(0, d − d₀)/τ). d₀ 안(몇 분 걷는 거리)은 거리 차이를 따지지 않습니다 —
   * 순수 exp(−d/τ) 는 번화가에서 50m 와 300m 를 크게 갈라, 실데이터 진단에서 점수의 85% 가 거리였고 5곳이 모두 100m 안이었습니다.
   * 비 · 혹서 · 혹한이면 τ 를 줄이고, 평일 점심은 조금 줄입니다.
   */
  distance: { comfortM: 250, tauM: 900, badWeatherFactor: 0.7, weekdayLunchFactor: 0.85 },
  weather: { maxAgeMinutes: 120 },

  /** Algorithm C — R = ρ·exp(-Δt/h). 같은 가게와 같은 종류를 따로. */
  repetition: {
    place: { rho: 0.16, hDays: 3 },
    cuisine: { rho: 0.08, hDays: 2, windowDays: 7 },
    routine: { windowDays: 90, maxGapDays: 14, minDates: 3, kappa: 5, maxReduction: 0.65 },
  },

  /** Algorithm D */
  novelty: {
    /** 맛 점수가 lo 이하면 새로움 보너스 0, hi 이상이면 다. 맛이 안 맞는 곳을 새로움으로 메우지 않습니다. */
    tasteGate: { lo: 0.42, hi: 0.6 },
    revisitedLongAgoDays: 90,
    longAgo: 0.4,
  },
  favorite: { kappa: 1.5 },
  community: {
    /** 재방문율 수축 — (n·rate + k·p0)/(n + k). */
    priorRate: 0.3,
    priorN: 3,
    /** 이 재방문율이면 1. */
    fullRate: 0.6,
  },
  /** 식사 시간대 — verified_at(서버 시각)이 있는 기록만 씁니다. visited_at 은 날짜뿐이라 쓰지 않습니다. */
  meal: { betaK: 2 },

  /**
   * Stage C — MMR. r* = argmax [Score − λ·max_j Sim(r,j) − λc·max(0, n_c − 1)·sim.cuisine].
   * 둘째 항(포화)은 같은 종류가 이미 n_c 곳 뽑혔을 때 커집니다 — max 만 쓰면 같은 종류 둘째 곳이 늘 막히거나(λ 큼)
   * 다섯 곳 모두 같은 종류가 되기(λ 작음) 쉬워서, 뚜렷한 취향이면 2곳 · 강하면 3곳이 되도록 합니다.
   */
  mmr: {
    lambda: 0.12,
    saturation: 0.12,
    sim: { cuisine: 0.4, sub: 0.15, price: 0.1, geo: 0.35, geoTauM: 150 },
    /** 먹고 싶은 종류를 골랐으면 종류 유사도를 이만큼만. */
    requestedCuisineFactor: 0.15,
  },
  count: 5,
  /** Research only until live logging is verified. No app-side randomization by default. */
  exploration: { enabled: false, epsilon: 0.1, maxScoreGap: 0.02 },
} as const;

export type RecConfig = typeof REC_CONFIG;
export type ComponentKey = keyof RecConfig["weights"];
