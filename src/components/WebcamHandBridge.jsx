import { useEffect, useRef } from 'react';

const MP_VERSION = '0.10.21';
const WASM_BASE = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${MP_VERSION}/wasm`;
const MODEL_URL =
  'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task';

const IDX_WRIST = 0;
const IDX_INDEX_MCP = 5;
const IDX_INDEX_TIP = 8;

/** حداقل نسبت فاصلهٔ نوک انگشت به مچ / فاصلهٔ مفصل به مچ — زیر این یعنی انگشت جمع است و کنترل خاموش می‌شود. */
const MIN_POINT_RATIO = 0.92;
/** بعد از gate، شدت خروجی با این توان نرم می‌شود (مرکز ظریف‌تر، لبه قوی‌تر). */
const RESPONSE_GAMMA = 0.62;
const LOOK_GAIN = 2.85;
const MOVE_GAIN = 2.45;

function hypot2d(a, b) {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.sqrt(dx * dx + dy * dy);
}

/** هرچه بزرگ‌تر، انگشت بیشتر باز و «اشاره» واقعی‌تر. */
function indexPointRatio(lm) {
  const dTip = hypot2d(lm[IDX_INDEX_TIP], lm[IDX_WRIST]);
  const dMcp = hypot2d(lm[IDX_INDEX_MCP], lm[IDX_WRIST]) + 1e-5;
  return dTip / dMcp;
}

/** جهت واحد مچ → نوک انگشت اشاره در صفحهٔ نرمال‌شدهٔ تصویر (y رو به پایین تصویر). */
function indexPointUnit(lm) {
  const vx = lm[IDX_INDEX_TIP].x - lm[IDX_WRIST].x;
  const vy = lm[IDX_INDEX_TIP].y - lm[IDX_WRIST].y;
  const len = Math.sqrt(vx * vx + vy * vy) + 1e-6;
  return { ux: vx / len, uy: vy / len, len };
}

/**
 * خروجی -۱…۱: جهت اشاره را با منحنی پاسخ ترکیب می‌کند.
 * سلفی آینه‌ای: برای اینکه «اشاره به چپ تصویر» = استراف به چپ حس شود، محور x را برعکس می‌کنیم.
 */
function steerFromPointUnit(ux, uy, gain) {
  const mx = -ux * gain;
  const my = uy * gain;
  const shapedX = Math.sign(mx) * Math.pow(Math.min(Math.abs(mx), 1), RESPONSE_GAMMA);
  const shapedY = Math.sign(my) * Math.pow(Math.min(Math.abs(my), 1), RESPONSE_GAMMA);
  return { x: shapedX, y: shapedY };
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
    if (pr >= MIN_POINT_RATIO - 0.05) {
      const { ux, uy } = indexPointUnit(lm);
      ctx.strokeStyle = 'rgba(255,255,255,0.88)';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(lm[IDX_WRIST].x * w, lm[IDX_WRIST].y * h);
      ctx.lineTo(
        (lm[IDX_WRIST].x + ux * 0.22) * w,
        (lm[IDX_WRIST].y + uy * 0.22) * h,
      );
      ctx.stroke();
    }
  }

  ctx.restore();
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
  return { leftLm, rightLm };
}

/**
 * وب‌کم + MediaPipe: کنترل با «اشاره با انگشت» (مچ → نوک سبابه)، نه موقعیت مچ.
 */
export default function WebcamHandBridge({ moveRef, lookRef, onError, onReady }) {
  const videoRef = useRef(null);
  const wrapRef = useRef(null);
  const overlayRef = useRef(null);
  const rafRef = useRef(0);
  const smoothRef = useRef({ mx: 0, my: 0, lx: 0, ly: 0 });
  const connectionsRef = useRef(null);
  const onErrorRef = useRef(onError);
  const onReadyRef = useRef(onReady);

  useEffect(() => {
    onErrorRef.current = onError;
    onReadyRef.current = onReady;
  }, [onError, onReady]);

  useEffect(() => {
    const video = videoRef.current;
    if (!navigator.mediaDevices?.getUserMedia) {
      onErrorRef.current?.('مرورگر اجازهٔ دوربین را پشتیبانی نمی‌کند (نیاز به HTTPS یا localhost).');
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
      onReadyRef.current?.(false);
    };

    (async () => {
      let visionMod;
      try {
        visionMod = await import('@mediapipe/tasks-vision');
      } catch {
        onErrorRef.current?.('بارگذاری MediaPipe ناموفق بود.');
        onReadyRef.current?.(false);
        return;
      }
      const { HandLandmarker, FilesetResolver } = visionMod;
      connectionsRef.current = HandLandmarker.HAND_CONNECTIONS;

      try {
        onErrorRef.current?.('');
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
        video.muted = true;
        await video.play();

        const fileset = await FilesetResolver.forVisionTasks(WASM_BASE);
        landmarker = await HandLandmarker.createFromOptions(fileset, {
          baseOptions: {
            modelAssetPath: MODEL_URL,
            delegate: 'CPU',
          },
          runningMode: 'VIDEO',
          numHands: 2,
          minHandDetectionConfidence: 0.35,
          minHandPresenceConfidence: 0.35,
          minTrackingConfidence: 0.35,
        });

        if (cancelled) {
          landmarker.close();
          return;
        }

        onReadyRef.current?.(true);

        const tick = () => {
          if (cancelled || !landmarker || !video.videoWidth) {
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

          const { leftLm, rightLm } = pickHands(landmarks, handedness);

          const smoothMove = 1 - Math.exp(-11 * dt);
          const smoothLook = 1 - Math.exp(-8 * dt);

          let targetMx = 0;
          let targetMy = 0;
          if (leftLm && indexPointRatio(leftLm) >= MIN_POINT_RATIO) {
            const { ux, uy } = indexPointUnit(leftLm);
            const s = steerFromPointUnit(ux, uy, MOVE_GAIN);
            targetMx = s.x;
            targetMy = s.y;
          }
          smoothRef.current.mx += (targetMx - smoothRef.current.mx) * smoothMove;
          smoothRef.current.my += (targetMy - smoothRef.current.my) * smoothMove;
          if (moveRef?.current) {
            moveRef.current = { x: smoothRef.current.mx, y: smoothRef.current.my };
          }

          let targetLx = 0;
          let targetLy = 0;
          if (rightLm && indexPointRatio(rightLm) >= MIN_POINT_RATIO) {
            const { ux, uy } = indexPointUnit(rightLm);
            const s = steerFromPointUnit(ux, uy, LOOK_GAIN);
            targetLx = s.x;
            targetLy = s.y;
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
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        onErrorRef.current?.(
          msg.includes('Permission') ? 'دسترسی به دوربین رد شد.' : `وب‌کم / MediaPipe: ${msg}`,
        );
        stop();
      }
    })();

    return () => {
      stop();
    };
  }, [moveRef, lookRef]);

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
      </div>
      <p className="border-t border-[#8ab8d4]/50 px-2 py-1 text-center text-[10px] leading-tight text-[#1f5f85]">
        چپ = حرکت · اشاره با سبابه از مچ. راست = نگاه · همان اشاره. (خط سفید وقتی فعال است)
      </p>
    </div>
  );
}
