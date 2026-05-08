import { Canvas, useFrame, type ThreeEvent } from '@react-three/fiber'
import { OrbitControls, Grid, Environment, Html, CubicBezierLine, TransformControls, useGLTF } from '@react-three/drei'
import { useStore } from '../store'
import React, { Suspense, useEffect, useMemo, useRef, useState, type ReactElement } from 'react'
import * as THREE from 'three'
import type { ComponentInstance } from '../project/schema'
import type { PinDef } from '../project/component'
import { resolveSchematicSymbol } from '../project/component'
import { catalog, pinColor } from '../catalog'
import { resolvePin, netColor } from '../project/pins'
import { runDrc, suggestSafePin, type Violation } from '../drc'
const STRIP_LED_N = 8

function PinAnchor({ pin, owner, position, color, glow, onClick }: {
  pin: PinDef
  owner: string
  position: [number, number, number]
  color: string
  glow: number
  onClick: () => void
}) {
  return (
    <group position={position}>
      <mesh renderOrder={10}
            onClick={(e: ThreeEvent<MouseEvent>) => { e.stopPropagation(); onClick() }}>
        <sphereGeometry args={[0.0012, 12, 12]} />
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={glow}
                              depthTest={false} depthWrite={false} />
      </mesh>
      {glow > 0.5 && (
        <Html distanceFactor={0.1} style={{ pointerEvents: 'none' }}>
          <div style={{ background: '#222', color: '#eee', padding: '2px 6px',
                        borderRadius: 3, fontSize: 10, whiteSpace: 'nowrap',
                        border: `1px solid ${color}`, transform: 'translate(8px,-50%)' }}>
            {owner}.{pin.id}
          </div>
        </Html>
      )}
    </group>
  )
}

// Generic PCB placeholder sized to the board's actual pin bounding box.
// Used when no GLB is registered yet (M2 pending).
function BoardMesh({ board }: { board: import('../project/component').BoardDef }) {
  const edgePins = board.pins.filter((p) => p.normal[1] > 0)  // top-facing (edge headers)

  const xs = edgePins.map((p) => p.position[0])
  const zs = edgePins.map((p) => p.position[2])
  const minX = xs.length ? Math.min(...xs) : -0.027
  const maxX = xs.length ? Math.max(...xs) : 0.027
  const minZ = zs.length ? Math.min(...zs) : -0.014
  const maxZ = zs.length ? Math.max(...zs) : 0.014

  // PCB outline with a small margin around the pin extents
  const margin = 0.004
  const pcbW = (maxX - minX) + margin * 2        // long axis (x)
  const pcbD = (maxZ - minZ) + margin * 2        // short axis (z)
  const cx   = (minX + maxX) / 2
  const cz   = (minZ + maxZ) / 2

  // Unique z values → one header rail per unique z (left / right long edges)
  const uniqueZ = [...new Set(zs.map((z) => Math.round(z * 10000) / 10000))]

  // USB stub at the -x end (anti-USB end is +x for DevKitC convention,
  // but we have no orientation info — place it at the -x end as a placeholder)
  const usbX = minX - 0.004

  return (
    <group>
      {/* PCB body */}
      <mesh position={[cx, 0.005, cz]} castShadow receiveShadow>
        <boxGeometry args={[pcbW, 0.0016, pcbD]} />
        <meshStandardMaterial color="#1f4f3a" roughness={0.6} />
      </mesh>
      {/* USB connector stub */}
      <mesh position={[usbX, 0.009, cz]} castShadow>
        <boxGeometry args={[0.008, 0.006, 0.008]} />
        <meshStandardMaterial color="#aaa" metalness={0.8} roughness={0.3} />
      </mesh>
      {/* Module shield can — approximate, centered on PCB */}
      <mesh position={[cx + pcbW * 0.1, 0.008, cz]} castShadow>
        <boxGeometry args={[pcbW * 0.38, 0.003, pcbD * 0.65]} />
        <meshStandardMaterial color="#ddd" metalness={0.85} roughness={0.3} />
      </mesh>
      {/* Pin header rails — one per unique z edge */}
      {uniqueZ.map((z) => (
        <mesh key={z} position={[cx, 0.0062, z]}>
          <boxGeometry args={[pcbW - margin, 0.002, 0.0025]} />
          <meshStandardMaterial color="#0a0a0a" />
        </mesh>
      ))}
    </group>
  )
}

