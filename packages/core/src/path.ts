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
 * Spawn failure or empty PATH → this process PATH (`source: "process"`).
 */
export function snapshotTtyPath(
	platform: NodeJS.Platform = process.platform,
	env: NodeJS.ProcessEnv = process.env,
	execFile: ExecFile = defaultExecFile,
): PathSnapshot {
	try {
		const raw =
			platform === "win32"
				? execFile("powershell.exe", WINDOWS_TTY_PATH_ARGS, env)
				: execFile(env.SHELL || "/bin/sh", unixPathSnapshotArgs(env.SHELL || "/bin/sh"), env)
		const path = parsePathOutput(raw)
		if (path) return { path, source: "tty" }
	} catch {
		/* fall through */
	}
	return { path: processPath(env), source: "process" }
}
