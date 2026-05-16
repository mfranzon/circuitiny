import { useState } from 'react'
import type { TemplateEntry, MediaItem } from '../templates'

function MediaView({ item }: { item: MediaItem }) {
  if (item.kind === 'youtube') {
    return (
      <div style={{ aspectRatio: '16 / 9', background: '#000', borderRadius: 6, overflow: 'hidden' }}>
        <iframe
          src={`https://www.youtube.com/embed/${item.videoId}`}
          style={{ width: '100%', height: '100%', border: 0 }}
          allow="accelerometer; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
        />
      </div>
    )
  }
  if (item.kind === 'video') {
    return <video src={item.url} controls style={{ width: '100%', borderRadius: 6, background: '#000' }} />
  }
  return <img src={item.url} alt={item.caption ?? ''} style={{ width: '100%', borderRadius: 6, display: 'block' }} />
}

export default function LearnPanel({
  tpl,
  onClose,
  onLoad,
}: {
  tpl: TemplateEntry
  onClose: () => void
  onLoad: () => void
}) {
  const steps = tpl.walkthrough ?? []
  const [i, setI] = useState(0)
  const step = steps[i]
  const hasSteps = steps.length > 0
  const media = tpl.media ?? []

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 'min(720px, 92vw)', maxHeight: '88vh', overflow: 'auto',
          background: '#1a1a1a', border: '1px solid #333', borderRadius: 10,
          color: '#ddd', display: 'flex', flexDirection: 'column',
        }}
      >
        <div style={{ padding: '14px 18px', borderBottom: '1px solid #2a2a2a', display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ fontWeight: 600, fontSize: 14 }}>{tpl.title}</div>
          <div style={{ fontSize: 11, color: '#888' }}>{tpl.description}</div>
          <button
            onClick={onClose}
            style={{ marginLeft: 'auto', background: 'transparent', border: 0, color: '#888', cursor: 'pointer', fontSize: 18 }}
          >×</button>
        </div>

        <div style={{ padding: 18, display: 'flex', flexDirection: 'column', gap: 16 }}>
          {hasSteps ? (
            <div>
              <div style={{ display: 'flex', gap: 4, marginBottom: 10 }}>
                {steps.map((_, n) => (
                  <div
                    key={n}
                    style={{
                      flex: 1, height: 3, borderRadius: 2,
                      background: n <= i ? '#4a90d9' : '#2a2a2a',
                    }}
                  />
                ))}
              </div>
              <div style={{ fontSize: 11, color: '#888', marginBottom: 4 }}>Step {i + 1} of {steps.length}</div>
              <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 8 }}>{step.title}</div>
              <div style={{ fontSize: 13, lineHeight: 1.55, color: '#cfcfcf' }}>{step.body}</div>
              {step.targets && step.targets.length > 0 && (
                <div style={{ marginTop: 8, fontSize: 10, color: '#666', fontFamily: 'monospace' }}>
                  highlights: {step.targets.join(', ')}
                </div>
              )}
            </div>
          ) : (
            <div style={{ fontSize: 12, color: '#888' }}>No walkthrough yet for this template.</div>
          )}

          {media.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {media.map((m, n) => (
                <div key={n}>
                  <MediaView item={m} />
                  {m.caption && <div style={{ fontSize: 11, color: '#888', marginTop: 4 }}>{m.caption}</div>}
                </div>
              ))}
            </div>
          )}
        </div>

        <div style={{ padding: 14, borderTop: '1px solid #2a2a2a', display: 'flex', gap: 8 }}>
          {hasSteps && (
            <>
              <button
                onClick={() => setI((v) => Math.max(0, v - 1))}
                disabled={i === 0}
                style={btn(i === 0)}
              >Back</button>
              <button
                onClick={() => setI((v) => Math.min(steps.length - 1, v + 1))}
                disabled={i === steps.length - 1}
                style={btn(i === steps.length - 1)}
              >Next</button>
            </>
          )}
          <button onClick={onLoad} style={{ ...btn(false), marginLeft: 'auto', background: '#4a90d9', borderColor: '#4a90d9', color: '#fff' }}>
            Open project
          </button>
        </div>
      </div>
    </div>
  )
}

function btn(disabled: boolean): React.CSSProperties {
  return {
    background: '#2a2a2a',
    border: '1px solid #3a3a3a',
    borderRadius: 5,
    color: disabled ? '#555' : '#ddd',
    fontSize: 12,
    padding: '6px 14px',
    cursor: disabled ? 'default' : 'pointer',
  }
}
