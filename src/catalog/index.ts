// In-memory catalog for M2. Will be replaced by disk-backed loader (~/circuitiny/catalog/) in M9.

import type { ComponentDef, BoardDef, PinDef } from '../project/component'
import type { PinType } from '../project/schema'

const ledPins = [
  { id: 'anode',   label: 'A+', type: 'digital_in' as const,
    voltage: { min: 1.8, max: 3.3, nominal: 2.0 },
    position: [-0.0012, -0.005, 0] as [number, number, number], normal: [0, -1, 0] as [number, number, number] },
  { id: 'cathode', label: 'K-', type: 'ground' as const,
    position: [ 0.0012, -0.005, 0] as [number, number, number], normal: [0, -1, 0] as [number, number, number] }
]

const ledRed: ComponentDef = {
  id: 'led-5mm-red',
  name: 'LED 5mm Red',
  version: '0.1.0',
  category: 'actuator',
  model: 'led.glb',
  pins: ledPins,
  power: { current_ma: 10, rail: '3v3' },
  driver: { language: 'c', defaultPinAssignments: { anode: 'GPIO4' }, includes: ['driver/gpio.h'] },
  schematic: { symbol: 'led' },
  sim: { role: 'led', outputPin: 'anode' }
}

const ledGreen: ComponentDef = {
  id: 'led-5mm-green',
  name: 'LED 5mm Green',
  version: '0.1.0',
  category: 'actuator',
  model: 'led.glb',
  pins: ledPins,
  power: { current_ma: 10, rail: '3v3' },
  driver: { language: 'c', defaultPinAssignments: { anode: 'GPIO4' }, includes: ['driver/gpio.h'] },
  schematic: { symbol: 'led' },
  sim: { role: 'led', outputPin: 'anode' }
}

const ledYellow: ComponentDef = {
  id: 'led-5mm-yellow',
  name: 'LED 5mm Yellow',
  version: '0.1.0',
  category: 'actuator',
  model: 'led.glb',
  pins: ledPins,
  power: { current_ma: 10, rail: '3v3' },
  driver: { language: 'c', defaultPinAssignments: { anode: 'GPIO4' }, includes: ['driver/gpio.h'] },
  schematic: { symbol: 'led' },
  sim: { role: 'led', outputPin: 'anode' }
}

// Lay out header pins along the long edges of a PCB centered at origin.
// halfX: half the board length (meters); halfZ: half the board width (meters).
function headerPins(
  side: 'left' | 'right',
  halfX: number,
  halfZ: number,
  labels: { id: string; label: string; type: PinType }[]
): PinDef[] {
  const z = side === 'left' ? -halfZ : halfZ
  const n = labels.length
  const xs = labels.map((_, i) => n < 2 ? 0 : -halfX + i * (2 * halfX / (n - 1)))
  return labels.map((p, i) => ({
    id: p.id, label: p.label, type: p.type,
    position: [xs[i], 0.006, z] as [number, number, number],
    normal: [0, 1, 0]
  }))
}

// Shorthand for the DevKitC / S3-DevKitC shared outline (44×29 mm model space).
const hpDK = (side: 'left' | 'right', labels: { id: string; label: string; type: PinType }[]) =>
  headerPins(side, 0.022, 0.0145, labels)

