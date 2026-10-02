import { test, expect } from 'claude-code/testing'
import type { AgentSpawnInput, ConfigSetInput, On, TurnStepInput } from 'claude-code'

type World = {
  spawnedModels: (string | undefined)[]
  steps: TurnStepInput[]
  statuses: (string | undefined)[]
  configWrites: { key: string; value: unknown }[]
}

function engine(on: On): World {
  const world: World = { spawnedModels: [], steps: [], statuses: [], configWrites: [] }
  on('agent.spawn', (_$, e) => {
    world.spawnedModels.push(e.model)
    return { model: e.model ?? e.parentModel, agentId: 'agent-1' }
  })
  on('turn.step', async function* (_$, e) {
    world.steps.push(e)
    return { turnId: e.turnId, index: e.index, answer: '', toolUses: [], stopReason: 'end_turn' as never, usage: null }
  })
  on('ui.status', (_$, e) => (world.statuses.push((e as { text?: string }).text), {}) as never)
  on('config.set', (_$, e: ConfigSetInput) => (world.configWrites.push({ key: e.key, value: e.value }), { value: e.value }))
  return world
}

const spawnOf = (model: string | undefined, fork = false): AgentSpawnInput => ({
  tool_use_id: 'toolu_1',
  prompt: 'Read README.md.',
  description: 'read readme',
  subagentType: 'general-purpose',
  provider: { plugin: 'engine', tier: 'core' } as never,
  model,
  parentModel: 'claude-opus-5-5',
  background: true,
  fork,
})

const stepOf = (model: string, agentId?: string, effort?: TurnStepInput['effort']): TurnStepInput => ({
  turnId: 't1',
  index: 0,
  model,
  effort,
  messageCount: 1,
  agentId,
})

async function runStep($: { turn: { step: (e: TurnStepInput) => AsyncGenerator<unknown, unknown> & { result: Promise<unknown> } } }, e: TurnStepInput) {
  const stream = $.turn.step(e)
  for await (const _chunk of stream) {
  }
  return stream.result
}

async function command($: { command: { run: (e: never) => Promise<{ text?: string }> } }, args: string) {
  return $.command.run({ command: 'subagent-models', args, origin: { kind: 'composer' }, presentation: {} } as never)
}

test('moves a fable spawn to opus', async ($, on) => {
  const world = engine(on)
  const result = await $.agent.spawn(spawnOf('fable'))
  expect(world.spawnedModels).toEqual(['opus'])
  expect(result.deny).toBeUndefined()
})

test('moves a sonnet spawn to opus', async ($, on) => {
  const world = engine(on)
  await $.agent.spawn(spawnOf('sonnet'))
  expect(world.spawnedModels).toEqual(['opus'])
})

test('reads a full fable id as fable', async ($, on) => {
  const world = engine(on)
  await $.agent.spawn(spawnOf(' Claude-Fable-5-1 '))
  expect(world.spawnedModels).toEqual(['opus'])
})

test('passes an opus spawn as given', async ($, on) => {
  const world = engine(on)
  await $.agent.spawn(spawnOf('opus'))
  expect(world.spawnedModels).toEqual(['opus'])
})

test('passes a haiku spawn while haiku is on', async ($, on) => {
  const world = engine(on)
  await $.agent.spawn(spawnOf('haiku'))
  expect(world.spawnedModels).toEqual(['haiku'])
})

test('passes a spawn with no model', async ($, on) => {
  const world = engine(on)
  await $.agent.spawn(spawnOf(undefined))
  expect(world.spawnedModels).toEqual([undefined])
})

test('passes a fork whatever model it names', async ($, on) => {
  const world = engine(on)
  await $.agent.spawn(spawnOf('fable', true))
  expect(world.spawnedModels).toEqual(['fable'])
})

test('passes a fable spawn while fable is on', { options: { fable: 'on' } }, async ($, on) => {
  const world = engine(on)
  await $.agent.spawn(spawnOf('fable'))
  expect(world.spawnedModels).toEqual(['fable'])
})

