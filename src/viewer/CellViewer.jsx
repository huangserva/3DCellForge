import { Component, Suspense, useEffect, useMemo, useRef, useState } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { ContactShadows, Environment, Lightformer, Line, OrbitControls, RoundedBox, useGLTF, useTexture } from '@react-three/drei'
import * as THREE from 'three'
import { CELL_BODY, CELL_TYPES, ORGANELLES } from '../domain/cellData.js'
import { getEnvironmentPreset } from './environments.js'
import { getModelCellId } from '../domain/cellCatalog.js'
import { exportObjectAsGlb } from '../lib/downloads.js'
import { buildLayeredPngVisual, createImageReliefGeometry } from '../lib/imagePipeline.js'
import { pickSpherePoint, seeded } from '../lib/math.js'
import { canUseWebGL } from '../lib/webgl.js'
import { apiUrl } from '../services/modelApi.js'
import plantCellRender from '../assets/cell-plant-render.png'

function ClickableGroup({ id, onSelect, children, ...props }) {
  return (
    <group
      {...props}
      onClick={(event) => {
        event.stopPropagation()
        onSelect(id)
      }}
    >
      {children}
    </group>
  )
}

const DEFAULT_PRESENTATION_DURATION = 7600
const DEFAULT_CELL_CAMERA_POSITION = [0, 0.1, 6.05]
const DEFAULT_RELIEF_CAMERA_POSITION = [0, 0.18, 5.35]
const DEFAULT_CAMERA_TARGET = [0, 0, 0]
const PRESENTATION_DURATION_BY_PROFILE = {
  artifact: 9000,
  road: 7800,
  aircraft: 7200,
  vessel: 8600,
  specimen: 8200,
  product: 7600,
}

function smoothPingPong(elapsed, durationMs) {
  const durationSeconds = Math.max(1, durationMs / 1000)
  const phase = (elapsed % durationSeconds) / durationSeconds
  return {
    phase,
    sweep: 0.5 - Math.cos(phase * Math.PI * 2) * 0.5,
    wave: Math.sin(phase * Math.PI * 2),
    lift: Math.sin(phase * Math.PI * 4),
  }
}

function lookAt(camera, target) {
  camera.lookAt(target[0], target[1], target[2])
}

function resetTransform(object) {
  object.position.set(0, 0, 0)
  object.rotation.set(0, 0, 0)
  object.scale.setScalar(1)
}

function PresentationMotionRig({
  enabled,
  motionProfile = 'product',
  targetRef,
  defaultCameraPosition = DEFAULT_CELL_CAMERA_POSITION,
  defaultTarget = DEFAULT_CAMERA_TARGET,
}) {
  const { camera } = useThree()

  useEffect(() => {
    const target = targetRef.current

    if (!enabled) {
      if (target) resetTransform(target)
      camera.position.set(defaultCameraPosition[0], defaultCameraPosition[1], defaultCameraPosition[2])
      lookAt(camera, defaultTarget)
      return undefined
    }

    return () => {
      if (target) resetTransform(target)
      camera.position.set(defaultCameraPosition[0], defaultCameraPosition[1], defaultCameraPosition[2])
      lookAt(camera, defaultTarget)
    }
  }, [camera, defaultCameraPosition, defaultTarget, enabled, targetRef])

  useFrame(({ clock }) => {
    if (!enabled || !targetRef.current) return

    const { sweep, wave, lift } = smoothPingPong(clock.elapsedTime, PRESENTATION_DURATION_BY_PROFILE[motionProfile] || DEFAULT_PRESENTATION_DURATION)
    const root = targetRef.current

    if (motionProfile === 'artifact') {
      root.position.set(wave * 0.035, -0.03 + lift * 0.01, 0.02 - sweep * 0.1)
      root.rotation.set(-0.06 + lift * 0.012, -0.74 + sweep * 1.48, wave * 0.01)
      root.scale.setScalar(1.02 + sweep * 0.05)
      camera.position.set(1.05 + wave * 0.36, 0.74 + lift * 0.035, 4.78 - sweep * 0.32)
      lookAt(camera, [0, 0.08, 0])
      return
    }

    if (motionProfile === 'road') {
      root.position.set(wave * 0.08, -0.08 + wave * 0.018, -0.7 + sweep * 1.12)
      root.rotation.set(-0.09 + lift * 0.01, -0.34 + sweep * 0.52, wave * 0.012)
      root.scale.setScalar(0.9 + sweep * 0.18)
      camera.position.set(2.45 - sweep * 0.72, 0.62 + wave * 0.05, 4.92 - sweep * 0.42)
      lookAt(camera, [0, 0.02, 0.08 + sweep * 0.2])
      return
    }

    if (motionProfile === 'aircraft') {
      root.position.set(-0.82 + sweep * 1.64, 0.2 + wave * 0.18, -0.14 + sweep * 0.22)
      root.rotation.set(-0.08 + wave * 0.04, -0.82 + sweep * 1.42, -wave * 0.32)
      root.scale.setScalar(0.92 + sweep * 0.1)
      camera.position.set(2.65 - sweep * 1.08, 1.46 + lift * 0.06, 5.04 - sweep * 0.34)
      lookAt(camera, [root.position.x * 0.32, 0.08 + root.position.y * 0.22, -0.08])
      return
    }

    if (motionProfile === 'vessel') {
      root.position.set(-0.62 + sweep * 1.24, -0.05 + wave * 0.008, 0.02)
      root.rotation.set(-0.035, -0.2 + sweep * 0.4, wave * 0.006)
      root.scale.setScalar(1)
      camera.position.set(4.45 - sweep * 1.42, 1.04 + lift * 0.025, 5.28)
      lookAt(camera, [0.05, 0.04, 0])
      return
    }

    if (motionProfile === 'specimen') {
      root.position.set(wave * 0.05, lift * 0.018, 0.06 - sweep * 0.12)
      root.rotation.set(-0.12 + lift * 0.035, -0.54 + sweep * 1.08, wave * 0.025)
      root.scale.setScalar(1)
      camera.position.set(wave * 0.42, 0.32 + lift * 0.035, 5.55 - sweep * 0.58)
      lookAt(camera, [0, 0.08, 0])
      return
    }

    root.position.set(wave * 0.04, lift * 0.02, 0.08 - sweep * 0.18)
    root.rotation.set(-0.08 + lift * 0.02, -0.48 + sweep * 0.96, wave * 0.018)
    root.scale.setScalar(1)
    camera.position.set(0.82 + wave * 0.58, 0.56 + lift * 0.04, 5.2 - sweep * 0.44)
    lookAt(camera, [0, 0.06, 0])
  })

  return null
}

/**
 * 本地光棚（IBL）。
 *
 * 用 drei <Environment> 传 children 的形式：drei 会把这些几何体渲进一张 cubemap
 * 当环境贴图，全程本地完成，不会从任何 CDN 拉 HDRI —— 对主打「可自托管」的
 * 工具来说这个取舍很重要。
 *
 * 不用 <Environment preset>：preset 会从 pmndrs CDN 取 HDRI，离线跑不了。
 * 也不直接改 scene.environment：react-hooks/immutability 不允许改写 hook 返回值。
 *
 * 没有它，Tripo / Hunyuan3D 输出的 PBR 材质会发灰 —— 金属度高的表面没有
 * 环境可反射，粗糙度也体现不出来。
 *
 * 预设定义在 ./environments.js，全部本地生成，可零延迟切换。
 */
function StudioEnvironment({ preset = 'studio', background = false }) {
  const config = getEnvironmentPreset(preset)

  return (
    <Environment resolution={256} background={background} environmentIntensity={config.intensity}>
      <mesh scale={60}>
        <sphereGeometry args={[1, 32, 32]} />
        <meshBasicMaterial color={config.shell} side={THREE.BackSide} />
      </mesh>
      {config.lights.map((light, index) => (
        // key 带上 config.id，切换预设时整组重建，保证 cubemap 重新渲染
        <Lightformer
          key={`${config.id}-${index}`}
          form={light.form}
          intensity={light.intensity}
          color={light.color}
          position={light.position}
          scale={light.scale}
          target={[0, 0, 0]}
        />
      ))}
    </Environment>
  )
}

