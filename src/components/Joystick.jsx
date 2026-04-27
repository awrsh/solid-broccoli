import { useEffect, useRef, useState } from 'react';

const BASE_SIZE = 140;
const KNOB_SIZE = 56;
const MAX_RADIUS = (BASE_SIZE - KNOB_SIZE) / 2;

function clampJoystick(dx, dy) {
  const distance = Math.hypot(dx, dy);
  if (distance <= MAX_RADIUS || distance === 0) {
    return { x: dx, y: dy };
  }

  const scale = MAX_RADIUS / distance;
  return { x: dx * scale, y: dy * scale };
}

export default function Joystick({ onMove, onActiveChange, side = 'left', label = 'Analog Move' }) {
  const baseRef = useRef(null);
  const pointerIdRef = useRef(null);
  const centerRef = useRef({ x: 0, y: 0 });
  const [knob, setKnob] = useState({ x: 0, y: 0 });

  useEffect(() => {
    return () => onMove(0, 0);
  }, [onMove]);

  const start = (event) => {
    if (!baseRef.current) return;
    pointerIdRef.current = event.pointerId;
    onActiveChange?.(true);

    const rect = baseRef.current.getBoundingClientRect();
    centerRef.current = {
      x: rect.left + rect.width / 2,
      y: rect.top + rect.height / 2,
    };

    baseRef.current.setPointerCapture(event.pointerId);
  };

  const move = (event) => {
    if (pointerIdRef.current !== event.pointerId) return;

    const dx = event.clientX - centerRef.current.x;
    const dy = event.clientY - centerRef.current.y;
    const limited = clampJoystick(dx, dy);

    setKnob(limited);
    onMove(limited.x / MAX_RADIUS, limited.y / MAX_RADIUS);
  };

  const end = (event) => {
    if (pointerIdRef.current !== event.pointerId) return;
    pointerIdRef.current = null;
    setKnob({ x: 0, y: 0 });
    onMove(0, 0);
    onActiveChange?.(false);
  };

  return (
    <div
      ref={baseRef}
      onPointerDown={start}
      onPointerMove={move}
      onPointerUp={end}
      onPointerCancel={end}
      className={`ui-blocker fixed ${side === 'right' ? 'right-4' : 'left-4'} bottom-4 rounded-full border border-white/25 bg-black/45 touch-none select-none z-50`}
      style={{ width: BASE_SIZE, height: BASE_SIZE }}
    >
      <div
        className="absolute rounded-full bg-white/80"
        style={{
          width: KNOB_SIZE,
          height: KNOB_SIZE,
          left: `calc(50% - ${KNOB_SIZE / 2}px + ${knob.x}px)`,
          top: `calc(50% - ${KNOB_SIZE / 2}px + ${knob.y}px)`,
        }}
      />
      <div className="absolute -top-7 left-1 text-[11px] text-white/85 tracking-wide">
        {label}
      </div>
    </div>
  );
}
