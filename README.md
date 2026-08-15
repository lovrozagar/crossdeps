# @scriptgun/crossdeps

Define system dependencies in a config file. Install them on any OS with one command.

This repo is the source of the [`@scriptgun/crossdeps`](https://www.npmjs.com/package/@scriptgun/crossdeps) npm package.

## Start

```bash
bun add -D @scriptgun/crossdeps
```

```ts
import { defineConfig } from "@scriptgun/crossdeps"

export default defineConfig({
	deps: {
		bun: {
			description: "JavaScript runtime and package manager",
			os: {
				all: 'curl -fsSL https://bun.sh/install | bash -s "bun-v{{version}}"',
				windows: 'powershell -c "irm bun.sh/install.ps1|iex" && bun upgrade --to {{version}}',
			},
			required: true,
			version: "1.3.11",
		},
		git: {
			description: "Version control system",
			os: {
				"linux-apt": "sudo apt-get install -y git",
				macos: "brew install git",
				windows: "choco install git --version={{version}}",
			},
			required: true,
			version: "2.39.5",
		},
	},
})
```

```bash
bunx crossdeps install
bunx crossdeps check
bunx crossdeps install --dry-run
```

Full CLI, config reference, and library API: [`packages/core/README.md`](packages/core/README.md).

## Layout

```
packages/core     published package (@scriptgun/crossdeps)
examples/consumer sample app + the 24-dep catalog
e2e/app           consumer tests over workspace:*
e2e/docker        Linux distro matrix (apt / dnf / pacman)
e2e/catalog-install.ts   real install of the catalog on this machine
```

`packages/core` is the only published workspace. Consumers import `@scriptgun/crossdeps` over `workspace:*`.

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

## License

MIT
