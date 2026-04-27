import { useState, useEffect, useRef, useCallback, useMemo } from 'react';

import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Environment, useTexture } from '@react-three/drei';
import * as THREE from 'three';

import Player from './Player';
import Room from './Room';
import Lights from './Lights';
import Picture from './Picture';
import Modal from './Modal';
import Joystick from './Joystick';
import { ModalProvider, useModal } from './ModalContext';

const AUTO_MODAL_OPEN_DISTANCE = 8.5;
const AUTO_MODAL_CLOSE_DISTANCE = 10;
const AUTO_MODAL_MAX_VIEW_ANGLE = Math.PI / 4.8;
const PHARMA_HDRI = '/thumbnail_29b38d2f-a677-489c-9340-b90600d56806.png.2048x2048_q85.jpg.webp';

function HdriEnvironment() {
  const hdriTexture = useTexture(PHARMA_HDRI);

  useMemo(() => {
    if (!hdriTexture) return;
    hdriTexture.mapping = THREE.EquirectangularReflectionMapping;
    hdriTexture.colorSpace = THREE.SRGBColorSpace;
  }, [hdriTexture]);

  return <Environment map={hdriTexture} background />;
}

function getPictureProximityScore(camera, picture) {
  const picturePosition = new THREE.Vector3(...picture.position);
  const pictureRotation = new THREE.Euler(...(picture.rotation ?? [0, 0, 0]));
  const pictureQuaternion = new THREE.Quaternion().setFromEuler(pictureRotation);
  const toCamera = camera.position.clone().sub(picturePosition);
  const distance = toCamera.length();
  const pictureForward = new THREE.Vector3(0, 0, 1).applyQuaternion(pictureQuaternion).normalize();
  const cameraForward = new THREE.Vector3();

  camera.getWorldDirection(cameraForward);

  const directionToCamera = distance > 0 ? toCamera.clone().normalize() : new THREE.Vector3();
  const directionToPicture = picturePosition.clone().sub(camera.position).normalize();
  const facingPicture = cameraForward.angleTo(directionToPicture);
  const inFrontOfPicture = pictureForward.dot(directionToCamera) > 0.35;

  return {
    distance,
    facingPicture,
    inFrontOfPicture,
    score: distance + facingPicture * 3,
  };
}

function AutoPictureModal({ pictures, manualCloseIdRef }) {
  const { camera } = useThree();
  const { activeItem, setActiveItem } = useModal();
  const autoOpenedIdRef = useRef(null);

  useFrame(() => {
    if (!pictures.length) return;

    let bestCandidate = null;
    let bestMetrics = null;

    for (const picture of pictures) {
      const metrics = getPictureProximityScore(camera, picture);
      const isWithinActivationZone =
        metrics.distance <= AUTO_MODAL_OPEN_DISTANCE &&
        metrics.facingPicture <= AUTO_MODAL_MAX_VIEW_ANGLE &&
        metrics.inFrontOfPicture;

      if (!isWithinActivationZone) continue;

      if (!bestMetrics || metrics.score < bestMetrics.score) {
        bestCandidate = picture;
        bestMetrics = metrics;
      }
    }

    if (manualCloseIdRef?.current) {
      const suppressed = pictures.find((picture) => picture.id === manualCloseIdRef.current);
      if (suppressed) {
        const metrics = getPictureProximityScore(camera, suppressed);
        const stillTooClose =
          metrics.distance <= AUTO_MODAL_CLOSE_DISTANCE &&
          metrics.facingPicture <= AUTO_MODAL_MAX_VIEW_ANGLE + 0.18 &&
          metrics.inFrontOfPicture;
        if (!stillTooClose) {
          manualCloseIdRef.current = null;
        }
      } else {
        manualCloseIdRef.current = null;
      }
    }

    if (bestCandidate) {
      if (manualCloseIdRef?.current === bestCandidate.id) return;
      if (activeItem?.id !== bestCandidate.id) {
        autoOpenedIdRef.current = bestCandidate.id;
        setActiveItem(bestCandidate);
      }
      return;
    }

    if (!autoOpenedIdRef.current) return;

    const currentAutoItem = pictures.find((picture) => picture.id === autoOpenedIdRef.current);
    if (!currentAutoItem) {
      autoOpenedIdRef.current = null;
      if (activeItem?.id) setActiveItem(null);
      return;
    }

    const metrics = getPictureProximityScore(camera, currentAutoItem);
    const shouldClose =
      metrics.distance > AUTO_MODAL_CLOSE_DISTANCE ||
      metrics.facingPicture > AUTO_MODAL_MAX_VIEW_ANGLE + 0.18 ||
      !metrics.inFrontOfPicture;

    if (shouldClose && activeItem?.id === currentAutoItem.id) {
      autoOpenedIdRef.current = null;
      setActiveItem(null);
    }
  });

  useEffect(() => {
    if (!activeItem || activeItem.id === autoOpenedIdRef.current) return;
    autoOpenedIdRef.current = null;
  }, [activeItem]);

  return null;
}

