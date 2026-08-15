#!/usr/bin/env bun
/**
 * crossdeps CLI — cross-platform system dependency manager.
 *
 * Usage:
 *   crossdeps install              Install all deps (auto-detect OS, respects depends order)
 *   crossdeps install <name>       Install single dep
 *   crossdeps check                Check all deps
 *   crossdeps check <name>         Check single dep
 *   crossdeps env                  Setup environment variables
 *   crossdeps sync-pm              Sync packageManager field
 */

import { execSync } from "node:child_process"
import { existsSync, readFileSync, writeFileSync } from "node:fs"
import { homedir } from "node:os"
import { dirname, resolve } from "node:path"
import type { CrossdepsConfig, EnvVar, OsTarget, SystemDepConfig } from "./config.ts"
import { resolveCheckCommand, resolveOsCommand } from "./config.ts"
import {
	applyEnvBlock,
	ensureParentDir,
	expandPath,
	reloadHint,
	renderEnvBlock,
	shellConfigPath,
	shellKind,
} from "./env.ts"
import { sortByDependencies } from "./graph.ts"
import { commandExists, detectOs, parseOsTarget } from "./platform.ts"

const CONFIG_NAMES = ["crossdeps.config.ts", "crossdeps.config.js", "crossdeps.config.mjs"]

const USAGE = `Usage: crossdeps <command> [args]

Commands:
  install              Install all deps (auto-detect OS)
  install <name>       Install single dep
  check                Check all deps
  check <name>         Check single dep
  env                  Setup environment variables
  sync-pm              Sync packageManager field in package.json

Flags:
  --config <path>      Config file (default: crossdeps.config.ts in cwd)
  --os <target>        Force OS target (or set CROSSDEPS_OS)
`

/**
 * Resolve config file path. Checks --config flag, then convention names in cwd.
 */
function resolveConfigPath(args: string[]): string {
	const configIdx = args.indexOf("--config")
	if (configIdx !== -1) {
		const configPath = args[configIdx + 1]
		if (!configPath) {
			console.error("--config requires a path argument")
			process.exit(1)
		}
		const resolved = resolve(process.cwd(), configPath)
		if (!existsSync(resolved)) {
			console.error(`Config file not found: ${resolved}`)
			process.exit(1)
		}
		return resolved
	}

	for (const name of CONFIG_NAMES) {
		const candidate = resolve(process.cwd(), name)
		if (existsSync(candidate)) return candidate
	}

	console.error(`No crossdeps config found. Create one of: ${CONFIG_NAMES.join(", ")}`)
	process.exit(1)
}

/**
 * Strip --config <path> from args so command parsing is clean
 */
function stripFlag(args: string[], flag: string): { args: string[]; value: string | undefined } {
	const idx = args.indexOf(flag)
	if (idx === -1) return { args, value: undefined }
	return {
		args: [...args.slice(0, idx), ...args.slice(idx + 2)],
		value: args[idx + 1],
	}
}

async function loadConfig(configPath: string): Promise<CrossdepsConfig> {
	const mod = (await import(configPath)) as Record<string, unknown>

	/* support: export default defineConfig(...) */
	if (
		mod.default &&
		typeof mod.default === "object" &&
		"deps" in (mod.default as Record<string, unknown>)
	) {
		return mod.default as CrossdepsConfig
	}

	/* support: export const config = defineConfig(...) */
	for (const value of Object.values(mod)) {
		if (value && typeof value === "object" && "deps" in (value as Record<string, unknown>)) {
			return value as CrossdepsConfig
		}
	}

	console.error("Config file must export an object with a `deps` field (use defineConfig)")
	process.exit(1)
}

function execCommand(command: string, ignoreError = false): boolean {
	try {
		execSync(command, { stdio: "inherit" })
		return true
	} catch (_error) {
		if (!ignoreError) {
			console.error(`\nCommand failed: ${command}`)
		}
		return false
	}
}

