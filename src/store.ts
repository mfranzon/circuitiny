import { create } from 'zustand'
import { type Project, emptyProject } from './project/schema'

export type PinRef = string  // "instance.pinId" or "board.pinId"

interface State {
  project: Project
  past: Project[]
  future: Project[]
  savedPath: string | null
  dirty: boolean                // true whenever project has unsaved changes
  showBoardPicker: boolean
  selected: string | null
  pendingPin: PinRef | null
  catalogVersion: number        // bumped when catalog registers new entries — drives re-render
  simulating: boolean
  simPhase: 0 | 1               // ticks at ~1 Hz while simulating (kept for legacy visuals)
  simTime: number               // elapsed simulated milliseconds
  simGpios: Record<string, boolean>  // GPIO label -> output state (board-pin label, e.g. "2", "16")
  simStrips: Record<string, Array<[number, number, number]>>  // instance → per-pixel [r,g,b]
  simLog: string[]              // most recent simulation log lines
  pendingEdges: Array<{ label: string; type: 'rising' | 'falling' }>
  nativeCompileStatus: 'idle' | 'compiling' | 'ready' | 'error'
  nativeCompileError: string | null
  nativeBinaryPath: string | null
  nativeRunId: string | null

  setProject: (p: Project) => void
  loadProject: (p: Project, path?: string) => void
  markSaved: (path: string) => void
  openBoardPicker: () => void
  createProject: (name: string, boardId: string) => void
  select: (instance: string | null) => void
  undo: () => void
  redo: () => void

  clickPin: (ref: PinRef) => void
  cancelWire: () => void
  removeNet: (id: string) => void
  rewireBoardPin: (netId: string, toBoardPinId: string) => void

  addComponent: (componentId: string) => void
  removeComponent: (instance: string) => void
  moveComponent: (instance: string, position: [number, number, number]) => void
  bumpCatalog: () => void
  setSimulating: (b: boolean) => void
  tickSim: () => void
  pressButton: (boardPinLabel: string) => void
  releaseButton: (boardPinLabel: string) => void
  setNativeCompile: (status: 'idle' | 'compiling' | 'ready' | 'error', error?: string | null, binaryPath?: string | null) => void
  setNativeRunId: (id: string | null) => void

  setCustomCode: (file: string, code: string) => void
}

// Push current project onto the undo stack before a circuit mutation.
function snapshot(s: State) {
  return { past: [...s.past.slice(-49), s.project], future: [] as Project[] }
}

