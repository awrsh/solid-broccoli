import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { getMovementInput, setMovementKeyState, updateMovement } from './cameraMovement';

export default function Player({
  joystickInput,
  lookInput,
  mouseLookEnabled = true,
  touchGameplayEnabled = false,
  recenterSignal = 0,
  lookEnabled = true,
}) {
  const { camera } = useThree();
  const eyeHeight = 6.75;

  const yaw = useRef(0);
  const pitch = useRef(0);
  const mouseDelta = useRef({ x: 0, y: 0 });
  const lastMousePosition = useRef(null);
  const isLookDragging = useRef(false);
  const recenterHandledSignal = useRef(recenterSignal);
  const recenterAnim = useRef({
    active: false,
    elapsed: 0,
    duration: 0.85,
    startPos: new THREE.Vector3(),
    targetPos: new THREE.Vector3(),
    startYaw: 0,
    targetYaw: 0,
    startPitch: 0,
    targetPitch: 0,
  });
  const walls = useMemo(() => {
    const roomHalfSize = 20;
    const wallThickness = 0.8;
    const wallHeight = 10;
    const colliderDepth = 40;

    return {
      children: [
        {
          BoundingBox: new THREE.Box3(
            new THREE.Vector3(-roomHalfSize, 0, -roomHalfSize - wallThickness),
            new THREE.Vector3(roomHalfSize, wallHeight, -roomHalfSize + wallThickness)
          ),
        },
        {
          BoundingBox: new THREE.Box3(
            new THREE.Vector3(-roomHalfSize, 0, roomHalfSize - wallThickness),
            new THREE.Vector3(roomHalfSize, wallHeight, roomHalfSize + wallThickness)
          ),
        },
        {
          BoundingBox: new THREE.Box3(
            new THREE.Vector3(-roomHalfSize - wallThickness, 0, -colliderDepth / 2),
            new THREE.Vector3(-roomHalfSize + wallThickness, wallHeight, colliderDepth / 2)
          ),
        },
        {
          BoundingBox: new THREE.Box3(
            new THREE.Vector3(roomHalfSize - wallThickness, 0, -colliderDepth / 2),
            new THREE.Vector3(roomHalfSize + wallThickness, wallHeight, colliderDepth / 2)
          ),
        },
      ],
    };
  }, []);
  const controls = useMemo(() => {
    const forward = new THREE.Vector3();
    const right = new THREE.Vector3();
    const worldUp = new THREE.Vector3(0, 1, 0);

    return {
      moveForward(distance) {
        camera.getWorldDirection(forward);
        forward.y = 0;
        forward.normalize();
        camera.position.addScaledVector(forward, distance);
      },
      moveRight(distance) {
        camera.getWorldDirection(forward);
        forward.y = 0;
        forward.normalize();
        right.crossVectors(forward, worldUp).normalize();
        camera.position.addScaledVector(right, distance);
      },
    };
  }, [camera]);

  useEffect(() => {
    camera.rotation.order = 'YXZ';
    yaw.current = camera.rotation.y || 0;
    pitch.current = camera.rotation.x || 0;
  }, [camera]);

  useEffect(() => {
    const down = (e) => {
      if (e.code === 'ArrowUp') setMovementKeyState('ArrowUp', true);
      if (e.code === 'ArrowDown') setMovementKeyState('ArrowDown', true);
      if (e.code === 'ArrowLeft') setMovementKeyState('ArrowLeft', true);
      if (e.code === 'ArrowRight') setMovementKeyState('ArrowRight', true);
      if (e.code === 'KeyW') setMovementKeyState('w', true);
      if (e.code === 'KeyA') setMovementKeyState('a', true);
      if (e.code === 'KeyS') setMovementKeyState('s', true);
      if (e.code === 'KeyD') setMovementKeyState('d', true);
    };
    const up = (e) => {
      if (e.code === 'ArrowUp') setMovementKeyState('ArrowUp', false);
      if (e.code === 'ArrowDown') setMovementKeyState('ArrowDown', false);
      if (e.code === 'ArrowLeft') setMovementKeyState('ArrowLeft', false);
      if (e.code === 'ArrowRight') setMovementKeyState('ArrowRight', false);
      if (e.code === 'KeyW') setMovementKeyState('w', false);
      if (e.code === 'KeyA') setMovementKeyState('a', false);
      if (e.code === 'KeyS') setMovementKeyState('s', false);
      if (e.code === 'KeyD') setMovementKeyState('d', false);
    };
    const mouseMove = (e) => {
      if (!mouseLookEnabled || !lookEnabled) return;

      // Drag-to-look: only rotate/pan while holding mouse button.
      if (!isLookDragging.current) return;

      if (typeof e.movementX === 'number' && typeof e.movementY === 'number') {
        mouseDelta.current.x += e.movementX;
        mouseDelta.current.y += e.movementY;
        return;
      }

      if (!lastMousePosition.current) {
        lastMousePosition.current = { x: e.clientX, y: e.clientY };
        return;
      }

      mouseDelta.current.x += e.clientX - lastMousePosition.current.x;
      mouseDelta.current.y += e.clientY - lastMousePosition.current.y;
      lastMousePosition.current = { x: e.clientX, y: e.clientY };
    };

    const mouseDown = (e) => {
      if (!mouseLookEnabled || !lookEnabled) return;
      if (e.button !== 0) return;
      if (touchGameplayEnabled) return;
      isLookDragging.current = true;
      lastMousePosition.current = { x: e.clientX, y: e.clientY };
    };

    const mouseUp = (e) => {
      if (e.button !== 0) return;
      isLookDragging.current = false;
      mouseDelta.current.x = 0;
      mouseDelta.current.y = 0;
      lastMousePosition.current = null;
    };

    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    window.addEventListener('mousemove', mouseMove, { passive: true });
    window.addEventListener('mousedown', mouseDown);
    window.addEventListener('mouseup', mouseUp);

    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
      window.removeEventListener('mousemove', mouseMove);
      window.removeEventListener('mousedown', mouseDown);
      window.removeEventListener('mouseup', mouseUp);
    };
  }, [mouseLookEnabled, touchGameplayEnabled, lookEnabled]);

  useEffect(() => {
    if (lookEnabled) return;
    isLookDragging.current = false;
    mouseDelta.current.x = 0;
    mouseDelta.current.y = 0;
    lastMousePosition.current = null;
  }, [lookEnabled]);

  useFrame((_, delta) => {
    const mouseSensitivity = 0.0032;
    const pitchLimit = Math.PI / 2 - 0.08;
    const joystickLookSpeed = 1.9;
    const joystickX = joystickInput?.current?.x ?? 0;
    const joystickY = joystickInput?.current?.y ?? 0;
    const lookX = lookInput?.current?.x ?? 0;
    const lookY = lookInput?.current?.y ?? 0;

    if (recenterHandledSignal.current !== recenterSignal) {
      recenterHandledSignal.current = recenterSignal;
      recenterAnim.current.active = true;
      recenterAnim.current.elapsed = 0;
      recenterAnim.current.startPos.copy(camera.position);
      recenterAnim.current.targetPos.set(0, eyeHeight, 5.5);
      recenterAnim.current.startYaw = yaw.current;
      recenterAnim.current.targetYaw = 0;
      recenterAnim.current.startPitch = pitch.current;
      recenterAnim.current.targetPitch = 0;
    }

    if (recenterAnim.current.active) {
      recenterAnim.current.elapsed += delta;
      const t = Math.min(1, recenterAnim.current.elapsed / recenterAnim.current.duration);
      const eased = t * t * (3 - 2 * t);

      camera.position.lerpVectors(recenterAnim.current.startPos, recenterAnim.current.targetPos, eased);
      yaw.current = THREE.MathUtils.lerp(recenterAnim.current.startYaw, recenterAnim.current.targetYaw, eased);
      pitch.current = THREE.MathUtils.lerp(
        recenterAnim.current.startPitch,
        recenterAnim.current.targetPitch,
        eased
      );

      if (t >= 1) recenterAnim.current.active = false;
    }

    if (!recenterAnim.current.active && lookEnabled && mouseLookEnabled && isLookDragging.current) {
      yaw.current -= mouseDelta.current.x * mouseSensitivity;
      pitch.current -= mouseDelta.current.y * mouseSensitivity;
    }

    if (!recenterAnim.current.active && lookEnabled && touchGameplayEnabled) {
      yaw.current -= lookX * joystickLookSpeed * delta;
      pitch.current -= lookY * joystickLookSpeed * delta;
    }

    pitch.current = THREE.MathUtils.clamp(pitch.current, -pitchLimit, pitchLimit);

    camera.rotation.order = 'YXZ';
    camera.rotation.y = yaw.current;
    camera.rotation.x = pitch.current;
    mouseDelta.current.x = 0;
    mouseDelta.current.y = 0;
    camera.rotation.z = 0;

    if (!recenterAnim.current.active) {
      updateMovement(delta, controls, camera, walls, { x: joystickX, y: joystickY });
    }

    // Fixed camera height (eye level)
    camera.position.y = eyeHeight;
  });

  return null;
}
