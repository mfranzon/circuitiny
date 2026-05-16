import { useEffect, useState, Component, type ReactNode, type ErrorInfo } from 'react'
import { PanelGroup, Panel, PanelResizeHandle } from 'react-resizable-panels'
import Viewer3D from './panes/Viewer3D'
import SchematicTabs from './panes/SchematicTabs'
import CodeBuildTabs from './panes/CodeBuildTabs'
import ChatPane from './panes/ChatPane'
import Palette from './panes/Palette'
import BoardPicker from './panes/BoardPicker'
import { useStore } from './store'
import { hydrateCatalog } from './catalog/hydrate'
import { useNativeSimLoop } from './sim/useNativeSimLoop'

const LS_UI_MODE = 'circuitiny:ui-mode'
type UiMode = 'beginner' | 'advanced'

export default function App() {
  const [uiMode, setUiMode] = useState<UiMode>(() =>
    (localStorage.getItem(LS_UI_MODE) as UiMode) ?? 'beginner'
  )
  function toggleUiMode() {
    const next: UiMode = uiMode === 'beginner' ? 'advanced' : 'beginner'
    setUiMode(next)
    localStorage.setItem(LS_UI_MODE, next)
  }
  const bump = useStore((s) => s.bumpCatalog)
  const showBoardPicker = useStore((s) => s.showBoardPicker)
  const openBoardPicker = useStore((s) => s.openBoardPicker)
  const project = useStore((s) => s.project)
  const savedPath = useStore((s) => s.savedPath)
  const dirty = useStore((s) => s.dirty)
  const loadProject = useStore((s) => s.loadProject)
  const markSaved = useStore((s) => s.markSaved)

  useNativeSimLoop()

  useEffect(() => {
    hydrateCatalog().then((n) => { if (n > 0) bump() }).catch(() => { /* ignore */ })
  }, [bump])

  async function handleSave() {
    if (!window.espAI?.saveProject) return
    // Always read fresh state — avoids stale closure in keyboard handler
    const { project: p, savedPath: sp } = useStore.getState()
    const path = await window.espAI.saveProject(p, p.name, sp ?? undefined)
    if (path) markSaved(path)
  }

  async function handleOpen() {
    if (!window.espAI?.openProject) return
    const result = await window.espAI.openProject()
    if (result) loadProject(result.project as import('./project/schema').Project, result.path)
  }

  // Cmd+S / Ctrl+S, Cmd+Z / Ctrl+Z, Cmd+Shift+Z / Ctrl+Shift+Z
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 's') { e.preventDefault(); handleSave(); return }
      if ((e.metaKey || e.ctrlKey) && !e.shiftKey && e.key === 'z') { e.preventDefault(); useStore.getState().undo(); return }
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key === 'z') { e.preventDefault(); useStore.getState().redo(); return }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const canIO = !!window.espAI?.saveProject

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>
      <nav style={{ display: 'flex', gap: 6, padding: '6px 10px', background: '#0a0a0a',
                    borderBottom: '1px solid #333', alignItems: 'center' }}>
        <strong style={{ fontSize: 12, marginRight: 12 }}>Circuitiny</strong>
        <button onClick={toggleUiMode}
                title={uiMode === 'beginner'
                  ? 'Beginner mode: just the 3D view and the agent. Click for the full advanced layout.'
                  : 'Advanced mode: all panels visible. Click for the simpler beginner layout.'}
                style={modeToggleStyle(uiMode)}>
          {uiMode === 'beginner' ? '🌱 Beginner' : '⚙ Advanced'}
        </button>
        <div style={{ flex: 1 }} />
        <span style={{ fontSize: 11, color: dirty ? '#886633' : '#555', marginRight: 4 }}
              title={savedPath ?? 'unsaved'}>
          {project.name}{dirty && ' ●'}
        </span>
        {canIO && (
          <>
            <button onClick={handleOpen} style={actionStyle} title="Open project (⌘O)">Open</button>
            <button onClick={handleSave} style={actionStyle} title="Save project (⌘S)">Save</button>
          </>
        )}
        <button onClick={openBoardPicker} style={newProjectStyle}>+ New Project</button>
      </nav>
      <div style={{ flex: 1, minHeight: 0 }}>
        {uiMode === 'beginner' ? <BeginnerMode /> : <ProjectMode />}
      </div>
      {showBoardPicker && <BoardPicker />}
    </div>
  )
}

