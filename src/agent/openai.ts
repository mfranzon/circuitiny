// OpenAI-compatible chat client (works for OpenAI and OpenRouter).
// Streams SSE chunks; iterates tool calls until the model stops.

import { tools, execTool, makeExecContext, trimConvForApi } from './tools'
import type { Msg, AgentCallbacks, ProviderConfig } from './types'

export async function chatOpenAI(
  conv: Msg[],
  cfg: ProviderConfig,
  cb: AgentCallbacks
): Promise<void> {
  const baseUrl = cfg.baseUrl ?? 'https://api.openai.com/v1'
  const maxLoops = cfg.maxToolLoops ?? 16
  const signal = cfg.signal
  const execCtx = makeExecContext(signal)
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${cfg.apiKey ?? ''}`,
  }
  if (cfg.provider === 'openrouter') {
    headers['HTTP-Referer'] = 'https://circuitiny.app'
    headers['X-Title'] = 'Circuitiny'
  }

  for (let loop = 0; loop < maxLoops; loop++) {
    if (signal?.aborted) { cb.onError('aborted'); return }
    let resp: Response
    try {
      resp = await fetch(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          model: cfg.model,
          messages: trimConvForApi(conv),
          tools,
          tool_choice: 'auto',
          stream: true,
        }),
        signal,
      })
    } catch (e: any) {
      if (signal?.aborted || e?.name === 'AbortError') { cb.onError('aborted'); return }
      cb.onError(`${cfg.provider} fetch error: ${e?.message ?? String(e)}`)
      return
    }
    if (!resp.ok || !resp.body) {
      cb.onError(`${cfg.provider} error ${resp.status}: ${await resp.text().catch(() => '')}`)
      return
    }

    const reader = resp.body.getReader()
    const decoder = new TextDecoder()
    let buf = ''
    let acc = ''
    const toolCallAccum: Record<number, { id: string; name: string; args: string }> = {}

    try {
    outer: while (true) {
      const { done, value } = await reader.read()
      if (done) break
      buf += decoder.decode(value, { stream: true })
      let nl: number
      while ((nl = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, nl).trim()
        buf = buf.slice(nl + 1)
        if (!line.startsWith('data:')) continue
        const payload = line.slice(5).trim()
        if (payload === '[DONE]') break outer
        let chunk: any
        try { chunk = JSON.parse(payload) } catch { continue }
        const delta = chunk.choices?.[0]?.delta
        if (!delta) continue
        if (delta.content) { acc += delta.content; cb.onToken(delta.content) }
        for (const tc of delta.tool_calls ?? []) {
          const idx = tc.index ?? 0
          if (!toolCallAccum[idx]) toolCallAccum[idx] = { id: '', name: '', args: '' }
          if (tc.id)                toolCallAccum[idx].id   += tc.id
          if (tc.function?.name)    toolCallAccum[idx].name += tc.function.name
          if (tc.function?.arguments) toolCallAccum[idx].args += tc.function.arguments
        }
      }
    }
    } catch (e: any) {
      if (signal?.aborted || e?.name === 'AbortError') { cb.onError('aborted'); return }
      cb.onError(`${cfg.provider} stream error: ${e?.message ?? String(e)}`)
      return
    }

    const toolCalls = Object.values(toolCallAccum).length > 0
      ? Object.values(toolCallAccum).map((tc) => ({
          id: tc.id,
          function: { name: tc.name, arguments: safeJson(tc.args) },
        }))
      : undefined

    const msg: Msg = { role: 'assistant', content: acc, ...(toolCalls ? { tool_calls: toolCalls } : {}) }
    conv.push(msg)
    cb.onMessage(msg)

    if (!toolCalls?.length) return

    execCtx.abortBatch = false
    for (const call of toolCalls) {
      if (signal?.aborted) { cb.onError('aborted'); return }
      const name = call.function.name
      const args = call.function.arguments ?? {}

      const result = execCtx.abortBatch
        ? { ok: false as const, error: 'Skipped: a previous step in this batch failed. Fix the errors above and try again.' }
        : await execTool(name, args, execCtx)

      cb.onToolCall(name, args, result)
      const toolMsg: Msg = {
        role: 'tool', tool_name: name, name, tool_call_id: call.id,
        content: JSON.stringify(result),
      }
      conv.push(toolMsg)
      cb.onMessage(toolMsg)
    }
  }
  cb.onError(`Max tool loops (${cfg.maxToolLoops ?? 16}) reached`)
}

function safeJson(s: string) { try { return JSON.parse(s) } catch { return {} } }
