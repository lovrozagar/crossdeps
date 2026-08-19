import { chmodSync, existsSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { describe, expect, it } from "vitest"
import {
	PATH_PRINTF,
	TTY_PATH_FALLBACK_WARN,
	UNIX_BASH_PATH_ARGS,
	UNIX_ZSH_PATH_ARGS,
	WINDOWS_TTY_PATH_ARGS,
	parsePathOutput,
	pathEnv,
	processPath,
	snapshotTtyPath,
	isTtyEnvKeep,
	ttySnapshotEnv,
	unixPathSnapshotArgs,
	unixStockPath,
	windowsStockPath,
	type ExecFile,
} from "../../src/path.ts"

const spawnFail: ExecFile = () => {
	throw new Error("spawn ENOENT")
}

const emptyPath: ExecFile = () => "   \n"

const bashInteractive: ExecFile = (file, args) => {
	expect(file).toBe("/bin/bash")
	expect([...args]).toEqual(["-ic", PATH_PRINTF])
	expect(args[0]).not.toContain("l")
	return "/interactive/bin:/usr/bin\n"
}

const zshLoginInteractive: ExecFile = (file, args) => {
	expect(file).toBe("/bin/zsh")
	expect([...args]).toEqual(["-lic", PATH_PRINTF])
	return "/zsh/bin:/usr/bin\n"
}

const defaultSh: ExecFile = (file, args) => {
	expect(file).toBe("/bin/sh")
	expect([...args]).toEqual(["-ic", PATH_PRINTF])
	return "/usr/bin"
}

const windowsProfilePath: ExecFile = (file, args) => {
	expect(file).toBe("powershell.exe")
	expect([...args]).toEqual([...WINDOWS_TTY_PATH_ARGS])
	expect(args).not.toContain("-NoProfile")
	return "C:\\tty;C:\\Windows\r\n"
}

describe("processPath", () => {
	it("prefers PATH over Path", () => {
		expect(processPath({ PATH: "/a", Path: "/b" })).toBe("/a")
	})

	it("uses Path when PATH is missing", () => {
		expect(processPath({ Path: "C:\\Windows" })).toBe("C:\\Windows")
	})

	it("returns empty when neither is set", () => {
		expect(processPath({})).toBe("")
	})
})

describe("pathEnv", () => {
	it("sets PATH and Path on a copy of the base env", () => {
		const env = pathEnv("/tty/bin", { HOME: "/home/me", PATH: "/old" })
		expect(env.PATH).toBe("/tty/bin")
		expect(env.Path).toBe("/tty/bin")
		expect(env.HOME).toBe("/home/me")
	})
})

describe("isTtyEnvKeep", () => {
	it("keeps identity, locale, TERM, and Windows profile roots", () => {
		expect(isTtyEnvKeep("HOME")).toBe(true)
		expect(isTtyEnvKeep("USER")).toBe(true)
		expect(isTtyEnvKeep("SHELL")).toBe(true)
		expect(isTtyEnvKeep("LANG")).toBe(true)
		expect(isTtyEnvKeep("LC_TIME")).toBe(true)
		expect(isTtyEnvKeep("TERM")).toBe(true)
		expect(isTtyEnvKeep("USERPROFILE")).toBe(true)
	})

	it("rejects PATH and leftover toolchain exports", () => {
		expect(isTtyEnvKeep("PATH")).toBe(false)
		expect(isTtyEnvKeep("Path")).toBe(false)
		expect(isTtyEnvKeep("NVM_BIN")).toBe(false)
		expect(isTtyEnvKeep("FNM_MULTISHELL_PATH")).toBe(false)
		expect(isTtyEnvKeep("COLORTERM")).toBe(false)
		expect(isTtyEnvKeep("TMPDIR")).toBe(false)
	})
})

describe("ttySnapshotEnv", () => {
	it("keeps HOME/SHELL/locale and uses a stock PATH", () => {
		const env = ttySnapshotEnv(
			{
				HOME: "/home/me",
				SHELL: "/bin/bash",
				USER: "me",
				LANG: "C.UTF-8",
				LC_TIME: "C",
				TERM: "xterm",
				PATH: "/stale/bin:/usr/bin",
				NVM_BIN: "/stale/bin",
			},
			"linux",
		)
		expect(env.HOME).toBe("/home/me")
		expect(env.SHELL).toBe("/bin/bash")
		expect(env.USER).toBe("me")
		expect(env.LANG).toBe("C.UTF-8")
		expect(env.LC_TIME).toBe("C")
		expect(env.TERM).toBe("xterm")
		expect(env.PATH).toBe(unixStockPath())
		expect(env.NVM_BIN).toBeUndefined()
	})

	it("drops parent PATH and leftover toolchain exports", () => {
		const env = ttySnapshotEnv(
			{
				HOME: "/home/me",
				PATH: "/poison",
				NVM_BIN: "/stale/bin",
				NVM_INC: "/stale/include",
				FNM_MULTISHELL_PATH: "/fnm",
				VOLTA_HOME: "/volta",
				ASDF_DIR: "/asdf",
				COLORTERM: "truecolor",
			},
			"linux",
		)
		expect(env.PATH).toBe("/usr/local/bin:/usr/bin:/bin")
		expect(env.NVM_BIN).toBeUndefined()
		expect(env.NVM_INC).toBeUndefined()
		expect(env.FNM_MULTISHELL_PATH).toBeUndefined()
		expect(env.VOLTA_HOME).toBeUndefined()
		expect(env.ASDF_DIR).toBeUndefined()
		expect(env.COLORTERM).toBeUndefined()
	})

	it("uses SystemRoot for the Windows stock PATH", () => {
		const env = ttySnapshotEnv({ USERPROFILE: "C:\\Users\\me", SYSTEMROOT: "C:\\Windows" }, "win32")
		expect(env.PATH).toBe(windowsStockPath({ SYSTEMROOT: "C:\\Windows" }))
		expect(env.Path).toBe(env.PATH)
		expect(env.USERPROFILE).toBe("C:\\Users\\me")
	})

	it("defaults Windows stock PATH to C:\\Windows when SystemRoot is missing", () => {
		expect(windowsStockPath({})).toBe("C:\\Windows\\System32;C:\\Windows")
	})
})

describe("unixPathSnapshotArgs", () => {
	it("uses interactive -ic for bash and sh", () => {
		expect(unixPathSnapshotArgs("/bin/bash")).toEqual([...UNIX_BASH_PATH_ARGS])
		expect(unixPathSnapshotArgs("bash")).toEqual(["-ic", PATH_PRINTF])
		expect(unixPathSnapshotArgs("/bin/sh")).toEqual(["-ic", PATH_PRINTF])
		expect(unixPathSnapshotArgs("bash.exe")).toEqual(["-ic", PATH_PRINTF])
	})

	it("uses login+interactive -lic for zsh", () => {
		expect(unixPathSnapshotArgs("/usr/bin/zsh")).toEqual([...UNIX_ZSH_PATH_ARGS])
		expect(unixPathSnapshotArgs("zsh")).toEqual(["-lic", PATH_PRINTF])
		expect(unixPathSnapshotArgs("zsh.exe")).toEqual(["-lic", PATH_PRINTF])
	})
})

describe("parsePathOutput", () => {
	it("returns the last non-empty line so interactive rc MOTD is ignored", () => {
		expect(parsePathOutput("welcome\n/usr/bin:/bin")).toBe("/usr/bin:/bin")
		expect(parsePathOutput("C:\\Windows\r\n")).toBe("C:\\Windows")
	})

	it("returns empty when stdout has no path line", () => {
		expect(parsePathOutput("")).toBe("")
		expect(parsePathOutput("   \n\n")).toBe("")
	})
})

describe("snapshotTtyPath", () => {
	it("spawns bash with -ic, not login-only -lc", () => {
		expect(snapshotTtyPath("linux", { SHELL: "/bin/bash", PATH: "/process" }, bashInteractive)).toEqual({
			path: "/interactive/bin:/usr/bin",
			source: "tty",
		})
	})

	it("does not pass parent toolchain exports or PATH into the TTY spawn", () => {
		let seen: NodeJS.ProcessEnv | undefined
		const spy: ExecFile = (_file, _args, env) => {
			seen = env
			return "/tty/bin\n"
		}
		snapshotTtyPath(
			"linux",
			{
				HOME: "/home/me",
				SHELL: "/bin/bash",
				PATH: "/stale/bin:/usr/bin",
				NVM_BIN: "/stale/bin",
				NVM_INC: "/stale/include",
			},
			spy,
		)
		expect(seen?.NVM_BIN).toBeUndefined()
		expect(seen?.NVM_INC).toBeUndefined()
		expect(seen?.PATH).toBe(unixStockPath())
		expect(seen?.HOME).toBe("/home/me")
		expect(seen?.SHELL).toBe("/bin/bash")

		snapshotTtyPath("win32", { USERPROFILE: "C:\\Users\\me", SYSTEMROOT: "D:\\Win", PATH: "C:\\stale" }, spy)
		expect(seen?.PATH).toBe(windowsStockPath({ SYSTEMROOT: "D:\\Win" }))
		expect(seen?.USERPROFILE).toBe("C:\\Users\\me")
	})

	it("TTY spawn env has no parent PATH or leftover toolchain exports", () => {
		if (process.platform === "win32") return
		const dir = mkdtempSync(join(tmpdir(), "crossdeps-tty-isolate-"))
		const shell = join(dir, "shell")
		writeFileSync(
			shell,
			[
				"#!/bin/sh",
				'if [ -n "${NVM_BIN-}" ] || [ -n "${FNM_MULTISHELL_PATH-}" ]; then',
				'  printf %s "LEAKED_VM"',
				"  exit 0",
				"fi",
				'case "$PATH" in',
				'  *poison*) printf %s "LEAKED_PATH"; exit 0 ;;',
				"esac",
				'printf %s "/isolated"',
				"",
			].join("\n"),
			{ mode: 0o755 },
		)
		chmodSync(shell, 0o755)
		const snap = snapshotTtyPath("linux", {
			HOME: dir,
			USER: "me",
			SHELL: shell,
			PATH: "/poison/bin:/usr/bin",
			NVM_BIN: "/poison/bin",
			FNM_MULTISHELL_PATH: "/fnm",
		})
		expect(snap).toEqual({ path: "/isolated", source: "tty" })
	})

	it("spawns zsh with -lic", () => {
		expect(snapshotTtyPath("darwin", { SHELL: "/bin/zsh", PATH: "/process" }, zshLoginInteractive)).toEqual({
			path: "/zsh/bin:/usr/bin",
			source: "tty",
		})
	})

	it("uses /bin/sh -ic when SHELL is unset", () => {
		expect(snapshotTtyPath("linux", { PATH: "/process" }, defaultSh)).toEqual({
			path: "/usr/bin",
			source: "tty",
		})
	})

	it("reads Path from PowerShell with a profile", () => {
		expect(snapshotTtyPath("win32", { PATH: "C:\\process" }, windowsProfilePath)).toEqual({
			path: "C:\\tty;C:\\Windows",
			source: "tty",
		})
	})

	it("falls back when the TTY spawn throws", () => {
		expect(snapshotTtyPath("linux", { PATH: "/process", SHELL: "/bin/bash" }, spawnFail)).toEqual({
			path: "/process",
			source: "process",
		})
		expect(snapshotTtyPath("win32", { PATH: "C:\\process" }, spawnFail)).toEqual({
			path: "C:\\process",
			source: "process",
		})
	})

	it("falls back when the TTY PATH is empty", () => {
		expect(snapshotTtyPath("linux", { PATH: "/process" }, emptyPath)).toEqual({
			path: "/process",
			source: "process",
		})
		expect(snapshotTtyPath("win32", { Path: "C:\\process" }, emptyPath)).toEqual({
			path: "C:\\process",
			source: "process",
		})
	})

	it("falls back to empty process PATH when that is empty too", () => {
		expect(snapshotTtyPath("linux", {}, emptyPath)).toEqual({ path: "", source: "process" })
	})

	it("takes PATH from bash interactive rc, not login-only files", () => {
		if (process.platform === "win32") return
		const bash = existsSync("/bin/bash") ? "/bin/bash" : "bash"
		const home = mkdtempSync(join(tmpdir(), "crossdeps-tty-bash-"))
		const interactiveDir = join(home, "interactive-bin")
		const loginDir = join(home, "login-bin")
		const poisonDir = join(home, "poison-bin")
		mkdirSync(interactiveDir)
		mkdirSync(loginDir)
		mkdirSync(poisonDir)
		writeFileSync(join(home, ".bashrc"), `export PATH=${JSON.stringify(interactiveDir)}":$PATH"\n`)
		writeFileSync(join(home, ".profile"), `export PATH=${JSON.stringify(loginDir)}":$PATH"\n`)
		writeFileSync(join(home, ".bash_profile"), `export PATH=${JSON.stringify(loginDir)}":$PATH"\n`)
		const env: NodeJS.ProcessEnv = {
			...process.env,
			HOME: home,
			SHELL: bash,
			PATH: `${poisonDir}:/usr/bin`,
			NVM_BIN: poisonDir,
		}
		delete env.BASH_ENV
		delete env.ENV
		const snap = snapshotTtyPath(process.platform, env)
		expect(snap.source).toBe("tty")
		expect(snap.path.split(":").includes(interactiveDir)).toBe(true)
		expect(snap.path.split(":").includes(loginDir)).toBe(false)
		expect(snap.path.split(":").includes(poisonDir)).toBe(false)
	})

	it("does not treat stdin as a TTY", () => {
		if (process.platform === "win32") return
		const dir = mkdtempSync(join(tmpdir(), "crossdeps-tty-stdin-"))
		const shell = join(dir, "shell")
		writeFileSync(
			shell,
			`#!/bin/sh
if [ -t 0 ]; then
  echo "/tty-stdin"
  exit 0
fi
printf %s "/no-tty-stdin"
`,
			{ mode: 0o755 },
		)
		chmodSync(shell, 0o755)
		const snap = snapshotTtyPath("linux", { ...process.env, SHELL: shell, PATH: "/process" })
		expect(snap).toEqual({ path: "/no-tty-stdin", source: "tty" })
	})

	it("snapshots a non-empty PATH from the real interactive shell on this OS", () => {
		const snap = snapshotTtyPath()
		expect(snap.path.length).toBeGreaterThan(0)
		expect(["tty", "process"]).toContain(snap.source)
	})
})

describe("TTY_PATH_FALLBACK_WARN", () => {
	it("is a stable warning string", () => {
		expect(TTY_PATH_FALLBACK_WARN).toContain("interactive-shell PATH")
	})
})