function BoardWithPins() {
  const project = useStore((s) => s.project)
  const pendingPin = useStore((s) => s.pendingPin)
  const clickPin = useStore((s) => s.clickPin)
  const board = catalog.getBoard(project.board)
  if (!board) return null
  const glbUrl = catalog.getGlbUrl(board.id)
  return (
    <group>
      {glbUrl ? <LoadedGlb url={glbUrl} /> : <BoardMesh board={board} />}
      {board.pins.map((p) => {
        const ref = `board.${p.id}`
        const isPending = pendingPin === ref
        return (
          <PinAnchor key={p.id} pin={p} owner="board"
                     position={p.position}
                     color={pinColor(p.type)}
                     glow={isPending ? 1 : 0.2}
                     onClick={() => clickPin(ref)} />
        )
      })}
    </group>
  )
}

// Per-LED emissive + glow color, keyed by catalog id. Used by LoadedGlb so
// imported LED GLBs glow with the right color when their pin is driven HIGH.
const LED_GLB_GLOW: Record<string, { emissive: string; light: string }> = {
  'led-5mm-red':    { emissive: '#ff2200', light: '#ff4400' },
  'led-5mm-green':  { emissive: '#22ff22', light: '#44ff44' },
  'led-5mm-yellow': { emissive: '#ffdd00', light: '#ffee44' },
}

function LoadedGlb({ url, scale = 1, lit, simActive, componentId }: {
  url: string; scale?: number; lit?: boolean; simActive?: boolean; componentId?: string
}) {
  const gltf = useGLTF(url)
  const scene = useMemo(() => gltf.scene.clone(true), [gltf])
  const glow = (componentId && LED_GLB_GLOW[componentId]) ?? { emissive: '#ff2200', light: '#ff4400' }

  // Apply emissive tint to all meshes when lit or active.
  useEffect(() => {
    scene.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        const mat = child.material as THREE.MeshStandardMaterial
        if (!mat) return
        if (lit) {
          mat.emissive = new THREE.Color(glow.emissive)
          mat.emissiveIntensity = 1.5
        } else if (simActive) {
          mat.emissive = new THREE.Color('#0044ff')
          mat.emissiveIntensity = 0.8
        } else {
          mat.emissive = new THREE.Color('#000000')
          mat.emissiveIntensity = 0
        }
      }
    })
  }, [scene, lit, simActive, glow.emissive])

  return (
    <group>
      <primitive object={scene} scale={[scale, scale, scale]} />
      {lit && <pointLight position={[0, 0.004, 0]} intensity={0.03} distance={0.06} color={glow.light} />}
      {simActive && !lit && (
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.001, 0]}>
          <ringGeometry args={[0.005, 0.006, 24]} />
          <meshStandardMaterial color="#00aaff" emissive="#00aaff" emissiveIntensity={2} side={2} />
        </mesh>
      )}
    </group>
  )
}

// Animated WS2812B strip — per-pixel RGB when pixels prop is set, rainbow animation otherwise.
// Extracted as its own component so useFrame works correctly.
const LED_SPACING = 0.006
const LED_START_X = -((STRIP_LED_N - 1) * LED_SPACING) / 2

