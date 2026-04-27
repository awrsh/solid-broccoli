import { Text3D } from '@react-three/drei';

export default function Room() {
  const radius = 24;

  return (
    <>
      {/* Clean lab floor */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -1.82, 0]} receiveShadow>
        <circleGeometry args={[12.5, 128]} />
        <meshStandardMaterial color="#e7eef4" roughness={0.4} metalness={0.18} envMapIntensity={1.05} />
      </mesh>

      {/* Clinical floor accents */}
      <mesh rotation={[Math.PI / 2, 0, 0]} position={[0, -1.78, 0]}>
        <torusGeometry args={[5.6, 0.012, 10, 240]} />
        <meshBasicMaterial color="#6db7e6" transparent opacity={0.18} />
      </mesh>
      <mesh rotation={[Math.PI / 2, 0, 0]} position={[0, -1.78, 0]} scale={1.32}>
        <torusGeometry args={[5.6, 0.012, 10, 240]} />
        <meshBasicMaterial color="#9dd5f5" transparent opacity={0.13} />
      </mesh>

      {/* Floor logotype (extruded) */}
      <group position={[0, -1.62, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <Text3D
          font="https://cdn.jsdelivr.net/npm/three@0.161.0/examples/fonts/helvetiker_bold.typeface.json"
          size={2.2}
          height={0.24}
          curveSegments={12}
          bevelEnabled
          bevelThickness={0.03}
          bevelSize={0.02}
          bevelOffset={0}
          bevelSegments={4}
          position={[-7, 0, 0]}
        >
          CinnaGen
          <meshStandardMaterial
            color="#ff8a1f"
            emissive="#ff5a00"
            emissiveIntensity={0.34}
            roughness={0.24}
            metalness={0.4}
            envMapIntensity={1.5}
          />
        </Text3D>
      </group>

      {/* Boundary ring */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -1.81, 0]}>
        <ringGeometry args={[radius - 0.6, radius, 160]} />
        <meshBasicMaterial color="#7bb8dd" transparent opacity={0.08} />
      </mesh>

      {/* Lab counters */}
      {[
        [0, -1.2, -11],
        [0, -1.2, 11],
        [-11, -1.2, 0],
        [11, -1.2, 0],
      ].map((pos, idx) => (
        <group key={`counter-${idx}`} position={pos}>
          <mesh>
            <boxGeometry args={[6.8, 1.2, 1.8]} />
            <meshStandardMaterial color="#dbe6ef" roughness={0.5} metalness={0.08} />
          </mesh>
          <mesh position={[0, 0.7, 0]}>
            <boxGeometry args={[7.1, 0.16, 2]} />
            <meshStandardMaterial color="#f3f7fb" roughness={0.2} metalness={0.05} />
          </mesh>
        </group>
      ))}

      {/* Bioreactors */}
      {[
        [-8, -1.1, -8],
        [8, -1.1, -8],
      ].map((pos, idx) => (
        <group key={`bioreactor-${idx}`} position={pos}>
          <mesh position={[0, 1, 0]}>
            <cylinderGeometry args={[0.6, 0.6, 2.2, 30]} />
            <meshStandardMaterial
              color="#d8f3ff"
              transparent
              opacity={0.36}
              roughness={0.05}
              metalness={0}
            />
          </mesh>
          <mesh position={[0, 2.15, 0]}>
            <cylinderGeometry args={[0.46, 0.46, 0.34, 24]} />
            <meshStandardMaterial color="#6f8ea3" roughness={0.45} metalness={0.2} />
          </mesh>
          <mesh position={[0, -0.15, 0]}>
            <cylinderGeometry args={[0.68, 0.68, 0.2, 24]} />
            <meshStandardMaterial color="#90a9bb" roughness={0.45} metalness={0.2} />
          </mesh>
          <mesh position={[0.73, 1.35, 0]}>
            <cylinderGeometry args={[0.05, 0.05, 0.9, 14]} rotation={[0, 0, Math.PI / 2]} />
            <meshStandardMaterial color="#7fa3bd" roughness={0.35} metalness={0.2} />
          </mesh>
        </group>
      ))}

      {/* Fermentor */}
      <group position={[0, -1.1, 8.8]}>
        <mesh position={[0, 1.15, 0]}>
          <cylinderGeometry args={[0.95, 1.05, 2.5, 36]} />
          <meshStandardMaterial
            color="#def4ff"
            transparent
            opacity={0.34}
            roughness={0.05}
            metalness={0.05}
          />
        </mesh>
        <mesh position={[0, 2.6, 0]}>
          <cylinderGeometry args={[0.8, 0.8, 0.28, 30]} />
          <meshStandardMaterial color="#6f8ea3" roughness={0.4} metalness={0.25} />
        </mesh>
        <mesh position={[0, -0.2, 0]}>
          <cylinderGeometry args={[1.15, 1.15, 0.24, 30]} />
          <meshStandardMaterial color="#90a9bb" roughness={0.45} metalness={0.2} />
        </mesh>
        <mesh position={[0.95, 1.35, 0]} rotation={[0, 0, Math.PI / 2]}>
          <cylinderGeometry args={[0.06, 0.06, 1.1, 16]} />
          <meshStandardMaterial color="#7fa3bd" roughness={0.35} metalness={0.2} />
        </mesh>
      </group>

      {/* Chromatography columns */}
      {[-1.2, 0, 1.2].map((x, idx) => (
        <group key={`column-${idx}`} position={[x, -1.1, -8.8]}>
          <mesh position={[0, 1.25, 0]}>
            <cylinderGeometry args={[0.22, 0.22, 2.5, 24]} />
            <meshStandardMaterial
              color="#d8f3ff"
              transparent
              opacity={0.42}
              roughness={0.08}
              metalness={0}
            />
          </mesh>
          <mesh position={[0, 2.6, 0]}>
            <cylinderGeometry args={[0.18, 0.18, 0.26, 20]} />
            <meshStandardMaterial color="#7b98ad" roughness={0.4} metalness={0.22} />
          </mesh>
          <mesh position={[0, -0.1, 0]}>
            <cylinderGeometry args={[0.24, 0.24, 0.2, 20]} />
            <meshStandardMaterial color="#8ba8bb" roughness={0.42} metalness={0.22} />
          </mesh>
        </group>
      ))}
    </>
  );
}
