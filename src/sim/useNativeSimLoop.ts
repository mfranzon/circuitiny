import { useEffect } from 'react'
import { useStore } from '../store'

// Bridges the native firmware binary ↔ Zustand store:
//   binary stdout JSON lines → simGpios / simLog
//   pendingEdges (button clicks) → binary stdin

export function useNativeSimLoop() {
  const simulating  = useStore((s) => s.simulating)
  const nativeRunId = useStore((s) => s.nativeRunId)

  // ── GPIO + log events from the binary ─────────────────────────────────
  useEffect(() => {
    if (!simulating || !nativeRunId) return

    const api = (window as any).espAI
    if (!api?.onSimEvent || !api?.onSimExit) return

    const unsubEvent = api.onSimEvent((e: { runId: string; line: string }) => {
      if (e.runId !== nativeRunId) return
      try {
        const ev = JSON.parse(e.line)
        if (ev.t === 'gpio') {
          const label = String(ev.pin)
          useStore.setState((s) => ({
            simGpios: { ...s.simGpios, [label]: ev.val === 1 },
          }))
        } else if (ev.t === 'log') {
          const line = `[${ev.level}] ${ev.tag}: ${ev.msg}`
          useStore.setState((s) => ({
            simLog: [...s.simLog, line].slice(-200),
          }))
        } else if (ev.t === 'stderr') {
          useStore.setState((s) => ({
            simLog: [...s.simLog, `[stderr] ${ev.msg}`].slice(-200),
          }))
        }
      } catch { /* ignore parse errors */ }
    })

    const unsubExit = api.onSimExit((e: { runId: string }) => {
      if (e.runId !== nativeRunId) return
      useStore.getState().setSimulating(false)
      useStore.getState().setNativeRunId(null)
    })

    return () => { unsubEvent(); unsubExit() }
  }, [simulating, nativeRunId])

  // ── Button press injection → binary stdin ──────────────────────────────
  useEffect(() => {
    if (!simulating || !nativeRunId) return

    const api = (window as any).espAI
    if (!api?.simInject) return

    return useStore.subscribe((state, prev) => {
      if (state.pendingEdges === prev.pendingEdges) return
      if (!state.pendingEdges.length) return
      const runId = state.nativeRunId
      if (!runId) return
      for (const { label, type } of state.pendingEdges) {
        const pin = parseInt(label, 10)
        if (isNaN(pin)) continue
        const val = type === 'falling' ? 0 : 1
        api.simInject(runId, JSON.stringify({ t: 'gpio_in', pin, val }))
      }
      useStore.setState({ pendingEdges: [] })
    })
  }, [simulating, nativeRunId])
}