function LedStripBody({ lit, pixels, onClick }: {
  lit?: boolean
  pixels?: Array<[number, number, number]>
  onClick: (e: ThreeEvent<MouseEvent>) => void
}) {
  const meshRefs = useRef<(THREE.Mesh | null)[]>(Array(STRIP_LED_N).fill(null))
  const lightRefs = useRef<(THREE.PointLight | null)[]>(Array(STRIP_LED_N).fill(null))
  const t = useRef(0)

  useFrame((_, delta) => {
    if (pixels) {
      meshRefs.current.forEach((mesh, i) => {
        if (!mesh) return
        const mat = mesh.material as THREE.MeshStandardMaterial
        const px = pixels[i] ?? [0, 0, 0]
        const on = px[0] > 0 || px[1] > 0 || px[2] > 0
        const col = new THREE.Color(px[0] / 255, px[1] / 255, px[2] / 255)
        mat.color.copy(col)
        mat.emissive.copy(col)
        mat.emissiveIntensity = on ? 3.5 : 0
        const light = lightRefs.current[i]
        if (light) { light.color.copy(col); light.intensity = on ? 0.008 : 0 }
      })
      return
    }
    if (!lit) return
    t.current += delta * 0.8
    meshRefs.current.forEach((mesh, i) => {
      if (!mesh) return
      const mat = mesh.material as THREE.MeshStandardMaterial
      const hue = (t.current + i / STRIP_LED_N) % 1
      const col = new THREE.Color().setHSL(hue, 1, 0.5)
      mat.color.copy(col)
      mat.emissive.copy(col)
      mat.emissiveIntensity = 3.5
      const light = lightRefs.current[i]
      if (light) { light.color.copy(col); light.intensity = 0.008 }
    })
  })

  return (
    <group onClick={onClick}>
      <mesh position={[0, -0.0005, 0]}>
        <boxGeometry args={[STRIP_LED_N * LED_SPACING + 0.004, 0.001, 0.009]} />
        <meshStandardMaterial color="#1a3a1a" roughness={0.7} />
      </mesh>
      {Array.from({ length: STRIP_LED_N }, (_, i) => (
        <group key={i} position={[LED_START_X + i * LED_SPACING, 0.001, 0]}>
          <mesh ref={(el) => { meshRefs.current[i] = el }}>
            <boxGeometry args={[0.004, 0.002, 0.004]} />
            <meshStandardMaterial color="#111" emissive="#000" emissiveIntensity={0} />
          </mesh>
          <pointLight ref={(el) => { lightRefs.current[i] = el }}
            position={[0, 0.003, 0]} intensity={0} distance={0.03} color="#ff2200" />
        </group>
      ))}
    </group>
  )
}

function DefaultBody({ componentId, schematicSymbol, onClick, selected, lit, pixels, isButton, simActive }: {
  componentId: string
  schematicSymbol?: string
  onClick: (e: ThreeEvent<MouseEvent>) => void
  selected: boolean
  lit?: boolean
  pixels?: Array<[number, number, number]>
  isButton?: boolean
  simActive?: boolean
}) {
  // WS2812B LED strip: per-pixel RGB when pixels is set, rainbow animation otherwise.
  if (schematicSymbol === 'ledstrip') {
    return <LedStripBody lit={lit} pixels={pixels} onClick={onClick} />
  }
  // LED: dome + two leads (red / green / yellow variants).
  const LED_COLORS: Record<string, { base: string; emissiveLit: string; emissiveOff: string; emissiveSel: string; light: string }> = {
    'led-5mm-red':    { base: '#ff1a1a', emissiveLit: '#ff3030', emissiveOff: '#220000', emissiveSel: '#551100', light: '#ff4040' },
    'led-5mm-green':  { base: '#1aff1a', emissiveLit: '#30ff30', emissiveOff: '#002200', emissiveSel: '#115511', light: '#40ff40' },
    'led-5mm-yellow': { base: '#ffee00', emissiveLit: '#ffdd00', emissiveOff: '#221a00', emissiveSel: '#554400', light: '#ffee40' },
  }
  if (componentId in LED_COLORS) {
    const c = LED_COLORS[componentId]
    const emissive = lit ? c.emissiveLit : (selected ? c.emissiveSel : c.emissiveOff)
    const emissiveIntensity = lit ? 3 : 1
    return (
      <group onClick={onClick}>
        {lit && <pointLight position={[0, 0.002, 0]} intensity={0.02} distance={0.05} color={c.light} />}
        <mesh position={[0, 0, 0]} castShadow>
          <sphereGeometry args={[0.0025, 16, 12]} />
          <meshStandardMaterial color={c.base} transparent opacity={0.65}
                                emissive={emissive} emissiveIntensity={emissiveIntensity} />
        </mesh>
        <mesh position={[0, -0.0025, 0]}>
          <cylinderGeometry args={[0.0025, 0.0025, 0.001, 16]} />
          <meshStandardMaterial color={c.base} transparent opacity={0.85}
                                emissive={emissive} emissiveIntensity={emissiveIntensity * 0.5} />
        </mesh>
        <mesh position={[-0.0012, -0.005, 0]}>
          <cylinderGeometry args={[0.0003, 0.0003, 0.006, 8]} />
          <meshStandardMaterial color="#c0c0c0" metalness={0.85} roughness={0.3} />
        </mesh>
        <mesh position={[0.0012, -0.004, 0]}>
          <cylinderGeometry args={[0.0003, 0.0003, 0.005, 8]} />
          <meshStandardMaterial color="#c0c0c0" metalness={0.85} roughness={0.3} />
        </mesh>
      </group>
    )
  }
  // Button: box with a highlight ring when clickable, brighter when pressed.
  if (isButton) {
    const pressed = lit
    const color = pressed ? '#ffffff' : (simActive ? '#00aaff' : (selected ? '#ffaa00' : '#555'))
    const emissive = pressed ? '#aaddff' : (simActive ? '#00aaff' : '#000')
    const emissiveInt = pressed ? 4 : (simActive ? 1.5 : 0.2)
    return (
      <group onClick={onClick}>
        <mesh castShadow position={[0, pressed ? 0.001 : 0.002, 0]}>
          <boxGeometry args={[0.006, pressed ? 0.002 : 0.004, 0.006]} />
          <meshStandardMaterial color={color} emissive={emissive} emissiveIntensity={emissiveInt} />
        </mesh>
        {simActive && (
          <mesh position={[0, 0.003, 0]}>
            <ringGeometry args={[0.004, 0.005, 24]} />
            <meshStandardMaterial color="#00aaff" emissive="#00aaff" emissiveIntensity={pressed ? 4 : 2} side={2} />
          </mesh>
        )}
      </group>
    )
  }
  // Generic fallback.
  return (
    <mesh onClick={onClick}>
      <boxGeometry args={[0.006, 0.006, 0.006]} />
      <meshStandardMaterial color={selected ? '#ffaa00' : '#cc3333'} emissive={selected ? '#552200' : '#000'} />
    </mesh>
  )
}

