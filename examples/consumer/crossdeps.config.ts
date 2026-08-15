import { defineConfig } from "@scriptgun/crossdeps"

export default defineConfig({
	deps: {
		"android-sdk": {
			check: { command: "adb --version" },
			description: "Android SDK for React Native development (includes adb, emulator)",
			env: [
				{
					detect: [
						"$HOME/Android/sdk",
						"$HOME/Android/Sdk",
						"$HOME/Library/Android/sdk",
						"/usr/lib/android-sdk",
						"/opt/android-sdk",
					],
					fallback: "$HOME/Android/sdk",
					key: "ANDROID_HOME",
				},
				{ appendToPath: true, key: "PATH", value: "$ANDROID_HOME/emulator" },
				{ appendToPath: true, key: "PATH", value: "$ANDROID_HOME/platform-tools" },
			],
			os: {
				"linux-apt": `
export ANDROID_SDK_ROOT=/usr/lib/android-sdk
export CMDLINE_TOOLS_URL="https://dl.google.com/android/repository/commandlinetools-linux-11076708_latest.zip"

sudo apt-get update && sudo apt-get install -y android-sdk wget unzip

if [ ! -d "$ANDROID_SDK_ROOT/cmdline-tools/latest" ]; then
  cd /tmp && wget -q "$CMDLINE_TOOLS_URL" -O cmdline-tools.zip && unzip -q cmdline-tools.zip
  sudo mkdir -p "$ANDROID_SDK_ROOT/cmdline-tools" && sudo mv cmdline-tools "$ANDROID_SDK_ROOT/cmdline-tools/latest"
  rm cmdline-tools.zip
fi

yes | sudo "$ANDROID_SDK_ROOT/cmdline-tools/latest/bin/sdkmanager" --licenses > /dev/null 2>&1 || true
sudo "$ANDROID_SDK_ROOT/cmdline-tools/latest/bin/sdkmanager" "platform-tools" "platforms;android-34" "build-tools;34.0.0" "emulator" "system-images;android-34;google_apis;x86_64"

if ! "$ANDROID_SDK_ROOT/cmdline-tools/latest/bin/avdmanager" list avd | grep -q "Pixel_7_API_34"; then
  "$ANDROID_SDK_ROOT/cmdline-tools/latest/bin/avdmanager" create avd -n Pixel_7_API_34 -k "system-images;android-34;google_apis;x86_64" -d pixel_7 --force
fi`,
				macos: `
export ANDROID_SDK_ROOT="$HOME/Library/Android/sdk" && mkdir -p "$ANDROID_SDK_ROOT"
brew install --cask android-commandlinetools

CMDLINE_TOOLS="$ANDROID_SDK_ROOT/cmdline-tools/latest/bin"
if [ ! -d "$CMDLINE_TOOLS" ]; then
  mkdir -p "$ANDROID_SDK_ROOT/cmdline-tools"
  ln -sf "$(brew --prefix)/share/android-commandlinetools" "$ANDROID_SDK_ROOT/cmdline-tools/latest"
fi

yes | "$CMDLINE_TOOLS/sdkmanager" --licenses > /dev/null 2>&1 || true
"$CMDLINE_TOOLS/sdkmanager" "platform-tools" "platforms;android-34" "build-tools;34.0.0" "emulator" "system-images;android-34;google_apis;arm64-v8a"

if ! "$CMDLINE_TOOLS/avdmanager" list avd | grep -q "Pixel_7_API_34"; then
  "$CMDLINE_TOOLS/avdmanager" create avd -n Pixel_7_API_34 -k "system-images;android-34;google_apis;arm64-v8a" -d pixel_7 --force
fi`,
			},
			required: true,
			version: "35.0.0",
		},
		"agent-browser": {
			check: { command: "agent-browser --version" },
			dependsOn: ["rust"],
			description: "Fast browser automation CLI for AI agents — powers src/audits/ on landing",
			os: {
				all: "cargo install agent-browser --version {{version}} --locked",
			},
			required: true,
			version: "0.19.0",
		},
		"android-studio": {
			check: { command: "echo android-studio" },
			dependsOn: ["android-sdk"],
			description: "Android IDE with SDK Manager",
			os: {
				"linux-apt": "sudo snap install android-studio --classic",
				macos: "brew install --cask android-studio",
			},
			required: true,
			version: "2024.3.1",
		},
		atlas: {
			check: { command: "atlas version" },
			description: "Database schema management tool",
			os: {
				"linux-apt": "curl -sSf https://atlasgo.sh | sh -s -- --version v{{version}}",
				"linux-dnf": "curl -sSf https://atlasgo.sh | sh -s -- --version v{{version}}",
				"linux-pacman": "curl -sSf https://atlasgo.sh | sh -s -- --version v{{version}}",
				macos: "curl -sSf https://atlasgo.sh | sh -s -- --version v{{version}}",
				windows: "choco install atlas --version={{version}}",
			},
			required: true,
			version: "v1.0.1-1c2aa24-canary",
		},
		bun: {
			description: "JavaScript runtime and package manager",
			os: {
				"linux-apt": 'curl -fsSL https://bun.sh/install | bash -s "bun-v{{version}}"',
				"linux-dnf": 'curl -fsSL https://bun.sh/install | bash -s "bun-v{{version}}"',
				"linux-pacman": 'curl -fsSL https://bun.sh/install | bash -s "bun-v{{version}}"',
				macos: 'curl -fsSL https://bun.sh/install | bash -s "bun-v{{version}}"',
				windows: 'powershell -c "irm bun.sh/install.ps1|iex" && bun upgrade --to {{version}}',
			},
			required: true,
			version: "1.3.5",
		},
		claude: {
			check: { command: "claude --version" },
			dependsOn: ["npm"],
			description: "Claude Code CLI for AI-assisted development",
			os: {
				all: "npm install -g @anthropic-ai/claude-code@{{version}}",
			},
			required: true,
			version: "latest",
		},
		cloudflared: {
			check: { command: "cloudflared --version" },
			description: "Cloudflare Tunnel client for wrangler dev remote bindings (AI, Vectorize)",
			os: {
				"linux-apt":
					"curl -fsSL https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64.deb -o /tmp/cloudflared.deb && sudo dpkg -i /tmp/cloudflared.deb && rm /tmp/cloudflared.deb",
				"linux-dnf":
					"curl -fsSL https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-x86_64.rpm -o /tmp/cloudflared.rpm && sudo rpm -i /tmp/cloudflared.rpm && rm /tmp/cloudflared.rpm",
				"linux-pacman":
					"curl -fsSL https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64 -o /tmp/cloudflared && chmod +x /tmp/cloudflared && sudo mv /tmp/cloudflared /usr/local/bin/cloudflared",
				macos: "brew install cloudflared",
				windows: "choco install cloudflared",
			},
			required: true,
			version: "2026.2.0",
		},
		deno: {
			description: "Secure JavaScript/TypeScript runtime",
			env: [
				{
					detect: ["$HOME/.deno"],
					fallback: "$HOME/.deno",
					key: "DENO_INSTALL",
				},
				{ appendToPath: true, key: "PATH", value: "$HOME/.deno/bin" },
			],
			os: {
				"linux-apt": 'curl -fsSL https://deno.land/install.sh | sh -s "v{{version}}"',
				"linux-dnf": 'curl -fsSL https://deno.land/install.sh | sh -s "v{{version}}"',
				"linux-pacman": 'curl -fsSL https://deno.land/install.sh | sh -s "v{{version}}"',
				macos: 'curl -fsSL https://deno.land/install.sh | sh -s "v{{version}}"',
				windows: "irm https://deno.land/install.ps1 | iex",
			},
			required: true,
			version: "2.7.5",
		},
		dnsmasq: {
			description: "Local DNS server for development",
			os: {
				"linux-apt": "sudo apt-get install -y dnsmasq",
				"linux-dnf": "sudo dnf install -y dnsmasq",
				"linux-pacman": "sudo pacman -S --noconfirm dnsmasq",
				macos: "brew install dnsmasq",
				windows: false,
			},
			required: true,
			version: "2.92",
		},
		docker: {
			description: "Container runtime for local infrastructure services",
			os: {
				"linux-apt":
					"curl -fsSL https://download.docker.com/linux/static/stable/x86_64/docker-{{version}}.tgz | sudo tar -xz -C /usr/local/bin --strip-components=1 && sudo usermod -aG docker $USER",
				"linux-dnf":
					"curl -fsSL https://download.docker.com/linux/static/stable/x86_64/docker-{{version}}.tgz | sudo tar -xz -C /usr/local/bin --strip-components=1 && sudo usermod -aG docker $USER",
				"linux-pacman":
					"curl -fsSL https://download.docker.com/linux/static/stable/x86_64/docker-{{version}}.tgz | sudo tar -xz -C /usr/local/bin --strip-components=1 && sudo usermod -aG docker $USER",
				macos: "brew install --cask docker",
				windows: "choco install docker-desktop --version={{version}}",
			},
			required: true,
			version: "27.5.1",
		},
		epiphany: {
			check: {
				command: "epiphany --version 2>&1 || flatpak run org.gnome.Epiphany --version 2>&1",
			},
			description: "GNOME Web browser (WebKit engine, Linux)",
			os: {
				"linux-apt": "sudo apt-get install -y epiphany-browser",
				"linux-dnf": "sudo dnf install -y epiphany",
				"linux-pacman": "sudo pacman -S --noconfirm epiphany",
			},
			required: true,
			version: "46.5",
		},
		firefox: {
			check: { command: "firefox --version" },
			description: "Mozilla Firefox browser (Gecko engine)",
			os: {
				"linux-apt": "sudo apt-get install -y firefox",
				"linux-dnf": "sudo dnf install -y firefox",
				"linux-pacman": "sudo pacman -S --noconfirm firefox",
				macos: "brew install --cask firefox",
				windows: "choco install firefox",
			},
			required: true,
			version: "145.0",
		},
		flux: {
			check: { command: "ls /Applications/Flux.app || ls /usr/bin/xflux" },
			description: "Screen color temperature adjustment for eye comfort",
			os: {
				"linux-apt":
					"sudo add-apt-repository -y ppa:nathan-renniewaldock/flux && sudo apt-get update && sudo apt-get install -y fluxgui",
				"linux-dnf": "sudo dnf install -y f.lux",
				"linux-pacman": "sudo pacman -S --noconfirm xflux-gui-git",
				macos: "brew install --cask flux",
				windows: "choco install f.lux",
			},
			required: false,
			version: "42.1",
		},
		foundry: {
			check: { command: "forge --version" },
			description: "Ethereum development toolkit (forge, cast, anvil)",
			os: {
				"linux-apt": "curl -L https://foundry.paradigm.xyz | bash && foundryup -v {{version}}",
				"linux-dnf": "curl -L https://foundry.paradigm.xyz | bash && foundryup -v {{version}}",
				"linux-pacman": "curl -L https://foundry.paradigm.xyz | bash && foundryup -v {{version}}",
				macos: "curl -L https://foundry.paradigm.xyz | bash && foundryup -v {{version}}",
			},
			required: true,
			version: "1.5.1-stable",
		},
		git: {
			description: "Version control system",
			os: {
				"linux-apt": "sudo apt-get install -y git={{version}}-* || sudo apt-get install -y git",
				"linux-dnf": "sudo dnf install -y git-{{version}} || sudo dnf install -y git",
				"linux-pacman": "sudo pacman -S --noconfirm git",
				macos: "brew install git",
				windows: "choco install git --version={{version}}",
			},
			required: true,
			version: "2.39.5",
		},
		"google-chrome": {
			check: { command: "google-chrome --version" },
			description: "Google Chrome browser (Blink engine)",
			os: {
				"linux-apt":
					"curl -fsSL https://dl.google.com/linux/direct/google-chrome-stable_current_amd64.deb -o /tmp/chrome.deb && sudo dpkg -i /tmp/chrome.deb && sudo apt-get install -f -y && rm /tmp/chrome.deb",
				"linux-dnf":
					"sudo dnf install -y https://dl.google.com/linux/direct/google-chrome-stable_current_x86_64.rpm",
				macos: "brew install --cask google-chrome",
				windows: "choco install googlechrome",
			},
			required: true,
			version: "142.0.7444.162",
		},
		jq: {
			description: "Command-line JSON processor",
			os: {
				"linux-apt":
					"curl -fsSL https://github.com/jqlang/jq/releases/download/jq-{{version}}/jq-linux-{{arch}} -o /tmp/jq && chmod +x /tmp/jq && sudo mv /tmp/jq /usr/local/bin/jq",
				"linux-dnf":
					"curl -fsSL https://github.com/jqlang/jq/releases/download/jq-{{version}}/jq-linux-{{arch}} -o /tmp/jq && chmod +x /tmp/jq && sudo mv /tmp/jq /usr/local/bin/jq",
				"linux-pacman":
					"curl -fsSL https://github.com/jqlang/jq/releases/download/jq-{{version}}/jq-linux-{{arch}} -o /tmp/jq && chmod +x /tmp/jq && sudo mv /tmp/jq /usr/local/bin/jq",
				macos:
					"curl -fsSL https://github.com/jqlang/jq/releases/download/jq-{{version}}/jq-macos-{{arch}} -o /tmp/jq && chmod +x /tmp/jq && sudo mv /tmp/jq /usr/local/bin/jq",
				windows: "choco install jq --version={{version}}",
			},
			required: true,
			version: "1.8.1",
		},
		nginx: {
			check: { command: "nginx -v 2>&1" },
			description: "Web server and reverse proxy",
			os: {
				"linux-apt": "sudo apt-get install -y nginx={{version}}-* || sudo apt-get install -y nginx",
				"linux-dnf": "sudo dnf install -y nginx-{{version}} || sudo dnf install -y nginx",
				"linux-pacman": "sudo pacman -S --noconfirm nginx",
				macos: "brew install nginx",
				windows: "choco install nginx --version={{version}}",
			},
			required: true,
			version: "1.29.4",
		},
		node: {
			description: "JavaScript runtime",
			os: {
				"linux-apt":
					"curl -fsSL https://nodejs.org/dist/v{{version}}/node-v{{version}}-linux-x64.tar.gz | sudo tar -xz -C /usr/local --strip-components=1",
				"linux-dnf":
					"curl -fsSL https://nodejs.org/dist/v{{version}}/node-v{{version}}-linux-x64.tar.gz | sudo tar -xz -C /usr/local --strip-components=1",
				"linux-pacman":
					"curl -fsSL https://nodejs.org/dist/v{{version}}/node-v{{version}}-linux-x64.tar.gz | sudo tar -xz -C /usr/local --strip-components=1",
				macos:
					"curl -fsSL https://nodejs.org/dist/v{{version}}/node-v{{version}}-darwin-{{arch}}.tar.gz | sudo tar -xz -C /usr/local --strip-components=1",
				windows: "choco install nodejs --version={{version}}",
			},
			required: true,
			version: "22.12.0",
		},
		npm: {
			dependsOn: ["node"],
			description: "Node package manager (installed with Node)",
			os: {
				all: "npm install -g npm@{{version}}",
			},
			required: false,
			version: "11.8.0",
		},
		"playwright-deps": {
			check: {
				command:
					"dpkg -s libavif16 2>/dev/null | grep -q 'Status: install ok installed' && echo ok",
			},
			description: "System libraries required by Playwright browsers (WebKit, Chromium, Firefox)",
			os: {
				"linux-apt": "sudo npx playwright install-deps",
				"linux-dnf": "sudo npx playwright install-deps",
				"linux-pacman": "sudo npx playwright install-deps",
				macos: "echo 'No extra deps needed — macOS uses system frameworks'",
			},
			required: true,
			version: "1.52.0",
		},
		rust: {
			check: { command: "rustc --version" },
			description: "Systems programming language (rustc, cargo via rustup)",
			env: [
				{
					detect: ["$HOME/.cargo"],
					fallback: "$HOME/.cargo",
					key: "CARGO_HOME",
				},
				{
					detect: ["$HOME/.rustup"],
					fallback: "$HOME/.rustup",
					key: "RUSTUP_HOME",
				},
				{ appendToPath: true, key: "PATH", value: "$HOME/.cargo/bin" },
			],
			os: {
				"linux-apt":
					"curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y --default-toolchain {{version}}",
				"linux-dnf":
					"curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y --default-toolchain {{version}}",
				"linux-pacman":
					"curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y --default-toolchain {{version}}",
				macos:
					"curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y --default-toolchain {{version}}",
				windows: "choco install rustup.install && rustup default {{version}}",
			},
			required: true,
			version: "stable",
		},
		"stripe-cli": {
			check: { command: "stripe version" },
			description: "Stripe payment testing CLI",
			os: {
				"linux-apt":
					"curl -fsSL https://github.com/stripe/stripe-cli/releases/download/v{{version}}/stripe_{{version}}_linux_x86_64.tar.gz | tar -xz -C /tmp && sudo mv /tmp/stripe /usr/local/bin/stripe",
				"linux-dnf":
					"curl -fsSL https://github.com/stripe/stripe-cli/releases/download/v{{version}}/stripe_{{version}}_linux_x86_64.tar.gz | tar -xz -C /tmp && sudo mv /tmp/stripe /usr/local/bin/stripe",
				"linux-pacman":
					"curl -fsSL https://github.com/stripe/stripe-cli/releases/download/v{{version}}/stripe_{{version}}_linux_x86_64.tar.gz | tar -xz -C /tmp && sudo mv /tmp/stripe /usr/local/bin/stripe",
				macos:
					"curl -fsSL https://github.com/stripe/stripe-cli/releases/download/v{{version}}/stripe_{{version}}_mac-os_{{arch}}.tar.gz | tar -xz -C /tmp && sudo mv /tmp/stripe /usr/local/bin/stripe",
				windows: "choco install stripe-cli --version={{version}}",
			},
			required: true,
			version: "1.35.0",
		},
		"tauri-deps": {
			check: { command: "pkg-config --exists webkit2gtk-4.1 && echo ok" },
			dependsOn: ["rust"],
			description: "System libraries for Tauri v2 desktop builds (GTK, WebKit, AppIndicator)",
			os: {
				"linux-apt":
					"sudo apt-get install -y libwebkit2gtk-4.1-dev libgtk-3-dev libayatana-appindicator3-dev librsvg2-dev patchelf",
				"linux-dnf":
					"sudo dnf install -y webkit2gtk4.1-devel gtk3-devel libayatana-appindicator-gtk3 librsvg2-devel patchelf",
				"linux-pacman":
					"sudo pacman -S --noconfirm webkit2gtk-4.1 gtk3 libayatana-appindicator librsvg patchelf",
				macos: "echo 'No extra deps needed — macOS uses system WebKit'",
				windows: "echo 'No extra deps needed — Windows uses WebView2'",
			},
			required: true,
			version: "2.44",
		},
	},
	packageJsonPath: "package.json",
})
