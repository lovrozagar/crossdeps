/**
 * Login-shell PATH snapshot for `check`.
 *
 * `install` keeps using this process PATH. `check --here` does too.
 */

import { execFileSync } from "node:child_process"

export type PathSource = "login" | "process"

export interface PathSnapshot {
	path: string
	source: PathSource
}

export type ExecFile = (file: string, args: readonly string[], env: NodeJS.ProcessEnv) => string

export const LOGIN_PATH_FALLBACK_WARN = "could not read login-shell PATH; using this process PATH"

export const UNIX_LOGIN_PATH_ARGS = ["-lc", 'printf %s "$PATH"'] as const
export const WINDOWS_LOGIN_PATH_ARGS = ["-NoLogo", "-NonInteractive", "-Command", "$env:Path"] as const

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

/**
 * Snapshot PATH from a login shell once.
 * Unix: `$SHELL -lc 'printf %s "$PATH"'`.
 * Windows: `powershell.exe` with profile (`$env:Path`), not `-NoProfile`.
 * Spawn failure or empty PATH → this process PATH (`source: "process"`).
 */
export function snapshotLoginPath(
	platform: NodeJS.Platform = process.platform,
	env: NodeJS.ProcessEnv = process.env,
	execFile: ExecFile = defaultExecFile,
): PathSnapshot {
	try {
		const raw =
			platform === "win32"
				? execFile("powershell.exe", WINDOWS_LOGIN_PATH_ARGS, env)
				: execFile(env.SHELL || "/bin/sh", UNIX_LOGIN_PATH_ARGS, env)
		const path = raw.trim()
		if (path) return { path, source: "login" }
	} catch {
		/* fall through */
	}
	return { path: processPath(env), source: "process" }
}