function PresentationEnvironment({ profile }) {
  const groupRef = useRef(null)
  const stripeRefs = useRef([])
  const waveRefs = useRef([])
  const stripeOffsets = useMemo(() => Array.from({ length: 12 }, (_, index) => -5.4 + index * 0.95), [])
  const waveOffsets = useMemo(() => Array.from({ length: 9 }, (_, index) => -3.8 + index * 0.95), [])

  useFrame(({ clock }) => {
    if (profile === 'road') {
      stripeRefs.current.forEach((stripe, index) => {
        if (!stripe) return
        stripe.position.z = ((stripeOffsets[index] + clock.elapsedTime * 3.1 + 5.6) % 11.2) - 5.6
      })
    }

    if (profile === 'vessel') {
      waveRefs.current.forEach((wave, index) => {
        if (!wave) return
        wave.position.z = ((waveOffsets[index] + clock.elapsedTime * 0.62 + 4.2) % 8.4) - 4.2
      })
    }

    if (profile === 'aircraft' && groupRef.current) {
      groupRef.current.position.x = Math.sin(clock.elapsedTime * 0.55) * 0.34
      groupRef.current.position.y = Math.sin(clock.elapsedTime * 0.42) * 0.06
    }
  })

  if (profile === 'road') {
    return (
      <group position={[0, -1.42, 0.25]} rotation={[-Math.PI / 2, 0, 0]}>
        <mesh position={[0, 0, 0]}>
          <planeGeometry args={[5.8, 11.2]} />
          <meshStandardMaterial color="#687579" transparent opacity={0.64} roughness={0.86} depthWrite={false} />
        </mesh>
        <mesh position={[0, 0.006, 0]}>
          <planeGeometry args={[2.15, 11.2]} />
          <meshStandardMaterial color="#2c3638" transparent opacity={0.46} roughness={0.92} depthWrite={false} />
        </mesh>
        <mesh position={[-1.42, 0.012, 0]}>
          <planeGeometry args={[0.035, 11.2]} />
          <meshBasicMaterial color="#ffffff" transparent opacity={0.76} depthWrite={false} />
        </mesh>
        <mesh position={[1.42, 0.012, 0]}>
          <planeGeometry args={[0.035, 11.2]} />
          <meshBasicMaterial color="#ffffff" transparent opacity={0.76} depthWrite={false} />
        </mesh>
        {[-2.18, 2.18].map((x) => (
          <Line
            key={x}
            points={[[x, 0.03, -5.3], [x, 0.03, 5.3]]}
            color="#d7e5e7"
            lineWidth={2.2}
            transparent
            opacity={0.48}
          />
        ))}
        {stripeOffsets.map((z, index) => (
          <mesh
            key={z}
            ref={(node) => {
              stripeRefs.current[index] = node
            }}
            position={[0, 0.018, z]}
          >
            <planeGeometry args={[0.09, 0.54]} />
            <meshBasicMaterial color="#ffffff" transparent opacity={0.76} depthWrite={false} />
          </mesh>
        ))}
      </group>
    )
  }

  if (profile === 'aircraft') {
    return (
      <group ref={groupRef} position={[0, 0.45, -0.35]}>
        {[
          [-2.4, 1.15, -0.45, 0.62],
          [1.9, 1.0, -0.6, 0.5],
          [-1.4, -0.9, -0.55, 0.42],
        ].map(([x, y, z, scale], index) => (
          <group key={index} position={[x, y, z]} scale={scale}>
            {[-0.28, 0, 0.32].map((offset, cloudIndex) => (
              <mesh key={cloudIndex} position={[offset, Math.sin(cloudIndex) * 0.06, 0]}>
                <sphereGeometry args={[0.34, 24, 24]} />
                <meshBasicMaterial color="#ffffff" transparent opacity={0.22} depthWrite={false} />
              </mesh>
            ))}
          </group>
        ))}
        {[-1.55, -0.92, -0.28, 0.36, 0.98, 1.54].map((y, index) => (
          <Line
            key={y}
            points={[
              [-3.2, y, -0.12 - index * 0.04],
              [-0.4, y + 0.18, 0.1],
              [3.4, y + 0.44, 0.28 + index * 0.03],
            ]}
            color={index % 2 ? '#ffffff' : '#7fb2cf'}
            lineWidth={index % 2 ? 1.1 : 1.6}
            transparent
            opacity={index % 2 ? 0.36 : 0.26}
          />
        ))}
      </group>
    )
  }

  if (profile === 'vessel') {
    return (
      <group position={[0, -1.36, 0.15]} rotation={[-Math.PI / 2, 0, 0]}>
        <mesh>
          <planeGeometry args={[6.4, 8.6]} />
          <meshStandardMaterial color="#67aebf" transparent opacity={0.5} roughness={0.72} depthWrite={false} />
        </mesh>
        {waveOffsets.map((z, index) => (
          <mesh
            key={z}
            ref={(node) => {
              waveRefs.current[index] = node
            }}
            position={[0, 0.016, z]}
          >
            <planeGeometry args={[4.8 - (index % 3) * 0.5, 0.025]} />
            <meshBasicMaterial color={index % 2 ? '#ffffff' : '#2c839b'} transparent opacity={index % 2 ? 0.78 : 0.52} depthWrite={false} />
          </mesh>
        ))}
        <mesh position={[0, 0.022, -0.7]}>
          <planeGeometry args={[3.4, 1.55]} />
          <meshBasicMaterial color="#ffffff" transparent opacity={0.38} depthWrite={false} />
        </mesh>
      </group>
    )
  }

  if (profile === 'artifact') {
    return (
      <group>
        <spotLight position={[0, 4.4, 2.8]} angle={0.38} penumbra={0.78} intensity={4.2} color="#ffd29a" />
        <pointLight position={[-2.8, 1.1, 1.8]} intensity={1.1} color="#7dd3fc" />
        <mesh position={[0, -1.42, 0]} receiveShadow>
          <cylinderGeometry args={[1.38, 1.62, 0.24, 96]} />
          <meshStandardMaterial color="#1c1713" metalness={0.18} roughness={0.48} />
        </mesh>
        <mesh position={[0, -1.28, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <circleGeometry args={[1.52, 96]} />
          <meshBasicMaterial color="#c7923a" transparent opacity={0.16} depthWrite={false} />
        </mesh>
        {[1.55, 1.95, 2.35].map((radius, index) => (
          <mesh key={radius} position={[0, -1.25 + index * 0.012, 0]} rotation={[-Math.PI / 2, 0, 0]}>
            <torusGeometry args={[radius, 0.006, 8, 128]} />
            <meshBasicMaterial color="#c7923a" transparent opacity={0.26 - index * 0.05} depthWrite={false} />
          </mesh>
        ))}
      </group>
    )
  }

  if (profile === 'product') {
    return (
      <group>
        <mesh position={[0, -1.38, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <circleGeometry args={[2.25, 96]} />
          <meshStandardMaterial color="#e9f0ef" transparent opacity={0.44} roughness={0.22} metalness={0.05} depthWrite={false} />
        </mesh>
        {[-1.9, 1.9].map((x) => (
          <mesh key={x} position={[x, 0.62, -0.62]} rotation={[0.12, x > 0 ? -0.34 : 0.34, 0]}>
            <planeGeometry args={[0.52, 1.35]} />
            <meshBasicMaterial color="#ffffff" transparent opacity={0.3} depthWrite={false} />
          </mesh>
        ))}
      </group>
    )
  }

  if (profile === 'specimen') {
    return (
      <group>
        <mesh position={[0, -1.4, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <circleGeometry args={[2.45, 96]} />
          <meshBasicMaterial color="#b7d7db" transparent opacity={0.18} depthWrite={false} />
        </mesh>
        {[-1.8, -1.2, -0.6, 0, 0.6, 1.2, 1.8].map((x) => (
          <Line key={`x-${x}`} points={[[x, -1.36, -1.8], [x, -1.36, 1.8]]} color="#8cc4cf" lineWidth={0.8} transparent opacity={0.22} />
        ))}
        {[-1.8, -1.2, -0.6, 0, 0.6, 1.2, 1.8].map((z) => (
          <Line key={`z-${z}`} points={[[-1.8, -1.36, z], [1.8, -1.36, z]]} color="#8cc4cf" lineWidth={0.8} transparent opacity={0.22} />
        ))}
      </group>
    )
  }

  return null
}

function PlantChloroplast({ position, rotation = [0, 0, 0], scale = 1 }) {
  return (
    <group position={position} rotation={rotation} scale={scale}>
      <mesh>
        <capsuleGeometry args={[0.13, 0.5, 14, 34]} />
        <meshPhysicalMaterial color="#78b83d" roughness={0.42} clearcoat={0.35} clearcoatRoughness={0.35} />
      </mesh>
      {[-0.18, -0.09, 0, 0.09, 0.18].map((y) => (
        <mesh key={y} position={[0, y, 0.035]} rotation={[Math.PI / 2, 0, 0]}>
          <torusGeometry args={[0.085, 0.012, 8, 28]} />
          <meshStandardMaterial color="#3f7d20" roughness={0.38} />
        </mesh>
      ))}
    </group>
  )
}

function PlantMitochondrion({ position, rotation = [0, 0, 0], scale = 1 }) {
  return (
    <group position={position} rotation={rotation} scale={scale}>
      <mesh>
        <capsuleGeometry args={[0.095, 0.42, 12, 30]} />
        <meshStandardMaterial color="#f07832" emissive="#b84213" emissiveIntensity={0.12} roughness={0.38} />
      </mesh>
      {[-0.13, 0, 0.13].map((y) => (
        <Line
          key={y}
          points={[
            [-0.055, y - 0.04, 0.08],
            [0.055, y, 0.09],
            [-0.035, y + 0.045, 0.08],
          ]}
          color="#ffd0a8"
          lineWidth={1.4}
          transparent
          opacity={0.75}
        />
      ))}
    </group>
  )
}

function PlantGolgi({ position, rotation = [0, 0, 0] }) {
  return (
    <group position={position} rotation={rotation}>
      {[-0.18, -0.09, 0, 0.09, 0.18].map((y, index) => (
        <RoundedBox key={y} args={[0.56 - index * 0.035, 0.05, 0.07]} radius={0.025} smoothness={4} position={[0, y, index * 0.018]}>
          <meshStandardMaterial color={index % 2 === 0 ? '#f28a72' : '#ef6f86'} roughness={0.42} />
        </RoundedBox>
      ))}
      {[0, 1, 2, 3, 4].map((index) => (
        <mesh key={index} position={[0.36 + seeded(index) * 0.16, -0.2 + index * 0.09, 0.05]}>
          <sphereGeometry args={[0.045, 18, 18]} />
          <meshStandardMaterial color="#f08b65" roughness={0.34} />
        </mesh>
      ))}
    </group>
  )
}

function PlantCellWallPores() {
  const pores = useMemo(
    () =>
      Array.from({ length: 46 }, (_, index) => {
        const onHorizontal = index % 2 === 0
        const side = seeded(index) > 0.5 ? 1 : -1
        return {
          position: onHorizontal
            ? [(seeded(index + 10) - 0.5) * 2.85, side * (0.86 + seeded(index + 20) * 0.08), 0.29 + seeded(index + 30) * 0.05]
            : [side * (1.45 + seeded(index + 10) * 0.08), (seeded(index + 20) - 0.5) * 1.55, 0.29 + seeded(index + 30) * 0.05],
          scale: 0.018 + seeded(index + 40) * 0.018,
        }
      }),
    [],
  )

  return (
    <group>
      {pores.map((pore, index) => (
        <mesh key={index} position={pore.position} scale={[pore.scale * 1.45, pore.scale, pore.scale * 0.24]}>
          <sphereGeometry args={[1, 12, 12]} />
          <meshStandardMaterial color="#5e7f30" roughness={0.72} transparent opacity={0.62} />
        </mesh>
      ))}
    </group>
  )
}

function PlantCellBubbles() {
  const bubbles = useMemo(
    () =>
      Array.from({ length: 30 }, (_, index) => ({
        position: [(seeded(index) - 0.5) * 2.35, (seeded(index + 50) - 0.5) * 1.25, 0.48 + seeded(index + 100) * 0.28],
        radius: 0.025 + seeded(index + 150) * 0.045,
      })),
    [],
  )

  return (
    <group>
      {bubbles.map((bubble, index) => (
        <mesh key={index} position={bubble.position}>
          <sphereGeometry args={[bubble.radius, 18, 18]} />
          <meshPhysicalMaterial
            color="#d8f8ff"
            transparent
            opacity={0.38}
            roughness={0.04}
            metalness={0}
            transmission={0.28}
            thickness={0.2}
            clearcoat={0.8}
          />
        </mesh>
      ))}
    </group>
  )
}

function PlantReticulum() {
  const lines = useMemo(
    () => [
      [
        [0.14, 0.55, 0.58],
        [0.38, 0.7, 0.62],
        [0.78, 0.65, 0.58],
        [1.04, 0.47, 0.54],
      ],
      [
        [0.06, 0.26, 0.6],
        [0.38, 0.12, 0.66],
        [0.86, 0.2, 0.62],
        [1.12, 0.02, 0.57],
      ],
      [
        [0.1, -0.08, 0.62],
        [0.36, -0.18, 0.7],
        [0.78, -0.1, 0.64],
        [1.02, -0.24, 0.58],
      ],
      [
        [0.12, 0.42, 0.5],
        [-0.12, 0.26, 0.58],
        [-0.38, 0.12, 0.54],
      ],
    ],
    [],
  )

  return (
    <group>
      {lines.map((points, index) => (
        <Line key={index} points={points} color={index % 2 ? '#326eb2' : '#6d46bd'} lineWidth={2.1} transparent opacity={0.7} />
      ))}
    </group>
  )
}

function PlantCellModel({ selected, crossSection, onSelect, hideOthers, proofMode, viewMode = 'layers' }) {
  const group = useRef()
  const xrayMode = viewMode === 'layers'
  const focusMode = viewMode === 'focus'
  const effectiveHideOthers = hideOthers || focusMode
  const effectiveCrossSection = crossSection || xrayMode
  const show = (id) => !effectiveHideOthers || id === selected || id === 'membrane'
  const shellOpacity = effectiveHideOthers && selected !== 'membrane' ? 0.3 : effectiveCrossSection ? 0.42 : 0.68
  const shellWireOpacity = xrayMode ? 0.22 : selected === 'membrane' ? 0.24 : 0
  const proofOffset = (id) => {
    if (!proofMode) return [0, 0, 0]
    return {
      nucleus: [0.34, 0.18, 0.46],
      granules: [-0.2, -0.04, 0.32],
      mitochondria: [-0.42, 0.08, 0.56],
      chloroplasts: [0.24, -0.18, 0.72],
    }[id] ?? [0, 0, 0]
  }
  const ribosomes = useMemo(
    () =>
      Array.from({ length: 92 }, (_, index) => {
        const point = pickSpherePoint(index + 20, 1)
        return {
          position: [point[0] * 1.4, point[1] * 0.84, 0.34 + seeded(index + 70) * 0.25],
          radius: 0.018 + seeded(index + 120) * 0.018,
          color: ['#d59a3d', '#8561bd', '#d76f7e', '#5aa4b5'][index % 4],
        }
      }),
    [],
  )

  const fibers = useMemo(
    () => [
      [
        [-1.25, -0.58, 0.42],
        [-0.5, -0.38, 0.5],
        [0.24, -0.56, 0.48],
        [1.1, -0.35, 0.46],
      ],
      [
        [-1.18, 0.45, 0.42],
        [-0.3, 0.24, 0.52],
        [0.55, 0.48, 0.48],
        [1.2, 0.25, 0.44],
      ],
      [
        [-0.95, -0.1, 0.5],
        [-0.2, 0.05, 0.56],
        [0.72, -0.03, 0.5],
      ],
    ],
    [],
  )

  return (
    <group ref={group} scale={1.12} rotation={[-0.54, -0.18, 0.02]}>
        <ClickableGroup id="membrane" onSelect={onSelect}>
          <RoundedBox args={[3.45, 2.16, 0.42]} radius={0.18} smoothness={8} position={[0, 0, 0.02]}>
            <meshPhysicalMaterial color="#87a944" roughness={0.46} clearcoat={0.55} clearcoatRoughness={0.42} sheen={0.35} sheenColor="#dbe68e" />
          </RoundedBox>
          <PlantCellWallPores />
          <RoundedBox args={[3.08, 1.78, 0.46]} radius={0.16} smoothness={8} position={[0, 0, 0.16]}>
            <meshPhysicalMaterial
              color="#7fb59d"
              transparent
              opacity={shellOpacity}
              roughness={0.24}
              metalness={0.02}
              transmission={0.12}
              depthWrite={false}
              clearcoat={0.6}
              clearcoatRoughness={0.18}
            />
          </RoundedBox>
          {(selected === 'membrane' || xrayMode) && (
            <RoundedBox args={[3.55, 2.26, 0.48]} radius={0.2} smoothness={8} position={[0, 0, 0.2]}>
              <meshBasicMaterial color={xrayMode ? '#54b9d2' : '#6b9844'} wireframe transparent opacity={shellWireOpacity || 0.24} />
            </RoundedBox>
          )}
        </ClickableGroup>

        {show('granules') && (
        <ClickableGroup id="granules" onSelect={onSelect} position={proofOffset('granules')}>
          <mesh position={[-0.5, -0.05, 0.48]} rotation={[0.02, -0.1, -0.18]} scale={[0.58, 0.92, 0.16]}>
            <sphereGeometry args={[0.7, 56, 56]} />
            <meshPhysicalMaterial color="#6cc8ee" transparent opacity={0.84} roughness={0.08} clearcoat={0.88} clearcoatRoughness={0.08} transmission={0.1} />
          </mesh>
          <PlantGolgi position={[0.48, -0.38, 0.62]} rotation={[0, 0, 0.08]} />
          <PlantCellBubbles />
          {ribosomes.map((ribosome, index) => (
            <mesh key={index} position={ribosome.position}>
              <sphereGeometry args={[ribosome.radius, 12, 12]} />
              <meshStandardMaterial color={ribosome.color} roughness={0.35} />
            </mesh>
          ))}
        </ClickableGroup>
        )}

        {show('nucleus') && (
        <ClickableGroup id="nucleus" onSelect={onSelect} position={[0.55 + proofOffset('nucleus')[0], 0.38 + proofOffset('nucleus')[1], 0.6 + proofOffset('nucleus')[2]]}>
          <mesh scale={[0.56, 0.5, 0.28]}>
            <sphereGeometry args={[0.58, 72, 72]} />
            <meshPhysicalMaterial color="#8d55c7" roughness={0.36} clearcoat={0.35} transparent opacity={0.9} />
          </mesh>
          <mesh position={[0.06, -0.02, 0.18]} scale={[0.17, 0.17, 0.14]}>
            <sphereGeometry args={[1, 40, 40]} />
            <meshStandardMaterial color="#5a2f96" roughness={0.28} />
          </mesh>
          {[0.62, 0.78, 0.94].map((radius, index) => (
            <mesh key={radius} rotation={[Math.PI / 2, 0, 0.05 * index]} position={[0, 0, -0.02 - index * 0.015]}>
              <torusGeometry args={[radius, 0.018, 8, 90]} />
              <meshStandardMaterial color={index % 2 ? '#6e45b8' : '#304f9b'} roughness={0.4} />
            </mesh>
          ))}
          <PlantReticulum />
          {selected === 'nucleus' && (
            <mesh scale={[0.77, 0.68, 0.36]}>
              <sphereGeometry args={[0.62, 48, 48]} />
              <meshBasicMaterial color="#8d55c7" wireframe transparent opacity={0.32} />
            </mesh>
          )}
        </ClickableGroup>
        )}

        {show('mitochondria') && (
        <ClickableGroup id="mitochondria" onSelect={onSelect} position={proofOffset('mitochondria')}>
          <PlantMitochondrion position={[-1.1, 0.48, 0.58]} rotation={[0.2, 0.18, -0.42]} scale={0.82} />
          <PlantMitochondrion position={[1.2, 0.3, 0.56]} rotation={[0.2, -0.18, 0.62]} scale={0.88} />
          <PlantMitochondrion position={[-0.85, -0.78, 0.55]} rotation={[0.15, 0.2, 1.45]} scale={0.82} />
        </ClickableGroup>
        )}

        {show('granules') && (
        <ClickableGroup id="granules" onSelect={onSelect} position={proofOffset('chloroplasts')}>
          <PlantChloroplast position={[-1.18, -0.38, 0.58]} rotation={[0.15, -0.22, -0.9]} scale={1.05} />
          <PlantChloroplast position={[-1.02, 0.76, 0.54]} rotation={[0.2, -0.1, -1.12]} scale={0.95} />
          <PlantChloroplast position={[1.15, -0.58, 0.55]} rotation={[0.16, 0.12, 0.82]} scale={1.03} />
          <PlantChloroplast position={[1.02, 0.7, 0.5]} rotation={[0.18, -0.16, 0.98]} scale={0.9} />
          {fibers.map((points, index) => (
            <Line key={index} points={points} color={index % 2 ? '#5f7fcb' : '#68a173'} lineWidth={1.5} transparent opacity={0.55} />
          ))}
        </ClickableGroup>
        )}
    </group>
  )
}

function CellBodyGeometry({ kind }) {
  if (kind === 'box') return <boxGeometry args={[1.9, 1.42, 0.9, 10, 10, 4]} />
  if (kind === 'capsule') return <capsuleGeometry args={[0.42, 2.38, 18, 64]} />
  return <sphereGeometry args={[1.32, 96, 96]} />
}

function CellSpecificStructures({ cellId, onSelect }) {
  if (cellId === 'neuron') {
    return (
      <group>
        <ClickableGroup id="membrane" onSelect={onSelect}>
          {[
            [
              [-0.72, 0.2, 0.12],
              [-1.46, 0.72, 0.05],
              [-2.18, 0.94, -0.08],
            ],
            [
              [-0.54, -0.08, 0.16],
              [-1.28, -0.54, 0.08],
              [-2.18, -0.86, -0.08],
            ],
            [
              [-0.34, 0.38, 0.12],
              [-0.88, 1.02, 0.04],
              [-1.34, 1.44, -0.05],
            ],
            [
              [0.64, 0.02, 0.08],
              [1.55, 0.02, 0.02],
              [2.65, -0.05, -0.04],
              [3.34, 0.16, -0.1],
            ],
          ].map((points, index) => (
            <Line key={index} points={points} color="#8b5cf6" lineWidth={3.2} transparent opacity={0.68} />
          ))}
          {[
            [-2.18, 0.94, -0.08],
            [-2.18, -0.86, -0.08],
            [-1.34, 1.44, -0.05],
            [3.34, 0.16, -0.1],
          ].map((position, index) => (
            <mesh key={index} position={position}>
              <sphereGeometry args={[0.08, 20, 20]} />
              <meshStandardMaterial color="#a78bfa" emissive="#6d28d9" emissiveIntensity={0.16} roughness={0.34} />
            </mesh>
          ))}
        </ClickableGroup>
      </group>
    )
  }

  if (cellId === 'bacteria') {
    const dna = Array.from({ length: 28 }, (_, index) => {
      const x = index * 0.07 - 0.95
      return [x, Math.sin(index * 0.9) * 0.16, 0.22]
    })

    return (
      <group>
        <ClickableGroup id="granules" onSelect={onSelect}>
          <Line points={dna} color="#5b7fdf" lineWidth={3} transparent opacity={0.78} />
          {Array.from({ length: 32 }, (_, index) => (
            <mesh key={index} position={[(seeded(index) - 0.5) * 2.2, (seeded(index + 20) - 0.5) * 0.48, 0.24 + seeded(index + 40) * 0.2]}>
              <sphereGeometry args={[0.025 + seeded(index + 60) * 0.018, 12, 12]} />
              <meshStandardMaterial color={index % 2 ? '#2f9a7d' : '#5b82c4'} roughness={0.42} />
            </mesh>
          ))}
        </ClickableGroup>
        <ClickableGroup id="membrane" onSelect={onSelect}>
          <Line points={[[1.54, -0.05, 0.02], [2.18, -0.22, -0.05], [2.8, -0.02, -0.1], [3.38, 0.2, -0.14]]} color="#52b788" lineWidth={3.4} transparent opacity={0.72} />
          {[-0.8, -0.42, 0, 0.42, 0.8].map((x, index) => (
            <Line
              key={x}
              points={[
                [x, 0.35, 0.02],
                [x + (index % 2 ? 0.08 : -0.08), 0.68, -0.05],
              ]}
              color="#69c6a9"
              lineWidth={1.8}
              transparent
              opacity={0.64}
            />
          ))}
        </ClickableGroup>
      </group>
    )
  }

  if (cellId === 'muscle') {
    return (
      <group>
        <ClickableGroup id="membrane" onSelect={onSelect}>
          {[-1.08, -0.78, -0.48, -0.18, 0.12, 0.42, 0.72, 1.02].map((x) => (
            <Line key={x} points={[[x, -0.38, 0.26], [x + 0.16, 0.38, 0.26]]} color="#f8c4ca" lineWidth={2.2} transparent opacity={0.84} />
          ))}
          <Line points={[[-1.48, 0.1, 0.25], [-0.5, 0.18, 0.28], [0.5, 0.13, 0.28], [1.48, 0.2, 0.25]]} color="#ffe2e5" lineWidth={2.4} transparent opacity={0.72} />
        </ClickableGroup>
      </group>
    )
  }

  if (cellId === 'epithelial') {
    return (
      <ClickableGroup id="membrane" onSelect={onSelect}>
        {[-0.72, -0.36, 0, 0.36, 0.72].map((x) => (
          <Line key={x} points={[[x, 0.58, 0.38], [x + 0.03, 0.92, 0.38]]} color="#b96363" lineWidth={2} transparent opacity={0.64} />
        ))}
        {[-0.46, 0, 0.46].map((x) => (
          <Line key={x} points={[[x, -0.62, 0.42], [x, 0.62, 0.42]]} color="#f7d4cd" lineWidth={1.6} transparent opacity={0.72} />
        ))}
      </ClickableGroup>
    )
  }

  if (cellId === 'white-blood') {
    return (
      <ClickableGroup id="membrane" onSelect={onSelect}>
        {[
          [-1.38, -0.08, 0.02, -0.5],
          [1.36, 0.18, 0.04, 0.52],
          [-0.3, 1.24, -0.02, 1.55],
          [0.38, -1.18, -0.02, -1.48],
        ].map(([x, y, z, angle], index) => (
          <mesh key={index} position={[x, y, z]} rotation={[0.2, 0.08, angle]}>
            <capsuleGeometry args={[0.11, 0.38, 10, 24]} />
            <meshPhysicalMaterial color="#d7dfef" transparent opacity={0.64} roughness={0.36} clearcoat={0.35} />
          </mesh>
        ))}
      </ClickableGroup>
    )
  }

  if (cellId === 'animal') {
    return (
      <ClickableGroup id="granules" onSelect={onSelect}>
        {[[-0.68, 0.64, 0.36], [0.72, -0.38, 0.4], [0.45, 0.62, 0.28]].map((position, index) => (
          <mesh key={index} position={position} scale={[0.22, 0.16, 0.16]}>
            <sphereGeometry args={[1, 28, 28]} />
            <meshPhysicalMaterial color="#8cc9dd" transparent opacity={0.46} roughness={0.08} clearcoat={0.7} />
          </mesh>
        ))}
      </ClickableGroup>
    )
  }

  return null
}

function CellModel({ cellId, selected, crossSection, onSelect, hideOthers, proofMode, viewMode = 'layers' }) {
  const group = useRef()
  const body = CELL_BODY[cellId] ?? CELL_BODY['white-blood']
  const seedOffset = CELL_TYPES.findIndex((cell) => cell.id === cellId) * 100
  const xrayMode = viewMode === 'layers'
  const focusMode = viewMode === 'focus'
  const effectiveHideOthers = hideOthers || focusMode
  const effectiveCrossSection = crossSection || xrayMode
  const show = (id) => !effectiveHideOthers || id === selected || id === 'membrane'
  const bodyRotation = body.kind === 'capsule' ? [0, 0, Math.PI / 2] : [0, 0, 0]
  const bodyOpacity = effectiveHideOthers && selected !== 'membrane' ? 0.24 : effectiveCrossSection ? 0.38 : 0.66
  const wireOpacity = xrayMode ? 0.28 : selected === 'membrane' ? 0.3 : 0.12
  const proofOffset = (id) => {
    if (!proofMode) return [0, 0, 0]
    return {
      nucleus: [0.34, 0.18, 0.42],
      granules: [-0.28, -0.04, 0.46],
      lysosome: [0.28, 0.26, 0.58],
      mitochondria: [-0.38, -0.18, 0.62],
    }[id] ?? [0, 0, 0]
  }

  const granules = useMemo(
    () =>
      Array.from({ length: cellId === 'bacteria' ? 48 : cellId === 'muscle' ? 34 : 88 }, (_, index) => {
        const point = pickSpherePoint(index + seedOffset, body.kind === 'capsule' ? 1.1 : 1.4)
        return {
          position:
            body.kind === 'capsule'
              ? [(seeded(index + seedOffset) - 0.5) * 2.46, (seeded(index + seedOffset + 30) - 0.5) * 0.56, point[2] * 0.32]
              : [point[0] * 1.04, point[1] * 0.92, point[2] * 0.74],
          radius: 0.035 + seeded(index + 200) * 0.04,
          color: ['#d8dde8', '#b6c3dc', '#8799d6', '#dab3d2'][index % 4],
        }
      }),
    [body.kind, cellId, seedOffset],
  )

  const lysosomes = useMemo(
    () =>
      Array.from({ length: 13 }, (_, index) => ({
        position: [1.28 + seeded(index + seedOffset) * 0.34, 0.56 + seeded(index + seedOffset + 40) * 0.64, -0.16 + seeded(index + seedOffset + 80) * 0.3],
        radius: 0.06 + seeded(index + 120) * 0.035,
      })),
    [seedOffset],
  )

  const erLines = useMemo(
    () => [
      [
        [-0.18, -0.86, 0.34],
        [0.12, -0.76, 0.25],
        [0.36, -0.9, 0.32],
        [0.58, -0.72, 0.24],
        [0.8, -0.84, 0.34],
      ],
      [
        [-0.22, -1.02, 0.26],
        [0.04, -1.15, 0.22],
        [0.34, -1.04, 0.28],
        [0.62, -1.16, 0.2],
      ],
      [
        [0.02, -0.62, 0.36],
        [0.34, -0.52, 0.32],
        [0.6, -0.62, 0.38],
        [0.88, -0.5, 0.28],
      ],
    ],
    [],
  )

  return (
      <group ref={group} scale={1.22} rotation={[-0.08, -0.42, 0.05]}>
        <ClickableGroup id="membrane" onSelect={onSelect}>
          <mesh scale={body.scale} rotation={bodyRotation}>
            <CellBodyGeometry kind={body.kind} />
            <meshPhysicalMaterial
              color={body.color}
              transparent
              opacity={bodyOpacity}
              roughness={0.34}
              metalness={0.03}
              transmission={body.kind === 'capsule' ? 0.06 : 0.14}
              clearcoat={0.58}
              clearcoatRoughness={0.2}
            />
          </mesh>
          <mesh scale={body.scale.map((value) => value * 1.04)} rotation={bodyRotation}>
            <CellBodyGeometry kind={body.kind} />
            <meshBasicMaterial color={xrayMode ? '#6bc4d8' : '#f4f0e4'} wireframe transparent opacity={wireOpacity} />
          </mesh>
        </ClickableGroup>

        {effectiveCrossSection && (
          <mesh position={[0.12, -0.04, 0.1]} rotation={[0, 0.05, 0]} scale={[1.58, 1.28, 1]}>
            <circleGeometry args={[1.05, 96]} />
            <meshBasicMaterial color="#f6e9dc" transparent opacity={0.32} side={THREE.DoubleSide} />
          </mesh>
        )}

        {show('nucleus') && cellId !== 'bacteria' && (
        <ClickableGroup id="nucleus" onSelect={onSelect} position={[-0.2 + proofOffset('nucleus')[0], 0.12 + proofOffset('nucleus')[1], 0.28 + proofOffset('nucleus')[2]]} rotation={[0.2, -0.12, -0.32]}>
          <mesh position={[-0.25, 0.18, 0]} scale={[0.72, 0.5, 0.44]}>
            <sphereGeometry args={[0.48, 64, 64]} />
            <meshPhysicalMaterial color="#6f3a9b" roughness={0.36} clearcoat={0.32} emissive="#4c1d95" emissiveIntensity={0.08} />
          </mesh>
          <mesh position={[0.36, -0.24, 0.04]} scale={[0.76, 0.54, 0.44]}>
            <sphereGeometry args={[0.48, 64, 64]} />
            <meshPhysicalMaterial color="#753ca8" roughness={0.36} clearcoat={0.32} emissive="#4c1d95" emissiveIntensity={0.08} />
          </mesh>
          <mesh position={[0.08, -0.02, 0.02]} scale={[0.42, 0.28, 0.28]}>
            <sphereGeometry args={[0.42, 48, 48]} />
            <meshStandardMaterial color="#8449b8" roughness={0.48} />
          </mesh>
          {selected === 'nucleus' && (
            <mesh scale={[1.42, 1.1, 0.78]} position={[0.04, -0.04, 0]}>
              <sphereGeometry args={[0.68, 48, 48]} />
              <meshBasicMaterial color="#7b4bb4" wireframe transparent opacity={0.28} />
            </mesh>
          )}
        </ClickableGroup>
        )}

        {show('granules') && (
        <ClickableGroup id="granules" onSelect={onSelect} position={proofOffset('granules')}>
          {granules.map((granule, index) => (
            <mesh key={index} position={granule.position}>
              <sphereGeometry args={[granule.radius, 18, 18]} />
              <meshStandardMaterial
                color={granule.color}
                emissive={selected === 'granules' ? '#5b82c4' : '#1e293b'}
                emissiveIntensity={selected === 'granules' ? 0.25 : 0.02}
                roughness={0.36}
              />
            </mesh>
          ))}
        </ClickableGroup>
        )}

        {show('lysosome') && cellId !== 'bacteria' && cellId !== 'muscle' && (
        <ClickableGroup id="lysosome" onSelect={onSelect} position={proofOffset('lysosome')}>
          {lysosomes.map((lysosome, index) => (
            <mesh key={index} position={lysosome.position}>
              <sphereGeometry args={[lysosome.radius, 24, 24]} />
              <meshStandardMaterial
                color={index % 2 === 0 ? '#7c3b91' : '#a15bb7'}
                emissive="#5b2470"
                emissiveIntensity={selected === 'lysosome' ? 0.45 : 0.16}
                roughness={0.3}
              />
            </mesh>
          ))}
        </ClickableGroup>
        )}

        {show('mitochondria') && cellId !== 'bacteria' && (
        <ClickableGroup id="mitochondria" onSelect={onSelect} position={proofOffset('mitochondria')}>
          {[
            [-0.78, -0.55, 0.48, 0.38],
            [0.7, 0.1, 0.46, -0.35],
            [0.96, -0.62, 0.16, 0.7],
            ...(cellId === 'muscle'
              ? [
                  [-1.18, 0.18, 0.34, -0.72],
                  [1.2, 0.24, 0.32, 0.58],
                ]
              : []),
          ].map(([x, y, z, tilt], index) => (
            <mesh key={index} position={[x, y, z]} rotation={[0.78, tilt, 0.95]} scale={selected === 'mitochondria' ? 1.08 : 1}>
              <capsuleGeometry args={[0.105, 0.42, 10, 28]} />
              <meshStandardMaterial color="#df7046" emissive="#c2410c" emissiveIntensity={0.22} roughness={0.34} />
            </mesh>
          ))}
        </ClickableGroup>
        )}

        {show('granules') && cellId !== 'bacteria' && (
        <ClickableGroup id="granules" onSelect={onSelect}>
          {erLines.map((points, index) => (
            <Line key={index} points={points} color="#d65e85" lineWidth={2.4} transparent opacity={0.78} />
          ))}
        </ClickableGroup>
        )}

        <CellSpecificStructures cellId={cellId} onSelect={onSelect} />
      </group>
  )
}

function SceneExportBridge({ exportRoot, onExporterReady }) {
  useEffect(() => {
    if (typeof onExporterReady !== 'function') return undefined

    const exportCurrentModel = () => exportObjectAsGlb(exportRoot.current)
    onExporterReady(() => exportCurrentModel)

    return () => onExporterReady(null)
  }, [exportRoot, onExporterReady])

  return null
}

function ProofRig() {
  const gridLines = useMemo(() => {
    const lines = []
    for (let i = -4; i <= 4; i += 1) {
      lines.push({
        key: `x-${i}`,
        points: [[-2.4, -1.42, i * 0.45], [2.4, -1.42, i * 0.45]],
      })
      lines.push({
        key: `z-${i}`,
        points: [[i * 0.45, -1.42, -1.8], [i * 0.45, -1.42, 1.8]],
      })
    }
    return lines
  }, [])

  return (
    <group>
      {gridLines.map((line) => (
        <Line key={line.key} points={line.points} color="#9a8a72" lineWidth={0.8} transparent opacity={0.24} />
      ))}
      <Line points={[[-2.55, -1.38, 0], [2.65, -1.38, 0]]} color="#d94a4a" lineWidth={3.2} transparent opacity={0.78} />
      <Line points={[[0, -1.48, 0], [0, 1.72, 0]]} color="#45a464" lineWidth={3.2} transparent opacity={0.78} />
      <Line points={[[0, -1.38, -2.05], [0, -1.38, 2.25]]} color="#3b82f6" lineWidth={3.2} transparent opacity={0.78} />
      {[0.65, 1.15, 1.65].map((radius) => (
        <mesh key={radius} rotation={[Math.PI / 2, 0, 0]} position={[0, -1.36, 0]}>
          <torusGeometry args={[radius, 0.006, 8, 96]} />
          <meshBasicMaterial color="#7c6d5a" transparent opacity={0.22} />
        </mesh>
      ))}
    </group>
  )
}

export class ViewerErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { error: null }
  }

  static getDerivedStateFromError(error) {
    return { error }
  }

  componentDidCatch(error) {
    this.props.onError?.(error)
  }

  componentDidUpdate(previousProps) {
    if (previousProps.resetKey !== this.props.resetKey && this.state.error) {
      this.setState({ error: null })
    }
  }

  render() {
    if (this.state.error) return this.props.fallback
    return this.props.children
  }
}

function GeneratedGlbModel({ modelUrl, proofMode, viewMode = 'solid', onSelect }) {
  const gltf = useGLTF(modelUrl)
  const { object, scale } = useMemo(() => {
    const cloned = gltf.scene.clone(true)
    const xrayMode = viewMode === 'layers'
    const focusMode = viewMode === 'focus'
    const prepareMaterial = (sourceMaterial) => {
      if (xrayMode) {
        return new THREE.MeshBasicMaterial({
          color: '#60c8df',
          transparent: true,
          opacity: 0.36,
          wireframe: true,
          depthWrite: false,
          side: THREE.DoubleSide,
        })
      }

      const material = sourceMaterial?.clone
        ? sourceMaterial.clone()
        : new THREE.MeshStandardMaterial({ color: '#dbe7ea', roughness: 0.42, metalness: 0.04 })

      material.side = THREE.DoubleSide
      material.envMapIntensity = Math.max(material.envMapIntensity || 0, focusMode ? 1.75 : 1.15)

      if (focusMode && 'emissive' in material) {
        material.emissive = new THREE.Color('#12384d')
        material.emissiveIntensity = Math.max(material.emissiveIntensity || 0, 0.12)
      }

      if (focusMode && 'roughness' in material) material.roughness = Math.min(material.roughness ?? 0.48, 0.36)
      if (focusMode && 'metalness' in material) material.metalness = Math.max(material.metalness ?? 0, 0.04)

      material.needsUpdate = true
      return material
    }

    cloned.traverse((node) => {
      if (!node.isMesh) return
      node.castShadow = true
      node.receiveShadow = true
      node.renderOrder = xrayMode ? 6 : 0
      if (node.material) {
        node.material = Array.isArray(node.material)
          ? node.material.map((material) => prepareMaterial(material))
          : prepareMaterial(node.material)
      }
    })

    const box = new THREE.Box3().setFromObject(cloned)
    const center = box.getCenter(new THREE.Vector3())
    const size = box.getSize(new THREE.Vector3())
    const longest = Math.max(size.x, size.y, size.z) || 1
    cloned.position.sub(center)

    return {
      object: cloned,
      scale: 3.25 / longest,
    }
  }, [gltf.scene, viewMode])

  return (
    <group
      scale={scale * (proofMode ? 0.92 : 1)}
      rotation={[-0.12, -0.2, 0]}
      onClick={(event) => {
        event.stopPropagation()
        onSelect('membrane')
      }}
    >
      <primitive object={object} />
    </group>
  )
}

function CinematicReliefSpecimen({ imageUrl, autoRotate, onSelect, viewMode = 'layers' }) {
  const groupRef = useRef(null)
  const xrayMode = viewMode === 'layers'
  const focusMode = viewMode === 'focus'
  const sourceTexture = useTexture(imageUrl)
  const texture = useMemo(() => {
    const nextTexture = sourceTexture.clone()
    nextTexture.colorSpace = THREE.SRGBColorSpace
    nextTexture.anisotropy = 12
    nextTexture.generateMipmaps = false
    nextTexture.minFilter = THREE.LinearFilter
    nextTexture.magFilter = THREE.LinearFilter
    nextTexture.wrapS = THREE.ClampToEdgeWrapping
    nextTexture.wrapT = THREE.ClampToEdgeWrapping
    nextTexture.needsUpdate = true
    return nextTexture
  }, [sourceTexture])
  const relief = useMemo(() => createImageReliefGeometry(sourceTexture.image), [sourceTexture.image])

  useEffect(() => () => {
    texture.dispose()
    relief.geometry.dispose()
    relief.slabGeometry.dispose()
  }, [relief, texture])

  useFrame((_, delta) => {
    if (!groupRef.current) return
    if (autoRotate) groupRef.current.rotation.y += delta * 0.22
  })

  return (
    <group ref={groupRef} rotation={[-0.12, -0.18, 0]} onClick={(event) => {
      event.stopPropagation()
      onSelect('membrane')
    }}>
      <mesh geometry={relief.geometry} position={[0, 0, 0.18]} renderOrder={10}>
        <meshPhysicalMaterial
          map={texture}
          alphaTest={xrayMode ? 0.16 : 0.24}
          transparent={xrayMode}
          opacity={xrayMode ? 0.78 : 1}
          depthWrite={!xrayMode}
          roughness={focusMode ? 0.34 : 0.46}
          metalness={0.02}
          clearcoat={focusMode ? 0.66 : 0.42}
          clearcoatRoughness={0.18}
          envMapIntensity={focusMode ? 1.72 : 1.35}
          side={THREE.DoubleSide}
        />
      </mesh>
      {xrayMode && (
        <mesh geometry={relief.geometry} position={[0, 0, 0.185]} renderOrder={11}>
          <meshBasicMaterial color="#5fc6df" wireframe transparent opacity={0.2} depthWrite={false} side={THREE.DoubleSide} />
        </mesh>
      )}
    </group>
  )
}

function CinematicReliefScene({ imageUrl, autoRotate, presentationMode, motionProfile, onSelectOrganelle, viewMode, environment = 'studio' }) {
  const presentationRoot = useRef(null)

  return (
    <Canvas
      className="cinematic-relief-canvas"
      camera={{ position: [0, 0.18, 5.35], fov: 34 }}
      shadows
      dpr={[1, 1]}
      gl={{ antialias: true, alpha: presentationMode, preserveDrawingBuffer: true }}
      onCreated={({ gl }) => {
        gl.toneMapping = THREE.ACESFilmicToneMapping
        gl.toneMappingExposure = 1.14
      }}
    >
      {!presentationMode && <color attach="background" args={['#f6efdf']} />}
      <StudioEnvironment preset={environment} />
      <ambientLight intensity={0.16} />
      <directionalLight castShadow position={[3.6, 4.8, 5.8]} intensity={1.5} color="#fff7e8" shadow-mapSize={[1024, 1024]} />
      <directionalLight position={[-4.2, 2.1, 3.2]} intensity={0.55} color="#d6eef8" />
      <pointLight position={[0.8, -2.6, 2.6]} intensity={0.45} color="#f4a6c8" />
      <pointLight position={[-2.8, 1.2, 1.8]} intensity={0.32} color="#bde8b0" />
      {presentationMode && <PresentationEnvironment profile={motionProfile} />}
      <PresentationMotionRig
        enabled={presentationMode}
        motionProfile={motionProfile}
        targetRef={presentationRoot}
        defaultCameraPosition={DEFAULT_RELIEF_CAMERA_POSITION}
      />
      <Suspense fallback={null}>
        <group ref={presentationRoot}>
          <CinematicReliefSpecimen imageUrl={imageUrl} autoRotate={autoRotate && !presentationMode} onSelect={onSelectOrganelle} viewMode={viewMode} />
        </group>
      </Suspense>
      <OrbitControls enabled={!presentationMode} enablePan={false} minDistance={3.15} maxDistance={6.2} enableDamping dampingFactor={0.08} autoRotate={autoRotate && !presentationMode} autoRotateSpeed={0.32} />
    </Canvas>
  )
}

export function CinematicLayerVisual({ imageUrl, selectedOrganelle, onSelectOrganelle, autoRotate, presentationMode = false, motionProfile = 'specimen', viewMode = 'layers', environment = 'studio' }) {
  const [pointer, setPointer] = useState({ x: 0, y: 0 })
  const [visualState, setVisualState] = useState(null)
  const visual = visualState?.imageUrl === imageUrl ? visualState.visual : null
  const webglAvailable = canUseWebGL()

  useEffect(() => {
    let cancelled = false

    if (webglAvailable) {
      return () => {
        cancelled = true
      }
    }

    buildLayeredPngVisual(imageUrl)
      .then((nextVisual) => {
        if (!cancelled) setVisualState({ imageUrl, visual: nextVisual })
      })
      .catch((error) => {
        console.warn(error)
        if (!cancelled) {
          setVisualState({
            imageUrl,
            visual: {
              aspect: 1,
              layers: [{ id: 'source', className: 'layer-body', url: imageUrl, z: 0, shiftX: 0, shiftY: 0, scale: 1, opacity: 1 }],
            },
          })
        }
      })

    return () => {
      cancelled = true
    }
  }, [imageUrl, webglAvailable])

  function handlePointerMove(event) {
    if (webglAvailable) return
    const rect = event.currentTarget.getBoundingClientRect()
    const x = ((event.clientX - rect.left) / rect.width - 0.5) * 2
    const y = ((event.clientY - rect.top) / rect.height - 0.5) * 2
    setPointer({
      x: Math.max(-1, Math.min(1, x)),
      y: Math.max(-1, Math.min(1, y)),
    })
  }

  return (
    <div
      className={`cinematic-layer-scene mode-${viewMode}`}
      style={{ '--px': pointer.x.toFixed(3), '--py': pointer.y.toFixed(3) }}
      onPointerMove={handlePointerMove}
      onPointerLeave={() => {
        if (!webglAvailable) setPointer({ x: 0, y: 0 })
      }}
      onClick={() => onSelectOrganelle('membrane')}
    >
      {!webglAvailable && <div className="cinematic-depth-field" />}
      {webglAvailable ? (
        <CinematicReliefScene imageUrl={imageUrl} autoRotate={autoRotate} presentationMode={presentationMode} motionProfile={motionProfile} onSelectOrganelle={onSelectOrganelle} viewMode={viewMode} environment={environment} />
      ) : (
        <div
          className={`layered-png-stage motion-${motionProfile} ${autoRotate ? 'auto' : ''}`}
          style={{ '--layer-aspect': visual?.aspect || 1 }}
          aria-label="Layered transparent PNG model visual"
        >
          {visual ? (
            visual.layers.map((layer) => (
              <img
                key={layer.id}
                className={`cinematic-png-layer ${layer.className}`}
                src={layer.url}
                alt=""
                style={{
                  '--z': `${layer.z}px`,
                  '--shift-x': `${layer.shiftX}px`,
                  '--shift-y': `${layer.shiftY}px`,
                  '--scale': layer.scale,
                  '--layer-opacity': layer.opacity,
                }}
              />
            ))
          ) : (
            <div className="layered-png-loading">
              <span />
              Building PNG layers
            </div>
          )}
        </div>
      )}
      <button type="button" className="cinematic-hotspot" style={{ '--label-color': ORGANELLES[selectedOrganelle]?.accent || '#72a4bf' }} onClick={(event) => {
        event.stopPropagation()
        onSelectOrganelle(selectedOrganelle)
      }}>
        <span />
        {ORGANELLES[selectedOrganelle]?.title || 'Layer'}
      </button>
    </div>
  )
}

export function CellScene({ selectedCell, modelCellId, referenceImageUrl, generatedModelUrl, selectedOrganelle, crossSection, autoRotate, hideOthers, proofMode, viewMode = 'layers', renderQuality, environment = 'studio', presentationMode = false, motionProfile = 'specimen', onSelectOrganelle, onExporterReady = null }) {
  const isPlant = modelCellId === 'plant'
  const presentationRoot = useRef(null)
  const exportRoot = useRef(null)
  const dpr = renderQuality === 'high' ? [1, 2] : [1, 1.4]

  if (!canUseWebGL()) return null

  return (
    <Canvas
      camera={{ position: [0, 0.1, 6.05], fov: 35 }}
      shadows
      dpr={dpr}
      gl={{ antialias: true, alpha: true, preserveDrawingBuffer: true }}
      onCreated={({ gl }) => {
        gl.toneMapping = THREE.ACESFilmicToneMapping
        gl.toneMappingExposure = 1.08
      }}
      fallback={<CellFallback selectedCell={selectedCell} modelCellId={modelCellId} referenceImageUrl={referenceImageUrl} selectedOrganelle={selectedOrganelle} onSelectOrganelle={onSelectOrganelle} />}
    >
      {!presentationMode && <color attach="background" args={['#f5efdf']} />}
      <StudioEnvironment preset={environment} />
      <ambientLight intensity={0.14} />
      <directionalLight castShadow position={[4, 5, 5]} intensity={1.35} color="#fff7ed" shadow-mapSize={[1024, 1024]} />
      <directionalLight position={[-4.5, 2.6, 3]} intensity={0.6} color="#dbeafe" />
      <pointLight position={[0, -3.2, 2.4]} intensity={0.5} color="#f9a8d4" />
      <pointLight position={[-2.4, 1.2, 1.6]} intensity={0.28} color="#b8f7a6" />
      {proofMode && <ProofRig />}
      {presentationMode && <PresentationEnvironment profile={motionProfile} />}
      <PresentationMotionRig enabled={presentationMode} motionProfile={motionProfile} targetRef={presentationRoot} />
      <group ref={presentationRoot}>
        <group ref={exportRoot} name={`${selectedCell}-model-export-root`}>
          {generatedModelUrl ? (
            <Suspense fallback={null}>
              <GeneratedGlbModel modelUrl={apiUrl(generatedModelUrl)} proofMode={proofMode} viewMode={viewMode} onSelect={onSelectOrganelle} />
            </Suspense>
          ) : isPlant ? (
            <PlantCellModel selected={selectedOrganelle} crossSection={crossSection} hideOthers={hideOthers} proofMode={proofMode} viewMode={viewMode} onSelect={onSelectOrganelle} />
          ) : (
            <CellModel cellId={modelCellId} selected={selectedOrganelle} crossSection={crossSection} hideOthers={hideOthers} proofMode={proofMode} viewMode={viewMode} onSelect={onSelectOrganelle} />
          )}
        </group>
      </group>
      <SceneExportBridge exportRoot={exportRoot} onExporterReady={onExporterReady} />
      <ContactShadows frames={1} position={[0, -1.32, 0]} opacity={0.2} scale={5.4} blur={2.4} far={2.8} color="#8a7355" />
      <OrbitControls enabled={!presentationMode} enablePan={false} minDistance={proofMode ? 4 : 3.3} maxDistance={proofMode ? 7.4 : 6.4} enableDamping dampingFactor={0.08} autoRotate={!presentationMode && (autoRotate || proofMode)} autoRotateSpeed={proofMode ? 0.75 : 0.45} />
    </Canvas>
  )
}

export function CellFallback({ selectedCell, modelCellId, referenceImageUrl, selectedOrganelle, onSelectOrganelle }) {
  const visualCellId = modelCellId ?? getModelCellId(selectedCell)
  const fallbackGranules = Array.from({ length: 34 }, (_, index) => ({
    left: 26 + seeded(index) * 50,
    top: 22 + seeded(index + 80) * 52,
    size: 5 + seeded(index + 140) * 8,
    tone: index % 5,
  }))

  if (referenceImageUrl) {
    return (
      <div className="cell-fallback upload-render-fallback" aria-label="Uploaded model image fallback">
        <img src={referenceImageUrl} alt="Uploaded model reference" />
      </div>
    )
  }

  if (visualCellId === 'plant') {
    return (
      <div className="cell-fallback plant-render-fallback" aria-label="Starter model image fallback">
        <img src={plantCellRender} alt="Detailed starter model fallback render" />
      </div>
    )
  }

  return (
    <div className="cell-fallback" aria-label="Model illustration fallback">
      <button
        type="button"
        className={selectedOrganelle === 'membrane' ? `fallback-cell-body ${visualCellId} active` : `fallback-cell-body ${visualCellId}`}
        onClick={() => onSelectOrganelle('membrane')}
      >
        <span className="fallback-texture" />
        <span className="fallback-nucleus-one" onClick={(event) => {
          event.stopPropagation()
          onSelectOrganelle('nucleus')
        }} />
        <span className="fallback-nucleus-two" onClick={(event) => {
          event.stopPropagation()
          onSelectOrganelle('nucleus')
        }} />
        <span className="fallback-er" />
        <span className="fallback-mito one" onClick={(event) => {
          event.stopPropagation()
          onSelectOrganelle('mitochondria')
        }} />
        <span className="fallback-mito two" onClick={(event) => {
          event.stopPropagation()
          onSelectOrganelle('mitochondria')
        }} />
        <span className="fallback-lysosomes" onClick={(event) => {
          event.stopPropagation()
          onSelectOrganelle('lysosome')
        }} />
        {fallbackGranules.map((granule, index) => (
          <span
            key={index}
            className={`fallback-granule tone-${granule.tone}`}
            style={{
              left: `${granule.left}%`,
              top: `${granule.top}%`,
              width: `${granule.size}px`,
              height: `${granule.size}px`,
            }}
            onClick={(event) => {
              event.stopPropagation()
              onSelectOrganelle('granules')
            }}
          />
        ))}
      </button>
    </div>
  )
}
