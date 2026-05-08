// project.json — single source of truth.
// IR (resolved buses, etc.) is derived from this in ir.ts.

export type Target = 'esp32' | 'esp32s2' | 'esp32s3' | 'esp32c3' | 'esp32c6' | 'esp32h2'

export type PinType =
  | 'power_in' | 'power_out' | 'ground'
  | 'digital_io' | 'digital_in' | 'digital_out'
  | 'analog_in' | 'analog_out'
  | 'i2c_sda' | 'i2c_scl'
  | 'spi_mosi' | 'spi_miso' | 'spi_sck' | 'spi_cs'
  | 'uart_tx' | 'uart_rx'
  | 'i2s_bclk' | 'i2s_lrclk' | 'i2s_din' | 'i2s_dout'
  | 'pwm' | 'nc'

export interface ComponentInstance {
  instance: string             // unique id within project, e.g. "temp1"
  componentId: string          // catalog id, e.g. "dht22"
  position?: [number, number, number]
  rotation?: [number, number, number]
  pinAssignments: Record<string, string>  // local pin id -> board GPIO label, e.g. { data: "GPIO4" }
  config?: Record<string, unknown>
  internalPullups?: Record<string, boolean> // pin id -> enable internal pullup
}

export interface Net {
  id: string
  endpoints: string[]          // ["temp1.data", "board.GPIO4"]
}

export interface AppConfig {
  wifi: { enabled: boolean; ssid?: string }   // password is in secrets store, not here
  mqtt?: { enabled: boolean; host: string; port: number; clientId?: string }
  http?: { client: boolean; server: boolean; serverPort?: number }
  log_level: 'verbose' | 'debug' | 'info' | 'warn' | 'error'
}

export interface Project {
  schemaVersion: 1
  name: string
  target: Target
  board: string                // catalog id, e.g. "esp32-devkitc-v4"
  components: ComponentInstance[]
  nets: Net[]
  app: AppConfig
  drcOverrides?: string[]      // warning ids the user has dismissed
  customCode?: Record<string, string>  // file path → content, set by agent
}

// Authoritative board→target map. Kept here (not imported from catalog) to avoid
// a circular dep: catalog imports schema, not the other way around.
const BOARD_TARGETS: Record<string, Target> = {
  'esp32-devkitc-v4':    'esp32',
  'esp32s3-devkitc-1':   'esp32s3',
  'esp32c3-devkitm-1':   'esp32c3',
  'esp32c6-devkitc-1':   'esp32c6',
  'xiao-esp32s3':        'esp32s3',
}

export const emptyProject = (
  name: string,
  boardId: string = 'esp32-devkitc-v4',
): Project => ({
  schemaVersion: 1,
  name,
  target: BOARD_TARGETS[boardId] ?? 'esp32',
  board: boardId,
  components: [],
  nets: [],
  app: { wifi: { enabled: false }, log_level: 'info' }
})
