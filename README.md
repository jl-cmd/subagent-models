# subagent-models

A Claude Code mod that decides which models subagents may run on and the effort they run at.

## What it does

- A spawn that names a turned-off model runs on the default model instead. With `offAction` set to `deny`, the spawn is refused with a message that names the model to use.
- A full model id counts by its family. `claude-fable-5-1` is fable.
- Every request a subagent makes runs at the effort you set. The main conversation keeps its own model and effort.
- A subagent whose model comes from its agent definition is caught on its first request and moved the same way.
- A fork inherits its parent and passes untouched. So does a spawn that names no model.
- The status line shows the default model and effort, as `subagents: opus/medium`. It adds `(session)` while this session differs from the defaults.

## Settings

`/config` holds the defaults every new session starts with:

| Setting | Options | Default |
|---|---|---|
| Fable subagents | on, off | off |
| Sonnet subagents | on, off | off |
| Haiku subagents | on, off | on |
| Default subagent model | opus, sonnet, haiku, fable | opus |
| Subagent effort | inherit, low, medium, high, xhigh, max | medium |
| When a spawn names a turned-off model | move, deny | move |

Opus has no switch. It is always allowed.

## This session only

`/subagent-models` changes the current session from its next spawn, and leaves other sessions alone.

- `/subagent-models` prints the values in force and marks the ones this session changed.
- `/subagent-models fable on` sets one value for this session. Any setting name works, with one of its options.
- `/subagent-models save` writes this session's values to the `/config` defaults.
- `/subagent-models reset` drops this session's values, so the defaults apply again.

## Install

Clone the repository, then name the clone in the `env` block of `~/.claude/settings.json`. Every session started after that loads the mod, desktop sessions included:

```json
"env": { "CLAUDE_CODE_PLUGIN_DIRS": "<path to the clone>" }
```

Or load it from a clone for one session:

```sh
claude --plugin-dir <path to this folder>
```

## Test

```sh
claude plugin validate .
claude plugin test .
```

Built and tested on Claude Code 2.1.287. The mod API is in early access and can change between releases.

MIT license. See [LICENSE](LICENSE).
