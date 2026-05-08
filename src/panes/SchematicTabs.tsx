import Schematic from './Schematic'

export default function SchematicTabs() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{ flex: 1, minHeight: 0, overflow: 'hidden' }}>
        <Schematic />
      </div>
    </div>
  )
}
