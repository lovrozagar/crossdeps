import {
	detectOs,
	interpolate,
	resolveCheckCommand,
	resolveOsCommand,
	sortByDependencies,
} from "@scriptgun/crossdeps"
import config from "../crossdeps.config.ts"

export function bunInstallCommand(): string | null {
	return resolveOsCommand("bun", config.deps.bun!, detectOs())
}

export function nodeCheckCommand(): string {
	return resolveCheckCommand("node", config.deps.node!)
}

export function installOrder(): string[] {
	return sortByDependencies(Object.entries(config.deps)).map(([name]) => name)
}

export function templated(): string {
	return interpolate("{{name}}-{{major}}", "node", config.deps.node!.version)
}