function getInstalledVersion(name: string, config: SystemDepConfig): string | null {
	const checkCmd = resolveCheckCommand(name, config)
	const binary = checkCmd.split(" ")[0]
	if (binary && !commandExists(binary)) return null

	try {
		const output = execSync(checkCmd, {
			encoding: "utf-8",
			stdio: ["pipe", "pipe", "pipe"],
		}).trim()
		const match = output.match(/(\d+\.\d+[\w.-]*)/)
		return match?.[1] ?? null
	} catch {
		return null
	}
}

function resolveEnvValue(env: EnvVar): string | null {
	if (env.detect && env.detect.length > 0) {
		for (const path of env.detect) {
			const expanded = expandPath(path, homedir())
			if (existsSync(expanded)) {
				console.log(`   Detected ${env.key} at: ${expanded}`)
				return path
			}
		}
		if (env.fallback) {
			console.log(`   Using fallback for ${env.key}: ${env.fallback}`)
			return env.fallback
		}
		console.log(`   Could not detect ${env.key}, no fallback specified`)
		return null
	}

	return env.value || null
}

function configureEnvVars(tool: string, envVars: EnvVar[]): boolean {
	if (envVars.length === 0) return true

	const kind = shellKind(process.platform)
	const configPath = shellConfigPath(homedir(), kind, process.env.SHELL || "")
	const configName = configPath.split(/[\\/]/).pop()

	console.log(`\n   Configuring environment variables in ${configName}...`)

	try {
		const existingContent = existsSync(configPath) ? readFileSync(configPath, "utf-8") : ""

		const resolvedEnvs: Array<{ appendToPath?: boolean; key: string; value: string }> = []
		for (const env of envVars) {
			const value = resolveEnvValue(env)
			if (value) {
				resolvedEnvs.push({ appendToPath: env.appendToPath, key: env.key, value })
			}
		}

		if (resolvedEnvs.length === 0) {
			console.log("   No environment variables to configure")
			return false
		}

		if (existingContent.includes(`# ${tool} environment (managed by crossdeps)`)) {
			console.log(`   Updating existing ${tool} environment config...`)
		}

		const next = applyEnvBlock(existingContent, renderEnvBlock(tool, resolvedEnvs, kind), tool)
		ensureParentDir(configPath)
		writeFileSync(configPath, next)
		console.log(`   Added to ${configName}:`)
		for (const env of resolvedEnvs) {
			if (env.appendToPath) {
				console.log(`      PATH+=:${env.value}`)
			} else {
				console.log(`      ${env.key}=${env.value}`)
			}
		}
		console.log(`\n   ${reloadHint(kind, configName ?? "")}`)

		return true
	} catch (error) {
		console.error("   Failed to configure env vars:", error)
		return false
	}
}

function installOne(
	name: string,
	config: SystemDepConfig,
	os: OsTarget,
): "installed" | "skipped" | "failed" | "unavailable" {
	const command = resolveOsCommand(name, config, os)

	if (!command) {
		console.log(`${name}@${config.version} — not available on ${os}`)
		return "unavailable"
	}

	console.log(`${name}@${config.version}`)
	console.log(`   ${config.description}`)

	const installed = getInstalledVersion(name, config)
	if (installed) {
		console.log(`   Already installed (${installed}), skipping`)
		return "skipped"
	}

	const success = execCommand(command, true)
	if (success) {
		console.log("   Installed successfully")
		if (config.env && config.env.length > 0) {
			configureEnvVars(name, config.env)
		}
		return "installed"
	}

	console.error("   Installation failed")
	return "failed"
}