function BeginnerMode() {
  return (
    <PanelGroup direction="horizontal" autoSaveId="circuitiny:beginner">
      <Panel defaultSize={65} minSize={30}>
        <PaneFrame title="3D Viewer" noPad><Viewer3D /></PaneFrame>
      </Panel>
      <ResizeH />
      <Panel defaultSize={35} minSize={20} maxSize={55}>
        <PaneFrame title="Agent" noPad><ChatPane /></PaneFrame>
      </Panel>
    </PanelGroup>
  )
}

function ProjectMode() {
  return (
    <PanelGroup direction="horizontal" autoSaveId="circuitiny:project">
      <Panel defaultSize={15} minSize={10} maxSize={30}>
        <PaneFrame title="Palette"><Palette /></PaneFrame>
      </Panel>
      <ResizeH />
      <Panel defaultSize={60} minSize={20}>
        <PanelGroup direction="vertical" autoSaveId="circuitiny:project:center">
          <Panel defaultSize={70} minSize={20}>
            <PanelGroup direction="horizontal" autoSaveId="circuitiny:project:center:top">
              <Panel defaultSize={60} minSize={20}>
                <PaneFrame title="3D Viewer" noPad><Viewer3D /></PaneFrame>
              </Panel>
              <ResizeH />
              <Panel defaultSize={40} minSize={15}>
                <PaneFrame title="Schematic" noPad><SchematicTabs /></PaneFrame>
              </Panel>
            </PanelGroup>
          </Panel>
          <ResizeV />
          <Panel defaultSize={30} minSize={10}>
            <PaneFrame title="Code / Build" noPad><CodeBuildTabs /></PaneFrame>
          </Panel>
        </PanelGroup>
      </Panel>
      <ResizeH />
      <Panel defaultSize={25} minSize={15} maxSize={40}>
        <PaneFrame title="Agent" noPad><ChatPane /></PaneFrame>
      </Panel>
    </PanelGroup>
  )
}

class ErrorBoundary extends Component<
  { children: ReactNode; label: string },
  { error: Error | null }
> {
  state = { error: null }
  static getDerivedStateFromError(error: Error) { return { error } }
  componentDidCatch(_err: Error, info: ErrorInfo) {
    console.error('[Circuitiny] render error in', this.props.label, info.componentStack)
  }
  render() {
    if (this.state.error) {
      const msg = (this.state.error as Error).message
      return (
        <div style={{ padding: 16, color: '#ff6b6b', fontFamily: 'monospace', fontSize: 11 }}>
          <strong>Render error in {this.props.label}</strong>
          <pre style={{ marginTop: 8, whiteSpace: 'pre-wrap', color: '#aaa' }}>{msg}</pre>
          <button onClick={() => this.setState({ error: null })}
                  style={{ marginTop: 8, padding: '4px 10px', fontSize: 11, cursor: 'pointer',
                           background: 'transparent', color: '#aaa', border: '1px solid #444', borderRadius: 3 }}>
            retry
          </button>
        </div>
      )
    }
    return this.props.children
  }
}

function PaneFrame({ title, children, noPad }: { title: string; children: React.ReactNode; noPad?: boolean }) {
  return (
    <section className="pane" style={{ height: '100%' }}>
      <header>{title}</header>
      <div className="body" style={noPad ? { padding: 0, overflow: 'hidden' } : undefined}>
        <ErrorBoundary label={title}>{children}</ErrorBoundary>
      </div>
    </section>
  )
}

function ResizeH() {
  return <PanelResizeHandle style={{ width: 4, background: '#111', cursor: 'col-resize' }} className="resize-h" />
}

function ResizeV() {
  return <PanelResizeHandle style={{ height: 4, background: '#111', cursor: 'row-resize' }} className="resize-v" />
}

const modeToggleStyle = (mode: UiMode): React.CSSProperties => ({
  background: mode === 'beginner' ? '#0d2a1a' : 'transparent',
  color: mode === 'beginner' ? '#7fc97f' : '#888',
  border: `1px solid ${mode === 'beginner' ? '#2a5a3a' : '#333'}`,
  borderRadius: 4, padding: '3px 10px', fontSize: 11, cursor: 'pointer',
})

const actionStyle: React.CSSProperties = {
  background: 'transparent',
  color: '#aaa',
  border: '1px solid #333',
  borderRadius: 4,
  padding: '3px 10px',
  fontSize: 11,
  cursor: 'pointer',
}

const newProjectStyle: React.CSSProperties = {
  background: 'transparent',
  color: '#4a90d9',
  border: '1px solid #4a90d940',
  borderRadius: 4,
  padding: '3px 10px',
  fontSize: 11,
  cursor: 'pointer',
}