const devkitc: BoardDef = {
  id: 'esp32-devkitc-v4',
  name: 'ESP32-DevKitC v4',
  version: '0.1.0',
  boardVersion: 'v4',
  category: 'misc',
  model: 'esp32-devkitc.glb',
  target: 'esp32',
  features: ['Wi-Fi', 'BLE 4.2', 'Bluetooth Classic'],
  inputOnlyPins: ['GPIO34', 'GPIO35', 'GPIO36', 'GPIO39'],
  strappingPins: ['GPIO0', 'GPIO2', 'GPIO5', 'GPIO12', 'GPIO15'],
  flashPins: ['GPIO6', 'GPIO7', 'GPIO8', 'GPIO9', 'GPIO10', 'GPIO11'],
  usbPins: [],
  adc1Pins: ['GPIO32', 'GPIO33', 'GPIO34', 'GPIO35', 'GPIO36', 'GPIO39'],
  adc2Pins: ['GPIO0', 'GPIO2', 'GPIO4', 'GPIO12', 'GPIO13', 'GPIO14', 'GPIO15', 'GPIO25', 'GPIO26', 'GPIO27'],
  railBudgetMa: { '3v3': 500 },
  pins: [
    ...hpDK('left', [
      { id: '3v3',    label: '3V3', type: 'power_out' },
      { id: 'gnd_l',  label: 'GND', type: 'ground' },
      { id: 'gpio15', label: '15',  type: 'digital_io' },
      { id: 'gpio2',  label: '2',   type: 'digital_io' },
      { id: 'gpio4',  label: '4',   type: 'digital_io' },
      { id: 'gpio16', label: '16',  type: 'digital_io' },
      { id: 'gpio17', label: '17',  type: 'digital_io' },
      { id: 'gpio5',  label: '5',   type: 'digital_io' },
      { id: 'gpio18', label: '18',  type: 'spi_sck' },
      { id: 'gpio19', label: '19',  type: 'spi_miso' },
      { id: 'gpio21', label: '21',  type: 'i2c_sda' },
      { id: 'gpio22', label: '22',  type: 'i2c_scl' },
      { id: 'gpio23', label: '23',  type: 'spi_mosi' },
    ]),
    ...hpDK('right', [
      { id: 'vin',    label: 'VIN', type: 'power_in' },
      { id: 'gnd_r',  label: 'GND', type: 'ground' },
      { id: 'gpio13', label: '13',  type: 'digital_io' },
      { id: 'gpio12', label: '12',  type: 'digital_io' },
      { id: 'gpio14', label: '14',  type: 'digital_io' },
      { id: 'gpio27', label: '27',  type: 'digital_io' },
      { id: 'gpio26', label: '26',  type: 'digital_io' },
      { id: 'gpio25', label: '25',  type: 'digital_io' },
      { id: 'gpio33', label: '33',  type: 'analog_in' },
      { id: 'gpio32', label: '32',  type: 'analog_in' },
      { id: 'gpio35', label: '35',  type: 'analog_in' },
      { id: 'gpio34', label: '34',  type: 'analog_in' },
      { id: 'gpio39', label: '39',  type: 'analog_in' },
    ])
  ]
}