function cmdInstall(deps: Record<string, SystemDepConfig>, target: string | undefined): void {
	const os = detectOs()

	if (target) {
		const config = deps[target]
		if (!config) {
			console.error(`Unknown dependency: ${target}`)
			console.log(`Available: ${Object.keys(deps).join(", ")}`)
			process.exit(1)
		}
		console.log(`Detected OS: ${os}`)
		const result = installOne(target, config, os)
		if (result === "failed") process.exit(1)
		return
	}

	console.log("crossdeps — System Dependencies Installer")
	console.log(`Detected OS: ${os}`)
	console.log("=".repeat(50))

	const entries = sortByDependencies(Object.entries(deps))
	console.log(`\nFound ${entries.length} dependencies to install:\n`)
	for (const [name, config] of entries) {
		const badge = config.required ? "[required]" : "[optional]"
		const available = resolveOsCommand(name, config, os) !== null
		console.log(
			`  ${badge} ${name}@${config.version}${available ? "" : ` (not available on ${os})`}`,
		)
	}

	console.log(`\n${"=".repeat(50)}`)
	console.log("Installing dependencies...")
	console.log("=".repeat(50))

	let installed = 0
	let skipped = 0
	let failed = 0
	let unavailable = 0

	for (const [name, config] of entries) {
		const result = installOne(name, config, os)

		if (result === "installed") installed++
		else if (result === "skipped") skipped++
		else if (result === "unavailable") unavailable++
		else if (config.required) failed++
		else skipped++
	}

	console.log(`\n${"=".repeat(50)}`)
	console.log("Installation Summary")
	console.log("=".repeat(50))
	console.log(`Installed: ${installed}`)
	console.log(`Skipped: ${skipped}`)
	console.log(`Unavailable on ${os}: ${unavailable}`)
	console.log(`Failed: ${failed}`)

	if (failed > 0) {
		console.log("\nSome required dependencies failed to install")
		process.exit(1)
	}

	console.log("\nAll required system dependencies are ready!")
}

function cmdCheck(
	deps: Record<string, SystemDepConfig>,
	configDir: string,
	packageJsonPath: string,
	target: string | undefined,
): void {
	const os = detectOs()

	if (target) {
		const config = deps[target]
		if (!config) {
			console.error(`Unknown dependency: ${target}`)
			console.log(`Available: ${Object.keys(deps).join(", ")}`)
			process.exit(1)
		}

		const installed = getInstalledVersion(target, config)
		const available = resolveOsCommand(target, config, os) !== null

		if (!available) {
			console.log(`${target} — not available on ${os}`)
		} else if (!installed) {
			console.log(`${target} — not installed (expected ${config.version})`)
			process.exit(1)
		} else {
			console.log(`${target}@${installed} (expected ${config.version})`)
		}
		return
	}

	console.log("crossdeps — System Dependencies Check")
	console.log(`Detected OS: ${os}`)
	console.log("=".repeat(50))

	let ok = 0
	let warn = 0
	let missing = 0

	for (const [name, config] of Object.entries(deps)) {
		const installed = getInstalledVersion(name, config)
		const badge = config.required ? "[required]" : "[optional]"
		const available = resolveOsCommand(name, config, os) !== null

		if (!available) {
			console.log(`  - ${badge} ${name} — not available on ${os}`)
			continue
		}

		if (!installed) {
			console.log(`  x ${badge} ${name} — not installed (expected ${config.version})`)
			if (config.required) missing++
			else warn++
		} else if (
			config.version === "latest" ||
			installed === config.version ||
			config.version.includes(installed) ||
			installed.includes(config.version)
		) {
			console.log(`  v ${badge} ${name}@${installed}`)
			ok++
		} else {
			console.log(`  ~ ${badge} ${name}@${installed} (expected ${config.version})`)
			warn++
		}
	}

	/* packageManager sync check */
	const bunConfig = deps.bun
	if (bunConfig) {
		const pkgJsonPath = resolve(configDir, packageJsonPath)
		const pkg = JSON.parse(readFileSync(pkgJsonPath, "utf-8")) as Record<string, unknown>
		const current = pkg.packageManager as string | undefined

		if (bunConfig.version === "latest") {
			if (current?.startsWith("bun@")) {
				console.log(`\n  v packageManager: ${current} (latest mode)`)
			} else {
				console.log(`\n  ~ packageManager: ${current ?? "(missing)"} (expected bun@*)`)
				warn++
			}
		} else {
			const expected = `bun@${bunConfig.version}`
			if (current === expected) {
				console.log(`\n  v packageManager: ${current}`)
			} else {
				console.log(`\n  ~ packageManager: ${current ?? "(missing)"} (expected ${expected})`)
				warn++
			}
		}
	}

	console.log(`\n${"=".repeat(50)}`)
	console.log(`OK: ${ok}  Mismatch: ${warn}  Missing: ${missing}`)

	if (missing > 0) {
		console.log("\nRequired dependencies missing — run: crossdeps install")
		process.exit(1)
	}

	if (warn > 0) {
		console.log("\nVersion mismatches found — update crossdeps.config.ts or reinstall")
	} else {
		console.log("\nAll system dependencies OK")
	}
}

