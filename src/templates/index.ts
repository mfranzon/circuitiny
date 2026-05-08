import type { Project } from '../project/schema'

export type Difficulty = 'beginner' | 'intermediate' | 'advanced'

export interface TemplateEntry {
  id: string
  title: string
  description: string
  difficulty: Difficulty
  tags: string[]
  project: Project
}

export const TEMPLATES: TemplateEntry[] = [
  {
    id: 'blink-led',
    title: 'Blink LED',
    description: 'Toggle an LED on and off every second using a periodic timer.',
    difficulty: 'beginner',
    tags: ['LED', 'GPIO', 'Timer'],
    project: {
      schemaVersion: 1,
      name: 'Blink LED',
      target: 'esp32',
      board: 'esp32-devkitc-v4',
      components: [
        {
          instance: 'r1',
          componentId: 'resistor-220r',
          position: [0.02, 0, 0.01],
          rotation: [0, 0, 0],
          pinAssignments: { in: 'GPIO16' },
        },
        {
          instance: 'led1',
          componentId: 'led-5mm-red',
          position: [0.04, 0, 0.01],
          rotation: [0, 0, 0],
          pinAssignments: { anode: 'GPIO16' },
        },
      ],
      nets: [
        { id: 'n1', endpoints: ['board.gpio16', 'r1.in'] },
        { id: 'n2', endpoints: ['r1.out', 'led1.anode'] },
        { id: 'n3', endpoints: ['led1.cathode', 'board.gnd_l'] },
      ],
      app: { wifi: { enabled: false }, log_level: 'info' },
    },
  },
  {
    id: 'button-led',
    title: 'Button + LED',
    description: 'Press a button to turn an LED on; release to turn it off.',
    difficulty: 'beginner',
    tags: ['LED', 'Button', 'GPIO edge'],
    project: {
      schemaVersion: 1,
      name: 'Button + LED',
      target: 'esp32',
      board: 'esp32-devkitc-v4',
      components: [
        {
          instance: 'btn1',
          componentId: 'button-6mm',
          position: [0.02, 0, 0.02],
          rotation: [0, 0, 0],
          pinAssignments: { a: 'GPIO4' },
          internalPullups: { a: true },
        },
        {
          instance: 'r1',
          componentId: 'resistor-220r',
          position: [0.02, 0, 0.01],
          rotation: [0, 0, 0],
          pinAssignments: { in: 'GPIO16' },
        },
        {
          instance: 'led1',
          componentId: 'led-5mm-red',
          position: [0.04, 0, 0.01],
          rotation: [0, 0, 0],
          pinAssignments: { anode: 'GPIO16' },
        },
      ],
      nets: [
        { id: 'n1', endpoints: ['board.gpio4', 'btn1.a'] },
        { id: 'n2', endpoints: ['btn1.b', 'board.gnd_r'] },
        { id: 'n3', endpoints: ['board.gpio16', 'r1.in'] },
        { id: 'n4', endpoints: ['r1.out', 'led1.anode'] },
        { id: 'n5', endpoints: ['led1.cathode', 'board.gnd_l'] },
      ],
      app: { wifi: { enabled: false }, log_level: 'info' },
    },
  },
  {
    id: 'sos-blinker',
    title: 'SOS Blinker',
    description: 'Flash the classic SOS Morse code pattern on a LED at boot.',
    difficulty: 'beginner',
    tags: ['LED', 'Sequence', 'Morse'],
    project: {
      schemaVersion: 1,
      name: 'SOS Blinker',
      target: 'esp32',
      board: 'esp32-devkitc-v4',
      components: [
        {
          instance: 'r1',
          componentId: 'resistor-220r',
          position: [0.02, 0, 0.01],
          rotation: [0, 0, 0],
          pinAssignments: { in: 'GPIO16' },
        },
        {
          instance: 'led1',
          componentId: 'led-5mm-red',
          position: [0.04, 0, 0.01],
          rotation: [0, 0, 0],
          pinAssignments: { anode: 'GPIO16' },
        },
      ],
      nets: [
        { id: 'n1', endpoints: ['board.gpio16', 'r1.in'] },
        { id: 'n2', endpoints: ['r1.out', 'led1.anode'] },
        { id: 'n3', endpoints: ['led1.cathode', 'board.gnd_l'] },
      ],
      app: { wifi: { enabled: false }, log_level: 'info' },
    },
  },
]

export const DIFFICULTY_COLOR: Record<Difficulty, string> = {
  beginner:     '#34c759',
  intermediate: '#ff9500',
  advanced:     '#ff3b30',
}