// Renders the OLED 3D model + a canvas texture plane laid on its screen surface.
function OledDisplayBody({ url, scale = 1, lit, simActive, simLog }: {
  url: string; scale?: number; lit?: boolean; simActive?: boolean; simLog: string[]
}) {
  const gltf = useGLTF(url)
  const scene = useMemo(() => gltf.scene.clone(true), [gltf])

  // Compute screen-plane dimensions from the model bounding box.
  // The OLED screen occupies roughly the upper 55% of a typical module, so we
  // use a conservative height (40%) centered on the model to stay inside the screen.
  const { topY, screenW, screenH, offsetZ } = useMemo(() => {
    const box = new THREE.Box3().setFromObject(scene)
    const size = box.getSize(new THREE.Vector3())
    return {
      topY: box.max.y * scale + 0.00008,
      screenW: size.x * scale * 0.62,
      screenH: size.z * scale * 0.38,
      offsetZ: -size.z * scale * 0.08,
    }
  }, [scene, scale])

  // Draw log lines onto a transparent canvas so the blue GLB screen shows through.
  // Canvas H is derived from the real screen aspect ratio to prevent stretching.
  const texture = useMemo(() => {
    const W = 512
    const aspect = screenW > 0 && screenH > 0 ? screenW / screenH : 1
    const H = Math.round(W / aspect)
    const canvas = document.createElement('canvas')
    canvas.width = W; canvas.height = H
    const ctx = canvas.getContext('2d')!
    ctx.clearRect(0, 0, W, H)
    const lines = simLog.slice(-4)
    const lineH = Math.floor((H - 8) / Math.max(lines.length, 1))
    // Cap so ~20 monospace chars fit per line (char ≈ 0.6 × fontSize)
    const fontSize = Math.min(Math.floor((W - 12) / (20 * 0.6)), lineH - 4)
    ctx.font = `bold ${fontSize}px "SF Mono", Menlo, monospace`
    ctx.shadowColor = 'rgba(0,0,0,0.9)'
    ctx.shadowBlur = 3
    lines.forEach((line, i) => {
      ctx.fillStyle = line.startsWith('⚠') ? '#ffee44' : '#ffffff'
      // Extract just the message content, strip "[id] level: " prefix
      const match = line.match(/^\[.*?\]\s+\w+:\s*(.+)$/)
      const raw = match ? match[1] : line.replace(/^⚠\s*/, '')
      // Truncate to fit without compressing characters
      let text = raw
      while (text.length > 1 && ctx.measureText(text).width > W - 12) text = text.slice(0, -1)
      if (text.length < raw.length) text += '…'
      ctx.fillText(text, 6, fontSize + 4 + i * lineH)
    })
    return new THREE.CanvasTexture(canvas)
  }, [simLog, screenW, screenH])
  useEffect(() => () => { texture.dispose() }, [texture])

  useEffect(() => {
    scene.traverse((child) => {
      if (!(child instanceof THREE.Mesh)) return
      const mat = child.material as THREE.MeshStandardMaterial
      if (!mat) return
      mat.emissive = lit ? new THREE.Color('#ff2200') : simActive ? new THREE.Color('#0044ff') : new THREE.Color('#000')
      mat.emissiveIntensity = lit ? 1.5 : simActive ? 0.8 : 0
    })
  }, [scene, lit, simActive])

  return (
    <group>
      <primitive object={scene} scale={[scale, scale, scale]} />
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, topY, offsetZ]}>
        <planeGeometry args={[screenW, screenH]} />
        <meshBasicMaterial map={texture} transparent opacity={0.93} />
      </mesh>
      {lit && <pointLight position={[0, 0.004, 0]} intensity={0.03} distance={0.06} color="#ff4400" />}
    </group>
  )
}

