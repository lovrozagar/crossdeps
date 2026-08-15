# @scriptgun/crossdeps

Cross-platform system dependency manager. Define your project's system dependencies in a config file, then install them on any OS with a single command.

## Install

```bash
npm install -D @scriptgun/crossdeps
# or
bun add -D @scriptgun/crossdeps
```

## Quick Start

Create `crossdeps.config.ts` in your project root:

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
			version: "1.3.5",
			os: {
				all: 'curl -fsSL https://bun.sh/install | bash -s "bun-v{{version}}"',
				windows: 'powershell -c "irm bun.sh/install.ps1|iex" && bun upgrade --to {{version}}',
			},
		},
	},
})
```

## CLI Usage

```bash
# Install all dependencies
npx crossdeps install

# Install a single dependency
npx crossdeps install node

# Check installed versions
npx crossdeps check

# Check a single dependency
npx crossdeps check bun

# Setup environment variables (for deps that define env)
npx crossdeps env

# Sync packageManager field in package.json (for bun)
npx crossdeps sync-pm

# Use a custom config path
npx crossdeps install --config ./my-config.ts

# Force an OS target (also: CROSSDEPS_OS=windows)
npx crossdeps install --os windows

# Print commands without installing
npx crossdeps install --dry-run
```

## Package.json Integration

Add scripts to your `package.json` so team members can run setup with a single command:

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

Then onboarding is just:

```bash
npm install
npm run setup:deps
```

The `sync-pm` command updates the `packageManager` field in your `package.json` to match the version defined in your config — useful for keeping `bun` or `node` version in sync across the team.

## Config Reference

### `defineConfig(options)`

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

Per-OS install commands. Supported targets: `macos`, `linux-apt`, `linux-dnf`, `linux-pacman`, `windows`.

- Use specific OS keys for platform-specific commands
- Use `"all"` for commands identical across all platforms
- Per-OS keys override `"all"` when both are present
- Set an OS key to `false` to mark explicitly unavailable

### Template Variables

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

## OS Detection

Auto-detects: `macos`, `linux-apt`, `linux-dnf`, `linux-pacman`, `windows`.

Linux distro detection uses package manager availability (`apt-get`, `dnf`, `pacman`).

## Changelog

See [CHANGELOG.md](./CHANGELOG.md) for release history.

## License

MIT
