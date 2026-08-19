# Changelog

## 0.2.0 - 2026-08-19

- `install --upgrade` re-runs the install command when the detected version does not match the pin (`latest` still matches any parsed version)
- `install` without `--upgrade` still skips a present binary, but mismatch now prints the resolved path and `run: crossdeps install <name> --upgrade`
- After `--upgrade`, if PATH still reports the old version, print a shadow warning (brew/nvm/fnm winning over the installer)
- `check` mismatch lines include the resolved binary path
- Export `versionsMatch` and `whichBinary`

## 0.1.0 - 2026-08-15

First public release of `@lovrozagar/crossdeps`.

- Config-driven system dependency manager (`install`, `check`, `env`, `sync-pm`)
- CLI flags: `--config`, `--os`, `--dry-run`
- OS targets: macOS, Linux (apt / dnf / pacman), Windows
- Windows: PowerShell for `irm` / `$env:` commands, `cmd.exe` otherwise
- `env` writes `~/.bashrc` / `~/.zshrc` on Unix and the PowerShell 7 profile on Windows
- Catalog proven on GitHub-hosted Ubuntu, macOS, and Windows (24/24)