function ComponentWithPins({ c, selected, lit, simActive }: {
  c: ComponentInstance; selected: boolean; lit: boolean; simActive: boolean
}) {
  const select = useStore((s) => s.select)
  const pendingPin = useStore((s) => s.pendingPin)
  const clickPin = useStore((s) => s.clickPin)
  const move = useStore((s) => s.moveComponent)
  const simulating = useStore((s) => s.simulating)
  const simLog = useStore((s) => s.simLog)
  const pixels = useStore((s) => s.simStrips[c.instance])
  const pressButton = useStore((s) => s.pressButton)
  const releaseButton = useStore((s) => s.releaseButton)
  const def = catalog.getComponent(c.componentId)
  const glbUrl = catalog.getGlbUrl(c.componentId)
  const pos = c.position ?? [0, 0.01, 0]
  const groupRef = useRef<THREE.Group>(null)

  const isButton = def?.sim?.role === 'button'
  const isDisplay = def?.sim?.role === 'display' || resolveSchematicSymbol(def?.schematic) === 'display'

  function resolveButtonLabel(): string | null {
    if (!def?.sim?.inputPin) return null
    const pinRef = `${c.instance}.${def.sim.inputPin}`
    const net = useStore.getState().project.nets.find((n) => n.endpoints.includes(pinRef))
    const boardEp = net?.endpoints.find((ep) => ep.startsWith('board.'))
    if (!boardEp) return null
    const board = catalog.getBoard(useStore.getState().project.board)
    const pid = boardEp.split('.')[1]
    return board?.pins.find((p) => p.id === pid)?.label ?? null
  }

  function handlePointerDown(e: ThreeEvent<PointerEvent>) {
    e.stopPropagation()
    if (simulating && isButton) {
      const label = resolveButtonLabel()
      if (label) pressButton(label)
    } else {
      select(c.instance)
    }
  }

  function handlePointerUp(e: ThreeEvent<PointerEvent>) {
    e.stopPropagation()
    if (simulating && isButton) {
      const label = resolveButtonLabel()
      if (label) releaseButton(label)
    }
  }

  const content = (
    <group ref={groupRef} position={pos}>
      <group onPointerDown={handlePointerDown} onPointerUp={handlePointerUp}>
        {isDisplay && glbUrl && simulating
          ? <OledDisplayBody url={glbUrl} scale={def?.scale ?? 1} lit={lit} simActive={simActive} simLog={simLog} />
          : glbUrl
            ? <LoadedGlb url={glbUrl} scale={def?.scale ?? 1} lit={lit} simActive={simActive} componentId={c.componentId} />
            : <DefaultBody componentId={c.componentId} schematicSymbol={resolveSchematicSymbol(def?.schematic)} selected={selected} lit={lit}
                           pixels={pixels} isButton={isButton} simActive={simActive}
                           onClick={() => {}} />}
      </group>
      {def?.pins.map((p) => {
        const ref = `${c.instance}.${p.id}`
        const isPending = pendingPin === ref
        return (
          <PinAnchor key={p.id} pin={p} owner={c.instance}
                     position={p.position}
                     color={pinColor(p.type)}
                     glow={isPending ? 1 : 0.2}
                     onClick={() => clickPin(ref)} />
        )
      })}
    </group>
  )

  if (!selected) return content
  return (
    <>
      {content}
      <TransformControls
        object={groupRef as unknown as THREE.Object3D}
        mode="translate"
        size={0.4}
        showY={false}
        onMouseUp={() => {
          const g = groupRef.current
          if (g) move(c.instance, [g.position.x, g.position.y, g.position.z])
        }}
      />
    </>
  )
}

