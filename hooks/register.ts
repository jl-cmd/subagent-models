import { atom, read, update } from 'claude-code'
import type { PluginOptions, Register, StateDollar } from 'claude-code'

import type { Family, SessionOverrides, Settings } from '../types'

const PLUGIN = 'subagent-models'

const ALL_CHOICES: { readonly [Field in keyof Settings]: readonly Settings[Field][] } = {
  fable: ['on', 'off'],
  sonnet: ['on', 'off'],
  haiku: ['on', 'off'],
  defaultModel: ['opus', 'sonnet', 'haiku', 'fable'],
  effort: ['inherit', 'low', 'medium', 'high', 'xhigh', 'max'],
  offAction: ['move', 'deny'],
}

const ALL_FIELDS = Object.keys(ALL_CHOICES) as (keyof Settings)[]

const ALL_FAMILIES: readonly Family[] = ['opus', 'sonnet', 'haiku', 'fable']

const overrides = atom({ plugin: 'subagent-models', key: 'overrides' } as const, {} as SessionOverrides)

function familyOf(model: string | undefined): Family | undefined {
  if (model === undefined) return undefined
  const normalized = model.trim().toLowerCase()
  return ALL_FAMILIES.find(family => normalized === family || normalized.startsWith(`claude-${family}`))
}

function isField(name: string): name is keyof Settings {
  return (ALL_FIELDS as string[]).includes(name)
}

function isAllowed(settings: Settings, family: Family | undefined): boolean {
  return family === undefined || family === 'opus' || settings[family] === 'on'
}

function statusOf(settings: Settings, sessionOverrides: SessionOverrides): string {
  const sessionMark = Object.keys(sessionOverrides).length > 0 ? ' (session)' : ''
  return `subagents: ${settings.defaultModel}/${settings.effort}${sessionMark}`
}

function denyTextOf(model: string, settings: Settings): string {
  const effortAsk = settings.effort === 'inherit' ? '' : ` and ask for ${settings.effort} effort in the brief`
  return `Subagent model ${model} is turned off. Spawn subagents on ${settings.defaultModel}${effortAsk}.`
}

function listingOf(settings: Settings, sessionOverrides: SessionOverrides): string {
  return ALL_FIELDS.map(field => `${field} ${settings[field]}${field in sessionOverrides ? ' (this session)' : ''}`).join('\n')
}

async function sessionState($: StateDollar, defaults: Settings) {
  const sessionOverrides = await read($, overrides)
  return { sessionOverrides, settings: { ...defaults, ...sessionOverrides } as Settings }
}

const USAGE = `Usage: /${PLUGIN} [<field> <value> | save | reset]. Fields: ${ALL_FIELDS.join(', ')}.`

export const register: Register = (on, options: PluginOptions) => {
  const defaults = Object.fromEntries(ALL_FIELDS.map(field => [field, String(options[field])])) as Settings

  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: PLUGIN,
      description: 'Show or change which models subagents may run on, and their effort, for this session',
    })
    const { settings, sessionOverrides } = await sessionState($, defaults)
    $.ui.status(statusOf(settings, sessionOverrides))
    return next(e)
  })

  on('command.run', { command: PLUGIN }, async ($, e) => {
    const [word = '', value, ...rest] = e.args.trim().split(/\s+/).filter(Boolean)
    const { settings, sessionOverrides } = await sessionState($, defaults)
    if (word === '') return { text: listingOf(settings, sessionOverrides) }
    if (word === 'reset' && value === undefined) {
      await update($, overrides, () => ({}))
      $.ui.status(statusOf(defaults, {}))
      return { text: 'Session values cleared. The /config defaults apply again.' }
    }
    if (word === 'save' && value === undefined) {
      for (const field of Object.keys(sessionOverrides) as (keyof Settings)[]) {
        await $.config.set({ key: `${PLUGIN}.${field}`, value: settings[field] })
      }
      return { text: `Saved as defaults:\n${listingOf(settings, {})}` }
    }
    if (!isField(word) || value === undefined || rest.length > 0) return { text: USAGE }
    const allChoices = ALL_CHOICES[word] as readonly string[]
    if (!allChoices.includes(value)) return { text: `${word} takes ${allChoices.join(', ')}.` }
    const nextOverrides = await update($, overrides, current => ({ ...current, [word]: value }))
    $.ui.status(statusOf({ ...defaults, ...nextOverrides } as Settings, nextOverrides))
    return { text: `${word} ${value} for this session.` }
  })

  on('agent.spawn', async ($, e, next) => {
    if (e.fork || e.model === undefined) return next(e)
    const { settings } = await sessionState($, defaults)
    if (isAllowed(settings, familyOf(e.model))) return next(e)
    if (settings.offAction === 'deny') return { deny: denyTextOf(e.model, settings) }
    return next({ ...e, model: settings.defaultModel })
  })

  on('turn.step', async function* ($, e, next) {
    if (e.agentId === undefined) return yield* next(e)
    const { settings } = await sessionState($, defaults)
    const model = isAllowed(settings, familyOf(e.model)) ? e.model : settings.defaultModel
    const effort = settings.effort === 'inherit' || e.effort === undefined ? e.effort : settings.effort
    return yield* next({ ...e, model, effort })
  })
}
