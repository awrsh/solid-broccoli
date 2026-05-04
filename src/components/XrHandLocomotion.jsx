import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { XRHandModelFactory } from 'three/addons/webxr/XRHandModelFactory.js';

const factory = new XRHandModelFactory();

const vHead = new THREE.Vector3();
const vToWrist = new THREE.Vector3();
const vForward = new THREE.Vector3();
const vRight = new THREE.Vector3();
const vRel = new THREE.Vector3();
const quatInv = new THREE.Quaternion();

function wristWorldPosition(xrFrame, refSpace, inputSource) {
  if (!inputSource?.hand) return null;
  const wrist = inputSource.hand.get('wrist');
  if (!wrist) return null;
  const pose = xrFrame.getJointPose(wrist, refSpace);
  if (!pose) return null;
  const t = pose.transform.position;
  return new THREE.Vector3(t.x, t.y, t.z);
}

/**
 * WebXR hand tracking: hand meshes + wrist-driven move / look (uses same refs as on-screen joysticks).
 *
 * Left wrist vs head (XZ): forward/back + strafe. Right wrist in camera-local space: look.
 */
export default function XrHandLocomotion({ moveRef, lookRef }) {
  const { gl, scene, camera } = useThree();
  const cleanupRef = useRef(null);

  useEffect(() => {
    const h0 = gl.xr.getHand(0);
    const h1 = gl.xr.getHand(1);
    const leftModel = factory.createHandModel(h0, 'spheres');
    const rightModel = factory.createHandModel(h1, 'spheres');
    h0.add(leftModel);
    h1.add(rightModel);
    scene.add(h0);
    scene.add(h1);
    cleanupRef.current = () => {
      h0.remove(leftModel);
      h1.remove(rightModel);
      scene.remove(h0);
      scene.remove(h1);
    };

    return () => {
      cleanupRef.current?.();
      cleanupRef.current = null;
    };
  }, [gl, scene]);

  useFrame((_, delta) => {
    if (!moveRef || !lookRef) return;
    if (!gl.xr.isPresenting) {
      moveRef.current = { x: 0, y: 0 };
      lookRef.current = { x: 0, y: 0 };
      return;
    }

    const xrFrame = gl.xr.getFrame();
    const refSpace = gl.xr.getReferenceSpace();
    const session = gl.xr.getSession();
    if (!xrFrame || !refSpace || !session) {
      moveRef.current = { x: 0, y: 0 };
      lookRef.current = { x: 0, y: 0 };
      return;
    }

    const withHands = session.inputSources.filter((s) => s.hand);
    /** @type {THREE.Vector3 | null} */
    let leftWrist = null;
    /** @type {THREE.Vector3 | null} */
    let rightWrist = null;

    for (const src of withHands) {
      const p = wristWorldPosition(xrFrame, refSpace, src);
      if (!p) continue;
      if (src.handedness === 'left') leftWrist = p;
      else if (src.handedness === 'right') rightWrist = p;
    }

    if (!leftWrist && withHands[0]) {
      leftWrist = wristWorldPosition(xrFrame, refSpace, withHands[0]);
    }
    if (!rightWrist) {
      const rightSrc = withHands.find((s) => s.handedness === 'right');
      if (rightSrc) rightWrist = wristWorldPosition(xrFrame, refSpace, rightSrc);
      else if (withHands.length > 1) {
        const second = withHands.find((s) => s !== withHands[0]);
        if (second) rightWrist = wristWorldPosition(xrFrame, refSpace, second);
      }
    }

    camera.getWorldPosition(vHead);

    vForward.set(0, 0, -1).applyQuaternion(camera.quaternion);
    vForward.y = 0;
    if (vForward.lengthSq() < 1e-8) {
      moveRef.current = { x: 0, y: 0 };
      lookRef.current = { x: 0, y: 0 };
      return;
    }
    vForward.normalize();
    vRight.crossVectors(vForward, new THREE.Vector3(0, 1, 0)).normalize();

    const deadMoveF = 0.12;
    const deadMoveS = 0.1;
    const scaleMoveF = 0.28;
    const scaleMoveS = 0.22;

    if (leftWrist) {
      vToWrist.copy(leftWrist).sub(vHead);
      vToWrist.y = 0;
      let f = vToWrist.dot(vForward);
      let s = vToWrist.dot(vRight);
      if (Math.abs(f) < deadMoveF) f = 0;
      else f = THREE.MathUtils.clamp(Math.sign(f) * ((Math.abs(f) - deadMoveF) / scaleMoveF), -1, 1);
      if (Math.abs(s) < deadMoveS) s = 0;
      else s = THREE.MathUtils.clamp(Math.sign(s) * ((Math.abs(s) - deadMoveS) / scaleMoveS), -1, 1);
      moveRef.current = { x: s, y: -f };
    } else {
      moveRef.current = { x: 0, y: 0 };
    }

    const deadLook = 0.08;
    const scaleLook = 0.22;
    const smooth = 1 - Math.exp(-10 * delta);

    if (rightWrist) {
      vRel.copy(rightWrist).sub(vHead);
      quatInv.copy(camera.quaternion).invert();
      vRel.applyQuaternion(quatInv);
      let lx = vRel.x;
      let ly = vRel.y;
      if (Math.abs(lx) < deadLook) lx = 0;
      else lx = THREE.MathUtils.clamp(Math.sign(lx) * ((Math.abs(lx) - deadLook) / scaleLook), -1, 1);
      if (Math.abs(ly) < deadLook) ly = 0;
      else ly = THREE.MathUtils.clamp(Math.sign(ly) * ((Math.abs(ly) - deadLook) / scaleLook), -1, 1);
      lookRef.current.x += (lx - lookRef.current.x) * smooth;
      lookRef.current.y += (ly - lookRef.current.y) * smooth;
    } else {
      lookRef.current.x += (0 - lookRef.current.x) * smooth;
      lookRef.current.y += (0 - lookRef.current.y) * smooth;
    }
  });

  return null;
}
