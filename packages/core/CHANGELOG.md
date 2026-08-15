# Changelog

## 0.1.0 - 2026-08-15

First public release of `@lovrozagar/crossdeps`.

- Config-driven system dependency manager (`install`, `check`, `env`, `sync-pm`)
- CLI flags: `--config`, `--os`, `--dry-run`
- OS targets: macOS, Linux (apt / dnf / pacman), Windows
- Windows: PowerShell for `irm` / `$env:` commands, `cmd.exe` otherwise
- `env` writes `~/.bashrc` / `~/.zshrc` on Unix and the PowerShell 7 profile on Windows
- Catalog proven on GitHub-hosted Ubuntu, macOS, and Windows (24/24)
