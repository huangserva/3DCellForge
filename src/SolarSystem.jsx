import { Canvas, useFrame } from '@react-three/fiber'
import { OrbitControls, Stars } from '@react-three/drei'
import { useRef } from 'react'

function Planet({ name, size, distance, speed, color }) {
  const orbitRef = useRef()
  const planetRef = useRef()

  useFrame(({ clock }) => {
    const t = clock.getElapsedTime()
    orbitRef.current.rotation.y = t * speed
    planetRef.current.rotation.y = t * 2
  })

  return (
    <group ref={orbitRef}>
      <mesh position={[distance, 0, 0]} ref={planetRef}>
        <sphereGeometry args={[size, 32, 32]} />
        <meshStandardMaterial color={color} />
      </mesh>

      <mesh rotation={[Math.PI / 2, 0, 0]}>
        <ringGeometry args={[distance - 0.01, distance + 0.01, 128]} />
        <meshBasicMaterial color="#444" />
      </mesh>
    </group>
  )
}

export default function SolarSystem() {
  return (
    <div style={{ width: '100%', height: '100vh', background: '#020617' }}>
      <Canvas camera={{ position: [0, 18, 28], fov: 55 }}>
        <ambientLight intensity={0.4} />
        <pointLight position={[0, 0, 0]} intensity={3} />

        <Stars radius={120} depth={60} count={6000} factor={4} />

        {/* 太阳 */}
        <mesh>
          <sphereGeometry args={[2.2, 64, 64]} />
          <meshStandardMaterial emissive="#facc15" color="#f97316" />
        </mesh>

        <Planet name="Mercury" size={0.25} distance={4} speed={1.6} color="#aaa" />
        <Planet name="Venus" size={0.45} distance={5.5} speed={1.2} color="#d6a85c" />
        <Planet name="Earth" size={0.5} distance={7.2} speed={1} color="#3b82f6" />
        <Planet name="Mars" size={0.38} distance={9} speed={0.8} color="#ef4444" />
        <Planet name="Jupiter" size={1.1} distance={12} speed={0.45} color="#c08457" />
        <Planet name="Saturn" size={0.95} distance={15} speed={0.35} color="#eab308" />
        <Planet name="Uranus" size={0.7} distance={18} speed={0.25} color="#67e8f9" />
        <Planet name="Neptune" size={0.7} distance={21} speed={0.2} color="#2563eb" />

        <OrbitControls enablePan enableZoom enableRotate />
      </Canvas>
    </div>
  )
}