// ESP32-S3-DevKitC-1 N8R8 — 38 pins, same PCB outline as DevKitC (55×28 mm).
const s3devkitc: BoardDef = {
  id: 'esp32s3-devkitc-1',
  name: 'ESP32-S3-DevKitC-1 N8R8',
  version: '0.1.0',
  boardVersion: '1.0',
  category: 'misc',
  model: 'esp32s3-devkitc.glb',
  target: 'esp32s3',
  features: ['Wi-Fi 6', 'BLE 5.0', 'USB CDC/JTAG', 'AI acceleration', '8 MB PSRAM'],
  inputOnlyPins: [],
  strappingPins: ['GPIO0', 'GPIO3', 'GPIO45', 'GPIO46'],
  flashPins: ['GPIO27', 'GPIO28', 'GPIO29', 'GPIO30', 'GPIO31', 'GPIO32'],
  usbPins: ['GPIO19', 'GPIO20'],
  adc1Pins: ['GPIO1','GPIO2','GPIO3','GPIO4','GPIO5','GPIO6','GPIO7','GPIO8','GPIO9','GPIO10'],
  adc2Pins: ['GPIO11','GPIO12','GPIO13','GPIO14','GPIO15','GPIO16','GPIO17','GPIO18','GPIO19','GPIO20'],
  railBudgetMa: { '3v3': 600 },
  pins: [
    ...hpDK('left', [
      { id: '3v3_a',  label: '3V3', type: 'power_out' },
      { id: 'gnd_l',  label: 'GND', type: 'ground' },
      { id: 'gpio1',  label: '1',   type: 'analog_in' },
      { id: 'gpio2',  label: '2',   type: 'analog_in' },
      { id: 'gpio3',  label: '3',   type: 'analog_in' },
      { id: 'gpio4',  label: '4',   type: 'analog_in' },
      { id: 'gpio5',  label: '5',   type: 'analog_in' },
      { id: 'gpio6',  label: '6',   type: 'digital_io' },
      { id: 'gpio7',  label: '7',   type: 'digital_io' },
      { id: 'gpio8',  label: '8',   type: 'digital_io' },
      { id: 'gpio9',  label: '9',   type: 'digital_io' },
      { id: 'gpio10', label: '10',  type: 'digital_io' },
      { id: 'gpio11', label: '11',  type: 'digital_io' },
      { id: 'gpio12', label: '12',  type: 'digital_io' },
      { id: 'gpio13', label: '13',  type: 'digital_io' },
      { id: 'gpio14', label: '14',  type: 'digital_io' },
      { id: 'gpio21', label: '21',  type: 'i2c_sda' },
      { id: 'gpio47', label: '47',  type: 'digital_io' },
      { id: 'gpio48', label: '48',  type: 'digital_io' },
    ]),
    ...hpDK('right', [
      { id: 'gnd_r',  label: 'GND', type: 'ground' },
      { id: '5v0',    label: '5V',  type: 'power_in' },
      { id: 'gpio38', label: '38',  type: 'digital_io' },
      { id: 'gpio39', label: '39',  type: 'digital_io' },
      { id: 'gpio40', label: '40',  type: 'digital_io' },
      { id: 'gpio41', label: '41',  type: 'digital_io' },
      { id: 'gpio42', label: '42',  type: 'digital_io' },
      { id: 'gpio45', label: '45',  type: 'digital_io' },
      { id: 'gpio46', label: '46',  type: 'digital_io' },
      { id: 'gpio0',  label: '0',   type: 'digital_io' },
      { id: 'gpio15', label: '15',  type: 'digital_io' },
      { id: 'gpio16', label: '16',  type: 'digital_io' },
      { id: 'gpio17', label: '17',  type: 'digital_io' },
      { id: 'gpio18', label: '18',  type: 'digital_io' },
      { id: 'gpio19', label: '19',  type: 'uart_rx' },
      { id: 'gpio20', label: '20',  type: 'uart_tx' },
      { id: 'gpio43', label: '43',  type: 'uart_tx' },
      { id: 'gpio44', label: '44',  type: 'uart_rx' },
      { id: 'gpio3v3_b', label: '3V3', type: 'power_out' },
    ])
  ]
}

// ESP32-C3-DevKitM-1 — 22 pins, 43×26 mm.
const c3devkitm: BoardDef = {
  id: 'esp32c3-devkitm-1',
  name: 'ESP32-C3-DevKitM-1',
  version: '0.1.0',
  boardVersion: '1.0',
  category: 'misc',
  model: 'esp32c3-devkitm.glb',
  target: 'esp32c3',
  features: ['Wi-Fi', 'BLE 5.0', 'RISC-V', 'USB CDC/JTAG'],
  inputOnlyPins: [],
  strappingPins: ['GPIO2', 'GPIO8', 'GPIO9'],
  flashPins: ['GPIO12', 'GPIO13', 'GPIO14', 'GPIO15', 'GPIO16', 'GPIO17'],
  usbPins: ['GPIO18', 'GPIO19'],
  adc1Pins: ['GPIO0', 'GPIO1', 'GPIO2', 'GPIO3', 'GPIO4'],
  adc2Pins: [],
  railBudgetMa: { '3v3': 500 },
  pins: [
    ...headerPins('left', 0.0215, 0.013, [
      { id: 'gnd_l',  label: 'GND', type: 'ground' },
      { id: '3v3',    label: '3V3', type: 'power_out' },
      { id: 'gpio2',  label: '2',   type: 'digital_io' },
      { id: 'gpio3',  label: '3',   type: 'digital_io' },
      { id: 'gpio8',  label: '8',   type: 'digital_io' },
      { id: 'gpio9',  label: '9',   type: 'digital_io' },
      { id: 'gpio10', label: '10',  type: 'digital_io' },
      { id: 'gpio6',  label: '6',   type: 'spi_sck' },
      { id: 'gpio7',  label: '7',   type: 'spi_mosi' },
      { id: 'gpio4',  label: '4',   type: 'i2c_sda' },
      { id: 'gpio5',  label: '5',   type: 'i2c_scl' },
    ]),
    ...headerPins('right', 0.0215, 0.013, [
      { id: 'gnd_r',  label: 'GND', type: 'ground' },
      { id: '5v0',    label: '5V',  type: 'power_in' },
      { id: 'gpio20', label: '20',  type: 'uart_rx' },
      { id: 'gpio21', label: '21',  type: 'uart_tx' },
      { id: 'gpio0',  label: '0',   type: 'analog_in' },
      { id: 'gpio1',  label: '1',   type: 'analog_in' },
      { id: 'gpio11', label: '11',  type: 'digital_io' },
      { id: 'gpio18', label: '18',  type: 'digital_io' },
      { id: 'gpio19', label: '19',  type: 'digital_io' },
      { id: 'gpio10b', label: '10', type: 'spi_miso' },
      { id: 'rst',    label: 'RST', type: 'nc' },
    ])
  ]
}

