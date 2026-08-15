/**
 * crossdeps - Cross-platform system dependency manager
 */

export type { CrossdepsConfig, EnvVar, OsCommands, OsTarget, SystemDepConfig } from "./config.ts"
export { defineConfig, interpolate, OS_TARGETS, resolveCheckCommand, resolveOsCommand } from "./config.ts"
export { sortByDependencies } from "./graph.ts"
export { commandExists, commandLookup, detectOs, detectOsFromPlatform, parseOsTarget } from "./platform.ts"
