# Changelog

## Unreleased

- Standalone monorepo: published package in `packages/core`, consumers in `examples/` and `e2e/`
- CLI flags: `--os`, `--dry-run`
- Windows: PowerShell for `irm` / `$env:` commands, `cmd.exe` otherwise
- `env` writes the PowerShell 7 profile on Windows
- Catalog proven on GitHub-hosted Ubuntu, macOS, and Windows (24/24)

## 0.1.0 - 2026-02-09

- Initial public release
- Config-driven system dependency management
- Cross-platform support (macOS, Linux)
- Commands: install, check, env, sync-pm
