export {}

export interface IdfLogEvent { runId: string; stream: 'stdout' | 'stderr'; text: string }
export interface IdfExitEvent { runId: string; code: number | null; signal: string | null }

declare global {
  interface Window {
    espAI: {
      pickGlb: () => Promise<{ path: string; data: Uint8Array } | null>
      pickComponent: () => Promise<{ jsonPath: string; json: string; glbData: Uint8Array | null; glbName: string | null } | null>
      writeBundle: (id: string, glbName: string, glbData: Uint8Array, jsonText: string) => Promise<string>
      listCatalog: () => Promise<Array<{ id: string; json: any; glbData: Uint8Array | null }>>
      listBoardModels: () => Promise<Array<{ id: string; data: Uint8Array }>>

      saveProject: (project: unknown, suggestedName: string, existingPath?: string) => Promise<string | null>
      openProject: () => Promise<{ project: unknown; path: string } | null>
      projectWrite: (name: string, target: string, files: Record<string, string>) => Promise<{ dir: string; target: string }>
      listSerialPorts: () => Promise<string[]>
      idfStart: (opts: { name: string; target: string; op: 'build' | 'flash' | 'monitor' | 'clean'; port?: string }) => Promise<{ runId: string; cwd: string; cmd: string }>
      idfStop: (runId: string) => Promise<{ ok: boolean; reason?: string }>
      onIdfLog: (cb: (e: IdfLogEvent) => void) => () => void
      onIdfExit: (cb: (e: IdfExitEvent) => void) => () => void
      simCompile: (name: string, appMainC: string) => Promise<{ ok: boolean; binaryPath?: string; error?: string }>
      simStart: (binaryPath: string) => Promise<{ runId: string }>
      simStop: (runId: string) => Promise<{ ok: boolean; reason?: string }>
      simInject: (runId: string, line: string) => Promise<{ ok: boolean }>
      onSimEvent: (cb: (e: { runId: string; line: string }) => void) => () => void
      onSimExit: (cb: (e: { runId: string; code: number | null; signal: string | null }) => void) => () => void
      claudeCodeChat: (opts: { prompt: string; systemAppend: string; model: string; timeoutMs?: number }) => Promise<{ ok: boolean; text?: string; error?: string }>
    }
  }
}
