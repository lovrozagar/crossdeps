import {
	defineConfig,
	detectOs,
	interpolate,
	resolveCheckCommand,
	resolveOsCommand,
	sortByDependencies,
	versionsMatch,
	whichBinary,
} from "@lovrozagar/crossdeps"
import config from "../crossdeps.config.ts"

export { config }

export const presentCheck = resolveCheckCommand("present", config.deps.present!)
export const presentInstall = resolveOsCommand("present", config.deps.present!, detectOs())
export const order = sortByDependencies(Object.entries(config.deps)).map(([name]) => name)
export const label = interpolate("{{name}}@{{version}}", "present", "1.0.0")
export const presentPinMatches = versionsMatch("1.0.0", config.deps.present!.version)
export const bunBinary = whichBinary("bun")

export function extraConfig() {
	return defineConfig({
		deps: {
			jq: {
				description: "JSON processor",
				os: { all: "echo jq-{{version}}" },
				required: true,
				version: "1.8.1",
			},
		},
	})
}