// ESP32-C6-DevKitC-1 — 30 pins, 55×26 mm.
const c6devkitc: BoardDef = {
  id: 'esp32c6-devkitc-1',
  name: 'ESP32-C6-DevKitC-1',
  version: '0.1.0',
  boardVersion: '1.0',
  category: 'misc',
  model: 'esp32c6-devkitc.glb',
  target: 'esp32c6',
  features: ['Wi-Fi 6', 'BLE 5.0', 'Thread/Zigbee', 'RISC-V', 'USB CDC/JTAG'],
  inputOnlyPins: [],
  strappingPins: ['GPIO8', 'GPIO9', 'GPIO15'],
  flashPins: ['GPIO24', 'GPIO25', 'GPIO26', 'GPIO27', 'GPIO28', 'GPIO29'],
  usbPins: ['GPIO12', 'GPIO13'],
  adc1Pins: ['GPIO0', 'GPIO1', 'GPIO2', 'GPIO3', 'GPIO4', 'GPIO5', 'GPIO6'],
  adc2Pins: [],
  railBudgetMa: { '3v3': 500 },
  pins: [
    ...headerPins('left', 0.022, 0.013, [
      { id: '3v3',    label: '3V3', type: 'power_out' },
      { id: 'rst',    label: 'RST', type: 'nc' },
      { id: 'gpio4',  label: '4',   type: 'analog_in' },
      { id: 'gpio5',  label: '5',   type: 'analog_in' },
      { id: 'gpio6',  label: '6',   type: 'analog_in' },
      { id: 'gpio7',  label: '7',   type: 'digital_io' },
      { id: 'gpio8',  label: '8',   type: 'digital_io' },
      { id: 'gpio9',  label: '9',   type: 'digital_io' },
      { id: 'gpio10', label: '10',  type: 'digital_io' },
      { id: 'gpio11', label: '11',  type: 'digital_io' },
      { id: 'gpio12', label: '12',  type: 'digital_io' },
      { id: 'gpio13', label: '13',  type: 'digital_io' },
      { id: 'gpio14', label: '14',  type: 'digital_io' },
      { id: 'gnd_l',  label: 'GND', type: 'ground' },
      { id: '3v3_b',  label: '3V3', type: 'power_out' },
    ]),
    ...headerPins('right', 0.022, 0.013, [
      { id: 'gnd_r',  label: 'GND', type: 'ground' },
      { id: '5v0',    label: '5V',  type: 'power_in' },
      { id: 'gpio23', label: '23',  type: 'digital_io' },
      { id: 'gpio22', label: '22',  type: 'digital_io' },
      { id: 'gpio21', label: '21',  type: 'uart_rx' },
      { id: 'gpio20', label: '20',  type: 'uart_tx' },
      { id: 'gpio19', label: '19',  type: 'digital_io' },
      { id: 'gpio18', label: '18',  type: 'digital_io' },
      { id: 'gpio17', label: '17',  type: 'digital_io' },
      { id: 'gpio16', label: '16',  type: 'spi_sck' },
      { id: 'gpio15', label: '15',  type: 'digital_io' },
      { id: 'gpio0',  label: '0',   type: 'analog_in' },
      { id: 'gpio1',  label: '1',   type: 'analog_in' },
      { id: 'gpio2',  label: '2',   type: 'analog_in' },
      { id: 'gpio3',  label: '3',   type: 'analog_in' },
    ])
  ]
}

