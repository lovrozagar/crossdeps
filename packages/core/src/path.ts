/**
 * Interactive-TTY PATH snapshot for `check`.
 *
 * `install` keeps using this process PATH. `check --here` does too.
 */

import { execFileSync } from "node:child_process"
import { basename } from "node:path"

export type PathSource = "tty" | "process"

export interface PathSnapshot {
	path: string
	source: PathSource
}

export type ExecFile = (file: string, args: readonly string[], env: NodeJS.ProcessEnv) => string

export const TTY_PATH_FALLBACK_WARN = "could not read interactive-shell PATH; using this process PATH"

export const PATH_PRINTF = 'printf %s "$PATH"'
export const UNIX_BASH_PATH_ARGS = ["-ic", PATH_PRINTF] as const
export const UNIX_ZSH_PATH_ARGS = ["-lic", PATH_PRINTF] as const
export const WINDOWS_TTY_PATH_ARGS = ["-NoLogo", "-NonInteractive", "-Command", "$env:Path"] as const

const defaultExecFile: ExecFile = (file, args, env) =>
	execFileSync(file, [...args], {
		encoding: "utf-8",
		env,
		stdio: ["ignore", "pipe", "pipe"],
		timeout: 30_000,
	})

export function processPath(env: NodeJS.ProcessEnv = process.env): string {
	return env.PATH ?? env.Path ?? ""
}

export function pathEnv(searchPath: string, base: NodeJS.ProcessEnv = process.env): NodeJS.ProcessEnv {
	return { ...base, PATH: searchPath, Path: searchPath }
}

/** HOME/USER/SHELL, locale, TERM, Windows profile roots. Not PATH. Not leftover toolchain exports. */
export const TTY_ENV_KEEP = [
	"ComSpec",
	"COMSPEC",
	"HOME",
	"HOMEDRIVE",
	"HOMEPATH",
	"HOMESHARE",
	"LANG",
	"LANGUAGE",
	"LOGNAME",
	"PATHEXT",
	"SHELL",
	"SYSTEMROOT",
	"SystemRoot",
	"TERM",
	"USER",
	"USERPROFILE",
	"WINDIR",
	"windir",
] as const

export function isTtyEnvKeep(key: string): boolean {
	if (key.startsWith("LC_")) return true
	return (TTY_ENV_KEEP as readonly string[]).includes(key)
}

export function unixStockPath(): string {
	return "/usr/local/bin:/usr/bin:/bin"
}

export function windowsStockPath(env: NodeJS.ProcessEnv): string {
	const root = env.SYSTEMROOT || env.SystemRoot || "C:\\Windows"
	return `${root}\\System32;${root}`
}

/** Env for the TTY PATH spawn. Interactive rc applies the default toolchain on a stock PATH. */
export function ttySnapshotEnv(env: NodeJS.ProcessEnv, platform: NodeJS.Platform): NodeJS.ProcessEnv {
	const out: NodeJS.ProcessEnv = {}
	for (const [key, value] of Object.entries(env)) {
		if (value === undefined) continue
		if (isTtyEnvKeep(key)) out[key] = value
	}
	const stock = platform === "win32" ? windowsStockPath(env) : unixStockPath()
	out.PATH = stock
	out.Path = stock
	return out
}

/** bash: interactive (`-ic`). zsh: login+interactive (`-lic`). Other Unix shells: `-ic`. */
export function unixPathSnapshotArgs(shell: string): readonly [string, string] {
	const name = basename(shell).replace(/\.exe$/i, "")
	if (name === "zsh") return ["-lic", PATH_PRINTF]
	return ["-ic", PATH_PRINTF]
}

/** Interactive rc may print MOTD on stdout; the PATH line is last. */
export function parsePathOutput(out: string): string {
	const lines = out.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n")
	for (let i = lines.length - 1; i >= 0; i--) {
		const line = lines[i]?.trim()
		if (line) return line
	}
	return ""
}

/**
 * Snapshot PATH from a new interactive TTY once.
 * Unix bash: `$SHELL -ic` with stdin `/dev/null` (not login-only `-lc`).
 * Unix zsh: `$SHELL -lic` (`.zprofile` + `.zshrc`).
 * Windows: `powershell.exe` with profile (`$env:Path`), not `-NoProfile`.
 * Spawn env is a keep-list (HOME/SHELL/locale/TERM) plus a stock PATH so leftover
 * parent PATH and toolchain exports cannot pin a stale binary.
 * Spawn failure or empty PATH → this process PATH (`source: "process"`).
 */
export function snapshotTtyPath(
	platform: NodeJS.Platform = process.platform,
	env: NodeJS.ProcessEnv = process.env,
	execFile: ExecFile = defaultExecFile,
): PathSnapshot {
	try {
		const childEnv = ttySnapshotEnv(env, platform)
		const raw =
			platform === "win32"
				? execFile("powershell.exe", WINDOWS_TTY_PATH_ARGS, childEnv)
				: execFile(env.SHELL || "/bin/sh", unixPathSnapshotArgs(env.SHELL || "/bin/sh"), childEnv)
		const path = parsePathOutput(raw)
		if (path) return { path, source: "tty" }
	} catch {
		/* fall through */
	}
	return { path: processPath(env), source: "process" }
}
