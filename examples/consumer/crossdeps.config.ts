import { defineConfig } from "@scriptgun/crossdeps"

export default defineConfig({
	packageJsonPath: "package.json",
	deps: {
		bun: {
			description: "JavaScript runtime and package manager",
			os: {
				all: 'curl -fsSL https://bun.sh/install | bash -s "bun-v{{version}}"',
				windows: 'powershell -c "irm bun.sh/install.ps1|iex" && bun upgrade --to {{version}}',
			},
			required: true,
			version: "1.3.11",
		},
		git: {
			description: "Version control system",
			os: {
				"linux-apt": "sudo apt-get install -y git={{version}}-* || sudo apt-get install -y git",
				macos: "brew install git",
				windows: "choco install git --version={{version}}",
			},
			required: true,
			version: "2.39.5",
		},
		node: {
			description: "JavaScript runtime",
			os: {
				"linux-apt":
					"curl -fsSL https://nodejs.org/dist/v{{version}}/node-v{{version}}-linux-x64.tar.gz | sudo tar -xz -C /usr/local --strip-components=1",
				macos:
					"curl -fsSL https://nodejs.org/dist/v{{version}}/node-v{{version}}-darwin-{{arch}}.tar.gz | sudo tar -xz -C /usr/local --strip-components=1",
				windows: "choco install nodejs --version={{version}}",
			},
			required: true,
			version: "22.12.0",
		},
	},
})