// Seeed XIAO ESP32S3 — 17 exposed pads: 7+7 castellated edge pins + 3 bottom pads.
// Board: 21×17.5 mm, USB-C on the short top edge.
// Edge rows run along the long axis (x). USB end = +x.
// Bottom pads (GPIO3, BAT+, BAT−) sit on the board underside; normal points down (y = -1).
const xiaoS3: BoardDef = {
  id: 'xiao-esp32s3',
  name: 'XIAO ESP32S3',
  version: '0.1.0',
  boardVersion: '1.0',
  category: 'misc',
  model: 'xiao-esp32s3.glb',
  target: 'esp32s3',
  features: ['Wi-Fi 6', 'BLE 5.0', 'USB CDC', 'AI acceleration', 'Compact'],
  inputOnlyPins: [],
  strappingPins: ['GPIO0', 'GPIO3', 'GPIO45', 'GPIO46'],
  flashPins: ['GPIO27', 'GPIO28', 'GPIO29', 'GPIO30', 'GPIO31', 'GPIO32'],
  usbPins: [],
  adc1Pins: ['GPIO1', 'GPIO2', 'GPIO3', 'GPIO4', 'GPIO5', 'GPIO6', 'GPIO7', 'GPIO8', 'GPIO9'],
  adc2Pins: [],
  railBudgetMa: { '3v3': 700 },
  pins: [
    // Left edge — USB end first (index 0 = closest to USB = x = -halfX in model space)
    ...headerPins('left', 0.0105, 0.00875, [
      { id: 'gpio1',  label: '1',  type: 'analog_in' },   // D0 / A0 / TOUCH1
      { id: 'gpio2',  label: '2',  type: 'analog_in' },   // D1 / A1 / TOUCH2
      { id: 'gpio3',  label: '3',  type: 'analog_in' },   // D2 / A2 / TOUCH3
      { id: 'gpio4',  label: '4',  type: 'analog_in' },   // D3 / A3 / TOUCH4
      { id: 'gpio5',  label: '5',  type: 'i2c_sda'   },   // D4 / A4 / SDA / TOUCH5
      { id: 'gpio6',  label: '6',  type: 'i2c_scl'   },   // D5 / A5 / SCL / TOUCH6
      { id: 'gpio43', label: '43', type: 'uart_tx'   },   // D6 / TX
    ]),
    // Right edge — USB end first
    ...headerPins('right', 0.0105, 0.00875, [
      { id: '5v0',    label: '5V',  type: 'power_in'  },  // 5V
      { id: 'gnd',    label: 'GND', type: 'ground'    },  // GND
      { id: '3v3',    label: '3V3', type: 'power_out' },  // 3V3
      { id: 'gpio9',  label: '9',   type: 'spi_mosi'  },  // D10 / A10 / MOSI / TOUCH9
      { id: 'gpio8',  label: '8',   type: 'spi_miso'  },  // D9  / A9  / MISO / TOUCH8
      { id: 'gpio7',  label: '7',   type: 'spi_sck'   },  // D8  / A8  / SCK  / TOUCH7
      { id: 'gpio44', label: '44',  type: 'uart_rx'   },  // D7  / RX
    ]),
  ]
}