test('moves to the default model the settings name', { options: { defaultModel: 'haiku' } }, async ($, on) => {
  const world = engine(on)
  await $.agent.spawn(spawnOf('fable'))
  expect(world.spawnedModels).toEqual(['haiku'])
})

test('refuses a turned-off spawn when offAction is deny', { options: { offAction: 'deny' } }, async ($, on) => {
  const world = engine(on)
  const result = await $.agent.spawn(spawnOf('fable'))
  expect(world.spawnedModels).toEqual([])
  expect(result.deny).toBe('Subagent model fable is turned off. Spawn subagents on opus and ask for medium effort in the brief.')
})

test('sets medium effort on a subagent step', async ($, on) => {
  const world = engine(on)
  await runStep($ as never, stepOf('claude-opus-5-5', 'agent-1', 'high'))
  expect(world.steps[0]?.effort).toBe('medium')
  expect(world.steps[0]?.model).toBe('claude-opus-5-5')
})

test('leaves a main-session step untouched', async ($, on) => {
  const world = engine(on)
  await runStep($ as never, stepOf('claude-fable-5-1', undefined, 'high'))
  expect(world.steps[0]?.effort).toBe('high')
  expect(world.steps[0]?.model).toBe('claude-fable-5-1')
})

test('keeps the step effort when effort is inherit', { options: { effort: 'inherit' } }, async ($, on) => {
  const world = engine(on)
  await runStep($ as never, stepOf('claude-opus-5-5', 'agent-1', 'high'))
  expect(world.steps[0]?.effort).toBe('high')
})

test('moves a subagent step on a turned-off model to the default model', async ($, on) => {
  const world = engine(on)
  await runStep($ as never, stepOf('claude-fable-5-1', 'agent-1'))
  expect(world.steps[0]?.model).toBe('opus')
})

test('a session override turns fable on for this session only', async ($, on) => {
  const world = engine(on)
  const answer = await command($ as never, 'fable on')
  expect(answer.text).toMatch(/fable on/)
  await $.agent.spawn(spawnOf('fable'))
  expect(world.spawnedModels).toEqual(['fable'])
  expect(world.configWrites).toEqual([])
})

test('a session override sets the effort of later subagent steps', async ($, on) => {
  const world = engine(on)
  await command($ as never, 'effort high')
  await runStep($ as never, stepOf('claude-opus-5-5', 'agent-1', 'low'))
  expect(world.steps[0]?.effort).toBe('high')
})

test('refuses a value outside the field options', async ($, on) => {
  const world = engine(on)
  const answer = await command($ as never, 'fable maybe')
  expect(answer.text).toMatch(/fable takes on, off/)
  await $.agent.spawn(spawnOf('fable'))
  expect(world.spawnedModels).toEqual(['opus'])
})

test('reset drops the session overrides', async ($, on) => {
  const world = engine(on)
  await command($ as never, 'fable on')
  await command($ as never, 'reset')
  await $.agent.spawn(spawnOf('fable'))
  expect(world.spawnedModels).toEqual(['opus'])
})

test('save writes the session values to the defaults', async ($, on) => {
  const world = engine(on)
  await command($ as never, 'fable on')
  await command($ as never, 'save')
  expect(world.configWrites).toContainEqual({ key: 'subagent-models.fable', value: 'on' })
})

test('no arguments prints the values in force', async ($, on) => {
  engine(on)
  await command($ as never, 'sonnet on')
  const answer = await command($ as never, '')
  expect(answer.text).toMatch(/sonnet on \(this session\)/)
  expect(answer.text).toMatch(/fable off/)
  expect(answer.text).toMatch(/effort medium/)
})

test('the status line shows the default model and effort', async ($, on) => {
  const world = engine(on)
  await command($ as never, 'effort low')
  expect(world.statuses.at(-1)).toBe('subagents: opus/low (session)')
})