function Nets({ violations }: { violations: Violation[] }) {
  const project = useStore((s) => s.project)
  const removeNet = useStore((s) => s.removeNet)
  const errorRefs = new Set(violations.filter(v => v.severity === 'error').flatMap(v => v.involves))
  const warnRefs = new Set(violations.filter(v => v.severity === 'warning').flatMap(v => v.involves))

  return (
    <>
      {project.nets.flatMap((net) => {
        const resolved = net.endpoints.map((e) => resolvePin(project, e)).filter((r): r is NonNullable<typeof r> => !!r)
        const types = resolved.map((r) => r.type)
        const isError = net.endpoints.some(e => errorRefs.has(e))
        const isWarn = !isError && net.endpoints.some(e => warnRefs.has(e))
        const baseColor = isError ? '#ff3b30' : isWarn ? '#ffcc00' : netColor(types)
        // draw chained beziers a..b, b..c, etc.
        const segments: ReactElement[] = []
        for (let i = 0; i < resolved.length - 1; i++) {
          const a = resolved[i], b = resolved[i + 1]
          const lift = 0.015
          const ca: [number, number, number] = [a.position[0], a.position[1] + lift, a.position[2]]
          const cb: [number, number, number] = [b.position[0], b.position[1] + lift, b.position[2]]
          segments.push(
            <CubicBezierLine key={`${net.id}-${i}`}
              start={a.position} midA={ca} midB={cb} end={b.position}
              color={baseColor} lineWidth={isError ? 3 : 2}
              onContextMenu={(e: any) => {
                e.stopPropagation()
                if (window.confirm(`Delete connection between ${net.endpoints.join(' and ')}?`)) removeNet(net.id)
              }} />
          )
        }
        return segments
      })}
    </>
  )
}

const FIXABLE = new Set<string>([
  'gpio.input_only', 'gpio.flash_pin', 'gpio.strapping'
])

type Net = ReturnType<typeof useStore.getState>['project']['nets'][number]

function findNetId(nets: Net[], endpoints: string[]): string | null {
  const set = new Set(endpoints)
  return nets.find(n => n.endpoints.length === endpoints.length && n.endpoints.every(e => set.has(e)))?.id ?? null
}

function ViolationRow({ v, netId, safe, onFix }: { v: Violation; netId: string | null; safe: string | null; onFix: () => void }) {
  return (
    <div style={{ marginBottom: 4, padding: 4,
                  borderLeft: `3px solid ${v.severity === 'error' ? '#ff3b30' : '#ffcc00'}`,
                  background: '#1a1a1a' }}>
      <div>{v.message}</div>
      <div style={{ fontSize: 9, color: '#888' }}>{v.involves.join(' ↔ ')}</div>
      {netId && safe && (
        <button onClick={onFix}
                style={{ marginTop: 4, background: '#2a3140', color: '#fff',
                         border: '1px solid #4a90d9', borderRadius: 2, padding: '2px 8px',
                         fontSize: 10, cursor: 'pointer' }}>
          Fix → board.{safe}
        </button>
      )}
    </div>
  )
}

function DrcOverlay({ result }: { result: ReturnType<typeof runDrc> }) {
  const project = useStore((s) => s.project)
  const rewire = useStore((s) => s.rewireBoardPin)
  const all = [...result.errors, ...result.warnings]
  const sig = all.map((v) => v.id + ':' + v.involves.join(',')).join('|')
  const [dismissedSig, setDismissedSig] = useState<string | null>(null)
  if (all.length === 0) return null
  if (dismissedSig === sig) return null

  return (
    <div style={{
      position: 'absolute', top: 8, right: 8, maxWidth: 320, maxHeight: '60%', overflow: 'auto',
      background: 'rgba(20,20,20,0.92)', border: '1px solid #333', borderRadius: 4,
      padding: 8, fontSize: 11, color: '#ddd', zIndex: 10
    }}>
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: 6 }}>
        <div style={{ fontWeight: 'bold', flex: 1 }}>
          DRC: {result.errors.length} error{result.errors.length === 1 ? '' : 's'},
          {' '}{result.warnings.length} warning{result.warnings.length === 1 ? '' : 's'}
        </div>
        <button onClick={() => setDismissedSig(sig)}
                title="Dismiss until something changes"
                style={{ background: 'transparent', color: '#888', border: '1px solid #333',
                         borderRadius: 2, padding: '0 6px', fontSize: 11, cursor: 'pointer',
                         lineHeight: '16px' }}>×</button>
      </div>
      {all.map((v, i) => {
        const netId = FIXABLE.has(v.id) ? findNetId(project.nets, v.involves) : null
        const safe = netId ? suggestSafePin(project, netId) : null
        return <ViolationRow key={i} v={v} netId={netId} safe={safe} onFix={() => rewire(netId!, safe!)} />
      })}
    </div>
  )
}

