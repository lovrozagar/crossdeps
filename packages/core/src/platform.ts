/**
 * OS detection for system dependency installation
 */

import { execSync } from "node:child_process"
import { existsSync } from "node:fs"
import { OS_TARGETS, type OsTarget } from "./config.ts"

export function commandLookup(command: string, platform: NodeJS.Platform = process.platform): string {
	return platform === "win32" ? `where ${command} >nul 2>&1` : `command -v ${command} >/dev/null 2>&1`
}

export function commandExists(command: string): boolean {
	const unquoted = command.replace(/^["']|["']$/g, "")
	if (existsSync(unquoted)) return true
	try {
		execSync(commandLookup(command))
		return true
	} catch {
		return false
	}
}

export function parseOsTarget(value: string): OsTarget {
	if ((OS_TARGETS as readonly string[]).includes(value)) return value as OsTarget
	throw new Error(`Unknown OS target: ${value}. Expected one of: ${OS_TARGETS.join(", ")}`)
}

function detectLinuxDistro(): OsTarget {
	if (commandExists("apt-get")) return "linux-apt"
	if (commandExists("dnf")) return "linux-dnf"
	if (commandExists("pacman")) return "linux-pacman"
	/* default to apt if nothing detected */
	return "linux-apt"
}

export function detectOsFromPlatform(
	platform: NodeJS.Platform,
	override: string | undefined = process.env.CROSSDEPS_OS,
): OsTarget {
	if (override) return parseOsTarget(override)
	if (platform === "darwin") return "macos"
	if (platform === "win32") return "windows"
	return detectLinuxDistro()
}

/**
 * Detect the current OS target.
 * `override` (or `CROSSDEPS_OS`) forces a target — used by tests and `--os`.
 */
export function detectOs(override: string | undefined = process.env.CROSSDEPS_OS): OsTarget {
	return detectOsFromPlatform(process.platform, override)
}