const resistor220: ComponentDef = {
  id: 'resistor-220r',
  name: 'Resistor 220Ω',
  version: '0.1.0',
  category: 'misc',
  model: 'resistor.glb',
  pins: [
    { id: 'in',  label: 'in',  type: 'digital_in',  position: [-0.003, -0.003, 0], normal: [0, -1, 0] },
    { id: 'out', label: 'out', type: 'digital_out', position: [ 0.003, -0.003, 0], normal: [0, -1, 0] }
  ],
  schematic: { symbol: 'resistor' },
}

const button6mm: ComponentDef = {
  id: 'button-6mm',
  name: 'Push Button 6mm',
  version: '0.1.0',
  category: 'input',
  model: 'button.glb',
  pins: [
    { id: 'a', label: 'A', type: 'digital_io', position: [-0.0032, -0.003, 0], normal: [0, -1, 0] },
    { id: 'b', label: 'B', type: 'digital_io', position: [ 0.0032, -0.003, 0], normal: [0, -1, 0] }
  ],
  schematic: { symbol: 'button' },
  sim: { role: 'button', inputPin: 'a' }
}

// Shorthand for Freenove ESP32-WROVER-DEV (58×28 mm, 19 pins/side).
const hpWR = (side: 'left' | 'right', labels: { id: string; label: string; type: PinType }[]) =>
  headerPins(side, 0.029, 0.014, labels)

// Freenove ESP32-WROVER-DEV — 38-pin board with ESP32-WROVER-E module.
// GPIO16/17 reserved for PSRAM; GPIO6-11 tied to internal flash.
const freenoveWrover: BoardDef = {
  id: 'freenove-esp32-wrover-dev',
  name: 'Freenove ESP32-WROVER-DEV',
  version: '0.1.0',
  boardVersion: '1.0',
  category: 'misc',
  model: 'esp32-devkitc.glb',
  target: 'esp32',
  features: ['Wi-Fi', 'BLE 4.2', 'Bluetooth Classic', '4 MB PSRAM', 'Camera connector'],
  inputOnlyPins: ['GPIO34', 'GPIO35', 'GPIO36', 'GPIO39'],
  strappingPins: ['GPIO0', 'GPIO2', 'GPIO5', 'GPIO12', 'GPIO15'],
  flashPins: ['GPIO6', 'GPIO7', 'GPIO8', 'GPIO9', 'GPIO10', 'GPIO11'],
  usbPins: [],
  adc1Pins: ['GPIO32', 'GPIO33', 'GPIO34', 'GPIO35', 'GPIO36', 'GPIO39'],
  adc2Pins: ['GPIO0', 'GPIO2', 'GPIO4', 'GPIO12', 'GPIO13', 'GPIO14', 'GPIO15', 'GPIO25', 'GPIO26', 'GPIO27'],
  railBudgetMa: { '3v3': 500 },
  pins: [
    ...hpWR('left', [
      { id: 'gnd_l0',  label: 'GND', type: 'ground'     },
      { id: '3v3',     label: '3V3', type: 'power_out'  },
      { id: 'en',      label: 'EN',  type: 'nc'         },
      { id: 'gpio36',  label: '36',  type: 'analog_in'  },  // VP, input-only
      { id: 'gpio39',  label: '39',  type: 'analog_in'  },  // VN, input-only
      { id: 'gpio34',  label: '34',  type: 'analog_in'  },  // input-only
      { id: 'gpio35',  label: '35',  type: 'analog_in'  },  // input-only
      { id: 'gpio32',  label: '32',  type: 'digital_io' },
      { id: 'gpio33',  label: '33',  type: 'digital_io' },
      { id: 'gpio25',  label: '25',  type: 'digital_io' },  // DAC1
      { id: 'gpio26',  label: '26',  type: 'digital_io' },  // DAC2
      { id: 'gpio27',  label: '27',  type: 'digital_io' },
      { id: 'gpio14',  label: '14',  type: 'digital_io' },
      { id: 'gpio12',  label: '12',  type: 'digital_io' },
      { id: 'gpio13',  label: '13',  type: 'digital_io' },
      { id: 'gpio15',  label: '15',  type: 'digital_io' },
      { id: 'gpio2_l', label: '2',   type: 'digital_io' },
      { id: 'gpio0_l', label: '0',   type: 'digital_io' },
      { id: 'gpio4_l', label: '4',   type: 'digital_io' },
    ]),
    ...hpWR('right', [
      { id: 'gnd_r0',  label: 'GND', type: 'ground'     },
      { id: 'vin',     label: 'VIN', type: 'power_in'   },
      { id: 'gpio23',  label: '23',  type: 'spi_mosi'   },
      { id: 'gpio22',  label: '22',  type: 'i2c_scl'    },
      { id: 'gpio1',   label: '1',   type: 'uart_tx'    },  // TX0
      { id: 'gpio3',   label: '3',   type: 'uart_rx'    },  // RX0
      { id: 'gpio21',  label: '21',  type: 'i2c_sda'    },
      { id: 'gnd_r1',  label: 'GND', type: 'ground'     },
      { id: 'gpio19',  label: '19',  type: 'spi_miso'   },
      { id: 'gpio18',  label: '18',  type: 'spi_sck'    },
      { id: 'gpio5',   label: '5',   type: 'spi_cs'     },
      { id: 'gpio17',  label: '17',  type: 'nc'         },  // PSRAM-reserved
      { id: 'gpio16',  label: '16',  type: 'nc'         },  // PSRAM-reserved
      { id: 'gpio4_r', label: '4',   type: 'digital_io' },
      { id: 'gpio0_r', label: '0',   type: 'digital_io' },
      { id: 'gpio2_r', label: '2',   type: 'digital_io' },
      { id: 'gpio15_r',label: '15',  type: 'digital_io' },
      { id: 'gpio13_r',label: '13',  type: 'digital_io' },
      { id: 'gpio12_r',label: '12',  type: 'digital_io' },
    ]),
  ]
}

