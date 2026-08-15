# @scriptgun/crossdeps

Define system dependencies in a config file. Install them on any OS with one command.

This repo is the source of the [`@scriptgun/crossdeps`](https://www.npmjs.com/package/@scriptgun/crossdeps) npm package.

## Table of contents

- [Install](#install)
- [Quick start](#quick-start)
- [CLI](#cli)
- [package.json integration](#packagejson-integration)
- [Config](#config)
  - [`defineConfig`](#defineconfig)
  - [`SystemDepConfig`](#systemdepconfig)
  - [`OsCommands`](#oscommands)
  - [Template variables](#template-variables)
  - [`EnvVar`](#envvar)
- [Library API](#library-api)
- [OS detection](#os-detection)
- [Repository layout](#repository-layout)
- [Develop](#develop)
- [CI](#ci)
- [Changelog](#changelog)
- [License](#license)

## Install

```bash
npm install -D @scriptgun/crossdeps
# or
bun add -D @scriptgun/crossdeps
```

Requires [Bun](https://bun.sh) to run the CLI (`#!/usr/bin/env bun`).

## Quick start

Create `crossdeps.config.ts` in the project root:

```ts
import { defineConfig } from "@scriptgun/crossdeps"

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
```

A larger real catalog (24 deps) lives in [`examples/consumer/crossdeps.config.ts`](examples/consumer/crossdeps.config.ts).

## CLI

```bash
crossdeps install              # all deps, current OS, respects dependsOn
crossdeps install node         # one dep
crossdeps check                # all deps
crossdeps check bun            # one dep
crossdeps env                  # write env blocks for deps that define env
crossdeps sync-pm              # sync package.json packageManager from the bun dep

crossdeps install --config ./my-config.ts
crossdeps install --os windows           # or CROSSDEPS_OS=windows
crossdeps install --dry-run              # print commands, do not run them
```

Install already-present deps are skipped. Required deps that fail make `install` / `check` exit 1.

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

Onboarding is then `npm install && npm run setup:deps`.

`sync-pm` rewrites `packageManager` to `bun@<version>` from the `bun` entry in the config.

## Config

### `defineConfig`

| Field             | Type                              | Description                                                   |
| ----------------- | --------------------------------- | ------------------------------------------------------------- |
| `packageJsonPath` | `string?`                         | Path to package.json for `sync-pm`. Default: `"package.json"` |
| `deps`            | `Record<string, SystemDepConfig>` | Map of dependency name to config                              |

### `SystemDepConfig`

| Field         | Type                   | Description                                                   |
| ------------- | ---------------------- | ------------------------------------------------------------- |
| `description` | `string`               | Human-readable description                                    |
| `required`    | `boolean`              | Whether installation failure should exit with error           |
| `version`     | `string`               | Version string (or `"latest"`)                                |
| `os`          | `OsCommands`           | Per-OS install commands                                       |
| `check`       | `{ command: string }?` | Custom version check command. Default: `"{{name}} --version"` |
| `dependsOn`   | `string[]?`            | Deps that must be installed first (by key name)               |
| `env`         | `EnvVar[]?`            | Environment variables to configure after install              |

### `OsCommands`

Supported targets: `macos`, `linux-apt`, `linux-dnf`, `linux-pacman`, `windows`.

- Specific OS keys for platform-specific commands
- `"all"` when the command is the same everywhere
- A per-OS key overrides `"all"`
- `false` marks that OS explicitly unavailable
- Omit a key (and omit `"all"`) to mark it unavailable

### Template variables

Available in `os` commands and `check.command`:

| Variable      | Example           | Description                      |
| ------------- | ----------------- | -------------------------------- |
| `{{name}}`    | `node`            | Dependency key name              |
| `{{version}}` | `22.12.0`         | Full version string              |
| `{{major}}`   | `22`              | Major version number             |
| `{{arch}}`    | `arm64` / `amd64` | CPU architecture (auto-detected) |

### `EnvVar`

| Field          | Type        | Description                                        |
| -------------- | ----------- | -------------------------------------------------- |
| `key`          | `string`    | Environment variable name                          |
| `value`        | `string?`   | Static value                                       |
| `appendToPath` | `boolean?`  | If true, appends to PATH                           |
| `detect`       | `string[]?` | Auto-detect from these paths (first existing wins) |
| `fallback`     | `string?`   | Fallback if detect finds nothing                   |

`crossdeps env` writes `~/.bashrc` or `~/.zshrc` on Unix, and the PowerShell 7 profile on Windows.

## Library API

```ts
import {
	defineConfig,
	interpolate,
	resolveOsCommand,
	resolveCheckCommand,
	detectOs,
	commandExists,
	sortByDependencies,
} from "@scriptgun/crossdeps"
```

## OS detection

Auto-detects `macos`, `linux-apt`, `linux-dnf`, `linux-pacman`, or `windows`.

Linux distro is inferred from `apt-get` / `dnf` / `pacman`. Override with `--os <target>` or `CROSSDEPS_OS`.

On Windows, PowerShell-looking commands (`irm`, `$env:`, `Invoke-WebRequest`, …) run in PowerShell. Everything else runs in `cmd.exe` so `choco` and `bun -e` keep working.

## Repository layout

```
packages/core           published package (@scriptgun/crossdeps)
examples/consumer       a real consumer: defineConfig + the 24-dep catalog
e2e/app                 isolated fixtures + CLI / catalog tests
e2e/docker              Linux distro matrix (apt / dnf / pacman)
e2e/catalog-install.ts  real install of examples/consumer on this machine
```

`examples/` is what a user project looks like. It is not a test runner. `e2e/` is how this repo proves the package: fixture configs, `bun test`, Docker, and the catalog-install script. Tests import `@scriptgun/crossdeps` over `workspace:*` the same way a published consumer would.

`packages/core` is the only published workspace.

## Develop

Requires [Bun](https://bun.sh) 1.3+.

```bash
bun install
bun run test                 # core unit tests
bun run test:consumers       # e2e-app + catalog dry-run
bun run test:e2e:docker      # OS matrix in Docker
bun run test:catalog-install # real catalog install on this machine
bun run typecheck
bun run typecheck:consumers
```

## CI

GitHub Actions (`.github/workflows/ci.yml`) on `main` and pull requests:

| Job | What it runs |
| --- | --- |
| `test` | unit + consumer tests on Ubuntu, macOS, Windows |
| `docker` | apt / dnf / pacman install-path tests |
| `catalog-install` | real `crossdeps install` of the 24-dep catalog on those three OSes |

There is no auto-publish workflow. npm releases are manual from `packages/core`.

## Changelog

See [`packages/core/CHANGELOG.md`](packages/core/CHANGELOG.md).

## License

MIT
