import { useEffect, useRef } from 'react'
import { useStore } from '../store'
import { runDrc } from '../drc'
import { generate } from '../codegen/generate'

export default function SimPane() {
  const project    = useStore((s) => s.project)
  const simulating = useStore((s) => s.simulating)
  const simTime    = useStore((s) => s.simTime)
  const simLog     = useStore((s) => s.simLog)
  const nativeCompileStatus = useStore((s) => s.nativeCompileStatus)
  const nativeCompileError  = useStore((s) => s.nativeCompileError)
  const nativeBinaryPath    = useStore((s) => s.nativeBinaryPath)
  const nativeRunId         = useStore((s) => s.nativeRunId)
  const setSim              = useStore((s) => s.setSimulating)
  const setNativeCompile    = useStore((s) => s.setNativeCompile)
  const setNativeRunId      = useStore((s) => s.setNativeRunId)
  const logRef = useRef<HTMLDivElement>(null)

  const canRun = runDrc(project).errors.length === 0

  useEffect(() => {
    const el = logRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [simLog])

  const timeLabel = simTime < 1000
    ? `${simTime} ms`
    : `${(simTime / 1000).toFixed(2)} s`

  async function handleCompile() {
    const api = (window as any).espAI
    if (!api?.simCompile) return
    setNativeCompile('compiling', null, null)
    try {
      const { files } = generate(project)
      const appMainC = project.customCode?.['main/app_main.c'] ?? files['main/app_main.c']
      const result = await api.simCompile(project.name, appMainC)
      if (result.ok) {
        setNativeCompile('ready', null, result.binaryPath)
        useStore.setState((s) => ({
          simLog: [...s.simLog, '[compile] firmware compiled successfully'].slice(-200),
        }))
      } else {
        setNativeCompile('error', result.error ?? 'unknown error', null)
        useStore.setState((s) => ({
          simLog: [...s.simLog, `[compile] error: ${result.error}`].slice(-200),
        }))
      }
    } catch (e: any) {
      const msg = e?.message ?? String(e)
      setNativeCompile('error', msg, null)
      useStore.setState((s) => ({
        simLog: [...s.simLog, `[compile] exception: ${msg}`].slice(-200),
      }))
    }
  }

  async function handlePlay() {
    const api = (window as any).espAI
    if (!api?.simStart || !nativeBinaryPath) return
    setSim(true)
    const { runId } = await api.simStart(nativeBinaryPath)
    setNativeRunId(runId)
  }

  async function handleStop() {
    const api = (window as any).espAI
    if (!api?.simStop) return
    if (nativeRunId) await api.simStop(nativeRunId)
    setSim(false)
    setNativeRunId(null)
  }

  const compileLabel =
    nativeCompileStatus === 'compiling' ? '⟳ Compiling…' :
    nativeCompileStatus === 'ready'     ? '✓ Compiled' :
    nativeCompileStatus === 'error'     ? '✗ Error' :
    '⬡ Compile'

  const canPlay = nativeCompileStatus === 'ready' && canRun && !simulating

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: '#0f0f0f' }}>

      {/* Controls row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 10px',
                    borderBottom: '1px solid #222', flexShrink: 0 }}>

        {/* Compile */}
        <button
          onClick={handleCompile}
          disabled={simulating || nativeCompileStatus === 'compiling'}
          style={{
            ...btn, minWidth: 96,
            background: nativeCompileStatus === 'ready'     ? '#1a2a3a' :
                        nativeCompileStatus === 'error'     ? '#3a1a1a' :
                        nativeCompileStatus === 'compiling' ? '#1a1a2a' : 'transparent',
            borderColor: nativeCompileStatus === 'ready'     ? '#5a8af5' :
                         nativeCompileStatus === 'error'     ? '#ff6b6b' :
                         nativeCompileStatus === 'compiling' ? '#555'    : '#444',
            color: nativeCompileStatus === 'ready'     ? '#5a8af5' :
                   nativeCompileStatus === 'error'     ? '#ff6b6b' :
                   nativeCompileStatus === 'compiling' ? '#888'    : '#aaa',
            cursor: (simulating || nativeCompileStatus === 'compiling') ? 'not-allowed' : 'pointer',
          }}>
          {compileLabel}
        </button>

        {/* Play / Stop */}
        {!simulating ? (
          <button
            onClick={handlePlay}
            disabled={!canPlay}
            style={{
              ...btn, minWidth: 64,
              background: canPlay ? '#1a3a1a' : 'transparent',
              borderColor: canPlay ? '#4a9d4a' : '#333',
              color: canPlay ? '#fff' : '#555',
              cursor: canPlay ? 'pointer' : 'not-allowed',
            }}>
            ▶ Run
          </button>
        ) : (
          <button onClick={handleStop} style={{ ...btn, minWidth: 64,
            background: '#3a1a1a', borderColor: '#ff6b6b', color: '#fff' }}>
            ■ Stop
          </button>
        )}

        <div style={{ flex: 1 }} />

        {/* Clock */}
        <span style={{
          fontVariantNumeric: 'tabular-nums', fontSize: 11,
          color: simulating ? '#7edd7e' : '#444',
          minWidth: 60, textAlign: 'right',
          fontFamily: "'SF Mono', Menlo, monospace",
        }}>
          {simulating ? timeLabel : '—'}
        </span>
      </div>

      {/* Hint when idle */}
      {!simulating && (
        <div style={{ padding: '10px 12px', fontSize: 11, color: '#555', fontStyle: 'italic' }}>
          {nativeCompileStatus === 'ready'
            ? 'Firmware compiled. Press Run to start the simulation.'
            : canRun
            ? 'Press Compile to build the firmware, then Run to simulate it.'
            : 'Fix DRC errors before compiling.'}
        </div>
      )}

      {nativeCompileError && nativeCompileStatus === 'error' && (
        <div style={{ padding: '6px 10px', fontSize: 10, color: '#ff6b6b',
                      fontFamily: "'SF Mono', Menlo, monospace", whiteSpace: 'pre-wrap' }}>
          {nativeCompileError}
        </div>
      )}

      {/* Log */}
      <div ref={logRef} style={{
        flex: 1, overflowY: 'auto', padding: '6px 10px',
        fontFamily: "'SF Mono', Menlo, monospace", fontSize: 11, lineHeight: '17px',
        color: '#9ecbff',
      }}>
        {simLog.length === 0
          ? <span style={{ color: '#444' }}>no output</span>
          : simLog.map((line, i) => (
              <div key={i} style={{
                color: line.startsWith('⚠') || line.includes('error') ? '#ff6b6b' :
                       line.startsWith('[W]') ? '#ffcc00' :
                       line.startsWith('[compile]') ? '#888' : '#9ecbff',
              }}>
                {line}
              </div>
            ))}
      </div>
    </div>
  )
}

const btn: React.CSSProperties = {
  background: 'transparent',
  border: '1px solid #444',
  borderRadius: 3,
  color: '#ccc',
  fontSize: 10,
  padding: '2px 8px',
  cursor: 'pointer',
  lineHeight: '18px',
  fontFamily: "'SF Mono', Menlo, monospace",
}