const components: Record<string, ComponentDef> = {
  [ledRed.id]:        ledRed,
  [ledGreen.id]:      ledGreen,
  [ledYellow.id]:     ledYellow,
  [resistor220.id]:   resistor220,
  [button6mm.id]:     button6mm,
}
const boards: Record<string, BoardDef> = {
  [devkitc.id]:         devkitc,
  [s3devkitc.id]:       s3devkitc,
  [c3devkitm.id]:       c3devkitm,
  [c6devkitc.id]:       c6devkitc,
  [xiaoS3.id]:          xiaoS3,
  [freenoveWrover.id]:  freenoveWrover,
}
const glbBlobs: Record<string, string> = {}   // componentId -> blob URL

export const catalog = {
  getComponent: (id: string): ComponentDef | undefined => components[id],
  getBoard: (id: string): BoardDef | undefined => boards[id],
  getGlbUrl: (id: string): string | undefined => glbBlobs[id],
  listComponents: (): ComponentDef[] => Object.values(components),
  listBoards: (): BoardDef[] => Object.values(boards),
  registerComponent: (def: ComponentDef, glbData?: Uint8Array | null) => {
    components[def.id] = def
    if (glbData) {
      const buf = glbData.slice().buffer as ArrayBuffer
      glbBlobs[def.id] = URL.createObjectURL(new Blob([buf], { type: 'model/gltf-binary' }))
    }
  }
}

const PIN_COLORS: Partial<Record<PinType, string>> = {
  power_in:    '#ff3b30', power_out:   '#ff3b30',
  ground:      '#444',
  digital_io:  '#5ac8fa', digital_in:  '#5ac8fa', digital_out: '#5ac8fa',
  analog_in:   '#34c759', analog_out:  '#34c759',
  i2c_sda:     '#ffcc00', i2c_scl:     '#ffcc00',
  spi_mosi:    '#af52de', spi_miso:    '#af52de', spi_sck: '#af52de', spi_cs: '#af52de',
  uart_tx:     '#ff9500', uart_rx:     '#ff9500',
  i2s_bclk:    '#ff2d92', i2s_lrclk:  '#ff2d92', i2s_din: '#ff2d92', i2s_dout: '#ff2d92',
  pwm:         '#00c7be',
  nc:          '#222',
}

export const pinColor = (type: PinType): string => PIN_COLORS[type] ?? '#888'