function SimBadge() {
  const simulating = useStore((s) => s.simulating)
  const simTime    = useStore((s) => s.simTime)
  if (!simulating) return null
  const label = simTime < 1000 ? `${simTime} ms` : `${(simTime / 1000).toFixed(1)} s`
  return (
    <div style={{
      position: 'absolute', top: 8, left: 8, zIndex: 10,
      background: 'rgba(26,58,26,0.92)', border: '1px solid #4a9d4a',
      borderRadius: 4, padding: '3px 8px', fontSize: 10,
      color: '#7edd7e', pointerEvents: 'none',
      fontFamily: "'SF Mono', Menlo, monospace",
      display: 'flex', alignItems: 'center', gap: 6,
    }}>
      <span style={{ fontSize: 7, lineHeight: 1 }}>●</span>
      <span style={{ fontVariantNumeric: 'tabular-nums' }}>{label}</span>
    </div>
  )
}

function PendingHint() {
  const pendingPin = useStore((s) => s.pendingPin)
  const cancel = useStore((s) => s.cancelWire)
  if (!pendingPin) return null
  return (
    <div style={{
      position: 'absolute', bottom: 8, left: 8, background: 'rgba(20,20,20,0.92)',
      border: '1px solid #4a90d9', borderRadius: 4, padding: '4px 8px',
      fontSize: 11, color: '#ddd', zIndex: 10
    }}>
      Wiring from <b>{pendingPin}</b> — click target pin (or Esc to cancel)
      <button onClick={cancel} style={{ marginLeft: 8, background: 'transparent', color: '#888',
                                        border: '1px solid #444', borderRadius: 2, fontSize: 10, cursor: 'pointer' }}>
        Esc
      </button>
    </div>
  )
}

export default function Viewer3D() {
  const project = useStore((s) => s.project)
  const selected = useStore((s) => s.selected)
  const select = useStore((s) => s.select)
  const cancel = useStore((s) => s.cancelWire)
  const simulating = useStore((s) => s.simulating)
  const simGpios = useStore((s) => s.simGpios)
  const catalogVersion = useStore((s) => s.catalogVersion)

  const drc = useMemo(() => runDrc(project), [project, catalogVersion])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') cancel() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [cancel])

  const simStates = useMemo(() => {
    if (!simulating) return { lit: new Set<string>(), active: new Set<string>() }
    return computeSimStates(project, simGpios)
  }, [simulating, project, simGpios, catalogVersion])

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      <Canvas shadows="variance" camera={{ position: [0.12, 0.1, 0.12], fov: 40, near: 0.001, far: 10 }}
              style={{ background: '#F2F7F2' }}
              onPointerMissed={() => select(null)}>
        <Suspense fallback={null}>
          <ambientLight intensity={0.4} />
          <directionalLight position={[0.2, 0.3, 0.2]} intensity={1.2} castShadow />
          <Environment preset="city" />
          <Grid args={[1, 1]} cellSize={0.005} sectionSize={0.05}
                cellColor="#333" sectionColor="#555" fadeDistance={0.5} infiniteGrid />
          <BoardWithPins />
          {project.components.map((c) => (
            <ComponentWithPins key={c.instance} c={c}
                               selected={selected === c.instance}
                               lit={simStates.lit.has(c.instance)}
                               simActive={simStates.active.has(c.instance)} />
          ))}
          <Nets violations={[...drc.errors, ...drc.warnings]} />
          <OrbitControls makeDefault target={[0, 0, 0]} />
        </Suspense>
      </Canvas>
      <SimBadge />
      <DrcOverlay result={drc} />
      <PendingHint />
    </div>
  )
}

