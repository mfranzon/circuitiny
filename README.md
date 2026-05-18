# Circuitiny

A local-first, AI-assisted circuit design tool for your projects. Wire components in a 3D view, describe what you want to build, and the AI agent writes the firmware and simulates it , all before you touch a physical chip.

![Circuitiny screenshot](docs/screenshot.png)

---

## Table of contents

1. [Features](#features)
2. [Prerequisites](#prerequisites)
3. [Installation](#installation)
4. [UI overview](#ui-overview)
5. [Creating a project](#creating-a-project)
6. [Extending the palette , adding components](#extending-the-palette--adding-components)
   - [component.json reference](#componentjson-reference)
   - [Pin definitions](#pin-definitions)
   - [Sim metadata](#sim-metadata)
   - [3D model (.glb)](#3d-model-glb)
   - [Schematic symbol](#schematic-symbol)
7. [Adding boards](#adding-boards)
8. [Using the agent](#using-the-agent)
   - [Agent tools reference](#agent-tools-reference)
   - [Prompting tips](#prompting-tips)
9. [Firmware](#firmware)
10. [Firmware simulation](#firmware-simulation)
11. [Code generation](#code-generation)
12. [Build and flash](#build-and-flash)
13. [Project file format](#project-file-format)
14. [Architecture overview](#architecture-overview)
15. [Development](#development)

---

## Features

- **3D circuit view** , drag components onto the board, click pins to wire them, inspect nets in real time
- **AI agent** , describe a circuit in plain English; the agent plans the BOM, adds components, wires them, runs DRC, and writes firmware
- **Firmware simulation** , the generated (or agent-written) firmware is compiled to a native binary and run on your machine; GPIO outputs animate in the 3D view and logs stream live, with no hardware required
- **Code generation** , a complete ESP-IDF 5 C project (app_main.c, CMakeLists.txt, sdkconfig.defaults) is generated live from the circuit, or replaced wholesale by agent-written firmware
- **Build and flash** , one-click `idf.py build`, `idf.py flash`, and serial monitor, all streamed inside the app
- **Extensible catalog** , drop a `component.json` + `.glb` folder into `~/.circuitiny/catalog/` to add any component to the palette
- **Multi-board** , ESP32-DevKitC v4, ESP32-S3-DevKitC-1, ESP32-C3-DevKitM-1, ESP32-C6-DevKitC-1, XIAO ESP32-S3

---

## Prerequisites

| Requirement | Version | Notes |
|---|---|---|
| macOS | 13+ | Windows/Linux not tested yet |
| Node.js | 20+ | |
| pnpm | 9+ | `npm i -g pnpm` |
| ESP-IDF | 5.1+ | Only needed for Build/Flash; not required for design or simulation |

### ESP-IDF setup (optional)

Install via the [official guide](https://docs.espressif.com/projects/esp-idf/en/stable/esp32/get-started/). After installation, set the path:

```bash
export CIRCUITINY_IDF_PATH=/path/to/esp-idf   # default: /Users/$USER/esp/esp-idf
```

Add to your shell profile to make it permanent. If IDF is not installed, all design, simulation, and code generation features still work , only Build and Flash are disabled.

---

## Installation

```bash
git clone https://github.com/mfranzon/circuitiny
cd circuitiny
pnpm install
pnpm dev          # opens the Electron app in dev mode with hot reload
```

To build a distributable:

```bash
pnpm build
```

---

## UI overview

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  Circuitiny     [Project]  [Catalog Editor]              myproject ●  [Open] [Save]  [+ New] │
├──────────┬──────────────────────────────────┬────────────────────┬──────────┤
│          │                                  │                    │          │
│ Palette  │         3D Viewer                │ Schematic          │  Agent   │
│          │                                  │                    │          │
│ (catalog │   ● sim badge when running       │                    │  chat    │
│  list)   │                                  │                    │  window  │
│          ├──────────────────────────────────┤                    │          │
│          │   Code / Build / Sim             │                    │          │
│          │   [Code] [Build/Flash] [Sim ▶]   │                    │          │
└──────────┴──────────────────────────────────┴────────────────────┴──────────┘
```

| Pane | Purpose |
|---|---|
| **Palette** | Browse catalog components; click to add to the project |
| **3D Viewer** | Place and wire components; drag to reposition; click pins to connect; click input components during simulation |
| **Schematic** | 2D schematic view of the circuit |
| **Code** | Live-generated ESP-IDF C code; agent-written files shown with an `agent` badge |
| **Build / Flash** | Run `idf.py build`, flash to device, open serial monitor |
| **Sim** | Compile the firmware to a native binary, then Play/Stop it; real-time GPIO log |
| **Agent** | Chat with the AI agent; supports Anthropic Claude, Claude Code, OpenAI, OpenRouter, and local Ollama models |

---

## Creating a project

1. Click **+ New Project** in the top-right
2. Choose a board from the picker
3. Name your project and click Create

Projects auto-save state in memory. Use **Save** (or `Cmd+S`) to persist to a `.circuitiny.json` file. An amber `●` dot after the project name means there are unsaved changes.

To reopen a project: click **Open** and select the `.circuitiny.json` file.

---

## Creating 3D models with Claude Code

If you use [Claude Code](https://claude.ai/code), you can generate custom 3D component models with the [/render skill](https://github.com/mfranzon/render) and import them directly into Circuitiny without leaving the terminal.

**Step 1 — Generate a 3D model**

```
/render a 10kΩ potentiometer with 3 pins
```

The `/render` skill generates a `.glb` model from a text description using build123d and opens it in a browser viewer. You can iterate on the shape until it looks right.

**Step 2 — Import into Circuitiny**

```
/esp-ai-import
```

The `/esp-ai-import` skill picks up the most recently rendered `.glb`, asks you for the component name, category, and pin layout, then installs it into `~/.circuitiny/catalog/`. Restart Circuitiny and the component appears in the palette.

You can also fine-tune pin positions after import using the built-in **Catalog Editor** tab.

---

## Extending the palette , adding components

The component catalog lives at `~/.circuitiny/catalog/`. Each component is a folder containing:

```
~/.circuitiny/catalog/
└── my-component/
    ├── component.json    ← required
    └── model.glb         ← optional but recommended
```

The app loads all catalog entries at startup. Restart the app (or hot-reload in dev mode) to pick up new components.

### component.json reference

```jsonc
{
  "id": "my-sensor",              // unique id, must match the folder name
  "name": "My Sensor",            // human-readable label shown in the palette
  "version": "0.1.0",
  "category": "sensor",           // sensor | actuator | display | input | power | misc
  "model": "model.glb",           // path to the .glb file, relative to this folder
  "scale": 1.0,                   // uniform scale applied to the model (meters)

  "pins": [ /* see Pin definitions */ ],

  "power": {
    "current_ma": 10,             // peak current draw in milliamps
    "rail": "3v3"                 // "3v3" | "5v" | "vin"
  },

  "driver": {
    "language": "c",
    "defaultPinAssignments": { "data": "GPIO4" },
    "includes": ["driver/gpio.h"]
  },

  "schematic": { "symbol": "sensor" },  // see Schematic symbol

  "sim": { /* see Sim metadata */ }
}
```

### Pin definitions

Each entry in the `pins` array describes one physical pin:

```jsonc
{
  "id": "data",          // internal id , used in net references like "sensor1.data"
  "label": "DATA",       // label shown in the 3D view and schematic
  "type": "digital_io",  // electrical type , see table below
  "position": [0.0, -0.009, 0.0],  // XYZ position in meters, in the model's local frame
  "normal":   [0.0, -1.0,  0.0],   // wire exit direction (unit vector)

  // optional
  "protocol": "1wire",             // "1wire" | "i2c" | "spi" | "uart"
  "pull": "up_required",           // "none" | "up_required" | "down_required"
  "voltage": { "min": 3.3, "max": 3.3, "nominal": 3.3 }
}
```

**Pin types:**

| Type | Meaning |
|---|---|
| `digital_io` | bidirectional GPIO |
| `digital_in` | input only (e.g. LED anode) |
| `digital_out` | output only (e.g. sensor OUT) |
| `analog_in` | ADC input |
| `analog_out` | DAC / analog output |
| `power_in` | VCC / power supply input |
| `power_out` | power rail output |
| `ground` | GND |
| `i2c_sda` | I2C data |
| `i2c_scl` | I2C clock |
| `spi_mosi` / `spi_miso` / `spi_sck` / `spi_cs` | SPI bus |
| `uart_tx` / `uart_rx` | UART |
| `pwm` | PWM-capable pin |
| `nc` | not connected |

**Finding pin positions for a new model**

Pin positions must match the GLB model's local coordinate space. Use the built-in **Catalog Editor** (`Catalog Editor` tab in the nav bar):

1. Click **Load GLB** and pick your model file
2. Click on the model surface at each pin location , the app records the 3D position and normal
3. Name each pin and set its type
4. Click **Save to catalog** , writes `component.json` + copies the GLB to `~/.circuitiny/catalog/<id>/`

### Sim metadata

The `sim` field tells the simulator how to animate this component during firmware simulation:

```jsonc
"sim": {
  "role": "led",          // see roles table below
  "outputPin": "anode",   // pin id whose GPIO state drives the visual
  "inputPin": "a"         // pin id that fires a gpio_edge when the user clicks in sim mode
}
```

**Sim roles:**

| Role | `outputPin` effect | `inputPin` effect |
|---|---|---|
| `led` | glows red when GPIO is HIGH | , |
| `buzzer` | glows when GPIO is HIGH | , |
| `generic_output` | glows when GPIO is HIGH (relay, motor driver, etc.) | , |
| `servo` | glows when PWM signal GPIO is HIGH | , |
| `display` | glows when output GPIO is HIGH | , |
| `button` | , | click in 3D view fires a rising edge (press) and falling edge (release) |
| `generic_input` | , | click fires rising edge (PIR, potentiometer, DHT22, etc.) |

You can combine both fields , e.g. a component that both outputs and accepts clicks.

### 3D model (.glb)

- Format: binary glTF (`.glb`)
- Coordinate system: Y-up, units in **meters**
- Recommended: keep models small , typical components are 3–30 mm = 0.003–0.03 in model units
- Materials: standard PBR (`MeshStandardMaterial`). Emissive properties are overridden by the sim.
- If no GLB is provided, the app renders a colored box placeholder

### Schematic symbol

```jsonc
"schematic": {
  "symbol": "resistor"    // see symbol vocabulary below
}
```

**Available symbols:** `resistor`, `capacitor`, `led`, `button`, `potentiometer`, `display`, `ic`, `sensor`, `motor`, `relay`, `speaker`, `microphone`, `ledstrip`, `generic-rect`

If the symbol field is omitted the component renders as a generic labeled rectangle in the schematic view.

---

## Adding boards

Boards are defined in code at `src/catalog/index.ts`. To add a new board:

1. **Define the board** by adding a `BoardDef` object:

```typescript
const myBoard: BoardDef = {
  id: 'my-board-v1',                    // unique id
  name: 'My Board v1',
  version: '0.1.0',
  boardVersion: 'v1',
  category: 'misc',
  model: 'my-board.glb',                // GLB filename in assets
  target: 'esp32s3',                    // IDF target: esp32 | esp32s2 | esp32s3 | esp32c3 | esp32c6 | esp32h2

  features: ['Wi-Fi 6', 'BLE 5.0', 'USB CDC'],  // shown in board picker

  // Restricted pins , DRC checks these
  inputOnlyPins:  ['GPIO34', 'GPIO35'],
  strappingPins:  ['GPIO0', 'GPIO3', 'GPIO45', 'GPIO46'],
  flashPins:      ['GPIO27', 'GPIO28', 'GPIO29', 'GPIO30', 'GPIO31', 'GPIO32'],
  usbPins:        ['GPIO19', 'GPIO20'],    // native USB; triggers USB CDC config
  adc1Pins:       ['GPIO1', 'GPIO2', 'GPIO3'],
  adc2Pins:       ['GPIO11', 'GPIO12'],
  pwmCapablePins: [],                      // empty = all GPIO are PWM-capable
  railBudgetMa:   { '3v3': 600 },

  pins: [
    // Use the headerPins() helper for standard 2.54mm header rows
    ...headerPins('left', halfX, halfZ, [
      { id: '3v3',   label: '3V3', type: 'power_out' },
      { id: 'gnd_l', label: 'GND', type: 'ground'    },
      { id: 'gpio1', label: '1',   type: 'analog_in' },
      // ... one entry per pin
    ]),
    ...headerPins('right', halfX, halfZ, [
      // right header row
    ])
  ]
}
```

2. **Register it** by adding to the `boards` record near the bottom of the file:

```typescript
const boards: Record<string, BoardDef> = {
  [devkitc.id]:  devkitc,
  // ... existing boards
  [myBoard.id]:  myBoard,   // add here
}
```

3. **Pin positions** , the `headerPins(side, halfX, halfZ, labels)` helper places pins evenly along a header row. Parameters:
   - `side`: `'left'` (−Z edge) or `'right'` (+Z edge)
   - `halfX`: half the board length in meters (e.g. `0.022` for a 44mm board)
   - `halfZ`: half the board width in meters (e.g. `0.0145` for a 29mm board)
   - `labels`: array of `{ id, label, type }` from the pin closest to the USB end to the far end

4. **GLB model** , place the `.glb` file in `resources/` (Electron assets). Pin coordinates in the board definition must match the model's local coordinate space. The board mesh is centered at the origin in the 3D view.

> **Tip:** If you don't have a GLB yet, omit the `model` field (or point it at a non-existent file). The app renders a parametric green PCB placeholder automatically based on the pin bounding box.

---

## Using the agent

Open the **Agent** pane on the right. Select a model provider and key in the settings (gear icon), then type your request.

### Supported providers

| Provider | Setup |
|---|---|
| **Anthropic Claude** | Paste your API key in settings. Recommended: `claude-sonnet-4-6` or later. |
| **Claude Code** | Uses your local Claude Code CLI (no API key in-app). Models: `sonnet`, `opus`, `haiku`. |
| **OpenAI** | Paste your API key. Works with `gpt-4o` and later. |
| **OpenRouter** | Paste your OpenRouter API key. Routes to Claude, GPT, Llama, Gemini, etc. |
| **Ollama** | Run `ollama serve` locally. Select any pulled model. No API key needed. |

### Agent tools reference

The agent has access to the following tools. You can reference these in prompts to guide behavior.

| Tool | What it does |
|---|---|
| `get_project` | Returns board, component list, net list, DRC status, and custom firmware file names |
| `list_catalog` | Lists all components with ids, names, categories, and pin ids |
| `plan_circuit` | Pre-flight check: validates component ids, flags missing companion parts, returns safe GPIOs. Must be called before the first `add_component` |
| `add_component` | Adds a component instance to the project |
| `remove_component` | Removes an instance and any nets touching it |
| `remove_net` | Removes a single net (wire) by id |
| `connect` | Wires two pins together (`"led1.anode"` → `"board.gpio16"`) |
| `run_drc` | Runs design rule checks; returns errors and warnings |
| `write_firmware` | Writes full ESP-IDF C source into a project file (e.g. `main/app_main.c`); overrides the generated code |
| `read_firmware` | Reads back a previously written firmware file |
| `save_project` | Saves the project to disk (overwrites if previously saved, else opens dialog) |
| `think` | Private reasoning step , no side effects |
| `fetch_url` | Fetches a URL and returns readable text (for datasheets, docs) |
| `list_glb_models` | Lists all registered GLB models (boards and catalog components) |

### Prompting tips

**Start with a clear goal:**
> "Add an LED on GPIO16 with a 220Ω resistor, a push button on GPIO4, and write firmware that lights the LED while the button is held."

**The agent follows a fixed workflow:**
1. `think` to plan the BOM and wiring
2. `list_catalog` to check available components
3. `plan_circuit` to validate ids and get safe GPIOs (required before `add_component`)
4. `add_component` + `connect` for each component
5. `run_drc` after every wire
6. `write_firmware` to write the ESP-IDF C application
7. Summarises and tells you to Compile then click ▶ Play

**Iterate freely:**
> "The LED should also blink at 2Hz when not pressed."
> "Replace the button with a PIR sensor."

**The agent knows ESP32 constraints** , it will avoid strapping pins, check current limits, add pull-up resistors for I2C, and suggest safe GPIO numbers.

---

## Firmware

There is no behavior DSL. Firmware is plain ESP-IDF C, and it comes from one of two places:

1. **Generated from the circuit** , the code generator turns the components and nets into a working ESP-IDF project: GPIO/I2C initialisation, pin macros, and board-specific `sdkconfig`. This is always available and updates live as you edit the circuit. See [Code generation](#code-generation).

2. **Written by the agent** , when you ask the agent for logic ("blink the LED at 2 Hz", "turn the LED on while the button is held"), it calls `write_firmware` with complete C source. Agent-written files are stored in the project's `customCode` and **override** the generated file of the same path (e.g. `main/app_main.c`). They appear in the Code pane with an `agent` badge. Use `read_firmware` to inspect them; delete the custom file to fall back to generated code.

Pin references the agent reasons about follow the format `"instance.pinId"` (e.g. `"led1.anode"`, `"board.gpio4"`); the resolver traces nets to the real GPIO number when emitting C.

---

## Firmware simulation

The simulator runs your **actual firmware** , not an interpretation of it. The C project (generated or agent-written) is compiled to a small native host binary that emulates the ESP GPIO/log API, so what you see is the real control flow.

In the **Sim** tab (Code/Build/Sim panel):

1. **⬡ Compile** , compiles the current firmware to a native binary. The button shows `⟳ Compiling…`, then `✓ Compiled` (or `✗ Error` with the compiler output in the log).
2. **▶ Play** , runs the binary. GPIO writes stream out as JSON events and drive the 3D view; `ESP_LOGx` output appears in the Sim console.
3. **■ Stop** , terminates the running binary.

Recompile after changing the circuit or firmware , Play uses the last compiled binary.

**GPIO outputs** animate live: LEDs glow, relays activate, WS2812B strips light up.

**Interacting during simulation:**

- Components with `sim.role: "button"` or `"generic_input"` show a blue highlight ring
- Click and hold a button , a rising edge is injected into the binary's input
- Release , a falling edge is injected
- Rapid clicks each inject their own edge (no debounce)

---

## Code generation

The **Code** tab shows a live-generated ESP-IDF 5 project, updated as you edit the circuit. Three files are generated:

| File | Contents |
|---|---|
| `main/app_main.c` | Includes, pin macros, GPIO/I2C init, `app_main` |
| `main/CMakeLists.txt` | `idf_component_register` with all required IDF components |
| `sdkconfig.defaults` | `CONFIG_IDF_TARGET`, FreeRTOS Hz, CPU frequency, USB CDC (board-specific) |

The code generator covers:
- `#define PIN_<instance>_<pin>` macros resolved from net connections to real GPIO numbers
- GPIO direction setup per pin (`gpio_set_direction` input vs output, inferred from pin type)
- I2C bus init (when I2C components are present)
- Board-specific `sdkconfig.defaults` (target, CPU frequency, USB CDC)
- Wi-Fi / MQTT / HTTP include and `REQUIRES` scaffolding when enabled in the project's `app` config

The generated `app_main` initialises hardware but contains no application logic , that is the agent's job via `write_firmware`. If a custom file exists for a given path, it replaces the generated one in the Code pane (shown with an `agent` badge) and is what gets compiled, simulated, and flashed.

---

## Build and flash

Open the **Build / Flash** tab.

1. **Select a serial port** , click ↻ to rescan, then pick your device (e.g. `/dev/cu.usbserial-0001`)
2. **▶ Build** , writes the generated C project to `~/circuitiny/projects/<name>/` and runs `idf.py build`
3. **⚡ Flash** , runs `idf.py flash` to the selected port
4. **📟 Monitor** , opens `idf.py monitor` to stream serial output from the device
5. **■ Stop** , kills the current operation (SIGINT → SIGKILL after 1.5s)
6. **Clean** , runs `idf.py fullclean`

Build output streams in real time. Errors appear in red, metadata in green.

> **First build is slow** , `idf.py set-target` runs only once per project, configuring the toolchain for the selected chip. Subsequent builds are incremental.

---

## Project file format

Projects are saved as `.circuitiny.json`. The format is stable and human-readable:

```jsonc
{
  "schemaVersion": 1,
  "name": "blink-button",
  "target": "esp32",
  "board": "esp32-devkitc-v4",

  "components": [
    {
      "instance": "r1",
      "componentId": "resistor-220r",
      "position": [0.033, 0.005, 0.015],
      "pinAssignments": {}
    },
    {
      "instance": "led1",
      "componentId": "led-5mm-red",
      "position": [0.048, 0.005, 0.015],
      "pinAssignments": {}
    }
  ],

  "nets": [
    { "id": "net1", "endpoints": ["board.gpio16", "r1.in"] },
    { "id": "net2", "endpoints": ["r1.out", "led1.anode"] },
    { "id": "net3", "endpoints": ["led1.cathode", "board.gnd_l"] }
  ],

  "app": {
    "wifi": { "enabled": false },
    "log_level": "info"
  },

  "customCode": {
    "main/app_main.c": "// agent-written ESP-IDF C ... (overrides generated code)"
  }
}
```

`customCode` is optional , present only when the agent has written firmware. `drcOverrides` (also optional) holds warning ids the user has dismissed. `schemaVersion` is `1`; future breaking changes will increment it.

---

## Architecture overview

```
src/
├── agent/          # LLM integration
│   ├── anthropic.ts / openai.ts / ollama.ts / claudecode.ts  # provider adapters
│   ├── chatSession.ts                          # turn loop, tool dispatch
│   ├── tools.ts                                # tool definitions + HANDLERS dispatch map
│   └── expertPrompt.ts                         # system prompt for expert mode
│
├── catalog/
│   ├── index.ts        # in-memory catalog: boards + inline components
│   └── hydrate.ts      # loads ~/.circuitiny/catalog/ on startup
│
├── codegen/
│   ├── ir.ts           # intermediate representation: resolves nets → GPIO numbers
│   └── generate.ts     # emits app_main.c, CMakeLists.txt, sdkconfig.defaults
│
├── drc/
│   └── index.ts        # design rule checks (strapping pins, flash pins, short circuits…)
│
├── panes/
│   ├── Viewer3D.tsx     # 3D scene, component placement, wiring, sim visuals
│   ├── Schematic.tsx    # 2D schematic view
│   ├── ChatPane.tsx     # agent chat UI
│   ├── CodePane.tsx     # generated code viewer
│   ├── BuildPane.tsx    # build/flash/monitor UI
│   ├── SimPane.tsx      # sim controls + log
│   └── Palette.tsx      # component browser sidebar
│
├── project/
│   ├── schema.ts       # Project, Net, AppConfig types (no behavior DSL)
│   ├── pins.ts         # net → GPIO pin resolver
│   └── component.ts    # ComponentDef, BoardDef, SimDef, PinDef types
│
├── sim/
│   └── useNativeSimLoop.ts  # React hook: bridges native sim binary ↔ store
│
└── store.ts            # Zustand store: all app state + actions

electron/
├── main.ts     # IPC: file dialogs, catalog IO, idf.py pipeline, native sim compile/run
└── preload.ts  # contextBridge: exposes window.espAI to the renderer
```

**Data flow:**

```
Project state (store)
  │
  ├──► codegen/generate.ts ──► Code pane (live C code; customCode overrides)
  │                                  │
  │                                  ▼
  │                         electron simCompile ──► native binary
  │                                  │
  │                                  ▼
  │              useNativeSimLoop ◄── stdout JSON ──► sim visuals (Viewer3D)
  │
  ├──► drc/index.ts ──► DRC overlay
  │
  └──► agent/tools.ts ──► LLM ──► mutations back to store
```

---

## Development

```bash
pnpm dev          # Electron + Vite hot reload
pnpm typecheck    # TypeScript check (both node and web tsconfigs)
```

```bash
pnpm test         # vitest (codegen + schema unit tests)
```

**Adding a new agent tool:**

1. Add a `ToolDef` entry to the `tools` array in `src/agent/tools.ts`
2. Add a handler function and register it in the `HANDLERS` map
3. Mention the tool in `expertPrompt.ts` if the agent should use it proactively

**Changing code generation:**

1. Adjust the IR in `src/codegen/ir.ts` if you need new resolved data (buses, pin info)
2. Emit the new C in `src/codegen/generate.ts`
3. Add/adjust a test in `tests/codegen.test.ts` so CI guards the output

**Adding a new component or board:** see [Extending the palette](#extending-the-palette--adding-components) and [Adding boards](#adding-boards).
