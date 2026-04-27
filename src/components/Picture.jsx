import { useTexture, Html } from '@react-three/drei';
import { useFrame, useThree } from '@react-three/fiber';
import { useRef, useState, useMemo } from 'react';
import * as THREE from 'three';
import { useModal } from './ModalContext';

export default function Picture({ data, onClick }) {
  const texture = useTexture(data.image);

  const group = useRef();
  const { camera } = useThree();

  const [near, setNear] = useState(false);

  const { activeItem } = useModal();
  const modalOpen = !!activeItem;

  const aspect = useMemo(() => {
    if (!texture.image) return 1;
    return texture.image.width / texture.image.height;
  }, [texture]);

  const baseHeight = 4;

  const width = baseHeight * aspect;
  const height = baseHeight;

  useFrame((_, delta) => {
    if (!group.current) return;

    const targetPosition = new THREE.Vector3(...data.position);
    const targetRotation = new THREE.Euler(...(data.rotation ?? [0, 0, 0]));
    const targetQuaternion = new THREE.Quaternion().setFromEuler(targetRotation);
    const blend = Math.min(1, 8 * delta);

    group.current.position.lerp(targetPosition, blend);
    group.current.quaternion.slerp(targetQuaternion, blend);

    const d = group.current.position.distanceTo(camera.position);
    setNear(d < 10);
  });

  return (
    <group ref={group} position={data.position} rotation={data.rotation ?? [0, 0, 0]}>
      {/* Picture */}
      <mesh onClick={near ? onClick : null}>
        <planeGeometry args={[width, height]} />
        <meshStandardMaterial map={texture} />
      </mesh>

      {/* UI */}
      {near && !modalOpen && (
        <Html position={[0, height / 2 + 0.4, 0]} transform center scale={0.5}>
          <div className="bg-black/60 text-white text-xs p-2 rounded-sm">{data.title}</div>
        </Html>
      )}
    </group>
  );
}
