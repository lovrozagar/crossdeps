# @lovrozagar/crossdeps

Define system dependencies in a TypeScript (or JS) config file. Install, check, and wire their environment on macOS, Linux (apt / dnf / pacman), and Windows with one CLI.

The published package ships TypeScript source. The CLI shebang is `#!/usr/bin/env bun`, so **Bun is required to run the CLI**.

This README is the full usage contract. If you are an agent, read it end to end before writing a config or invoking the CLI. Every public command, flag, config field, export, and runtime rule is here with an example.

Source and the 24-dep catalog: [github.com/lovrozagar/crossdeps](https://github.com/lovrozagar/crossdeps).

## Table of contents

- [What this is](#what-this-is)
- [Requirements](#requirements)
- [Install](#install)
- [Quick start](#quick-start)
- [Agent contract](#agent-contract)
- [Config file](#config-file)
  - [Discovery](#discovery)
  - [Export shape](#export-shape)
  - [`defineConfig`](#defineconfig)
  - [`SystemDepConfig`](#systemdepconfig)
  - [`OsCommands`](#oscommands)
  - [Template variables](#template-variables)
  - [`EnvVar`](#envvar)
- [CLI](#cli)
  - [Invocation and flags](#invocation-and-flags)
  - [`install`](#install-1)
  - [`check`](#check)
  - [`env`](#env)
  - [`sync-pm`](#sync-pm)
  - [Version detection](#version-detection)
  - [Exit codes](#exit-codes)
- [OS detection](#os-detection)
- [How install commands are executed](#how-install-commands-are-executed)
- [Library API](#library-api)
- [Worked examples](#worked-examples)
- [package.json integration](#packagejson-integration)
- [Gotchas](#gotchas)
- [Changelog](#changelog)
- [License](#license)

## What this is

crossdeps is a **system-binary** installer, not an npm/bun package installer.

You write `crossdeps.config.ts` listing tools such as `node`, `bun`, `docker`, `adb`. Each entry has:

- a version string
- per-OS install shell commands
- an optional version-check command
- optional `dependsOn` install order
- optional env-var blocks written into the user shell profile

Then:

```bash
bunx crossdeps install      # install missing deps for this OS
bunx crossdeps check        # report installed vs expected
bunx crossdeps env          # write env blocks for deps that define env
bunx crossdeps sync-pm      # write package.json "packageManager": "bun@<version>"
```

It does **not**:

- install npm/bun workspace packages
- upgrade a dep that is already present (any detected version counts as installed)
- install `dependsOn` targets when you install a single name
- support JSON/YAML/TOML config (modules only: `.ts` / `.js` / `.mjs`)
- expose `env.ts` / `exec.ts` helpers as public API

## Requirements

| Need | Detail |
| --- | --- |
| Bun | CLI is `src/cli.ts` with `#!/usr/bin/env bun`. `npx crossdeps` / `bunx crossdeps` only work if `bun` is on `PATH`. |
| Config module | Loaded with dynamic `import()`. Must be valid ESM that Bun can import. |
| Privileges | Install commands run as-is. If a command uses `sudo` / `choco` / `brew`, the machine must allow that. |
| Network | Most catalog commands download installers. Offline machines will fail those commands. |

The library API (`defineConfig`, `detectOs`, …) can be imported from TypeScript that resolves `.ts` exports (Bun, or a bundler). There is no compiled `dist/`.

## Install

```bash
npm install -D @lovrozagar/crossdeps
# or
bun add -D @lovrozagar/crossdeps
```

The bin name is `crossdeps`. After install:

```bash
bunx crossdeps
# prints usage and exits 0 (no command)
```

## Quick start

Create `crossdeps.config.ts` in the project root (the directory you will run the CLI from):

```ts
import { defineConfig } from "@lovrozagar/crossdeps"

export default defineConfig({
	packageJsonPath: "package.json",
	deps: {
		node: {
			description: "JavaScript runtime",
			required: true,
			version: "22.12.0",
			os: {
				macos:
					"curl -fsSL https://nodejs.org/dist/v{{version}}/node-v{{version}}-darwin-{{arch}}.tar.gz | sudo tar -xz -C /usr/local --strip-components=1",
				"linux-apt":
					"curl -fsSL https://nodejs.org/dist/v{{version}}/node-v{{version}}-linux-x64.tar.gz | sudo tar -xz -C /usr/local --strip-components=1",
				windows: "choco install nodejs --version={{version}}",
			},
		},
		bun: {
			description: "JavaScript runtime and package manager",
			required: true,
			version: "1.3.11",
			os: {
				all: 'curl -fsSL https://bun.sh/install | bash -s "bun-v{{version}}"',
				windows: 'powershell -c "irm bun.sh/install.ps1|iex" && bun upgrade --to {{version}}',
			},
		},
	},
})
```

```bash
bunx crossdeps install
bunx crossdeps check
bunx crossdeps install --dry-run
bunx crossdeps sync-pm
```

## Agent contract

Follow these rules. They are the actual runtime, not suggestions.

1. Config files must be named `crossdeps.config.ts`, `crossdeps.config.js`, or `crossdeps.config.mjs` in `cwd`, or passed with `--config <path>`.
2. The file must export an object with a `deps` field. Default export is preferred. A named export also works if it has `deps`.
3. `defineConfig` is an identity helper that types the object and defaults `packageJsonPath` to `"package.json"`. You can export a plain object instead.
4. OS targets are exactly: `macos`, `linux-apt`, `linux-dnf`, `linux-pacman`, `windows`.
5. Install command resolution: per-OS string wins; else `os.all`; `false` means unavailable (overrides `all`); omitted key with no `all` means unavailable.
6. `{{name}}`, `{{version}}`, `{{major}}`, `{{arch}}` are interpolated in `os` commands and `check.command`. `{{arch}}` is `arm64` only when `process.arch === "arm64"`; every other arch is `amd64`.
7. Default check command is `{{name}} --version`. A dep is "installed" only if the check binary exists **and** stdout/stderr of the check command matches `(\d+\.\d+[\w.-]*)`.
8. `install` (no name) topologically sorts by `dependsOn`. `install <name>` installs **only** that name and does **not** walk `dependsOn`.
9. If any version is detected, `install` skips. It does not upgrade. `--dry-run` never skips and reports the dep as installed without running the command.
10. Failed **required** deps fail `install` (exit 1). Failed **optional** deps are counted as skipped.
11. Unavailable on this OS is not a failure.
12. `check` (all): missing **required** → exit 1. Version mismatch → warning, exit 0. Missing optional → warning, exit 0.
13. `check <name>`: missing → exit 1 even if the dep is optional. Unavailable → exit 0. Any detected version → exit 0 (no match check).
14. `sync-pm` only reads `deps.bun`. Skips if `bun` is absent or `version` is `"latest"`. Rewrites `package.json` by string replace, relative to the **config file directory**.
15. `env` writes `~/.zshrc` or `~/.bashrc` on Unix, and `Documents/PowerShell/Microsoft.PowerShell_profile.ps1` on Windows. Detected paths are written **unexpanded** (`$HOME/...`, not the resolved path).
16. On Windows, commands matching PowerShell markers run in `powershell.exe`. Everything else runs in `cmd.exe`. On Unix, commands run in `/bin/bash`.
17. `--os <target>` sets `CROSSDEPS_OS` for the process. Invalid targets exit 1.
18. Unknown CLI command → print usage, exit 1. No command → print usage, exit 0.
19. Public library surface is only what `@lovrozagar/crossdeps` re-exports from `index.ts`. Do not import `./env.ts` or `./exec.ts` from the package.
20. Circular `dependsOn` logs a warning and still installs every node once.

## Config file

### Discovery

The CLI looks at `process.cwd()`, not the config file's parent, to find a convention name.

Search order:

1. `--config <path>` (resolved with `path.resolve(cwd, path)`). Missing flag value → exit 1. File does not exist → exit 1.
2. First existing of:
   - `crossdeps.config.ts`
   - `crossdeps.config.js`
   - `crossdeps.config.mjs`
3. None found → exit 1:

```
No crossdeps config found. Create one of: crossdeps.config.ts, crossdeps.config.js, crossdeps.config.mjs
```

There is no `crossdeps.config.json`. There is no recursive walk up parent directories.

```bash
# convention name in cwd
bunx crossdeps install

# explicit path (any filename, must exist)
bunx crossdeps install --config ./tooling/deps.ts
bunx crossdeps check --config /abs/path/crossdeps.config.ts
```

### Export shape

The loader `import()`s the file and accepts:

1. `export default defineConfig({ deps, packageJsonPath? })`
2. `export default { deps, packageJsonPath? }`
3. Any named export whose value is an object with a `deps` field (first such value in `Object.values` order)

```ts
// preferred
export default defineConfig({ deps: { /* ... */ } })

// also valid
export const config = defineConfig({ deps: { /* ... */ } })

// also valid (no defineConfig)
export default {
	deps: {
		jq: {
			description: "JSON processor",
			required: false,
			version: "1.8.1",
			os: { all: "echo install jq" },
		},
	},
}
```

If nothing exported has `deps`:

```
Config file must export an object with a `deps` field (use defineConfig)
```

and the process exits 1.

### `defineConfig`

```ts
function defineConfig(options: {
	packageJsonPath?: string
	deps: Record<string, SystemDepConfig>
}): CrossdepsConfig
```

| Field | Type | Default | Meaning |
| --- | --- | --- | --- |
| `deps` | `Record<string, SystemDepConfig>` | required | Map of dep key → config. The key is `{{name}}`. |
| `packageJsonPath` | `string` | `"package.json"` | Path used by `sync-pm` and the `check` packageManager probe. **Relative to the config file's directory**, not `cwd`. |

```ts
import { defineConfig } from "@lovrozagar/crossdeps"

export default defineConfig({
	packageJsonPath: "./apps/web/package.json",
	deps: {
		bun: {
			description: "JavaScript runtime and package manager",
			required: true,
			version: "1.3.11",
			os: { all: 'curl -fsSL https://bun.sh/install | bash -s "bun-v{{version}}"' },
		},
	},
})
```

Calling `defineConfig` does not validate commands or OS keys. It returns `{ deps, packageJsonPath }` with the default filled in.

### `SystemDepConfig`

```ts
interface SystemDepConfig {
	description: string
	required: boolean
	version: string
	os: OsCommands
	check?: { command: string }
	dependsOn?: string[]
	env?: EnvVar[]
}
```

| Field | Required | Example | Meaning |
| --- | --- | --- | --- |
| `description` | yes | `"JSON processor"` | Printed by `install` / `check`. Not used for logic. |
| `required` | yes | `true` | If `true`, a failed `install` of this dep increments Failed and exits 1. If `false`, a failed install is counted as Skipped. Unused by single-target `check` (missing always exits 1). |
| `version` | yes | `"1.8.1"` or `"latest"` | Interpolated as `{{version}}`. `"latest"` makes `check` treat any detected version as OK, and makes `sync-pm` skip. |
| `os` | yes | `{ all: "brew install jq" }` | Per-OS install commands. See [OsCommands](#oscommands). |
| `check` | no | `{ command: "atlas version" }` | Version-check command. Default: `"{{name}} --version"`. Interpolates the same templates as `os`. |
| `dependsOn` | no | `["node", "npm"]` | Keys that must be installed **before** this one when running `install` with no name. Unknown keys are ignored. |
| `env` | no | `[{ key: "FOO", value: "bar" }]` | Written by `install` (after a successful install) and by `crossdeps env`. |

Every field together:

```ts
stripe: {
	description: "Stripe CLI",
	required: true,
	version: "1.21.0",
	dependsOn: ["brew"],
	check: { command: "stripe version" },
	os: {
		macos: "brew install stripe/stripe-cli/stripe",
		"linux-apt": "curl -s https://packages.stripe.dev/api/security/keypair/stripe-cli-gpg/public | gpg --dearmor | sudo tee /usr/share/keyrings/stripe.gpg && sudo apt-get install -y stripe",
		windows: "choco install stripe-cli --version={{version}}",
		"linux-dnf": false,
		"linux-pacman": false,
	},
	env: [{ key: "STRIPE_CLI_TELEMETRY_OPTOUT", value: "1" }],
}
```

### `OsCommands`

```ts
type OsTarget = "linux-apt" | "linux-dnf" | "linux-pacman" | "macos" | "windows"
type OsCommands = Partial<Record<OsTarget, string | false>> & { all?: string }
```

`OS_TARGETS` (exported) is `["linux-apt", "linux-dnf", "linux-pacman", "macos", "windows"]`.

Resolution for a given target:

| `os[target]` | `os.all` | Result |
| --- | --- | --- |
| string | anything | that string, interpolated |
| `false` | anything | unavailable (`null`) |
| omitted | string | `os.all`, interpolated |
| omitted | omitted | unavailable (`null`) |

```ts
// same command everywhere
os: { all: "npm install -g {{name}}@{{version}}" }

// same everywhere except Windows
os: {
	all: 'curl -fsSL https://bun.sh/install | bash -s "bun-v{{version}}"',
	windows: 'powershell -c "irm bun.sh/install.ps1|iex" && bun upgrade --to {{version}}',
}

// Linux only; macOS/Windows unavailable
os: {
	"linux-apt": "sudo apt-get install -y {{name}}",
	"linux-dnf": "sudo dnf install -y {{name}}",
	"linux-pacman": "sudo pacman -S --noconfirm {{name}}",
}

// available on Unix, explicitly not on Windows (overrides all)
os: {
	all: "cargo install {{name}} --version {{version}} --locked",
	windows: false,
}
```

Unavailable is printed as:

```
name@version — not available on linux-apt
```

It is not a failure.

### Template variables

Replaced globally (`replace(/\{\{name\}\}/g, …)`) in every `os` command and in `check.command`.

| Token | Source | Example input | Example output |
| --- | --- | --- | --- |
| `{{name}}` | dep key | key `stripe-cli` | `stripe-cli` |
| `{{version}}` | `config.version` as-is | `"22.12.0"` | `22.12.0` |
| `{{major}}` | first `.` segment of `version`, or the whole string if there is no `.` | `"22.12.0"` → `22`; `"stable"` → `stable` |
| `{{arch}}` | `process.arch === "arm64" ? "arm64" : "amd64"` | Apple Silicon → `arm64`; `x64` / `ia32` / `arm` → `amd64` |

```ts
os: {
	macos:
		"curl -fsSL https://nodejs.org/dist/v{{version}}/node-v{{version}}-darwin-{{arch}}.tar.gz -o /tmp/node.tgz",
}
check: { command: "{{name}}-{{major}} --version" }
```

There are no other tokens. `{{os}}`, `{{home}}`, and env vars are not interpolated here. Put `$HOME` / `%USERPROFILE%` in the shell command itself if you need them at install time.

### `EnvVar`

```ts
interface EnvVar {
	key: string
	value?: string
	appendToPath?: boolean
	detect?: string[]
	fallback?: string
}
```

| Field | Meaning |
| --- | --- |
| `key` | Variable name (`ANDROID_HOME`, `PATH`, …). For `appendToPath: true` the written line still uses PATH/`$env:Path`; `key` is only for logging. |
| `value` | Used when `detect` is absent or empty. Written as-is (not expanded by crossdeps). |
| `detect` | Candidate paths. First path that exists **after expansion** wins. The **original unexpanded** string is what gets written. |
| `fallback` | Used when every `detect` path is missing. Written as-is. |
| `appendToPath` | If true, append to PATH instead of `export KEY=value`. |

Path expansion for `detect` existence checks only substitutes:

| Token | Becomes |
| --- | --- |
| `$HOME` | `os.homedir()` |
| `%USERPROFILE%` | `os.homedir()` (case-insensitive) |
| `%HOME%` | `os.homedir()` (case-insensitive) |
| `$ANDROID_HOME` | `process.env.ANDROID_HOME` or `""` |
| `%ANDROID_HOME%` | `process.env.ANDROID_HOME` or `""` |

No other `$VAR` / `%VAR%` tokens are expanded.

Resolution order per `EnvVar`:

1. If `detect` is a non-empty array: first existing expanded path → return the **unexpanded** detect string. Else if `fallback` is set → return `fallback`. Else skip this var (log, do not write).
2. Else return `value` or `null`.

```ts
env: [
	{
		key: "ANDROID_HOME",
		detect: [
			"$HOME/Android/sdk",
			"$HOME/Library/Android/sdk",
			"/usr/lib/android-sdk",
		],
		fallback: "$HOME/Android/sdk",
	},
	{ key: "PATH", appendToPath: true, value: "$ANDROID_HOME/platform-tools" },
	{ key: "PATH", appendToPath: true, value: "$ANDROID_HOME/emulator" },
]
```

If `$HOME/Library/Android/sdk` exists, the profile gets `export ANDROID_HOME="$HOME/Library/Android/sdk"` (the detect string), not the resolved `/Users/you/Library/Android/sdk`.

Written blocks are wrapped in markers and replaced on the next run:

```bash
# android-sdk environment (managed by crossdeps)
export ANDROID_HOME="$HOME/Library/Android/sdk"
export PATH="$PATH:$ANDROID_HOME/platform-tools"
# end android-sdk environment
```

PowerShell 7:

```powershell
# android-sdk environment (managed by crossdeps)
$env:ANDROID_HOME = "$HOME/Library/Android/sdk"
$env:Path += ";$ANDROID_HOME/platform-tools"
# end android-sdk environment
```

Target files:

| Platform | File |
| --- | --- |
| Windows | `{homedir}/Documents/PowerShell/Microsoft.PowerShell_profile.ps1` (PowerShell 7, not Windows PowerShell 5 `WindowsPowerShell`) |
| Unix and `process.env.SHELL` contains `zsh` | `{homedir}/.zshrc` |
| Other Unix | `{homedir}/.bashrc` |

After writing, the CLI prints:

- Unix: `Run: source ~/.bashrc` (or `.zshrc`)
- Windows: `Restart PowerShell or run: . $PROFILE`

`install` writes env only after a **successful** install of that dep (not on skip, not on dry-run). `crossdeps env` writes every dep that has `env`, regardless of install state.

## CLI

```
Usage: crossdeps <command> [args]

Commands:
  install              Install all deps (auto-detect OS)
  install <name>       Install single dep
  check                Check all deps
  check <name>         Check single dep
  env                  Setup environment variables
  sync-pm              Sync packageManager field in package.json

Flags:
  --config <path>      Config file (default: crossdeps.config.ts in cwd)
  --os <target>        Force OS target (or set CROSSDEPS_OS)
  --dry-run            Print install commands without running them
```

### Invocation and flags

```bash
bunx crossdeps <command> [name] [--config <path>] [--os <target>] [--dry-run]
```

Flags may appear before or after the command. Each flag is stripped once (first occurrence).

| Flag / env | Applies to | Behavior |
| --- | --- | --- |
| `--config <path>` | all commands | Required path argument. Must exist. |
| `--os <target>` | all commands | Must be one of `OS_TARGETS`. Sets `process.env.CROSSDEPS_OS`. Missing value or unknown target → exit 1. |
| `CROSSDEPS_OS` | all commands | Same as `--os` when `--os` is not passed. |
| `--dry-run` | `install` only | Prints `dry-run: <command>` and counts the dep as installed. Silently ignored by `check` / `env` / `sync-pm`. |

```bash
bunx crossdeps install
bunx crossdeps install node
bunx crossdeps install --dry-run
bunx crossdeps install node --os windows --dry-run
bunx crossdeps --config ./deps.ts --os linux-dnf check bun
CROSSDEPS_OS=macos bunx crossdeps install --dry-run
```

Unknown command:

```bash
bunx crossdeps foo
# prints USAGE
# Unknown command: foo
# exit 1
```

No command:

```bash
bunx crossdeps
# prints USAGE
# exit 0
```

`--os` without a value:

```bash
bunx crossdeps install --os
# --os requires a target argument
# exit 1
```

`--os freebsd`:

```
Unknown OS target: freebsd. Expected one of: linux-apt, linux-dnf, linux-pacman, macos, windows
```

exit 1.

### `install`

**All deps** (`crossdeps install`):

1. Detect OS.
2. Print every dep with `[required]` / `[optional]` and mark those with no command as `(not available on <os>)`.
3. Sort with `sortByDependencies` (`dependsOn` first).
4. For each dep, run the [single-dep steps](#single-dep-steps) below.
5. Print summary: Installed / Skipped / Unavailable / Failed.
6. Exit 1 if Failed > 0.

**One dep** (`crossdeps install node`):

1. Unknown name → `Unknown dependency: node` plus `Available: …`, exit 1.
2. Run the single-dep steps. Do **not** install `dependsOn` first.
3. Exit 1 only if that dep **failed**. Unavailable and skipped exit 0.

#### Single-dep steps

1. Resolve the install command for the detected OS. None → log unavailable, return.
2. If `--dry-run` → print `dry-run: <command>`, return **installed** (no check, no exec, no env write).
3. If [version detection](#version-detection) returns any string → print `Already installed (<ver>), skipping`, return skipped.
4. Run the command. Success → print `Installed successfully`, then if `env` is non-empty run the env writer, return installed.
5. Failure → print `Installation failed`. Required → failed. Optional → skipped.

`install` does not compare the detected version to `config.version`. Any detected version skips.

### `check`

**All deps** (`crossdeps check`):

For each dep in `Object.entries` order (not topo-sorted):

| Situation | Line | Counter |
| --- | --- | --- |
| No install command on this OS | `- [required] name — not available on <os>` | none |
| Check found no version, required | `x [required] name — not installed (expected <ver>)` | Missing |
| Check found no version, optional | `x [optional] name — not installed (expected <ver>)` | Mismatch |
| Version matches (see below) | `v [required] name@<installed>` | OK |
| Version does not match | `~ [required] name@<installed> (expected <ver>)` | Mismatch |

A version **matches** if any of these is true:

- `config.version === "latest"`
- `installed === config.version`
- `config.version.includes(installed)`
- `installed.includes(config.version)`

Substring either way is intentional so `1.0.1` matches `v1.0.1-1c2aa24-canary` and the reverse.

Then, if `deps.bun` exists, `check` also probes `package.json` at `resolve(configDir, packageJsonPath)`:

| `deps.bun.version` | `packageManager` | Result |
| --- | --- | --- |
| `"latest"` | starts with `bun@` | OK line |
| `"latest"` | anything else / missing | Mismatch |
| other | exactly `bun@<version>` | OK line |
| other | anything else / missing | Mismatch |

Missing `package.json` throws (fatal, exit 1).

Summary:

```
OK: N  Mismatch: N  Missing: N
```

- Missing > 0 → `Required dependencies missing — run: crossdeps install`, exit 1.
- Mismatch > 0 → `Version mismatches found — update crossdeps.config.ts or reinstall`, exit 0.
- Else → `All system dependencies OK`, exit 0.

**One dep** (`crossdeps check bun`):

| Situation | Output | Exit |
| --- | --- | --- |
| Unknown name | `Unknown dependency: …` | 1 |
| Unavailable on this OS | `bun — not available on <os>` | 0 |
| No version detected | `bun — not installed (expected <ver>)` | 1 |
| Any version detected | `bun@<installed> (expected <ver>)` | 0 |

Single-target check does **not** apply the match table. Any parsed version is success, even if it disagrees with `config.version`. Single-target check does **not** honor `required: false` for the missing case.

### `env`

```bash
bunx crossdeps env
```

Walks every dep that has a non-empty `env` array and writes/replaces that tool's managed block. Does not install anything.

If no dep has `env`:

```
No dependencies with environment variables configured.
```

exit 0.

### `sync-pm`

```bash
bunx crossdeps sync-pm
```

Only uses `deps.bun`.

| Condition | Behavior | Exit |
| --- | --- | --- |
| No `deps.bun` | `Skipping packageManager sync — bun not in config` | 0 |
| `deps.bun.version === "latest"` | `Skipping packageManager sync — bun version is "latest"` | 0 |
| File already has `"packageManager": "bun@<version>"` | `packageManager already correct: bun@<version>` | 0 |
| File has a different `packageManager` string | String-replaces `"packageManager": "<current>"` with `"packageManager": "bun@<version>"` | 0 |
| File has no `packageManager` | Injects `,\n\t"packageManager": "bun@<version>"` immediately after `"name": "<pkg.name>"` | 0 |
| Read/parse/write throws | `Failed to sync packageManager:` + error | 0 from `cmdSyncPm` (the function returns false; `main` does not exit 1) |

`packageJsonPath` is resolved from the **directory that contains the config file**.

This is a string edit, not a JSON rewrite. It expects the current value to appear exactly as `"packageManager": "<current>"`. Unusual formatting (single quotes, extra spaces) will not match; the inject-after-name path only runs when `packageManager` is missing from the parsed object.

`sync-pm` never writes a `node@` packageManager. Only `bun@<version>`.

### Version detection

Used by `install` (skip if present) and `check`.

```
checkCmd = resolveCheckCommand(name, config)
          = interpolate(config.check?.command ?? "{{name}} --version", name, version)

binary   = first space-separated token of checkCmd
if binary is set and commandExists(binary) is false → not installed (null)

run checkCmd via execSync
stdout+stderr must match /(\d+\.\d+[\w.-]*)/
first match → that string
no match, non-zero exit, or throw → null
```

`commandExists`:

1. Strip one pair of surrounding quotes from the token.
2. If that path `existsSync`, true.
3. Else run `command -v <token>` (Unix) or `where <token>` (Windows).

Implications:

- Check command `echo android-studio` finds `echo` on PATH, prints `android-studio`, regex misses, result is **not installed**. The check output must contain something like `1.2` / `22.12.0` / `1.0.0-beta`.
- Check command `"/usr/local/bin/node" --version` works because `commandExists` accepts an existing path.
- A tool that prints only `stable` or `ok` is treated as missing.

### Exit codes

| Situation | Exit |
| --- | --- |
| `crossdeps` with no command | 0 |
| Unknown command | 1 |
| `--config` / `--os` missing value or bad `--os` | 1 |
| Config file missing or no `deps` export | 1 |
| `install` / `check` unknown dep name | 1 |
| `install` required dep command failed | 1 |
| `install` optional dep command failed | 0 (counted skipped) |
| `install` dep unavailable | 0 |
| `install --dry-run` | 0 |
| `check` all, required missing | 1 |
| `check` all, only version / packageManager mismatches | 0 |
| `check <name>` missing (even optional) | 1 |
| `check <name>` unavailable | 0 |
| `env` / `sync-pm` | 0 (sync-pm file errors are logged, not turned into exit 1) |
| Uncaught exception | 1 (`Fatal error:`) |

## OS detection

```ts
detectOs(override = process.env.CROSSDEPS_OS)
```

| Input | Result |
| --- | --- |
| `override` / `CROSSDEPS_OS` / `--os` set | `parseOsTarget(value)` or throw |
| `process.platform === "darwin"` | `macos` |
| `process.platform === "win32"` | `windows` |
| Linux and `apt-get` on PATH | `linux-apt` |
| Linux and `dnf` on PATH | `linux-dnf` |
| Linux and `pacman` on PATH | `linux-pacman` |
| Linux and none of those | `linux-apt` (default) |

`--os` is implemented by assigning `process.env.CROSSDEPS_OS` before any detect call.

```bash
# force the Windows command set while sitting on Linux (does not boot Windows)
bunx crossdeps install --os windows --dry-run
```

`--os` / `CROSSDEPS_OS` do **not** change `process.platform`. Env file paths and the PowerShell-vs-cmd router still follow the real kernel. Use `--os` to select which `os.*` command string is resolved, not to emulate another OS's shell.

## How install commands are executed

Unix (`linux-*`, and also when you force `--os windows` from Linux):

```
execSync(command, { shell: "/bin/bash", stdio: "inherit" })
```

Multi-line scripts and `&&` / pipes work because the shell is bash.

Windows, **if** the command matches any PowerShell marker:

```
powershell.exe -NoProfile -NonInteractive -Command <command>
```

Markers (any one is enough):

| Marker | Example that trips it |
| --- | --- |
| `\birm\b` | `irm bun.sh/install.ps1 \| iex` |
| `\biex\b` | same |
| `$env:` | `Invoke-WebRequest … -OutFile "$env:LOCALAPPDATA\bin\atlas.exe"` |
| `Invoke-WebRequest` | official Windows binary downloads |
| `Invoke-Expression` | |
| `New-Item` | `New-Item -ItemType Directory -Force …` |
| `Test-Path` | |
| `Out-Null` | `… \| Out-Null` |
| `Get-Command` | |
| `$LASTEXITCODE` | |

Windows, otherwise:

```
execSync(command, { shell: process.env.ComSpec || "cmd.exe", stdio: "inherit" })
```

so `choco install nginx || choco install nginx` and `bun -e "…"` keep working. `||` is **invalid** in PowerShell; do not add `$env:` / `Out-Null` to a cmd-oriented command or it will be routed to PowerShell and break.

`stdio: "inherit"` means the user sees the installer output live.

## Library API

This is the entire public surface (`src/index.ts`):

```ts
export type { CrossdepsConfig, EnvVar, OsCommands, OsTarget, SystemDepConfig }
export { defineConfig, interpolate, OS_TARGETS, resolveCheckCommand, resolveOsCommand }
export { sortByDependencies }
export { commandExists, commandLookup, detectOs, detectOsFromPlatform, parseOsTarget }
```

### `OS_TARGETS`

```ts
const OS_TARGETS = ["linux-apt", "linux-dnf", "linux-pacman", "macos", "windows"] as const
type OsTarget = (typeof OS_TARGETS)[number]
```

### `defineConfig(options)`

See [defineConfig](#defineconfig). Returns the same object with `packageJsonPath` defaulted.

### `interpolate(template, name, version)`

```ts
interpolate("{{name}}@{{version}} ({{major}}) {{arch}}", "node", "22.12.0")
// "node@22.12.0 (22) arm64"  or  "… amd64"
interpolate("{{major}}", "rust", "stable")
// "stable"
```

### `resolveOsCommand(name, config, target)`

```ts
resolveOsCommand("git", {
	description: "git",
	required: true,
	version: "2.39.5",
	os: { all: "echo all", "linux-apt": "apt install git={{version}}" },
}, "linux-apt")
// "apt install git=2.39.5"

resolveOsCommand("flux", { /* os: { all: "…", windows: false } */ }, "windows")
// null
```

### `resolveCheckCommand(name, config)`

```ts
resolveCheckCommand("node", { /* no check */ })
// "node --version"

resolveCheckCommand("atlas", { check: { command: "{{name}} version {{version}}" }, version: "1.2.3", /* … */ })
// "atlas version 1.2.3"
```

### `sortByDependencies(entries)`

```ts
sortByDependencies([
	["npm", { dependsOn: ["node"], /* … */ }],
	["node", { /* … */ }],
])
// [["node", …], ["npm", …]]
```

- Walks `dependsOn` depth-first.
- Names not present in the input set are ignored.
- Cycles: `console.warn("Circular dependency detected involving: <name>")`, then both nodes still appear once.

### `parseOsTarget(value)`

```ts
parseOsTarget("macos")        // "macos"
parseOsTarget("freebsd")      // throws Error("Unknown OS target: freebsd. Expected one of: …")
```

### `detectOsFromPlatform(platform, override?)`

```ts
detectOsFromPlatform("darwin")                         // "macos"
detectOsFromPlatform("win32")                          // "windows"
detectOsFromPlatform("linux", "linux-dnf")             // "linux-dnf"
detectOsFromPlatform("linux")                          // linux-apt / linux-dnf / linux-pacman / linux-apt default
```

### `detectOs(override?)`

`detectOsFromPlatform(process.platform, override ?? process.env.CROSSDEPS_OS)`.

### `commandLookup(command, platform = process.platform)`

```ts
commandLookup("bun", "win32")   // "where bun >nul 2>&1"
commandLookup("bun", "linux")   // "command -v bun >/dev/null 2>&1"
commandLookup("bun", "darwin")  // "command -v bun >/dev/null 2>&1"
```

### `commandExists(command)`

`true` if the (optionally quoted) path exists on disk, or if `commandLookup` succeeds.

```ts
commandExists("sh")                 // true on Unix
commandExists("/usr/local/bin/node")
commandExists('"/usr/local/bin/node"')
commandExists("crossdeps-not-real") // false
```

## Worked examples

### Optional dep

```ts
jq: {
	description: "JSON processor",
	required: false,
	version: "1.8.1",
	os: {
		macos: "brew install jq",
		"linux-apt": "sudo apt-get install -y jq",
		windows: "choco install jq --version={{version}}",
	},
}
```

If the command fails, `install` continues. `check` reports a mismatch, exit 0. `check jq` with jq missing still exits 1.

### Custom check command

```ts
atlas: {
	description: "Database schema management tool",
	required: true,
	version: "v1.0.1-1c2aa24-canary",
	check: { command: "atlas version" },
	os: {
		all: "curl -sSf https://atlasgo.sh | sh -s -- --version {{version}}",
		windows:
			'New-Item -ItemType Directory -Force "$env:LOCALAPPDATA\\bin" | Out-Null; Invoke-WebRequest -UseBasicParsing https://release.ariga.io/atlas/atlas-windows-amd64-latest.exe -OutFile "$env:LOCALAPPDATA\\bin\\atlas.exe"',
	},
}
```

Default `atlas --version` would be wrong. `check.command` must still print a `digits.digits` token or install will never skip.

### `dependsOn`

```ts
node: { /* … */ version: "22.12.0", os: { all: "…" } },
npm: {
	description: "npm CLI",
	required: true,
	version: "10.9.0",
	dependsOn: ["node"],
	os: { all: "npm install -g npm@{{version}}" },
},
claude: {
	description: "Claude Code CLI",
	required: true,
	version: "latest",
	dependsOn: ["npm"],
	os: { all: "npm install -g @anthropic-ai/claude-code@{{version}}" },
},
```

`crossdeps install` order: `node` → `npm` → `claude`.

`crossdeps install claude` runs only the claude command. Install `node` and `npm` first, or run the full `install`.

### `version: "latest"`

```ts
claude: {
	description: "Claude Code CLI",
	required: true,
	version: "latest",
	os: { all: "npm install -g @anthropic-ai/claude-code@{{version}}" },
}
```

- Install command becomes `…@latest`.
- If any version is already detected, install skips (will not refresh to a newer latest).
- `check` counts any detected version as OK.
- If this were `bun`, `sync-pm` would skip.

### Env detect + PATH append

```ts
"android-sdk": {
	description: "Android SDK",
	required: true,
	version: "35.0.0",
	check: { command: "adb --version" },
	os: { macos: "brew install --cask android-commandlinetools" },
	env: [
		{
			key: "ANDROID_HOME",
			detect: ["$HOME/Library/Android/sdk", "$HOME/Android/sdk"],
			fallback: "$HOME/Library/Android/sdk",
		},
		{ key: "PATH", appendToPath: true, value: "$ANDROID_HOME/platform-tools" },
	],
}
```

```bash
bunx crossdeps env
# writes ~/.zshrc or ~/.bashrc
source ~/.zshrc
```

### Unavailable on one OS

```ts
flux: {
	description: "InfluxDB CLI",
	required: false,
	version: "2.7.11",
	os: {
		macos: "brew install influxdb",
		windows: 'Invoke-WebRequest … -OutFile "$env:LOCALAPPDATA\\bin\\flux.exe"',
		"linux-apt": false,
		"linux-dnf": false,
		"linux-pacman": false,
	},
}
```

On Ubuntu: `flux@2.7.11 — not available on linux-apt`. Install and check succeed.

### Dry-run on another OS command set

```bash
bunx crossdeps install --os windows --dry-run
```

Prints the Windows command strings. Does not run them. Does not write env. Does not skip already-installed deps.

### Named export and custom config path

```ts
// tooling/system-deps.ts
import { defineConfig } from "@lovrozagar/crossdeps"
export const systemDeps = defineConfig({
	packageJsonPath: "../package.json",
	deps: { bun: { /* … */ } },
})
```

```bash
bunx crossdeps install --config ./tooling/system-deps.ts
```

`sync-pm` will edit `tooling/../package.json`.

### Library-only use (no CLI)

```ts
import {
	defineConfig,
	detectOs,
	interpolate,
	resolveCheckCommand,
	resolveOsCommand,
	sortByDependencies,
} from "@lovrozagar/crossdeps"

const config = defineConfig({
	deps: {
		jq: {
			description: "JSON processor",
			required: false,
			version: "1.8.1",
			os: { all: "brew install jq" },
		},
	},
})

const os = detectOs()
const command = resolveOsCommand("jq", config.deps.jq, os)
const check = resolveCheckCommand("jq", config.deps.jq)
const order = sortByDependencies(Object.entries(config.deps))
```

## package.json integration

```json
{
	"scripts": {
		"setup:deps": "crossdeps install",
		"setup:deps:check": "crossdeps check",
		"setup:deps:env": "crossdeps env",
		"setup:deps:sync-pm": "crossdeps sync-pm"
	}
}
```

Onboarding:

```bash
npm install          # or bun install
npm run setup:deps
npm run setup:deps:env
npm run setup:deps:sync-pm
```

`sync-pm` keeps Corepack / package-manager pinning aligned with `deps.bun.version`.

## Gotchas

| Trap | What actually happens |
| --- | --- |
| `install <name>` of a dep with `dependsOn` | Dependents are **not** installed. |
| Tool already installed at the wrong version | `install` skips. Change the check, uninstall manually, or live with `check` mismatch. |
| `--dry-run` to "see what would skip" | Dry-run never checks installed versions. Everything with a command is "installed". |
| Check command that prints no `N.N` | Treated as not installed. Install will run every time. |
| `check <optional-dep>` when missing | Exit 1. `required: false` only changes all-deps `install` / `check`. |
| `{{arch}}` on `x64` | `amd64`, not `x64`. |
| Linux without apt/dnf/pacman | Detected as `linux-apt`. |
| `os.windows` uses `\|\|` plus `$env:` | Routed to PowerShell; `\|\|` is wrong. Keep cmd syntax and PowerShell syntax in separate commands. |
| `env.detect` writes the resolved path | No. It writes the template (`$HOME/...`). |
| Extra env tokens in `detect` (`$XDG_DATA_HOME`) | Not expanded. Existence check looks for a literal `$XDG_DATA_HOME/…` path. |
| `sync-pm` for node | Not implemented. Only `deps.bun`. |
| `packageJsonPath` relative to cwd | No. Relative to the config file directory. |
| Import `@lovrozagar/crossdeps/env` | Not exported. Use the CLI or copy the idea. |
| JSON config | Not supported. |
| Walking parent dirs for config | Not supported. Run from the directory that contains the file, or pass `--config`. |

## Releases

GitHub Releases match npm versions. Pushing a tag `vX.Y.Z` (same as this `package.json` `version`) runs the repo [`.github/workflows/release.yml`](https://github.com/lovrozagar/crossdeps/blob/main/.github/workflows/release.yml): test, `npm publish` via trusted publishing, GitHub Packages, then a GitHub Release.

Configure the trusted publisher once on this package (Settings → Trusted Publisher → GitHub Actions): repository `lovrozagar/crossdeps`, workflow `release.yml`, no environment, allow npm publish. Do not put an npm token in GitHub secrets.

## Changelog

See [CHANGELOG.md](./CHANGELOG.md).

## License

MIT

