export default function Lights() {
  return (
    <>
      <ambientLight intensity={0.65} color="#f5fbff" />
      <hemisphereLight args={['#e8f5ff', '#d7e7f4', 0.8]} />
      <spotLight
        position={[0, 11, 0]}
        intensity={2.2}
        angle={0.85}
        penumbra={0.55}
        distance={36}
        decay={1.6}
        color="#f8fcff"
        castShadow
      />
      <spotLight
        position={[11, 9, -2]}
        intensity={1.45}
        angle={0.52}
        penumbra={0.6}
        distance={34}
        decay={1.8}
        color="#dff3ff"
      />
      <spotLight
        position={[-11, 9, 2]}
        intensity={1.45}
        angle={0.52}
        penumbra={0.6}
        distance={34}
        decay={1.8}
        color="#dff3ff"
      />
      <spotLight
        position={[0, 8.2, -12]}
        intensity={1.15}
        angle={0.45}
        penumbra={0.65}
        distance={26}
        decay={1.9}
        color="#e6f6ff"
      />
      <spotLight
        position={[0, 8.2, 12]}
        intensity={1.15}
        angle={0.45}
        penumbra={0.65}
        distance={26}
        decay={1.9}
        color="#e6f6ff"
      />
    </>
  );
}
