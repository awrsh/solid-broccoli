/** پیش‌فرض؛ با `public/hand-control-map.json` بازنویسی می‌شود. */
export const DEFAULT_HAND_CONTROL_MAP = {
  move: {
    enabled: true,
    pinchForwardBackEnabled: true,
    closedBackwardEnabled: true,
    closedBackwardStrength: 0.82,
    allowForward: true,
    allowBackward: true,
  },
  look: {
    enabled: true,
    axes: {
      allowAxisXNegative: true,
      allowAxisXPositive: true,
      allowAxisYNegative: true,
      allowAxisYPositive: true,
    },
  },
};

function boolOr(v, defaultTrue) {
  if (v === false) return false;
  if (v === true) return true;
  return defaultTrue;
}

function numOr(v, fallback) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

/** @param {unknown} raw */
export function normalizeHandControlMap(raw) {
  if (!raw || typeof raw !== 'object') {
    return structuredClone(DEFAULT_HAND_CONTROL_MAP);
  }
  const r = /** @type {Record<string, unknown>} */ (raw);

  const mv = r.move && typeof r.move === 'object' ? r.move : {};
  const lk = r.look && typeof r.look === 'object' ? r.look : {};
  const ax = lk.axes && typeof lk.axes === 'object' ? lk.axes : {};

  const legacyLh = r.leftHand && typeof r.leftHand === 'object' ? r.leftHand : {};
  const legacyMp = legacyLh.movePinch && typeof legacyLh.movePinch === 'object' ? legacyLh.movePinch : {};
  const legacyRh = r.rightHand && typeof r.rightHand === 'object' ? r.rightHand : {};
  const legacyLook = legacyRh.look && typeof legacyRh.look === 'object' ? legacyRh.look : {};

  const moveEnabled =
    mv.enabled !== undefined
      ? boolOr(mv.enabled, true)
      : boolOr(legacyLh.movePinchEnabled, true);

  return {
    move: {
      enabled: moveEnabled,
      pinchForwardBackEnabled: boolOr(mv.pinchForwardBackEnabled, true),
      closedBackwardEnabled: boolOr(mv.closedBackwardEnabled, true),
      closedBackwardStrength: numOr(mv.closedBackwardStrength, 0.82),
      allowForward:
        mv.allowForward !== undefined ? boolOr(mv.allowForward, true) : boolOr(legacyMp.allowForward, true),
      allowBackward:
        mv.allowBackward !== undefined
          ? boolOr(mv.allowBackward, true)
          : boolOr(legacyMp.allowBackward, true),
    },
    look: {
      enabled:
        lk.enabled !== undefined ? boolOr(lk.enabled, true) : boolOr(legacyRh.lookFromPointEnabled, true),
      axes: {
        allowAxisXNegative: boolOr(ax.allowAxisXNegative ?? legacyLook.allowAxisXNegative, true),
        allowAxisXPositive: boolOr(ax.allowAxisXPositive ?? legacyLook.allowAxisXPositive, true),
        allowAxisYNegative: boolOr(ax.allowAxisYNegative ?? legacyLook.allowAxisYNegative, true),
        allowAxisYPositive: boolOr(ax.allowAxisYPositive ?? legacyLook.allowAxisYPositive, true),
      },
    },
  };
}

export function clampLookAxes(lx, ly, lookCfg) {
  if (!lookCfg) return { x: lx, y: ly };
  let x = lx;
  let y = ly;
  if (x < 0 && !lookCfg.allowAxisXNegative) x = 0;
  if (x > 0 && !lookCfg.allowAxisXPositive) x = 0;
  if (y < 0 && !lookCfg.allowAxisYNegative) y = 0;
  if (y > 0 && !lookCfg.allowAxisYPositive) y = 0;
  return { x, y };
}

/** جلو (y منفی) / عقب (y مثبت) بعد از منطق pinch/closed */
export function clampDollyY(my, moveCfg) {
  if (!moveCfg?.enabled) return 0;
  let y = my;
  if (y < 0 && !moveCfg.allowForward) y = 0;
  if (y > 0 && !moveCfg.allowBackward) y = 0;
  return y;
}

/** @param {string} [url] */
export async function fetchHandControlMap(url = '/hand-control-map.json') {
  try {
    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) {
      return structuredClone(DEFAULT_HAND_CONTROL_MAP);
    }
    const json = await res.json();
    return normalizeHandControlMap(json);
  } catch {
    return structuredClone(DEFAULT_HAND_CONTROL_MAP);
  }
}
