/**
 * System dependencies configuration helpers
 *
 * Template variables available in `os` commands and `check.command`:
 *   {{name}}    — dep key (e.g. "node", "stripe-cli")
 *   {{version}} — full version string (e.g. "22.20.0")
 *   {{major}}   — major version number (e.g. "22")
 *   {{arch}}    — CPU architecture: "arm64" or "amd64" (auto-detected)
 */

export const OS_TARGETS = ["linux-apt", "linux-dnf", "linux-pacman", "macos", "windows"] as const

export type OsTarget = (typeof OS_TARGETS)[number]

/**
 * Per-OS install commands.
 * - Use specific OS keys for platform-specific commands
 * - Use "all" for commands identical across all platforms
 * - Per-OS keys override "all" when both are present
 * - Omit an OS key (without "all") = unavailable on that OS
 * - Set an OS key to `false` = explicitly unavailable on that OS (overrides "all")
 */
export type OsCommands = Partial<Record<OsTarget, string | false>> & { all?: string }

export interface EnvVar {
	/** Environment variable name */
	key: string
	/** Value (supports $HOME and other env refs). Can be omitted if detect is provided. */
	value?: string
	/** If true, appends to PATH instead of setting directly */
	appendToPath?: boolean
	/** Auto-detect value from these paths (first existing path wins). Supports $HOME. */
	detect?: string[]
	/** Fallback value if detect finds nothing */
	fallback?: string
}

export interface SystemDepConfig {
	description: string
	required: boolean
	version: string
	/** Per-OS install commands. Supports {{name}}, {{version}}, {{major}} templates. */
	os: OsCommands
	/**
	 * Version check command. Supports {{name}} template.
	 * Default: "{{name}} --version" — only declare when it differs.
	 */
	check?: { command: string }
	/** Deps that must be installed before this one (by dep key name) */
	dependsOn?: string[]
	/** Env vars to configure after install */
	env?: EnvVar[]
}

export interface CrossdepsConfig {
	/** Path to package.json for packageManager sync. Relative to config file directory. */
	packageJsonPath?: string
	deps: Record<string, SystemDepConfig>
}

/**
 * Interpolate {{name}}, {{version}}, {{major}} in a string
 */
function detectArch(): string {
	if (process.arch === "arm64") return "arm64"
	return "amd64"
}

/** Same table `check` uses. `"latest"` matches anything with a parsed version. */
export function versionsMatch(installed: string, expected: string): boolean {
	return expected === "latest" || installed === expected || expected.includes(installed) || installed.includes(expected)
}

export function interpolate(template: string, name: string, version: string): string {
	const major = version.split(".")[0] ?? version
	return template
		.replace(/\{\{name\}\}/g, name)
		.replace(/\{\{version\}\}/g, version)
		.replace(/\{\{major\}\}/g, major)
		.replace(/\{\{arch\}\}/g, detectArch())
}

/**
 * Resolve the install command for a dep on a given OS target.
 * Returns the interpolated command, or null if unavailable.
 */
export function resolveOsCommand(name: string, config: SystemDepConfig, target: OsTarget): string | null {
	const specific = config.os[target]

	/* explicitly unavailable */
	if (specific === false) return null

	/* prefer specific OS command, fall back to "all" */
	const raw = specific ?? config.os.all
	if (!raw) return null

	return interpolate(raw, name, config.version)
}

/**
 * Resolve the version check command for a dep.
 * Default: "{name} --version"
 */
export function resolveCheckCommand(name: string, config: SystemDepConfig): string {
	const raw = config.check?.command ?? "{{name}} --version"
	return interpolate(raw, name, config.version)
}

/**
 * Helper to define system dependencies configuration with type safety
 */
export function defineConfig(options: {
	packageJsonPath?: string
	deps: Record<string, SystemDepConfig>
}): CrossdepsConfig {
	return {
		deps: options.deps,
		packageJsonPath: options.packageJsonPath ?? "package.json",
	}
}
