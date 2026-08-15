# crossdeps

Cross-platform system dependency manager. Define deps in a config file, run `crossdeps install`.

This repo is the source of the `@scriptgun/crossdeps` npm package.

## Layout

```
packages/core     published package (@scriptgun/crossdeps)
examples/*        consumer apps used while iterating
e2e/app           consumer that imports the package over workspace:*
e2e/docker        local OS matrix (linux distros + windows/macos command paths)
```

`packages/core` is the only published workspace. Examples and `e2e/app` are the consumer proof — they import `@scriptgun/crossdeps` over `workspace:*` the way a real app would.

## Develop

Requires [Bun](https://bun.sh) 1.3+.

```bash
bun install
bun run test                 # core unit tests (default CI)
bun run test:consumers       # e2e-app imports and runs the CLI like a real app
bun run test:e2e:docker      # install matrix in Docker (needs Docker)
bun run typecheck            # core src (TypeScript 7)
bun run typecheck:consumers  # examples + e2e-app
```

CI `test` runs on `ubuntu-latest`, `windows-latest`, and `macos-latest` — those are real Windows and macOS machines. Locally, `test:e2e:docker` covers Linux distros plus Windows/macOS command paths:

| Service | What actually runs |
| --- | --- |
| `linux-apt` | Debian + real `detectOs()` + real `jq` download |
| `linux-dnf` | Fedora + real `detectOs()` + real `jq` download |
| `linux-pacman` | Arch + real `detectOs()` + real `jq` download |
| `windows` | Debian with `CROSSDEPS_OS=windows` — selects the Windows command, does not boot Windows |
| `macos` | Debian with `CROSSDEPS_OS=macos` — selects the macOS command, does not boot macOS |

Docker cannot run macOS, and Windows containers need a Windows host. Real Windows and macOS execution is the GitHub Actions matrix.

Single target:

```bash
bash e2e/docker/run.sh linux-apt
bash e2e/docker/run.sh windows macos
```

## Package

Consumers import `defineConfig` and the library helpers, then run the `crossdeps` CLI.

```ts
import { defineConfig } from "@scriptgun/crossdeps"
```

```bash
npx crossdeps install
npx crossdeps check
```

## License

MIT