// Walk the net graph from startPin, crossing through passive components (those
// with exactly 2 pins, e.g. resistors), until a board.* endpoint is found.
// Returns the board pin id or null. Visited set prevents infinite loops.
function findBoardGpio(
  project: ReturnType<typeof useStore.getState>['project'],
  startPin: string,
  visited = new Set<string>()
): string | null {
  if (visited.has(startPin)) return null
  visited.add(startPin)
  const net = project.nets.find((n) => n.endpoints.includes(startPin))
  if (!net) return null
  for (const ep of net.endpoints) {
    if (ep === startPin) continue
    if (ep.startsWith('board.')) return ep.split('.')[1]
    const [inst] = ep.split('.')
    const comp = project.components.find((c) => c.instance === inst)
    if (!comp) continue
    const def = catalog.getComponent(comp.componentId)
    if (!def || def.pins.length !== 2) continue
    for (const p of def.pins) {
      const other = `${inst}.${p.id}`
      if (other !== ep) {
        const result = findBoardGpio(project, other, visited)
        if (result) return result
      }
    }
  }
  return null
}

interface SimStates {
  lit: Set<string>     // instances whose output GPIO is high (LEDs, generic_output)
  active: Set<string>  // input instances wired to a board GPIO (buttons ready to fire)
}

type Project = ReturnType<typeof useStore.getState>['project']
type BoardDef = NonNullable<ReturnType<typeof catalog.getBoard>>

// Returns true if the ledstrip's DIN pin is reachable from a board GPIO.
function isLedstripLit(c: ComponentInstance, def: NonNullable<ReturnType<typeof catalog.getComponent>>, project: Project): boolean {
  const dinId = def.sim?.outputPin ?? def.pins.find(p => p.type === 'digital_in')?.id
  if (!dinId) return false
  return !!findBoardGpio(project, `${c.instance}.${dinId}`)
}

// Returns true if an output component's GPIO is driven high.
function isOutputLit(c: ComponentInstance, def: NonNullable<ReturnType<typeof catalog.getComponent>>, project: Project, board: BoardDef, simGpios: Record<string, boolean>): boolean {
  const { role, outputPin } = def.sim!
  if (!outputPin) return false
  if (role !== 'led' && role !== 'buzzer' && role !== 'generic_output' && role !== 'servo' && role !== 'display') return false
  const boardPinId = findBoardGpio(project, `${c.instance}.${outputPin}`)
  if (!boardPinId) return false
  const label = board.pins.find(p => p.id === boardPinId)?.label
  return !!label && !!simGpios[label]
}

// Returns active/lit state for input components (buttons, generic inputs).
function resolveInputState(c: ComponentInstance, def: NonNullable<ReturnType<typeof catalog.getComponent>>, project: Project, board: BoardDef, simGpios: Record<string, boolean>): { active: boolean; lit: boolean } {
  const { role, inputPin } = def.sim!
  if (!inputPin || (role !== 'button' && role !== 'generic_input')) return { active: false, lit: false }
  const boardPinId = findBoardGpio(project, `${c.instance}.${inputPin}`)
  if (!boardPinId) return { active: false, lit: false }
  const label = board.pins.find(p => p.id === boardPinId)?.label
  return { active: true, lit: !!label && !!simGpios[label] }
}

// Compute per-instance visual states from GPIO map using catalog sim metadata.
function computeSimStates(project: Project, simGpios: Record<string, boolean>): SimStates {
  const lit = new Set<string>()
  const active = new Set<string>()
  const board = catalog.getBoard(project.board)
  if (!board) return { lit, active }

  for (const c of project.components) {
    const def = catalog.getComponent(c.componentId)
    if (!def) continue

    const isLedstrip = def.sim?.role === 'ledstrip' || resolveSchematicSymbol(def.schematic) === 'ledstrip'
    if (isLedstrip) {
      if (isLedstripLit(c, def, project)) lit.add(c.instance)
      continue
    }

    if (!def.sim) continue

    if (isOutputLit(c, def, project, board, simGpios)) lit.add(c.instance)

    const inp = resolveInputState(c, def, project, board, simGpios)
    if (inp.active) active.add(c.instance)
    if (inp.lit) lit.add(c.instance)
  }

  return { lit, active }
}
