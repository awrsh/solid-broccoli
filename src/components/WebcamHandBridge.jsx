import { useEffect, useRef } from 'react';

import {
  DEFAULT_HAND_CONTROL_MAP,
  clampDollyY,
  clampLookAxes,
  fetchHandControlMap,
} from '../handControlMap';

/** 
 * معنای حالت‌ها مطابق Handtrack.js (مدل جعبه‌ای + برچسب‌های open/closed/pinch/point):
 * https://victordibia.com/handtrack.js/#/docs — جزئیات معنا در README کتابخانه:
 * https://github.com/victordibia/handtrack.js/blob/master/README.md
 *
 * - open: کف باز، همهٔ انگشتان باز
 * - closed: مشت؛ همهٔ انگشتان جمع در یک توپ
 * - pinch: شست و انگشت اشاره چسبیده (گرفتن / درگ)
 * - point: فقط انگشت اشاره دراز (اشاره)
 *
 * این فایل لندمارک MediaPipe را به همان کلاس‌ها نگاشت می‌کند (هیوریستیک هندسی، نه همان مدل CNN).
 */

const MP_VERSION = '0.10.21';
const WASM_BASE = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${MP_VERSION}/wasm`;
const MODEL_URL =
  'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task';

/** همان `scoreThreshold` پیش‌فرض `handTrack.load` در مستندات Handtrack.js (۰.۶). */
const HT_DEFAULT_SCORE_THRESHOLD = 0.6;

const IDX_WRIST = 0;
const IDX_THUMB_TIP = 4;
const IDX_INDEX_MCP = 5;
const IDX_INDEX_TIP = 8;
const IDX_MIDDLE_MCP = 9;
const IDX_MIDDLE_TIP = 12;

/** نسبت طول «اشاره»؛ نزدیک تعریف point در Handtrack (انگشت اشاره دراز، مچ به نوک). */
const MIN_POINT_RATIO = 0.92;
const RESPONSE_GAMMA = 0.78;
const LOOK_GAIN = 0.95;
const MOVE_GAIN = 0.9;
const STICK_CAP = 0.38;
/** فاصلهٔ نرمال‌شدهٔ شست–نوک اشاره؛ زیر این مقدار ≈ برچسب pinch در Handtrack. */
const PINCH_DIST_MAX = 0.095;
/** برای جدا کردن point از pinch: باید شست از نوک اشاره دورتر از این باشد. */
const PINCH_RELEASE_FOR_LOOK = 0.095;
const PINCH_NEUTRAL_LOW = 0.47;
const PINCH_NEUTRAL_HIGH = 0.53;
/** مچ وسط نوار خنثی ولی پینچ فعال → جلو با شدت کافی برای updateMovement */
const PINCH_DEFAULT_FORWARD_Y = -0.68;
/** هر پینچ «جلو» (y منفی) حداقل به این شدت می‌رسد تا بعد از smoothing هم حرکت قطع نشود */
const PINCH_MIN_FORWARD_Y = -0.58;

function hypot2d(a, b) {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.sqrt(dx * dx + dy * dy);
}

function thumbIndexDistance(lm) {
  return hypot2d(lm[IDX_THUMB_TIP], lm[IDX_INDEX_TIP]);
}

function indexPointRatio(lm) {
  const dTip = hypot2d(lm[IDX_INDEX_TIP], lm[IDX_WRIST]);
  const dMcp = hypot2d(lm[IDX_INDEX_MCP], lm[IDX_WRIST]) + 1e-5;
  return dTip / dMcp;
}

function middlePointRatio(lm) {
  const dTip = hypot2d(lm[IDX_MIDDLE_TIP], lm[IDX_WRIST]);
  const dMcp = hypot2d(lm[IDX_MIDDLE_MCP], lm[IDX_WRIST]) + 1e-5;
  return dTip / dMcp;
}

function indexPointUnit(lm) {
  const vx = lm[IDX_INDEX_TIP].x - lm[IDX_WRIST].x;
  const vy = lm[IDX_INDEX_TIP].y - lm[IDX_WRIST].y;
  const len = Math.sqrt(vx * vx + vy * vy) + 1e-6;
  return { ux: vx / len, uy: vy / len };
}

function steerFromPointUnit(ux, uy, gain) {
  const mx = -ux * gain;
  const my = uy * gain;
  const shapedX = Math.sign(mx) * Math.pow(Math.min(Math.abs(mx), 1), RESPONSE_GAMMA);
  const shapedY = Math.sign(my) * Math.pow(Math.min(Math.abs(my), 1), RESPONSE_GAMMA);
  return {
    x: Math.sign(shapedX) * Math.min(Math.abs(shapedX), STICK_CAP),
    y: Math.sign(shapedY) * Math.min(Math.abs(shapedY), STICK_CAP),
  };
}

/**
 * y مچ MediaPipe: ۰ بالای تصویر، ۱ پایین.
 * برای `updateMovement`: y منفی = جلو، y مثبت = عقب (هم‌راستا با W/S).
 * بعد از آینهٔ نمایش وب‌کم، «مچ پایین‌تر در فریم» = جلو طبیعی‌تر بود؛ علامت‌ها یک‌بار معکوس شدند.
 */
function pinchForwardBack(ny) {
  if (ny < PINCH_NEUTRAL_LOW) {
    const t = (PINCH_NEUTRAL_LOW - ny) / PINCH_NEUTRAL_LOW;
    return Math.min(1, t * 1.25) * MOVE_GAIN;
  }
  if (ny > PINCH_NEUTRAL_HIGH) {
    const t = (ny - PINCH_NEUTRAL_HIGH) / (1 - PINCH_NEUTRAL_HIGH);
    return -Math.min(1, t * 1.25) * MOVE_GAIN;
  }
  return 0;
}

function isPinch(lm) {
  return lm && thumbIndexDistance(lm) < PINCH_DIST_MAX;
}

/** ≈ label «closed» در Handtrack: مشت؛ انگشتان جمع (بدون pinch؛ با اشارهٔ واضح رد می‌شود). */
function isClosedHand(lm) {
  if (!lm || isPinch(lm)) return false;
  if (indexPointRatio(lm) >= 0.82) return false;
  return middlePointRatio(lm) < 0.88;
}

/** ≈ label «point» در Handtrack: اشاره با انگشت اشاره؛ نه حالت pinch. */
function isPointForLook(lm) {
  return (
    lm &&
    indexPointRatio(lm) >= MIN_POINT_RATIO &&
    thumbIndexDistance(lm) > PINCH_RELEASE_FOR_LOOK
  );
}

function pickLookLandmark(leftLm, rightLm) {
  if (isPointForLook(rightLm)) return rightLm;
  if (isPointForLook(leftLm)) return leftLm;
  return null;
}

/**
 * ترتیب مثل تفکیک معنایی Handtrack: pinch و point شاخص‌تر از closed؛ open پیش‌فرض.
 * نام‌های خروجی با فیلد `label` در خروجی `model.detect` هم‌خوان است.
 */
function classifyHandPose(lm) {
  if (!lm) return null;
  if (isPinch(lm)) return 'pinch';
  if (isPointForLook(lm)) return 'point';
  if (isClosedHand(lm)) return 'closed';
  return 'open';
}

/** همان شرطی که روی باکس «PINCH — پینچ» می‌نویسد (خروجی classifyHandPose). */
function anyClassifiedPinch(landmarks) {
  if (!landmarks?.length) return false;
  return landmarks.some((lm) => lm && classifyHandPose(lm) === 'pinch');
}

/** محور جلو/عقب از مچ هر دستی که در UI به‌صورت pinch طبقه شده است. */
function pinchMoveYFromClassifiedPinches(landmarks) {
  const pinchers = landmarks.filter((lm) => lm && classifyHandPose(lm) === 'pinch');
  if (pinchers.length === 0) return 0;
  if (pinchers.length === 1) return pinchForwardBack(pinchers[0][IDX_WRIST].y);
  const ny = Math.min(...pinchers.map((lm) => lm[IDX_WRIST].y));
  return pinchForwardBack(ny);
}

const POSE_EN = { pinch: 'PINCH', closed: 'CLOSED', point: 'POINT', open: 'OPEN' };
const POSE_FA = { pinch: 'پینچ', closed: 'مشت', point: 'اشاره', open: 'باز' };

function buildHandStatusText(landmarks, handedness) {
  if (!landmarks?.length) return 'دست دیده نمی‌شود';
  const lines = [];
  for (let i = 0; i < landmarks.length; i += 1) {
    const lm = landmarks[i];
    const pose = classifyHandPose(lm);
    const raw = handedness?.[i]?.[0]?.categoryName ?? handedness?.[i]?.[0]?.displayName ?? '';
    const rl = String(raw).toLowerCase();
    const side = rl === 'left' ? 'چپ' : rl === 'right' ? 'راست' : `دست ${i + 1}`;
    lines.push(`${side}: ${POSE_EN[pose]} — ${POSE_FA[pose]}`);
  }
  return lines.join('\n');
}

function pickHands(landmarks, handedness) {
  let leftLm = null;
  let rightLm = null;
  for (let i = 0; i < landmarks.length; i += 1) {
    const lm = landmarks[i];
    const raw = handedness?.[i]?.[0]?.categoryName ?? handedness?.[i]?.[0]?.displayName ?? '';
    const label = String(raw).toLowerCase();
    if (label === 'left') leftLm = lm;
    else if (label === 'right') rightLm = lm;
  }
  if (!leftLm && landmarks[0]) leftLm = landmarks[0];
  if (!rightLm && landmarks.length > 1) rightLm = landmarks[1];

  if (landmarks.length === 1) {
    const m = landmarks[0];
    if (isPinch(m)) return { leftLm: m, rightLm: null };
    if (isPointForLook(m)) return { leftLm: null, rightLm: m };
    if (isClosedHand(m)) return { leftLm: m, rightLm: null };
    return { leftLm: null, rightLm: null };
  }

  return { leftLm, rightLm };
}

function drawHandsOnCanvas(canvas, wrap, landmarks, handedness, connections) {
  const ctx = canvas.getContext('2d');
  if (!ctx || !wrap) return;

  const w = wrap.clientWidth;
  const h = wrap.clientHeight;
  if (w < 2 || h < 2) return;

  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  if (canvas.width !== Math.floor(w * dpr) || canvas.height !== Math.floor(h * dpr)) {
    canvas.width = Math.floor(w * dpr);
    canvas.height = Math.floor(h * dpr);
  }
  canvas.style.width = `${w}px`;
  canvas.style.height = `${h}px`;

  ctx.save();
  ctx.scale(dpr, dpr);
  ctx.clearRect(0, 0, w, h);

  if (!landmarks?.length || !connections?.length) {
    ctx.restore();
    return;
  }

  const strokeForHand = (idx) => {
    const raw = handedness?.[idx]?.[0]?.categoryName ?? handedness?.[idx]?.[0]?.displayName ?? '';
    const label = String(raw).toLowerCase();
    if (label === 'left') return 'rgba(56, 189, 248, 0.92)';
    if (label === 'right') return 'rgba(251, 191, 36, 0.95)';
    return 'rgba(147, 197, 253, 0.85)';
  };

  for (let hi = 0; hi < landmarks.length; hi += 1) {
    const lm = landmarks[hi];
    const stroke = strokeForHand(hi);
    ctx.strokeStyle = stroke;
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    for (const c of connections) {
      const a = lm[c.start];
      const b = lm[c.end];
      if (!a || !b) continue;
      ctx.beginPath();
      ctx.moveTo(a.x * w, a.y * h);
      ctx.lineTo(b.x * w, b.y * h);
      ctx.stroke();
    }

    ctx.fillStyle = stroke;
    for (const p of lm) {
      ctx.beginPath();
      ctx.arc(p.x * w, p.y * h, 3.2, 0, Math.PI * 2);
      ctx.fill();
    }

    const pr = indexPointRatio(lm);
    const pinchD = thumbIndexDistance(lm);
    if (pr >= MIN_POINT_RATIO - 0.05 && pinchD > PINCH_RELEASE_FOR_LOOK) {
      const { ux, uy } = indexPointUnit(lm);
      ctx.strokeStyle = 'rgba(255,255,255,0.88)';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(lm[IDX_WRIST].x * w, lm[IDX_WRIST].y * h);
      ctx.lineTo((lm[IDX_WRIST].x + ux * 0.22) * w, (lm[IDX_WRIST].y + uy * 0.22) * h);
      ctx.stroke();
    }
    if (pinchD < PINCH_DIST_MAX + 0.02) {
      ctx.strokeStyle = 'rgba(245, 158, 11, 0.95)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(lm[IDX_THUMB_TIP].x * w, lm[IDX_THUMB_TIP].y * h);
      ctx.lineTo(lm[IDX_INDEX_TIP].x * w, lm[IDX_INDEX_TIP].y * h);
      ctx.stroke();
    }
  }

  ctx.restore();
}

function waitForVideoDimensions(video) {
  if (video.videoWidth > 0) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const onMeta = () => {
      if (video.videoWidth > 0) {
        cleanup();
        resolve();
      }
    };
    const onErr = () => {
      cleanup();
      reject(new Error('metadata ویدیو در دسترس نیست.'));
    };
    const cleanup = () => {
      video.removeEventListener('loadedmetadata', onMeta);
      video.removeEventListener('error', onErr);
    };
    video.addEventListener('loadedmetadata', onMeta);
    video.addEventListener('error', onErr);
  });
}

/**
 * MediaPipe Hand Landmarker — wasm و مدل همان URLهای ثابت پروژه.
 * اشاره = نگاه چهارجهت · پینچ = جلو/عقب از y مچ · مشت = عقب ثابت (در صورت فعال بودن در JSON).
 */
export default function WebcamHandBridge({
  moveRef,
  lookRef,
  onError,
  onReady,
  handControlMapUrl = '/hand-control-map.json',
}) {
  const videoRef = useRef(null);
  const wrapRef = useRef(null);
  const overlayRef = useRef(null);
  const rafRef = useRef(0);
  const smoothRef = useRef({ mx: 0, my: 0, lx: 0, ly: 0 });
  const connectionsRef = useRef(null);
  const handMapRef = useRef(structuredClone(DEFAULT_HAND_CONTROL_MAP));
  const statusOverlayRef = useRef(null);
  const onErrorRef = useRef(onError);
  const onReadyRef = useRef(onReady);

  useEffect(() => {
    onErrorRef.current = onError;
    onReadyRef.current = onReady;
  }, [onError, onReady]);

  useEffect(() => {
    const video = videoRef.current;
    const report = (msg, fatal = true) => {
      onErrorRef.current?.(msg, { fatal });
    };

    if (!navigator.mediaDevices?.getUserMedia) {
      report('مرورگر اجازهٔ دوربین را پشتیبانی نمی‌کند (نیاز به HTTPS یا localhost).', true);
      onReadyRef.current?.(false);
      return undefined;
    }
    if (!video) {
      onReadyRef.current?.(false);
      return undefined;
    }

    let cancelled = false;
    let landmarker = null;
    let stream = null;
    let lastT = performance.now();

    const stop = () => {
      cancelled = true;
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = 0;
      landmarker?.close();
      landmarker = null;
      stream?.getTracks().forEach((t) => t.stop());
      stream = null;
      video.srcObject = null;
      connectionsRef.current = null;
      smoothRef.current = { mx: 0, my: 0, lx: 0, ly: 0 };
      if (moveRef?.current) moveRef.current = { x: 0, y: 0 };
      if (lookRef?.current) lookRef.current = { x: 0, y: 0 };
      const oc = overlayRef.current?.getContext('2d');
      if (oc && overlayRef.current) {
        oc.clearRect(0, 0, overlayRef.current.width, overlayRef.current.height);
      }
      if (statusOverlayRef.current) {
        statusOverlayRef.current.textContent = '';
      }
      onReadyRef.current?.(false);
    };

    (async () => {
      report('', false);

      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } },
          audio: false,
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        video.srcObject = stream;
        video.playsInline = true;
        video.setAttribute('playsinline', '');
        video.muted = true;
        await video.play();
        await waitForVideoDimensions(video);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        report(
          msg.includes('Permission') ? 'دسترسی به دوربین رد شد.' : `وب‌کم: ${msg}`,
          true,
        );
        onReadyRef.current?.(false);
        return;
      }

      if (cancelled) {
        stop();
        return;
      }

      onReadyRef.current?.(true);

      try {
        handMapRef.current = await fetchHandControlMap(handControlMapUrl);
      } catch {
        handMapRef.current = structuredClone(DEFAULT_HAND_CONTROL_MAP);
      }

      let visionMod;
      try {
        visionMod = await import('@mediapipe/tasks-vision');
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        report(`بارگذاری MediaPipe ناموفق: ${msg}`, false);
      }

      if (cancelled) {
        stop();
        return;
      }

      if (!visionMod) {
        const idle = () => {
          if (cancelled) return;
          rafRef.current = requestAnimationFrame(idle);
        };
        rafRef.current = requestAnimationFrame(idle);
        return;
      }

      const { HandLandmarker, FilesetResolver } = visionMod;

      try {
        const fileset = await FilesetResolver.forVisionTasks(WASM_BASE);
        landmarker = await HandLandmarker.createFromOptions(fileset, {
          baseOptions: {
            modelAssetPath: MODEL_URL,
            delegate: 'CPU',
          },
          runningMode: 'VIDEO',
          numHands: 2,
          minHandDetectionConfidence: HT_DEFAULT_SCORE_THRESHOLD,
          minHandPresenceConfidence: HT_DEFAULT_SCORE_THRESHOLD,
          minTrackingConfidence: HT_DEFAULT_SCORE_THRESHOLD,
        });
        connectionsRef.current = HandLandmarker.HAND_CONNECTIONS;
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        report(`مدل دست MediaPipe بارگذاری نشد (وب‌کم فعال است): ${msg}`, false);
      }

      if (cancelled) {
        landmarker?.close();
        landmarker = null;
        stop();
        return;
      }

      const tick = () => {
        if (cancelled) return;

        if (!landmarker || !video.videoWidth) {
          if (statusOverlayRef.current) statusOverlayRef.current.textContent = '';
          if (!cancelled) rafRef.current = requestAnimationFrame(tick);
          return;
        }

        const now = performance.now();
        const dt = Math.min(0.05, (now - lastT) / 1000) || 0.016;
        lastT = now;

        const result = landmarker.detectForVideo(video, now);
        const { landmarks, handedness } = result;

        drawHandsOnCanvas(
          overlayRef.current,
          wrapRef.current,
          landmarks,
          handedness,
          connectionsRef.current,
        );

        if (statusOverlayRef.current) {
          statusOverlayRef.current.textContent = buildHandStatusText(landmarks, handedness);
        }

        const { leftLm, rightLm } = pickHands(landmarks, handedness);
        const cfg = handMapRef.current;

        const smoothMove = 1 - Math.exp(-5.2 * dt);
        const smoothMovePinchY = 1 - Math.exp(-16 * dt);
        const smoothLook = 1 - Math.exp(-4 * dt);

        let targetMx = 0;
        let targetMy = 0;
        let pinchDrivingMove = false;
        if (cfg.move.enabled) {
          /** هم‌منبع با متن باکس (PINCH / پینچ) — نه فقط leftLm/rightLm از pickHands */
          const pinching = anyClassifiedPinch(landmarks);
          if (cfg.move.pinchForwardBackEnabled && pinching) {
            pinchDrivingMove = true;
            let rawY = pinchMoveYFromClassifiedPinches(landmarks);
            if (rawY === 0 && cfg.move.allowForward) rawY = PINCH_DEFAULT_FORWARD_Y;
            else if (rawY < 0 && cfg.move.allowForward) {
              rawY = Math.min(rawY, PINCH_MIN_FORWARD_Y);
            }
            targetMy = rawY;
          } else if (
            cfg.move.closedBackwardEnabled &&
            (isClosedHand(leftLm) || isClosedHand(rightLm))
          ) {
            targetMy = Math.min(1, cfg.move.closedBackwardStrength);
          }
        }
        targetMy = clampDollyY(targetMy, cfg.move);

        const smoothMy = pinchDrivingMove ? smoothMovePinchY : smoothMove;
        smoothRef.current.mx += (targetMx - smoothRef.current.mx) * smoothMove;
        smoothRef.current.my += (targetMy - smoothRef.current.my) * smoothMy;
        if (moveRef?.current) {
          moveRef.current = { x: smoothRef.current.mx, y: smoothRef.current.my };
        }

        let targetLx = 0;
        let targetLy = 0;
        const lookLm = cfg.look.enabled ? pickLookLandmark(leftLm, rightLm) : null;
        if (lookLm) {
          const { ux, uy } = indexPointUnit(lookLm);
          const s = steerFromPointUnit(ux, uy, LOOK_GAIN);
          const cl = clampLookAxes(s.x, s.y, cfg.look.axes);
          targetLx = cl.x;
          targetLy = cl.y;
        }

        smoothRef.current.lx += (targetLx - smoothRef.current.lx) * smoothLook;
        smoothRef.current.ly += (targetLy - smoothRef.current.ly) * smoothLook;
        if (lookRef?.current) {
          lookRef.current.x = smoothRef.current.lx;
          lookRef.current.y = smoothRef.current.ly;
        }

        rafRef.current = requestAnimationFrame(tick);
      };

      rafRef.current = requestAnimationFrame(tick);
    })().catch((e) => {
      const msg = e instanceof Error ? e.message : String(e);
      report(`وب‌کم / MediaPipe: ${msg}`, true);
      stop();
    });

    return () => {
      stop();
    };
  }, [moveRef, lookRef, handControlMapUrl]);

  return (
    <div
      className="pointer-events-none fixed left-4 bottom-28 z-50 w-[min(42vw,220px)] overflow-hidden rounded-lg border border-[#8ab8d4] bg-[#f5fbff]/95 shadow-xl"
      aria-label="پیش‌نمایش وب‌کم و دست"
    >
      <div ref={wrapRef} className="relative aspect-4/3 w-full bg-black">
        <div className="absolute inset-0 scale-x-[-1]">
          <video ref={videoRef} className="h-full w-full object-cover" muted playsInline />
          <canvas ref={overlayRef} className="absolute inset-0 h-full w-full" />
        </div>
        <div
          ref={statusOverlayRef}
          className="pointer-events-none absolute inset-x-0 bottom-0 z-10 max-h-[42%] overflow-hidden bg-black/70 px-2 py-1.5 text-center font-mono text-[10px] leading-snug whitespace-pre-line text-white"
          aria-live="polite"
          aria-atomic="true"
        />
      </div>
      <p className="border-t border-[#8ab8d4]/50 px-2 py-1 text-center text-[10px] leading-tight text-[#1f5f85]">
        MediaPipe ({MP_VERSION}) — اشاره = نگاه · پینچ = جلو/عقب · مشت = عقب ·{' '}
        <code className="rounded bg-[#e8f4fc] px-0.5">hand-control-map.json</code>
      </p>
    </div>
  );
}