export const useStore = create<State>((set) => ({
  project: seed(),
  past: [],
  future: [],
  savedPath: null,
  dirty: false,
  showBoardPicker: false,
  selected: null,
  pendingPin: null,
  catalogVersion: 0,
  simulating: false,
  simPhase: 0,
  simTime: 0,
  simGpios: {},
  simStrips: {},
  simLog: [],
  pendingEdges: [],
  nativeCompileStatus: 'idle',
  nativeCompileError: null,
  nativeBinaryPath: null,
  nativeRunId: null,

  setProject: (project) => set({ project, dirty: true }),
  loadProject: (project, path) => set({
    project, savedPath: path ?? null, dirty: false,
    past: [], future: [],
    selected: null, pendingPin: null,
    simulating: false, simTime: 0, simGpios: {}, simStrips: {}, simLog: [], pendingEdges: []
  }),
  markSaved: (savedPath) => set({ savedPath, dirty: false }),
  openBoardPicker: () => set({ showBoardPicker: true }),
  createProject: (name, boardId) => {
    set({ project: emptyProject(name || 'untitled', boardId), savedPath: null, dirty: false, past: [], future: [], showBoardPicker: false, selected: null, pendingPin: null })
  },
  select: (selected) => set({ selected }),

  clickPin: (ref) => set((s) => {
    if (!s.pendingPin) return { pendingPin: ref }
    if (s.pendingPin === ref) return { pendingPin: null }
    // create net joining pendingPin -> ref. Merge into existing net if either endpoint already in one.
    const a = s.pendingPin, b = ref
    const nets = [...s.project.nets]
    const idxA = nets.findIndex((n) => n.endpoints.includes(a))
    const idxB = nets.findIndex((n) => n.endpoints.includes(b))
    if (idxA >= 0 && idxB >= 0 && idxA !== idxB) {
      nets[idxA] = { ...nets[idxA], endpoints: Array.from(new Set([...nets[idxA].endpoints, ...nets[idxB].endpoints])) }
      nets.splice(idxB, 1)
    } else if (idxA >= 0) {
      nets[idxA] = { ...nets[idxA], endpoints: Array.from(new Set([...nets[idxA].endpoints, b])) }
    } else if (idxB >= 0) {
      nets[idxB] = { ...nets[idxB], endpoints: Array.from(new Set([...nets[idxB].endpoints, a])) }
    } else {
      nets.push({ id: `net${nets.length + 1}`, endpoints: [a, b] })
    }
    return { ...snapshot(s), pendingPin: null, dirty: true, project: { ...s.project, nets } }
  }),
  cancelWire: () => set({ pendingPin: null }),
  removeNet: (id) => set((s) => ({
    ...snapshot(s), dirty: true,
    project: { ...s.project, nets: s.project.nets.filter((n) => n.id !== id) }
  })),
  rewireBoardPin: (netId, toBoardPinId) => set((s) => ({
    ...snapshot(s), dirty: true,
    project: {
      ...s.project,
      nets: s.project.nets.map((n) => n.id !== netId ? n : {
        ...n,
        endpoints: n.endpoints.map((e) => e.startsWith('board.') ? `board.${toBoardPinId}` : e)
      })
    }
  })),

  addComponent: (componentId) => set((s) => {
    const existing = s.project.components.filter((c) => c.componentId === componentId).length
    const base = componentId.split('-')[0].replace(/[^a-z0-9]/gi, '')
    let n = existing + 1
    const names = new Set(s.project.components.map((c) => c.instance))
    let instance = `${base}${n}`
    while (names.has(instance)) { n++; instance = `${base}${n}` }
    const x = 0.04 + (existing * 0.01)
    return {
      ...snapshot(s), dirty: true,
      project: { ...s.project, components: [...s.project.components, {
        instance, componentId, position: [x, 0.005, 0.02], pinAssignments: {}
      }]},
      selected: instance
    }
  }),
  removeComponent: (instance) => set((s) => ({
    ...snapshot(s), dirty: true,
    project: {
      ...s.project,
      components: s.project.components.filter((c) => c.instance !== instance),
      nets: s.project.nets
        .map((n) => ({ ...n, endpoints: n.endpoints.filter((e) => !e.startsWith(`${instance}.`)) }))
        .filter((n) => n.endpoints.length >= 1)
    },
    selected: s.selected === instance ? null : s.selected
  })),
  moveComponent: (instance, position) => set((s) => ({
    ...snapshot(s), dirty: true,
    project: {
      ...s.project,
      components: s.project.components.map((c) =>
        c.instance === instance ? { ...c, position } : c)
    }
  })),
  bumpCatalog: () => set((s) => ({ catalogVersion: s.catalogVersion + 1 })),
  setSimulating: (b) => set({
    simulating: b, simPhase: 0,
    simTime: 0, simGpios: {}, simStrips: {}, simLog: b ? ['[sim] start'] : [], pendingEdges: []
  }),
  tickSim: () => set((s) => ({ simPhase: s.simPhase === 0 ? 1 : 0 })),
  pressButton: (label) => set((s) => ({
    simGpios: { ...s.simGpios, [label]: false },
    pendingEdges: [...s.pendingEdges, { label, type: 'falling' as const }]
  })),
  releaseButton: (label) => set((s) => ({
    simGpios: { ...s.simGpios, [label]: true },
    pendingEdges: [...s.pendingEdges, { label, type: 'rising' as const }]
  })),
  setNativeCompile: (status, error = null, binaryPath = null) => set({
    nativeCompileStatus: status,
    nativeCompileError: error ?? null,
    nativeBinaryPath: binaryPath ?? null,
  }),
  setNativeRunId: (nativeRunId) => set({ nativeRunId }),

  setCustomCode: (file, code) => set((s) => ({
    ...snapshot(s), dirty: true,
    project: { ...s.project, customCode: { ...s.project.customCode, [file]: code } }
  })),

  undo: () => set((s) => {
    if (!s.past.length) return {}
    const prev = s.past[s.past.length - 1]
    return {
      project: prev,
      past: s.past.slice(0, -1),
      future: [s.project, ...s.future].slice(0, 50),
      dirty: true,
    }
  }),
  redo: () => set((s) => {
    if (!s.future.length) return {}
    const next = s.future[0]
    return {
      project: next,
      past: [...s.past, s.project].slice(-50),
      future: s.future.slice(1),
      dirty: true,
    }
  }),
}))

function seed(): Project {
  const p = emptyProject('blink-button', 'freenove-esp32-wrover-dev')

  p.components.push(
    { instance: 'r1',   componentId: 'resistor-220r', position: [0.033, 0.005,  0.015], pinAssignments: {} },
    { instance: 'led1', componentId: 'led-5mm-red',   position: [0.048, 0.005,  0.015], pinAssignments: {} },
    { instance: 'btn1', componentId: 'button-6mm',    position: [0.055, 0.005, -0.010], pinAssignments: {} }
  )

  p.nets.push(
    { id: 'net1', endpoints: ['board.gpio4_l',  'r1.in']       },  // GPIO4 → resistor in
    { id: 'net2', endpoints: ['r1.out',         'led1.anode']  },  // resistor out → LED anode
    { id: 'net3', endpoints: ['led1.cathode',   'board.gnd_l0'] }, // LED cathode → GND
    { id: 'net4', endpoints: ['board.gpio13',   'btn1.a']      },  // GPIO13 → button A
    { id: 'net5', endpoints: ['btn1.b',         'board.gnd_r0'] }  // button B → GND
  )

  return p
}
