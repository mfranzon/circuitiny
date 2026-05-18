// Claude Code session provider — uses the locally stored OAuth credentials
// (your Claude Pro/Max subscription) instead of a separate API key.
// Tool calling works via a text-based protocol: Claude outputs <tool_call> tags
// which we parse and execute locally, then feed results back for the next turn.

import type { Msg, AgentCallbacks, ProviderConfig } from './types'
import { tools, execTool, makeExecContext } from './tools'

// One-line description per tool so the system-prompt injection stays compact.
const TOOL_SPEC = tools
  .map((t) => {
    const props = Object.entries(t.function.parameters.properties ?? {})
      .map(([k, v]: [string, any]) => {
        const req = (t.function.parameters.required ?? []).includes(k) ? '' : '?'
        const enumNote = v.enum ? ` (${v.enum.join('|')})` : ''
        return `    ${k}${req}: ${v.type ?? 'any'}${enumNote}`
      })
      .join('\n')
    return `  ${t.function.name} — ${t.function.description}\n${props}`
  })
  .join('\n\n')

const TOOL_PROTOCOL = `
TOOL CALL PROTOCOL:
To call a tool output EXACTLY this on its own line — nothing before or after it on that line:
<tool_call>{"name":"TOOL_NAME","args":{ARGS_JSON}}</tool_call>

Do NOT use your built-in bash/file tools. ONLY use the tools listed below via the format above.
After a tool call STOP — do not write more text. The result will appear as "ToolResult: ..." and you continue from there.

TOOLS:
${TOOL_SPEC}
`

const TOOL_CALL_RE = /<tool_call>([\s\S]*?)<\/tool_call>/g

function parseToolCalls(text: string): Array<{ name: string; args: any }> {
  const calls: Array<{ name: string; args: any }> = []
  let m: RegExpExecArray | null
  TOOL_CALL_RE.lastIndex = 0
  while ((m = TOOL_CALL_RE.exec(text)) !== null) {
    try {
      const parsed = JSON.parse(m[1].trim())
      if (parsed.name) calls.push({ name: parsed.name, args: parsed.args ?? {} })
    } catch { /* skip malformed tag */ }
  }
  return calls
}

function formatConversation(conv: Msg[]): string {
  const lines: string[] = []
  for (const m of conv) {
    if (m.role === 'system') {
      // Claude Code has no separate system field — inject it as the opening human turn
      // so the firmware rules and project context reach the model.
      lines.push(`Human: [System instructions]\n${m.content}`)
      lines.push('Assistant: Understood. I will follow these instructions and use only the tools listed in the protocol.')
      continue
    }
    if (m.role === 'user') {
      lines.push(`Human: ${m.content}`)
    } else if (m.role === 'assistant') {
      if (m.content) lines.push(`Assistant: ${m.content}`)
      for (const tc of m.tool_calls ?? []) {
        lines.push(
          `<tool_call>${JSON.stringify({ name: tc.function.name, args: tc.function.arguments })}</tool_call>`
        )
      }
    } else if (m.role === 'tool') {
      lines.push(`ToolResult: ${m.content}`)
    }
  }
  return lines.join('\n')
}

export async function chatClaudeCode(
  conv: Msg[],
  cfg: ProviderConfig,
  cb: AgentCallbacks
): Promise<void> {
  if (!window.espAI?.claudeCodeChat) {
    cb.onError('claudeCodeChat IPC not available — only works inside Electron')
    return
  }

  const maxLoops = cfg.maxToolLoops ?? 16
  const signal = cfg.signal
  const execCtx = makeExecContext(signal)

  for (let loop = 0; loop < maxLoops; loop++) {
    if (signal?.aborted) { cb.onError('aborted'); return }

    const result = await window.espAI.claudeCodeChat({
      prompt: formatConversation(conv),
      systemAppend: TOOL_PROTOCOL,
      model: cfg.model,
      timeoutMs: cfg.idleTimeoutMs,
    })

    if (signal?.aborted) { cb.onError('aborted'); return }
    if (!result.ok) { cb.onError(result.error ?? 'Claude Code error'); return }

    const raw = result.text ?? ''
    // Strip ANSI escape codes that the CLI may emit
    const clean = raw.replace(/\x1b\[[0-9;]*m/g, '')
    const toolCalls = parseToolCalls(clean)
    const visibleText = clean.replace(TOOL_CALL_RE, '').trim()

    if (visibleText) cb.onToken(visibleText)

    const msg: Msg = {
      role: 'assistant',
      content: visibleText,
      ...(toolCalls.length
        ? {
            tool_calls: toolCalls.map((tc, i) => ({
              id: `cc-${loop}-${i}`,
              function: { name: tc.name, arguments: tc.args },
            })),
          }
        : {}),
    }
    conv.push(msg)
    cb.onMessage(msg)

    if (!toolCalls.length) return

    // The CLI tends to emit a whole plan as one batch instead of stopping after
    // the first call. If a critical tool (e.g. plan_circuit with bad IDs) fails,
    // skip the rest so the next turn confronts the error instead of running a
    // cascade of doomed connects against components that were never added.
    execCtx.abortBatch = false
    for (const [i, call] of toolCalls.entries()) {
      if (signal?.aborted) { cb.onError('aborted'); return }
      const toolResult = execCtx.abortBatch
        ? { ok: false as const, error: 'Skipped: a previous step in this batch failed. Fix the errors above and try again.' }
        : await execTool(call.name, call.args, execCtx)
      cb.onToolCall(call.name, call.args, toolResult)
      const toolMsg: Msg = {
        role: 'tool',
        tool_name: call.name,
        name: call.name,
        tool_call_id: `cc-${loop}-${i}`,
        content: JSON.stringify(toolResult),
      }
      conv.push(toolMsg)
      cb.onMessage(toolMsg)
    }
  }
  cb.onError(`Max tool loops (${maxLoops}) reached`)
}
