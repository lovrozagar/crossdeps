import { defineConfig } from "@lovrozagar/crossdeps"

/**
 * Fixture config for consumer tests. Commands are bun no-ops so they
 * run on Linux, macOS, and Windows without installing system packages.
 */
export default defineConfig({
	packageJsonPath: "package.json",
	deps: {
		absent: {
			check: { command: "crossdeps-definitely-missing --version" },
			description: "Optional dep that is not installed",
			os: { all: "bun -e \"console.log('installed-absent')\"" },
			required: false,
			version: "9.9.9",
		},
		present: {
			check: { command: `${process.execPath} -e "console.log('1.0.0')"` },
			description: "Always-present marker dep",
			os: { all: "bun -e \"console.log('installed-present')\"" },
			required: true,
			version: "1.0.0",
		},
		stale: {
			check: { command: `${process.execPath} -e "console.log('9.9.9')"` },
			description: "Present at the wrong version (mismatch fixture)",
			os: { all: "bun -e \"console.log('upgraded-stale')\"" },
			required: false,
			version: "1.0.0",
		},
		"unix-only": {
			check: { command: `${process.execPath} -e "console.log('0.1.0')"` },
			description: "Unavailable on Windows",
			os: {
				"linux-apt": "bun -e \"console.log('unix')\"",
				"linux-dnf": "bun -e \"console.log('unix')\"",
				"linux-pacman": "bun -e \"console.log('unix')\"",
				macos: "bun -e \"console.log('unix')\"",
				windows: false,
			},
			required: false,
			version: "0.1.0",
		},
	},
})
