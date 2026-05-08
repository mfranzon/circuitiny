// Tool surface exposed to the local LLM. Small and typed.
// Each tool: JSON schema for the model + an executor that mutates the store and returns a compact result.

import { useStore } from '../store'
import { catalog } from '../catalog'
import { runDrc } from '../drc'
import { resolvePin } from '../project/pins'
import type { Project } from '../project/schema'
import type { Msg } from './types'

// Per-turn context threaded through the agent loop — tracks repeat failures and
// carries an AbortSignal so long-running tools (fetch_url) can be cancelled.
// planCircuitCalled gates add_component: the model must call plan_circuit first
// so it gets validated IDs and real board pin IDs before touching the project.
// abortBatch: set when a critical tool (plan_circuit) fails mid-batch so the
// agent loop can skip the remaining pre-queued calls rather than running them.
export type ExecContext = {
  failedCalls: Map<string, number>
  planCircuitCalled: boolean
  abortBatch: boolean
  signal?: AbortSignal
}
export function makeExecContext(signal?: AbortSignal): ExecContext {
  return { failedCalls: new Map(), planCircuitCalled: false, abortBatch: false, signal }
}

// Return a copy of conv with large tool results from already-consumed turns
// replaced by compact summaries, reducing tokens sent on every loop.
// "Already consumed" = before the last assistant message in the history.
// The original conv is never mutated; recent results are kept in full.
export function trimConvForApi(conv: Msg[]): Msg[] {
  let cutoff = -1
  for (let i = conv.length - 1; i >= 0; i--) {
    if (conv[i].role === 'assistant') { cutoff = i; break }
  }
  if (cutoff === -1) return conv

  return conv.map((m, i) => {
    if (m.role !== 'tool' || i >= cutoff) return m
    let parsed: any
    try { parsed = JSON.parse(m.content) } catch { return m }
    if (!parsed?.ok) return m

    const name = m.tool_name ?? m.name ?? ''

    if (name === 'list_catalog') {
      const components = parsed.data?.components
      if (!Array.isArray(components)) return m
      return { ...m, content: JSON.stringify({ ok: true, data: { components: components.map((c: any) => c.id) } }) }
    }

    if (name === 'plan_circuit') {
      const safeGpios = parsed.data?.safeGpios
      if (!Array.isArray(safeGpios)) return m
      return { ...m, content: JSON.stringify({ ok: true, data: { ...parsed.data, safeGpios: safeGpios.map((g: any) => g.pinId ?? g) } }) }
    }

    if (name === 'fetch_url') {
      const text = parsed.data?.content
      if (typeof text === 'string' && text.length > 500) {
        return { ...m, content: JSON.stringify({ ok: true, data: { ...parsed.data, content: text.slice(0, 500) + '…[trimmed]' } }) }
      }
    }

    return m
  })
}

export interface ToolDef {
  type: 'function'
  function: {
    name: string
    description: string
    parameters: { type: 'object'; properties: Record<string, any>; required?: string[] }
  }
}

