import type { SystemDepConfig } from "./config.ts"

/**
 * Topological sort of deps respecting `dependsOn` field.
 * Returns dep names in install order.
 */
export function sortByDependencies(depEntries: Array<[string, SystemDepConfig]>): Array<[string, SystemDepConfig]> {
	const nameSet = new Set(depEntries.map(([name]) => name))
	const sorted: Array<[string, SystemDepConfig]> = []
	const visited = new Set<string>()
	const visiting = new Set<string>()

	const depMap = new Map(depEntries)

	function visit(name: string): void {
		if (visited.has(name)) return
		if (visiting.has(name)) {
			console.warn(`Circular dependency detected involving: ${name}`)
			return
		}

		visiting.add(name)

		const config = depMap.get(name)
		if (config?.dependsOn) {
			for (const dep of config.dependsOn) {
				if (nameSet.has(dep)) {
					visit(dep)
				}
			}
		}

		visiting.delete(name)
		visited.add(name)
		if (config) {
			sorted.push([name, config])
		}
	}

	for (const [name] of depEntries) {
		visit(name)
	}

	return sorted
}
