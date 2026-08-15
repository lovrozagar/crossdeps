import { join, resolve } from "node:path"
import { describe, expect, it } from "vitest"
import {
	applyEnvBlock,
	expandPath,
	reloadHint,
	renderEnvBlock,
	shellConfigPath,
	shellKind,
} from "../../src/env.ts"

describe("shellKind", () => {
	it("uses PowerShell on Windows", () => {
		expect(shellKind("win32")).toBe("powershell")
	})

	it("uses posix on macOS and Linux", () => {
		expect(shellKind("darwin")).toBe("posix")
		expect(shellKind("linux")).toBe("posix")
	})
})

describe("shellConfigPath", () => {
	it("writes the PowerShell 7 profile on Windows", () => {
		const home = join("Users", "me")
		expect(shellConfigPath(home, "powershell")).toBe(
			resolve(home, "Documents", "PowerShell", "Microsoft.PowerShell_profile.ps1"),
		)
	})

	it("writes .zshrc for zsh", () => {
		const home = join("home", "me")
		expect(shellConfigPath(home, "posix", "/bin/zsh")).toBe(resolve(home, ".zshrc"))
	})

	it("writes .bashrc otherwise", () => {
		const home = join("home", "me")
		expect(shellConfigPath(home, "posix", "/bin/bash")).toBe(resolve(home, ".bashrc"))
	})
})

describe("expandPath", () => {
	it("expands unix and Windows home tokens", () => {
		expect(expandPath("$HOME/tool", "/home/me")).toBe("/home/me/tool")
		expect(expandPath("%USERPROFILE%\\tool", "C:\\Users\\me")).toBe("C:\\Users\\me\\tool")
	})

	it("expands ANDROID_HOME from either syntax", () => {
		const env = { ANDROID_HOME: "/sdk" }
		expect(expandPath("$ANDROID_HOME/platform-tools", "/home/me", env)).toBe(
			"/sdk/platform-tools",
		)
		expect(expandPath("%ANDROID_HOME%\\platform-tools", "C:\\Users\\me", env)).toBe(
			"/sdk\\platform-tools",
		)
	})
})

describe("renderEnvBlock", () => {
	const envs = [
		{ key: "TOOL_HOME", value: "$HOME/tool" },
		{ appendToPath: true, key: "PATH", value: "$HOME/tool/bin" },
	]

	it("emits bash exports", () => {
		const block = renderEnvBlock("tool", envs, "posix")
		expect(block).toContain("# tool environment (managed by crossdeps)")
		expect(block).toContain('export TOOL_HOME="$HOME/tool"')
		expect(block).toContain('export PATH="$PATH:$HOME/tool/bin"')
		expect(block).toContain("# end tool environment")
		expect(block).not.toContain("\r\n")
	})

	it("emits PowerShell assignments", () => {
		const block = renderEnvBlock("tool", envs, "powershell")
		expect(block).toContain("$env:TOOL_HOME = \"$HOME/tool\"")
		expect(block).toContain("$env:Path += \";$HOME/tool/bin\"")
		expect(block).toContain("\r\n")
	})
})

describe("applyEnvBlock", () => {
	it("replaces an existing managed block", () => {
		const first = renderEnvBlock("tool", [{ key: "A", value: "1" }], "posix")
		const second = renderEnvBlock("tool", [{ key: "A", value: "2" }], "posix")
		const next = applyEnvBlock(`keep${first}`, second, "tool")
		expect(next).toContain("keep")
		expect(next).toContain('export A="2"')
		expect(next).not.toContain('export A="1"')
	})
})

describe("reloadHint", () => {
	it("tells Windows users to reload $PROFILE", () => {
		expect(reloadHint("powershell", "Microsoft.PowerShell_profile.ps1")).toContain("$PROFILE")
	})
})
