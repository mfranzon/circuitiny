export interface Msg {
  role: 'system' | 'user' | 'assistant' | 'tool'
  content: string
  tool_calls?: Array<{ id?: string; function: { name: string; arguments: any } }>
  tool_name?: string
  tool_call_id?: string
  name?: string
}

export interface AgentCallbacks {
  onMessage: (m: Msg) => void
  onToken: (delta: string) => void
  onToolCall: (name: string, args: any, result: any) => void
  onError: (err: string) => void
  // Optional: fine-grained activity while a single message is still streaming
  // (e.g. the model is emitting a large tool_use block). Lets the UI show that
  // work is happening before the message/tool result is complete.
  onProgress?: (label: string) => void
}

export type ProviderType = 'ollama' | 'openai' | 'anthropic' | 'openrouter' | 'claudecode'

export interface ProviderConfig {
  provider: ProviderType
  model: string
  apiKey?: string
  baseUrl?: string   // custom Ollama host or OpenRouter base
  maxToolLoops?: number
  expertMode?: boolean
  signal?: AbortSignal
  connectTimeoutMs?: number  // max wait for API response headers (default 90s)
  idleTimeoutMs?: number     // max gap between stream chunks (default 120s)
}

export const PROVIDER_DEFAULTS: Record<ProviderType, { label: string; defaultModel: string; baseUrl: string; needsKey: boolean }> = {
  ollama:      { label: 'Ollama (local)',   defaultModel: 'qwen3.5:latest',             baseUrl: 'http://localhost:11434',        needsKey: false },
  openai:      { label: 'OpenAI',           defaultModel: 'gpt-4o',                     baseUrl: 'https://api.openai.com/v1',     needsKey: true  },
  anthropic:   { label: 'Anthropic',        defaultModel: 'claude-sonnet-4-6',          baseUrl: 'https://api.anthropic.com',     needsKey: true  },
  openrouter:  { label: 'OpenRouter',       defaultModel: 'anthropic/claude-sonnet-4-6', baseUrl: 'https://openrouter.ai/api/v1', needsKey: true  },
  claudecode:  { label: 'Claude Code (Pro)', defaultModel: 'sonnet',                    baseUrl: '',                              needsKey: false },
}