function cmdEnv(deps: Record<string, SystemDepConfig>): void {
	console.log("Setting up environment variables")
	console.log("=".repeat(50))

	const envDeps = Object.entries(deps).filter(([_, config]) => config.env && config.env.length > 0)

	if (envDeps.length === 0) {
		console.log("\nNo dependencies with environment variables configured.")
		return
	}

	for (const [tool, config] of envDeps) {
		if (config.env) {
			console.log(`\n${tool}`)
			configureEnvVars(tool, config.env)
		}
	}

	const kind = shellKind(process.platform)
	const configPath = shellConfigPath(homedir(), kind, process.env.SHELL || "")
	console.log(`\n${"=".repeat(50)}`)
	console.log(`Environment variables configured in ${configPath}`)
	console.log(`\n${reloadHint(kind, configPath.split(/[\\/]/).pop() ?? "")}`)
}

function cmdSyncPm(
	deps: Record<string, SystemDepConfig>,
	configDir: string,
	packageJsonPath: string,
): boolean {
	const bunConfig = deps.bun
	if (!bunConfig) {
		console.log("\nSkipping packageManager sync — bun not in config")
		return true
	}

	const bunVersion = bunConfig.version

	if (bunVersion === "latest") {
		console.log('\nSkipping packageManager sync — bun version is "latest"')
		return true
	}

	const pkgJsonPath = resolve(configDir, packageJsonPath)
	const expected = `bun@${bunVersion}`

	try {
		const content = readFileSync(pkgJsonPath, "utf-8")
		const pkg = JSON.parse(content) as Record<string, unknown>
		const current = pkg.packageManager as string | undefined

		if (current === expected) {
			console.log(`\npackageManager already correct: ${expected}`)
			return true
		}

		console.log(`\nSyncing packageManager: ${current ?? "(missing)"} -> ${expected}`)
		const pkgName = pkg.name as string
		const updated = current
			? content.replace(`"packageManager": "${current}"`, `"packageManager": "${expected}"`)
			: content.replace(
					`"name": "${pkgName}"`,
					`"name": "${pkgName}",\n\t"packageManager": "${expected}"`,
				)
		writeFileSync(pkgJsonPath, updated)
		console.log(`Updated packageManager to ${expected}`)
		return true
	} catch (error) {
		console.error("Failed to sync packageManager:", error)
		return false
	}
}

async function main(): Promise<void> {
	const rawArgs = process.argv.slice(2)
	const osFlag = stripFlag(rawArgs, "--os")
	if (rawArgs.includes("--os") && !osFlag.value) {
		console.error("--os requires a target argument")
		process.exit(1)
	}
	if (osFlag.value) {
		try {
			process.env.CROSSDEPS_OS = parseOsTarget(osFlag.value)
		} catch (error) {
			console.error(error instanceof Error ? error.message : error)
			process.exit(1)
		}
	}

	const configPath = resolveConfigPath(osFlag.args)
	const configDir = dirname(configPath)
	const config = await loadConfig(configPath)
	const deps = config.deps
	const packageJsonPath = config.packageJsonPath ?? "package.json"

	const args = stripFlag(osFlag.args, "--config").args
	const command = args[0]
	const target = args[1]

	switch (command) {
		case "install":
			cmdInstall(deps, target)
			break
		case "check":
			cmdCheck(deps, configDir, packageJsonPath, target)
			break
		case "env":
			cmdEnv(deps)
			break
		case "sync-pm":
			cmdSyncPm(deps, configDir, packageJsonPath)
			break
		default:
			console.log(USAGE)
			if (command) {
				console.error(`Unknown command: ${command}`)
				process.exit(1)
			}
	}
}

try {
	await main()
} catch (error) {
	console.error("\nFatal error:", error)
	process.exit(1)
}
