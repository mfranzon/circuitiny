import { app, BrowserWindow, dialog, ipcMain } from 'electron'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { readFile, writeFile, mkdir, readdir } from 'fs/promises'
import { existsSync } from 'fs'
import { homedir } from 'os'
import { spawn, type ChildProcess, type ChildProcessWithoutNullStreams } from 'child_process'
import { randomUUID } from 'crypto'
import * as pty from 'node-pty'

const __dirname = fileURLToPath(new URL('.', import.meta.url))
const ICON_PATH = join(__dirname, '../../resources/icon.png')
const CIRCUITINY_HOME = join(homedir(), '.circuitiny')
const PROJECTS_ROOT = join(homedir(), 'circuitiny', 'projects')
// Resolution order: explicit override → IDF's own export.sh env var → standard install location
const IDF_PATH = process.env.CIRCUITINY_IDF_PATH ?? process.env.IDF_PATH ?? join(homedir(), 'esp', 'esp-idf')

app.setName('Circuitiny')

type RunHandle = ChildProcessWithoutNullStreams | pty.IPty
const runs = new Map<string, RunHandle>()

let mainWindow: BrowserWindow | null = null

function createWindow() {
  const win = new BrowserWindow({
    width: 1400,
    height: 900,
    title: 'Circuitiny',
    icon: ICON_PATH,
    webPreferences: {
      preload: join(__dirname, '../preload/preload.mjs'),
      sandbox: false
    }
  })
  mainWindow = win
  win.on('closed', () => { mainWindow = null })

  if (process.env.ELECTRON_RENDERER_URL) {
    win.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

ipcMain.handle('pickGlb', async () => {
  const r = await dialog.showOpenDialog({
    title: 'Select a .glb model',
    filters: [{ name: '3D Model', extensions: ['glb', 'gltf'] }],
    properties: ['openFile']
  })
  if (r.canceled || !r.filePaths[0]) return null
  const data = await readFile(r.filePaths[0])
  return { path: r.filePaths[0], data: new Uint8Array(data) }
})

ipcMain.handle('pickComponent', async () => {
  const r = await dialog.showOpenDialog({
    title: 'Open component.json',
    filters: [{ name: 'Component JSON', extensions: ['json'] }],
    properties: ['openFile']
  })
  if (r.canceled || !r.filePaths[0]) return null
  const jsonPath = r.filePaths[0]
  const json = await readFile(jsonPath, 'utf8')
  let glbData: Uint8Array | null = null
  let glbName: string | null = null
  try {
    const parsed = JSON.parse(json)
    if (parsed.model) {
      const candidate = join(dirname(jsonPath), parsed.model)
      if (existsSync(candidate)) {
        glbData = new Uint8Array(await readFile(candidate))
        glbName = parsed.model
      }
    }
    if (!glbData) {
      // fallback: any .glb in same dir
      const sibs = await readdir(dirname(jsonPath))
      const glb = sibs.find((f) => f.toLowerCase().endsWith('.glb'))
      if (glb) {
        glbData = new Uint8Array(await readFile(join(dirname(jsonPath), glb)))
        glbName = glb
      }
    }
  } catch { /* ignore — return json only */ }
  return { jsonPath, json, glbData, glbName }
})

// In dev __dirname is out/main; in a packaged build, board GLBs are copied into
// process.resourcesPath via electron-builder's `extraResources`.
const BOARD_MODELS_DIR = app.isPackaged
  ? join(process.resourcesPath, 'boards')
  : join(__dirname, '../../resources/boards')

ipcMain.handle('listBoardModels', async () => {
  if (!existsSync(BOARD_MODELS_DIR)) return []
  const files = await readdir(BOARD_MODELS_DIR)
  const out: Array<{ id: string; data: Uint8Array }> = []
  for (const f of files) {
    if (!f.toLowerCase().endsWith('.glb')) continue
    const id = f.replace(/\.glb$/i, '')
    out.push({ id, data: new Uint8Array(await readFile(join(BOARD_MODELS_DIR, f))) })
  }
  return out
})

ipcMain.handle('listCatalog', async () => {
  const root = join(CIRCUITINY_HOME, 'catalog')
  if (!existsSync(root)) return []
  const dirs = await readdir(root, { withFileTypes: true })
  const out: Array<{ id: string; json: any; glbData: Uint8Array | null }> = []
  for (const d of dirs) {
    if (!d.isDirectory()) continue
    const jsonPath = join(root, d.name, 'component.json')
    if (!existsSync(jsonPath)) continue
    try {
      const json = JSON.parse(await readFile(jsonPath, 'utf8'))
      let glbData: Uint8Array | null = null
      if (json.model && existsSync(join(root, d.name, json.model))) {
        glbData = new Uint8Array(await readFile(join(root, d.name, json.model)))
      }
      out.push({ id: json.id ?? d.name, json, glbData })
    } catch { /* skip bad entry */ }
  }
  return out
})

ipcMain.handle('writeBundle', async (_e, id: string, glbName: string, glbData: Uint8Array, jsonText: string) => {
  if (!id) throw new Error('id is required')
  const dir = join(CIRCUITINY_HOME, 'catalog', id)
  await mkdir(dir, { recursive: true })
  await writeFile(join(dir, glbName), Buffer.from(glbData))
  await writeFile(join(dir, 'component.json'), jsonText, 'utf8')
  return dir
})

// ---- M5: flash pipeline ----

function projectDirFor(name: string): string {
  const safe = name.replace(/[^a-zA-Z0-9_-]/g, '_') || 'untitled'
  return join(PROJECTS_ROOT, safe)
}

ipcMain.handle('projectWrite', async (_e, name: string, target: string, files: Record<string, string>) => {
  const dir = projectDirFor(name)
  await mkdir(join(dir, 'main'), { recursive: true })
  for (const [rel, content] of Object.entries(files)) {
    const abs = join(dir, rel)
    await mkdir(dirname(abs), { recursive: true })
    await writeFile(abs, content, 'utf8')
  }
  // Top-level CMakeLists.txt — ESP-IDF expects this.
  const topCMake = [
    '# AUTO-GENERATED BY Circuitiny. DO NOT EDIT.',
    'cmake_minimum_required(VERSION 3.16)',
    'include($ENV{IDF_PATH}/tools/cmake/project.cmake)',
    `project(${name.replace(/[^a-zA-Z0-9_-]/g, '_') || 'circuitiny_project'})`,
    ''
  ].join('\n')
  await writeFile(join(dir, 'CMakeLists.txt'), topCMake, 'utf8')
  return { dir, target }
})

ipcMain.handle('listSerialPorts', async () => {
  try {
    const entries = await readdir('/dev')
    return entries
      .filter((f) => /^cu\.(usb|SLAB|wch|tty\.usb)/i.test(f))
      .map((f) => `/dev/${f}`)
      .sort()
  } catch {
    return []
  }
})

ipcMain.handle('idfStart', async (_e, opts: {
  name: string; target: string; op: 'build' | 'flash' | 'monitor' | 'clean'; port?: string
}) => {
  const dir = projectDirFor(opts.name)
  if (!existsSync(dir)) throw new Error(`Project dir does not exist: ${dir} (write first)`)
  if (!existsSync(IDF_PATH)) throw new Error(`ESP-IDF not found at ${IDF_PATH} (set CIRCUITINY_IDF_PATH)`)

  const needsTarget = !existsSync(join(dir, 'build'))
  const portArg = opts.port ? ` -p ${JSON.stringify(opts.port)}` : ''
  let cmd: string
  switch (opts.op) {
    case 'build':
      cmd = needsTarget
        ? `idf.py set-target ${opts.target} && idf.py build`
        : `idf.py build`
      break
    case 'flash':
      if (!opts.port) throw new Error('Flash requires a serial port')
      cmd = `idf.py${portArg} flash`
      break
    case 'monitor':
      if (!opts.port) throw new Error('Monitor requires a serial port')
      cmd = `idf.py${portArg} monitor`
      break
    case 'clean':
      cmd = `idf.py fullclean`
      break
  }

  const runId = randomUUID()
  const extraPaths = ['/opt/homebrew/bin', '/opt/homebrew/sbin', '/usr/local/bin', '/usr/local/sbin']
  const PATH = [...extraPaths, process.env.PATH ?? ''].join(':')
  const shell = `source ${JSON.stringify(join(IDF_PATH, 'export.sh'))} 1>/dev/null && cd ${JSON.stringify(dir)} && ${cmd}`
  const env = { ...process.env, PATH, IDF_PATH, PYTHONUNBUFFERED: '1' }

  if (opts.op === 'monitor') {
    // idf.py monitor requires a TTY — use node-pty to provide one.
    const ptyProcess = pty.spawn('bash', ['-c', shell], {
      name: 'xterm-color', cols: 220, rows: 50, cwd: dir, env
    })
    runs.set(runId, ptyProcess)
    ptyProcess.onData((text) => {
      mainWindow?.webContents.send('idf:log', { runId, stream: 'stdout', text })
    })
    ptyProcess.onExit(({ exitCode }) => {
      runs.delete(runId)
      mainWindow?.webContents.send('idf:exit', { runId, code: exitCode, signal: null })
    })
  } else {
    const child = spawn('bash', ['-c', shell], { env }) as ChildProcessWithoutNullStreams
    runs.set(runId, child)
    const emit = (stream: 'stdout' | 'stderr', data: Buffer) => {
      mainWindow?.webContents.send('idf:log', { runId, stream, text: data.toString('utf8') })
    }
    child.stdout.on('data', (d) => emit('stdout', d))
    child.stderr.on('data', (d) => emit('stderr', d))
    child.on('exit', (code, signal) => {
      runs.delete(runId)
      mainWindow?.webContents.send('idf:exit', { runId, code, signal })
    })
    child.on('error', (err) => {
      mainWindow?.webContents.send('idf:log', { runId, stream: 'stderr', text: `spawn error: ${err.message}\n` })
    })
  }
  return { runId, cwd: dir, cmd }
})

// ---- Firmware sim ----

const SIM_HAL_DIR = join(__dirname, '../../resources/sim_hal')
const SIM_BUILD_ROOT = join(homedir(), 'circuitiny', 'sim')

ipcMain.handle('simCompile', async (_e, name: string, appMainC: string) => {
  const safe = (name || 'untitled').replace(/[^a-zA-Z0-9_-]/g, '_')
  const dir = join(SIM_BUILD_ROOT, safe)
  await mkdir(dir, { recursive: true })

  const appMainPath = join(dir, 'app_main.c')
  const simHalC     = join(SIM_HAL_DIR, 'sim_hal.c')
  const binaryPath  = join(dir, 'firmware_sim')

  await writeFile(appMainPath, appMainC, 'utf8')

  const cmd = [
    'clang', '-pthread', '-DSIM_MODE',
    `-I${SIM_HAL_DIR}`,
    simHalC, appMainPath,
    '-o', binaryPath,
  ].map((s) => JSON.stringify(s)).join(' ')

  return new Promise<{ ok: boolean; binaryPath?: string; error?: string }>((resolve) => {
    const child = spawn('bash', ['-c', cmd]) as ChildProcessWithoutNullStreams
    let stderr = ''
    child.stderr.on('data', (d: Buffer) => { stderr += d.toString('utf8') })
    child.stdout.on('data', (d: Buffer) => { stderr += d.toString('utf8') })
    child.on('exit', (code) => {
      if (code === 0) resolve({ ok: true, binaryPath })
      else resolve({ ok: false, error: stderr.trim() || `clang exited with code ${code}` })
    })
    child.on('error', (err) => resolve({ ok: false, error: err.message }))
  })
})

ipcMain.handle('simStart', async (_e, binaryPath: string) => {
  if (!existsSync(binaryPath)) throw new Error(`Binary not found: ${binaryPath}`)

  // Make sure the binary is executable
  const { execSync } = await import('child_process')
  try { execSync(`chmod +x ${JSON.stringify(binaryPath)}`) } catch { /* ignore */ }

  const runId = randomUUID()
  const child = spawn(binaryPath, [], {
    stdio: ['pipe', 'pipe', 'pipe'],
  }) as ChildProcessWithoutNullStreams
  runs.set(runId, child)

  let buf = ''
  child.stdout.on('data', (d: Buffer) => {
    buf += d.toString('utf8')
    const lines = buf.split('\n')
    buf = lines.pop() ?? ''
    for (const line of lines) {
      if (line.trim()) {
        mainWindow?.webContents.send('sim:event', { runId, line })
      }
    }
  })
  child.stderr.on('data', (d: Buffer) => {
    const text = d.toString('utf8').trim()
    if (text) {
      mainWindow?.webContents.send('sim:event', {
        runId,
        line: JSON.stringify({ t: 'stderr', msg: text }),
      })
    }
  })
  child.on('exit', (code, signal) => {
    runs.delete(runId)
    mainWindow?.webContents.send('sim:exit', { runId, code, signal })
  })
  child.on('error', (err) => {
    mainWindow?.webContents.send('sim:event', {
      runId,
      line: JSON.stringify({ t: 'stderr', msg: `spawn error: ${err.message}` }),
    })
  })

  return { runId }
})

ipcMain.handle('simInject', async (_e, runId: string, line: string) => {
  const handle = runs.get(runId)
  if (!handle) return { ok: false, reason: 'not running' }
  if (!('stdin' in handle)) return { ok: false, reason: 'no stdin' }
  ;(handle as ChildProcessWithoutNullStreams).stdin.write(line + '\n')
  return { ok: true }
})

// ---- Claude Code session chat ----

const CLAUDE_EXTRA_PATHS = [
  join(homedir(), '.local', 'bin'),
  '/opt/homebrew/bin',
  '/usr/local/bin',
]

ipcMain.handle('claudeCodeChat', async (_e, opts: {
  prompt: string
  systemAppend: string
  model: string
  timeoutMs?: number
}): Promise<{ ok: boolean; text?: string; error?: string }> => {
  const claudePath = join(homedir(), '.local', 'bin', 'claude')
  const binary = existsSync(claudePath) ? claudePath : 'claude'
  const PATH = [...CLAUDE_EXTRA_PATHS, process.env.PATH ?? ''].join(':')

  return new Promise((resolve) => {
    const args = [
      '-p',
      '--no-session-persistence',
      '--output-format', 'text',
      '--model', opts.model || 'sonnet',
      // Disable every built-in CLI tool (Read/Bash/Edit/…). Otherwise the model
      // uses its native tools (or just talks) and never emits the text-based
      // <tool_call> protocol that claudecode.ts parses. With no native tools,
      // the protocol is the only way it can act.
      '--tools', '',
      '--append-system-prompt', opts.systemAppend,
    ]

    const child = spawn(binary, args, {
      env: { ...process.env, PATH },
    }) as ChildProcess

    let stdout = ''
    let stderr = ''
    let settled = false
    const done = (r: { ok: boolean; text?: string; error?: string }) => {
      if (settled) return
      settled = true
      clearTimeout(killTimer)
      resolve(r)
    }

    // Hard per-turn timeout so a hung `claude` CLI cannot block the agent loop
    // forever. There is no streaming here; each turn is one-shot.
    const timeoutMs = opts.timeoutMs ?? 240_000
    const killTimer = setTimeout(() => {
      child.kill('SIGKILL')
      done({ ok: false, error: `claude CLI timed out after ${timeoutMs / 1000}s` })
    }, timeoutMs)

    child.stdout?.on('data', (d: Buffer) => { stdout += d.toString('utf8') })
    child.stderr?.on('data', (d: Buffer) => { stderr += d.toString('utf8') })

    child.stdin?.write(opts.prompt)
    child.stdin?.end()

    child.on('exit', (code) => {
      if (code === 0) {
        done({ ok: true, text: stdout })
      } else {
        done({ ok: false, error: stderr.trim() || `claude exited with code ${code}` })
      }
    })
    child.on('error', (err) => {
      done({ ok: false, error: err.message })
    })
  })
})

// ---- Project save / open ----

ipcMain.handle('saveProject', async (_e, project: unknown, suggestedName: string, existingPath?: string) => {
  let filePath = existingPath
  if (!filePath) {
    const safe = (suggestedName || 'untitled').replace(/[^a-zA-Z0-9_-]/g, '_')
    const r = await dialog.showSaveDialog({
      title: 'Save project',
      defaultPath: join(homedir(), 'circuitiny', `${safe}.circuitiny.json`),
      filters: [{ name: 'Circuitiny project', extensions: ['circuitiny.json'] }]
    })
    if (r.canceled || !r.filePath) return null
    filePath = r.filePath
  }
  await mkdir(dirname(filePath), { recursive: true })
  await writeFile(filePath, JSON.stringify(project, null, 2), 'utf8')
  return filePath
})

ipcMain.handle('openProject', async () => {
  const r = await dialog.showOpenDialog({
    title: 'Open project',
    filters: [{ name: 'Circuitiny project', extensions: ['circuitiny.json', 'json'] }],
    properties: ['openFile']
  })
  if (r.canceled || !r.filePaths[0]) return null
  const text = await readFile(r.filePaths[0], 'utf8')
  const parsed = JSON.parse(text)
  if (parsed.schemaVersion !== 1) throw new Error('Unsupported project schema version')
  return { project: parsed, path: r.filePaths[0] }
})

function killRun(handle: RunHandle, signal: 'SIGINT' | 'SIGKILL' = 'SIGKILL') {
  if ('pid' in handle && typeof (handle as any).pid === 'number') {
    // node-pty IPty — kill via pid
    try { process.kill((handle as pty.IPty).pid, signal) } catch { /* already dead */ }
  } else {
    (handle as ChildProcessWithoutNullStreams).kill(signal)
  }
}

ipcMain.handle('idfStop', async (_e, runId: string) => {
  const handle = runs.get(runId)
  if (!handle) return { ok: false, reason: 'not running' }
  killRun(handle, 'SIGINT')
  setTimeout(() => { if (runs.has(runId)) killRun(runs.get(runId)!, 'SIGKILL') }, 1500)
  return { ok: true }
})

app.on('before-quit', () => {
  for (const handle of runs.values()) killRun(handle, 'SIGKILL')
})

app.whenReady().then(() => {
  if (process.platform === 'darwin') app.dock?.setIcon(ICON_PATH)
  createWindow()
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow()
})
