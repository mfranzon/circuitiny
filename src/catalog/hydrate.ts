// Loads user-added components from ~/.circuitiny/catalog/ into the in-memory catalog.

import { catalog } from './index'
import type { ComponentDef, SchematicSymbolSpec, SchematicSymbol, SimDef } from '../project/component'

// Heuristic fallback for user catalog entries whose component.json predates
// the `schematic.symbol` field.
function inferSchematic(id: string): SchematicSymbolSpec {
  const lower = id.toLowerCase()
  const match: [string, SchematicSymbol][] = [
    ['resistor', 'resistor'], ['capacitor', 'capacitor'], ['speaker', 'speaker'],
    ['mic', 'microphone'], ['led-strip', 'ledstrip'], ['ws2812', 'ledstrip'],
    ['led', 'led'], ['button', 'button'], ['switch', 'button'],
    ['pot', 'potentiometer'], ['oled', 'display'], ['display', 'display'],
    ['servo', 'motor'], ['motor', 'motor'], ['relay', 'relay'],
    ['pir', 'sensor'], ['dht', 'sensor'], ['mpu', 'ic'], ['imu', 'ic']
  ]
  for (const [needle, symbol] of match) if (lower.includes(needle)) return { symbol }
  return { symbol: 'generic-rect' }
}

export async function hydrateCatalog(): Promise<number> {
  if (!window.espAI?.listCatalog) return 0
  let n = 0

  // Built-in board models: shipped under resources/boards/<id>.glb
  if (window.espAI.listBoardModels) {
    for (const b of await window.espAI.listBoardModels()) {
      catalog.registerBoardGlb(b.id, b.data)
      n++
    }
  }

  const entries = await window.espAI.listCatalog()
  for (const e of entries) {
    const j = e.json
    if (!j?.id || !Array.isArray(j.pins)) continue
    const def: ComponentDef = {
      id: j.id,
      name: j.name ?? j.id,
      version: j.version ?? '0.1.0',
      category: j.category ?? 'misc',
      model: j.model ?? 'model.glb',
      scale: typeof j.scale === 'number' ? j.scale : 1,
      pins: j.pins.map((p: any) => ({
        id: p.id, label: p.label ?? p.id,
        type: p.type ?? 'digital_io',
        position: p.position, normal: p.normal ?? [0, 1, 0]
      })),
      schematic: j.schematic ?? inferSchematic(j.id),
      ...(j.sim ? { sim: j.sim as SimDef } : {})
    }
    catalog.registerComponent(def, e.glbData)
    n++
  }
  return n
}
