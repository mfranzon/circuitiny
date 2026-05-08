// Unified chat entry point. Routes to the correct provider client based on cfg.provider.

import type { Msg, AgentCallbacks, ProviderConfig } from './types'
import { chatAnthropic } from './anthropic'
import { chatOpenAI } from './openai'
import { chat as chatOllama } from './ollama'
import { chatClaudeCode } from './claudecode'
import { buildExpertPrompt } from './expertPrompt'

export const SYSTEM = `You are an ESP32 design copilot for hobbyists. The user has a 3D board viewer.
You manipulate the project by calling tools — never describe code or pin assignments in prose when you could just call the tool.

Workflow rule: when asked to add parts or wire things, call plan_circuit first with your component list to validate IDs and get safe GPIO pins, then add_component, then connect using exact pin refs like "led1.anode" and "board.gpio4".
After wiring changes, call run_drc to verify. Keep replies to the user short and focused.

Firmware rule: when the user asks for firmware, application code, or "make it work", call get_project first to read the current wiring, then call write_firmware with complete, compilable ESP-IDF C code for "main/app_main.c". Include all required headers, GPIO/I2C init, and the app_main function. The code appears instantly in the Code pane. Always write real working code — never refuse or say you lack the capability. Once write_firmware returns { ok: true }, stop calling tools and reply to the user with a one-line summary — do not call run_drc or get_project after writing firmware.

Electronics safety rules — apply these automatically without waiting for the user to ask:
- LED (any colour): always add a current-limiting resistor (220 Ω–470 Ω for 3.3 V GPIO) in series between the GPIO and the anode. Wire: board.gpioX → resistor.in → resistor.out → led.anode → led.cathode → board.GND.
- Buzzer (passive): needs a flyback / current-limiting resistor (~100 Ω) in series if driven directly from a GPIO.
- Button / tactile switch: add a pull-up or pull-down resistor (10 kΩ) unless the board pin already has one configured.
- I²C bus: add 4.7 kΩ pull-up resistors on SDA and SCL if no other component on the net already provides them.
- Crystal / oscillator: add the specified load capacitors (usually 2 × 22 pF) to GND on each leg.
- Any inductive load (motor, relay coil): add a flyback diode across the coil, cathode toward the supply rail.

When you are about to add a component that needs a companion part, add the companion first, then wire everything together in the correct order. Tell the user briefly what you added and why.`

// Rough token estimate: ~4 chars per token.
function estimateTokens(msg: Msg): number {
  let text = msg.content ?? ''
  if (msg.tool_calls) text += JSON.stringify(msg.tool_calls)
  return Math.ceil(text.length / 4)
}

// Keep the system prompt + the most recent messages that fit within TOKEN_BUDGET.
// Always preserves structural integrity: never drops the last user message.
const TOKEN_BUDGET = 12_000

function trimHistory(history: Msg[], systemPrompt: string): Msg[] {
  const sysMsg: Msg = { role: 'system', content: systemPrompt }
  const sysTokens = estimateTokens(sysMsg)
  let budget = TOKEN_BUDGET - sysTokens
  const kept: Msg[] = []
  for (let i = history.length - 1; i >= 0; i--) {
    const t = estimateTokens(history[i])
    if (budget - t < 0) break
    budget -= t
    kept.unshift(history[i])
  }

  // Drop orphaned tool_result messages: if the assistant message that issued
  // the matching tool_use was cut by the budget, Anthropic rejects the request
  // with a 400 "unexpected tool_use_id" error.
  const keptToolUseIds = new Set(kept.flatMap(m => m.tool_calls?.map(tc => tc.id) ?? []))
  const clean = kept.filter(m => m.role !== 'tool' || keptToolUseIds.has(m.tool_call_id ?? ''))

  return [sysMsg, ...clean]
}

export async function chat(
  history: Msg[],
  userMessage: string,
  cb: AgentCallbacks,
  cfg: ProviderConfig
): Promise<Msg[]> {
  // Build the expert prompt from recent context so only relevant snippets are injected.
  const recentContext = history.slice(-4).map(m => m.content ?? '').concat(userMessage).join(' ')
  const systemPrompt = cfg.expertMode ? buildExpertPrompt(recentContext) : SYSTEM
  const effectiveCfg: ProviderConfig = cfg.expertMode
    ? { ...cfg, maxToolLoops: cfg.maxToolLoops ?? 48 }
    : cfg

  const trimmed = trimHistory(history, systemPrompt)
  const conv: Msg[] = [
    ...trimmed,
    { role: 'user', content: userMessage },
  ]
  cb.onMessage({ role: 'user', content: userMessage })

  switch (effectiveCfg.provider) {
    case 'anthropic':
      await chatAnthropic(conv, effectiveCfg, cb)
      break
    case 'openai':
    case 'openrouter':
      await chatOpenAI(conv, effectiveCfg, cb)
      break
    case 'claudecode':
      await chatClaudeCode(conv, effectiveCfg, cb)
      break
    case 'ollama':
    default:
      await chatOllama(history, userMessage, cb, {
        model: effectiveCfg.model,
        host: effectiveCfg.baseUrl,
        maxToolLoops: effectiveCfg.maxToolLoops,
        signal: effectiveCfg.signal,
      })
      return conv  // ollama manages its own conv copy
  }

  return conv
}
