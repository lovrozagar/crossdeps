import {
	defineConfig,
	detectOs,
	interpolate,
	resolveCheckCommand,
	resolveOsCommand,
	sortByDependencies,
} from "@lovrozagar/crossdeps"
import config from "../crossdeps.config.ts"

export { config }

export const presentCheck = resolveCheckCommand("present", config.deps.present!)
export const presentInstall = resolveOsCommand("present", config.deps.present!, detectOs())
export const order = sortByDependencies(Object.entries(config.deps)).map(([name]) => name)
export const label = interpolate("{{name}}@{{version}}", "present", "1.0.0")

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
