export type Switch = 'on' | 'off'

export type Family = 'opus' | 'sonnet' | 'haiku' | 'fable'

export type Effort = 'inherit' | 'low' | 'medium' | 'high' | 'xhigh' | 'max'

export type OffAction = 'move' | 'deny'

export type Settings = {
  fable: Switch
  sonnet: Switch
  haiku: Switch
  defaultModel: Family
  effort: Effort
  offAction: OffAction
}

export type SessionOverrides = Partial<Settings>

declare module 'claude-code' {
  interface PluginState {
    'subagent-models': { overrides: SessionOverrides }
  }
}