export const tools: ToolDef[] = [
  {
    type: 'function',
    function: {
      name: 'get_project',
      description: 'Return the current project summary: board, components, nets, DRC status.',
      parameters: { type: 'object', properties: {} }
    }
  },
  {
    type: 'function',
    function: {
      name: 'list_catalog',
      description: 'List available components in the catalog (id, name, category, pin ids).',
      parameters: { type: 'object', properties: {} }
    }
  },
  {
    type: 'function',
    function: {
      name: 'add_component',
      description: 'Add a component instance to the project. Use an id from list_catalog.',
      parameters: {
        type: 'object',
        properties: { componentId: { type: 'string', description: 'Catalog component id, e.g. "led-5mm-red"' } },
        required: ['componentId']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'remove_component',
      description: 'Remove a component instance and any nets touching it.',
      parameters: {
        type: 'object',
        properties: { instance: { type: 'string', description: 'Instance name like "led1"' } },
        required: ['instance']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'remove_net',
      description: 'Remove a net (wire connection) by its id. Call get_project first to see current net ids.',
      parameters: {
        type: 'object',
        properties: { id: { type: 'string', description: 'Net id, e.g. "net-3"' } },
        required: ['id']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'connect',
      description: 'Wire two pins together. Pin refs look like "instance.pinId" or "board.pinId" (e.g. "led1.anode", "board.gpio4").',
      parameters: {
        type: 'object',
        properties: {
          from: { type: 'string' },
          to:   { type: 'string' }
        },
        required: ['from', 'to']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'run_drc',
      description: 'Run design rule checks and return errors + warnings.',
      parameters: { type: 'object', properties: {} }
    }
  },
  {
    type: 'function',
    function: {
      name: 'think',
      description: 'Private reasoning step, no side effects. Think through the problem before acting.',
      parameters: {
        type: 'object',
        properties: { reasoning: { type: 'string' } },
        required: ['reasoning']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'fetch_url',
      description: 'Fetch a URL and return its text content. Use for Espressif docs or component datasheets.',
      parameters: {
        type: 'object',
        properties: { url: { type: 'string' } },
        required: ['url']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'read_firmware',
      description: 'Read the content of a custom firmware file previously written by write_firmware.',
      parameters: {
        type: 'object',
        properties: {
          file: { type: 'string', description: 'File path, e.g. "main/app_main.c"' }
        },
        required: ['file']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'write_firmware',
      description: 'Write firmware source code into the project. Use file "main/app_main.c" for the main application. The code appears immediately in the Code pane. Write complete, compilable ESP-IDF C code.',
      parameters: {
        type: 'object',
        properties: {
          file: { type: 'string', description: 'File path, e.g. "main/app_main.c"' },
          code: { type: 'string', description: 'Full source code content for the file.' }
        },
        required: ['file', 'code']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'save_project',
      description: 'Save the current project to disk. If the project has been saved before it overwrites the existing file silently; otherwise it opens a native save dialog for the user to choose a location. Call this at the end of any session where you made meaningful changes.',
      parameters: { type: 'object', properties: {} }
    }
  },
  {
    type: 'function',
    function: {
      name: 'list_glb_models',
      description: 'List all 3D GLB models registered in the system — both built-in boards and catalog components. Use to know which physical models are available.',
      parameters: { type: 'object', properties: {} }
    }
  },
  {
    type: 'function',
    function: {
      name: 'plan_circuit',
      description: 'Pre-flight check before building a circuit. Validates component IDs against the catalog, warns about missing companion parts (resistor for LED, pull-ups for I2C), and returns a curated list of safe GPIO pins for the current board. Call this before the first add_component.',
      parameters: {
        type: 'object',
        properties: {
          goal: { type: 'string', description: 'One-sentence description of what the circuit should do.' },
          components: {
            type: 'array',
            items: { type: 'string' },
            description: 'Catalog component IDs you plan to use, e.g. ["led-5mm-red", "resistor-220r"].'
          },
          use_wifi: { type: 'boolean', description: 'True if the design uses Wi-Fi — excludes ADC2 pins from the safe GPIO list.' }
        },
        required: ['goal', 'components']
      }
    }
  }
]

export type ToolResult = { ok: true; data: unknown } | { ok: false; error: string }

export async function execTool(
  name: string,
  args: Record<string, any>,
  ctx?: ExecContext
): Promise<ToolResult> {
  const result = await executeInternal(name, args, ctx)

  // Repeated-failure guard — if the same (tool, args) fails twice, append a hint
  // so the model stops hammering the same bad call and either tries something
  // else or reports it to the user.
  if (ctx && result.ok === false) {
    const key = `${name}:${stableStringify(args)}`
    const count = (ctx.failedCalls.get(key) ?? 0) + 1
    ctx.failedCalls.set(key, count)
    if (count >= 2) {
      return {
        ok: false,
        error: `${result.error} — This exact call has now failed ${count} times. Stop retrying with identical arguments; try a different approach or tell the user you're stuck.`
      }
    }
  }
  return result
}

type Handler = (args: Record<string, any>, ctx?: ExecContext) => Promise<ToolResult>

async function handleGetProject(): Promise<ToolResult> {
  const { project } = useStore.getState()
  const drc = runDrc(project)
  return {
    ok: true,
    data: {
      board: project.board,
      target: project.target,
      components: project.components.map(c => ({ instance: c.instance, componentId: c.componentId })),
      nets: project.nets.map(n => ({ id: n.id, endpoints: n.endpoints })),
      drc: { errors: drc.errors.length, warnings: drc.warnings.length,
             messages: [...drc.errors, ...drc.warnings].slice(0, 5) },
      customFirmwareFiles: Object.keys(project.customCode ?? {}),
    }
  }
}

async function handleListCatalog(): Promise<ToolResult> {
  return {
    ok: true,
    data: {
      components: catalog.listComponents().map(c => ({
        id: c.id, name: c.name, category: c.category, pins: c.pins.map(p => p.id)
      }))
    }
  }
}

async function handleAddComponent(args: Record<string, any>, ctx?: ExecContext): Promise<ToolResult> {
  if (!ctx?.planCircuitCalled) {
    return { ok: false, error: `You must call plan_circuit before add_component. It validates your component IDs against the catalog and returns the correct board pin IDs to use with connect. Do not guess IDs.` }
  }
  const s = useStore.getState()
  if (!catalog.getComponent(args.componentId)) {
    const ids = catalog.listComponents().map(c => c.id)
    const near = closestMatches(String(args.componentId ?? ''), ids, 5)
    return { ok: false, error: `unknown componentId "${args.componentId}". Closest catalog ids: [${near.join(', ')}]. Call list_catalog for the full list.` }
  }
  const before = s.project.components.length
  s.addComponent(args.componentId)
  const after = useStore.getState().project.components
  const added = after[after.length - 1]
  return { ok: true, data: { instance: added.instance, componentId: added.componentId, index: before } }
}

async function handleRemoveComponent(args: Record<string, any>): Promise<ToolResult> {
  const { project, removeComponent } = useStore.getState()
  if (!project.components.find(c => c.instance === args.instance)) {
    const instances = project.components.map(c => c.instance)
    return { ok: false, error: `no such instance "${args.instance}". Current instances: [${instances.join(', ') || '(none)'}].` }
  }
  removeComponent(args.instance)
  return { ok: true, data: { removed: args.instance } }
}

async function handleRemoveNet(args: Record<string, any>): Promise<ToolResult> {
  const { project, removeNet } = useStore.getState()
  const net = project.nets.find(n => n.id === args.id)
  if (!net) {
    const ids = project.nets.map(n => n.id)
    return { ok: false, error: `no such net "${args.id}". Current net ids: [${ids.join(', ') || '(none)'}].` }
  }
  removeNet(args.id)
  return { ok: true, data: { removed: args.id, endpoints: net.endpoints } }
}

async function handleConnect(args: Record<string, any>): Promise<ToolResult> {
  const s = useStore.getState()
  const from = args.from as string, to = args.to as string
  if (from === to) return { ok: false, error: `Cannot connect a pin to itself: "${from}". Provide two different pin refs.` }
  if (!resolvePin(s.project, from)) return { ok: false, error: `unresolved pin: "${from}". ${pinHint(s.project, from)}` }
  if (!resolvePin(s.project, to))   return { ok: false, error: `unresolved pin: "${to}". ${pinHint(s.project, to)}` }
  const alreadyConnected = s.project.nets.find(n => n.endpoints.includes(from) && n.endpoints.includes(to))
  if (alreadyConnected) {
    return { ok: false, error: `"${from}" and "${to}" are already on the same net ("${alreadyConnected.id}"). No change needed.` }
  }
  s.clickPin(from)
  s.clickPin(to)
  const after = useStore.getState().project
  const drc = runDrc(after)
  const newErrors = drc.errors.filter(e => e.involves.includes(from) || e.involves.includes(to))
  return {
    ok: true,
    data: {
      netCount: after.nets.length,
      drc: {
        errors: drc.errors.length,
        warnings: drc.warnings.length,
        messages: [...drc.errors, ...drc.warnings].slice(0, 5),
        ...(newErrors.length > 0 ? {
          newErrorsFromThisConnect: newErrors.map(e => ({ rule: e.id, message: e.message, fix: e.fixHint }))
        } : {})
      }
    }
  }
}

async function handleRunDrc(): Promise<ToolResult> {
  const { project } = useStore.getState()
  const drc = runDrc(project)
  return { ok: true, data: { errors: drc.errors.length, warnings: drc.warnings.length,
                             messages: [...drc.errors, ...drc.warnings].slice(0, 10) } }
}

async function handleReadFirmware(args: Record<string, any>): Promise<ToolResult> {
  const { project } = useStore.getState()
  const file = String(args.file ?? 'main/app_main.c')
  const code = project.customCode?.[file]
  if (code === undefined) return { ok: false, error: `No custom firmware found for "${file}". Use write_firmware to create it first.` }
  return { ok: true, data: { file, code } }
}

async function handleWriteFirmware(args: Record<string, any>): Promise<ToolResult> {
  const file = String(args.file ?? 'main/app_main.c')
  const code = String(args.code ?? '')
  if (!code.trim()) return { ok: false, error: 'write_firmware called with empty code. Include the full source in the "code" parameter.' }
  useStore.getState().setCustomCode(file, code)
  return { ok: true, data: { file, bytes: code.length } }
}

async function handleSaveProject(): Promise<ToolResult> {
  if (!window.espAI?.saveProject) return { ok: false, error: 'save_project is only available in the Electron app.' }
  const { project, savedPath, markSaved } = useStore.getState()
  const path = await window.espAI.saveProject(project, project.name, savedPath ?? undefined)
  if (!path) return { ok: false, error: 'Save was cancelled by the user.' }
  markSaved(path)
  return { ok: true, data: { savedTo: path } }
}

async function handleFetchUrl(args: Record<string, any>, ctx?: ExecContext): Promise<ToolResult> {
  const url = args.url as string
  try {
    const timeout = AbortSignal.timeout(12000)
    const signal = ctx?.signal
      ? (AbortSignal as any).any?.([timeout, ctx.signal]) ?? timeout
      : timeout
    const resp = await fetch(url, { signal })
    if (!resp.ok) return { ok: false, error: `HTTP ${resp.status} from ${url}` }
    const ct = resp.headers.get('content-type') ?? ''
    const raw = await resp.text()
    const text = ct.includes('html')
      ? raw.replace(/<style[\s\S]*?<\/style>/gi, '')
           .replace(/<script[\s\S]*?<\/script>/gi, '')
           .replace(/<[^>]+>/g, ' ')
           .replace(/\s{2,}/g, ' ')
           .trim()
      : raw
    return { ok: true, data: { url, content: text.slice(0, 4000) } }
  } catch (e: any) {
    return { ok: false, error: e?.message ?? String(e) }
  }
}

async function handlePlanCircuit(args: Record<string, any>, ctx?: ExecContext): Promise<ToolResult> {
  // planCircuitCalled is only set to true when all IDs resolve cleanly (see end of function).
  const { project } = useStore.getState()
  const board = catalog.getBoard(project.board)
  if (!board) return { ok: false, error: 'No board loaded in project. Cannot plan.' }

  const requestedIds: string[] = Array.isArray(args.components) ? args.components : []
  const useWifi: boolean = !!args.use_wifi

  const validComponents: string[] = []
  const unknownComponents: { id: string; suggestions: string[] }[] = []
  const warnings: string[] = []
  const checklist: string[] = []

  const allCatalogIds = catalog.listComponents().map(c => c.id)
  for (const id of requestedIds) {
    if (catalog.getComponent(id)) {
      validComponents.push(id)
      checklist.push(`✓ "${id}" found in catalog`)
    } else {
      const suggestions = closestMatches(id, allCatalogIds, 3)
      unknownComponents.push({ id, suggestions })
      checklist.push(`✗ "${id}" not in catalog — closest: [${suggestions.join(', ')}]. Call list_catalog for all IDs.`)
    }
  }

  // Companion checks
  const hasLed = validComponents.some(id => catalog.getComponent(id)?.pins.some(p => p.id === 'anode'))
  const hasResistor = validComponents.some(id => id.startsWith('resistor-'))
  if (hasLed && !hasResistor) {
    warnings.push('LED planned without a series resistor — add "resistor-220r" to protect the LED and GPIO')
    checklist.push('⚠ Add resistor-220r for the LED before wiring')
  }

  const hasI2cComp = validComponents.some(id =>
    catalog.getComponent(id)?.pins.some(p => p.type === 'i2c_sda' || p.type === 'i2c_scl')
  )
  const hasPullup4k = validComponents.some(id => /resistor-4k/i.test(id))
  if (hasI2cComp && !hasPullup4k) {
    warnings.push('I2C component planned without 4.7 kΩ pull-ups — add resistor-4k7 ×2 for SDA and SCL')
    checklist.push('⚠ Add resistor-4k7 (×2) for I2C pull-ups on SDA and SCL')
  }

  // Build safe GPIO list: exclude flash, strapping, input-only, USB, already-used, and ADC2 when Wi-Fi is on
  const usedBoardPins = new Set(
    project.nets.flatMap(n => n.endpoints)
      .filter(e => e.startsWith('board.'))
      .map(e => e.split('.')[1])
  )
  const restrictedGpios = new Set([
    ...board.flashPins,
    ...board.strappingPins,
    ...board.inputOnlyPins,
    ...(board.usbPins ?? []),
    ...(useWifi ? (board.adc2Pins ?? []) : []),
  ])
  const safeGpios = board.pins
    .filter(p => {
      if (['ground', 'power_in', 'power_out', 'nc'].includes(p.type)) return false
      if (usedBoardPins.has(p.id)) return false
      const gpioLabel = 'GPIO' + p.label
      if (restrictedGpios.has(gpioLabel)) return false
      return true
    })
    .map(p => ({ pinId: p.id, gpio: `GPIO${p.label}`, type: p.type }))

  if (safeGpios.length === 0) {
    warnings.push('No safe GPIO pins available on this board — all suitable pins are in use or restricted')
  }

  if (unknownComponents.length > 0) {
    if (ctx) ctx.abortBatch = true
    const details = unknownComponents.map(u => `  "${u.id}" → did you mean: [${u.suggestions.join(', ')}]?`).join('\n')
    return {
      ok: false,
      error: `plan_circuit: unknown component IDs — fix these before calling add_component:\n${details}\nCall list_catalog for the full list of valid IDs.`
    }
  }

  // All IDs valid — unlock add_component for this session.
  if (ctx) ctx.planCircuitCalled = true

  return {
    ok: true,
    data: {
      goal: args.goal ?? '(not specified)',
      validComponents,
      warnings,
      safeGpios,
      checklist,
      nextStep: warnings.length > 0
          ? 'Address the warnings above (add missing companion parts), then proceed with add_component.'
          : 'Plan validated. Proceed with add_component for each item in validComponents, using safeGpios[].pinId for board pin refs in connect.'
    }
  }
}

async function handleListGlbModels(): Promise<ToolResult> {
  const boards = catalog.listBoards().map(b => ({ type: 'board', id: b.id, name: b.name, glb: b.model, target: b.target }))
  const components = catalog.listComponents().map(c => ({ type: 'component', id: c.id, name: c.name, glb: c.model, category: c.category }))
  return { ok: true, data: { boards, components } }
}

const HANDLERS: Record<string, Handler> = {
  get_project:      () => handleGetProject(),
  list_catalog:     () => handleListCatalog(),
  add_component:    (args, ctx) => handleAddComponent(args, ctx),
  remove_component: (args) => handleRemoveComponent(args),
  remove_net:       (args) => handleRemoveNet(args),
  connect:          (args) => handleConnect(args),
  run_drc:          () => handleRunDrc(),
  read_firmware:    (args) => handleReadFirmware(args),
  write_firmware:   (args) => handleWriteFirmware(args),
  save_project:     () => handleSaveProject(),
  think:            () => Promise.resolve({ ok: true, data: { logged: true } }),
  fetch_url:        (args, ctx) => handleFetchUrl(args, ctx),
  list_glb_models:  () => handleListGlbModels(),
  plan_circuit:     (args, ctx) => handlePlanCircuit(args, ctx),
}

async function executeInternal(
  name: string,
  args: Record<string, any>,
  ctx?: ExecContext
): Promise<ToolResult> {
  const handler = HANDLERS[name]
  if (!handler) return { ok: false, error: `unknown tool: ${name}` }
  try {
    return await handler(args, ctx)
  } catch (e: any) {
    return { ok: false, error: e?.message ?? String(e) }
  }
}

// ---- helpers ----

// Deterministic stringify so repeated calls with the same keys in different
// order still hash to the same failure key.
function stableStringify(o: any): string {
  if (o === null || typeof o !== 'object') return JSON.stringify(o)
  if (Array.isArray(o)) return '[' + o.map(stableStringify).join(',') + ']'
  const keys = Object.keys(o).sort()
  return '{' + keys.map(k => JSON.stringify(k) + ':' + stableStringify(o[k])).join(',') + '}'
}

function levenshtein(a: string, b: string): number {
  if (a === b) return 0
  if (!a.length) return b.length
  if (!b.length) return a.length
  let prev = new Array(b.length + 1)
  let curr = new Array(b.length + 1)
  for (let j = 0; j <= b.length; j++) prev[j] = j
  for (let i = 1; i <= a.length; i++) {
    curr[0] = i
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      curr[j] = Math.min(curr[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost)
    }
    ;[prev, curr] = [curr, prev]
  }
  return prev[b.length]
}

function closestMatches(query: string, candidates: string[], n: number): string[] {
  const q = query.toLowerCase()
  return candidates
    .map(c => ({ c, d: levenshtein(q, c.toLowerCase()) }))
    .sort((a, b) => a.d - b.d)
    .slice(0, n)
    .map(x => x.c)
}

// Build a helpful hint for a bad pin ref: suggest valid owners if the owner is
// unknown, or the closest pin ids on the correct owner if only the pin part is off.
function pinHint(project: Project, ref: string): string {
  const parts = (ref ?? '').split('.')
  const owner = parts[0] ?? ''
  const pinId = parts[1] ?? ''
  const owners = ['board', ...project.components.map(c => c.instance)]

  if (owner !== 'board' && !project.components.find(c => c.instance === owner)) {
    return `Unknown owner. Valid owners: [${owners.join(', ')}]. Format: "owner.pinId".`
  }

  let pinIds: string[] = []
  if (owner === 'board') {
    const board = catalog.getBoard(project.board)
    pinIds = board?.pins.map(p => p.id) ?? []
  } else {
    const inst = project.components.find(c => c.instance === owner)
    const def = inst && catalog.getComponent(inst.componentId)
    pinIds = def?.pins.map(p => p.id) ?? []
  }
  const near = closestMatches(pinId, pinIds, 5)
  return `Closest pins on "${owner}": [${near.join(', ')}]. Call get_project or list_catalog for the full pin list.`
}