function SceneInner() {
  const { activeItem, setActiveItem } = useModal();
  const [pictures, setPictures] = useState([]);
  const [gl, setGl] = useState(null);
  const [isVrSupported, setIsVrSupported] = useState(false);
  const [isInVr, setIsInVr] = useState(false);
  const [vrError, setVrError] = useState('');
  const joystickInput = useRef({ x: 0, y: 0 });
  const sceneRootRef = useRef(null);
  const [isPointerLocked, setIsPointerLocked] = useState(false);
  const [joystickMouseMode, setJoystickMouseMode] = useState(false);
  const [touchGameplayEnabled, setTouchGameplayEnabled] = useState(false);
  const [flatGeometryActive, setFlatGeometryActive] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const moveJoystickInput = useRef({ x: 0, y: 0 });
  const lookJoystickInput = useRef({ x: 0, y: 0 });
  const [recenterSignal, setRecenterSignal] = useState(0);
  const manualCloseIdRef = useRef(null);

  useEffect(() => {
    fetch('/pictures.json')
      .then((res) => res.json())
      .then((data) => setPictures(data))
      .catch((err) => console.error('Failed to load pictures:', err));
  }, []);

  useEffect(() => {
    if (!gl) return undefined;

    gl.xr.enabled = true;
    return undefined;
  }, [gl]);

  useEffect(() => {
    if (!navigator.xr) return undefined;

    let cancelled = false;
    navigator.xr
      .isSessionSupported('immersive-vr')
      .then((supported) => {
        if (!cancelled) setIsVrSupported(supported);
      })
      .catch(() => {
        if (!cancelled) setIsVrSupported(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const handleFullscreenChange = async () => {
      const root = sceneRootRef.current;
      if (!root) return;

      const fullscreenElement = document.fullscreenElement;
      const isSceneFullscreen =
        fullscreenElement === root ||
        (fullscreenElement instanceof Element && root.contains(fullscreenElement));

      if (isSceneFullscreen && !joystickMouseMode && document.pointerLockElement !== root) {
        try {
          await root.requestPointerLock();
        } catch (error) {
          console.warn('Failed to lock pointer in fullscreen mode:', error);
        }
      }

      if (!isSceneFullscreen && document.pointerLockElement) {
        document.exitPointerLock();
      }
    };

    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, [joystickMouseMode]);

  useEffect(() => {
    const onPointerLockChange = () => {
      const root = sceneRootRef.current;
      setIsPointerLocked(!!root && document.pointerLockElement === root);
    };
    document.addEventListener('pointerlockchange', onPointerLockChange);
    return () => document.removeEventListener('pointerlockchange', onPointerLockChange);
  }, []);

  useEffect(() => {
    const onKeyDown = async (e) => {
      if (e.key !== 'F11') return;
      const root = sceneRootRef.current;
      if (!root) return;

      // Try to convert browser fullscreen to document fullscreen (so we can reliably pointer-lock).
      e.preventDefault();
      try {
        if (document.fullscreenElement) {
          await document.exitFullscreen();
        } else {
          await root.requestFullscreen();
        }
      } catch (error) {
        console.warn('Failed to toggle fullscreen:', error);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  useEffect(() => {
    const onKeyDown = (e) => {
      if (e.key?.toLowerCase() !== 'h') return;
      setJoystickMouseMode((v) => !v);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  useEffect(() => {
    const root = sceneRootRef.current;
    if (!root) return;

    if (joystickMouseMode) {
      if (document.pointerLockElement) document.exitPointerLock();
    } else if (document.fullscreenElement && document.pointerLockElement !== root) {
      root.requestPointerLock().catch(() => {});
    }
  }, [joystickMouseMode]);

  const handleEnterVr = useCallback(async () => {
    if (!gl || !navigator.xr || isInVr) return;

    try {
      setVrError('');

      const session = await navigator.xr.requestSession('immersive-vr', {
        optionalFeatures: ['local-floor'],
      });

      if (
        typeof session?.requestReferenceSpace !== 'function' ||
        typeof session?.addEventListener !== 'function'
      ) {
        throw new Error('Invalid XR session received from runtime.');
      }

      if (typeof window.XRWebGLBinding === 'function') {
        try {
          // Preflight binding to avoid crashing inside setSession on incompatible runtimes/polyfills.
          // eslint-disable-next-line no-new
          new window.XRWebGLBinding(session, gl.getContext());
        } catch (bindingError) {
          await session.end();
          throw new Error('XR runtime is incompatible with this browser/polyfill.');
        }
      }

      session.addEventListener('end', () => setIsInVr(false), { once: true });
      await gl.xr.setSession(session);
      setIsInVr(true);
    } catch (error) {
      console.error('Failed to start VR session:', error);
      setVrError(error instanceof Error ? error.message : 'Failed to start VR session.');
      setIsInVr(false);
    }
  }, [gl, isInVr]);

  const handleJoystickMove = useCallback((x, y) => {
    moveJoystickInput.current = { x, y };
    joystickInput.current = { x, y };
  }, []);
  const handleLookJoystickMove = useCallback((x, y) => {
    lookJoystickInput.current = { x, y };
  }, []);

  const galleryPictures = useMemo(() => {
    if (!pictures.length) return [];

    const total = Math.max(12, pictures.length * 6);

    if (flatGeometryActive) {
      const columns = 6;
      const spacingX = 9;
      const spacingY = 6;
      const rows = Math.ceil(total / columns);
      const totalWidth = (columns - 1) * spacingX;
      const totalHeight = (rows - 1) * spacingY;

      return Array.from({ length: total }, (_, index) => {
        const source = pictures[index % pictures.length];
        const col = index % columns;
        const row = Math.floor(index / columns);
        return {
          ...source,
          id: `slot-${index}-${source.id}`,
          position: [col * spacingX - totalWidth / 2, 10 - (row * spacingY - totalHeight / 2), -20],
          rotation: [0, 0, 0],
        };
      });
    }

    const radius = 20;
    const viewerY = 6.75;

    return Array.from({ length: total }, (_, index) => {
      const source = pictures[index % pictures.length];
      const angle = (index / total) * Math.PI * 2;
      const x = Math.sin(angle) * radius;
      const z = Math.cos(angle) * radius;
      const y = viewerY + Math.sin(index * 1.75) * 1.35;
      const rotY = Math.atan2(x, z) + Math.PI;

      return {
        ...source,
        id: `slot-${index}-${source.id}`,
        position: [x, y, z],
        rotation: [0, rotY, 0],
      };
    });
  }, [pictures, flatGeometryActive]);

  return (
    <div
      ref={sceneRootRef}
      className={isPointerLocked && !joystickMouseMode ? 'cursor-none' : undefined}
      style={{ width: '100vw', height: '100vh' }}
    >
      <Canvas
        camera={{ position: [0, 2, 10], fov: 60 }}
        onCreated={({ gl: threeGl }) => setGl(threeGl)}
      >
        <Lights />
        <HdriEnvironment />
        <AutoPictureModal pictures={galleryPictures} manualCloseIdRef={manualCloseIdRef} />

        <Player
          joystickInput={joystickInput}
          mouseLookEnabled
          lookInput={lookJoystickInput}
          touchGameplayEnabled={touchGameplayEnabled}
          recenterSignal={recenterSignal}
          lookEnabled={!activeItem}
        />
        <Room />

        {galleryPictures.map((p) => (
          <Picture key={p.id} data={p} onClick={() => setActiveItem(p)} />
        ))}
      </Canvas>

      {touchGameplayEnabled && (
        <>
          <Joystick onMove={handleJoystickMove} label="Move" side="left" />
          <Joystick onMove={handleLookJoystickMove} label="Look" side="right" />
        </>
      )}
      <div className="fixed right-6 bottom-20 z-50">
        {[
          {
            id: 'recenter',
            label: 'Recenter Camera',
            onClick: () => setRecenterSignal((n) => n + 1),
            active: false,
          },
          {
            id: 'touch',
            label: 'Toggle Touch Gameplay',
            onClick: () => setTouchGameplayEnabled((v) => !v),
            active: touchGameplayEnabled,
          },
          {
            id: 'flat',
            label: 'Flat Geometry Active',
            onClick: () => setFlatGeometryActive((v) => !v),
            active: flatGeometryActive,
          },
        ].map((action, idx) => (
          <button
            key={action.id}
            type="button"
            onClick={action.onClick}
            className={`absolute right-0 h-12 w-12 rounded-full border text-[10px] px-1 leading-tight shadow-lg transition-all duration-300 ${
              action.active
                ? 'border-[#2b8dc7] bg-[#3fa8df] text-white'
                : 'border-[#8ab8d4] bg-[#f5fbff] text-[#1f5f85]'
            } ${menuOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'}`}
            style={{
              transform: menuOpen ? `translateY(${-72 * (idx + 1)}px)` : 'translateY(0px) scale(0.7)',
            }}
            title={action.label}
          >
            {action.id === 'recenter' ? 'RC' : action.id === 'touch' ? 'TG' : 'FG'}
          </button>
        ))}
        <button
          type="button"
          onClick={() => setMenuOpen((v) => !v)}
          className="h-14 w-14 rounded-full border border-[#8ab8d4] bg-[#f5fbff] text-[#1f5f85] shadow-xl transition-transform duration-300 hover:scale-105"
          title="Open actions"
        >
          {menuOpen ? '×' : '+'}
        </button>
      </div>
      {isVrSupported && (
        <button
          type="button"
          onClick={handleEnterVr}
          className="fixed left-1/2 -translate-x-1/2 bottom-4 z-50 rounded-md border border-[#7eaecb] bg-[#f5fbff] px-4 py-2 text-sm text-[#1f5f85] hover:bg-[#e4f2fb]"
        >
          {isInVr ? 'VR Active' : 'Enter VR'}
        </button>
      )}
      {vrError && (
        <div className="fixed right-4 bottom-20 z-50 max-w-[280px] rounded-md border border-red-300/30 bg-black/70 px-3 py-2 text-xs text-red-200">
          {vrError}
        </div>
      )}

      {activeItem && (
        <Modal
          data={activeItem}
          onClose={() => {
            manualCloseIdRef.current = activeItem.id;
            setActiveItem(null);
          }}
        />
      )}
    </div>
  );
}

export default function Scene() {
  return (
    <ModalProvider>
      <SceneInner />
    </ModalProvider>
  );
}
