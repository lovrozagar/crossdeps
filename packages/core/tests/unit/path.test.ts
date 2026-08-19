import { describe, expect, it } from "vitest"
import {
	LOGIN_PATH_FALLBACK_WARN,
	UNIX_LOGIN_PATH_ARGS,
	WINDOWS_LOGIN_PATH_ARGS,
	pathEnv,
	processPath,
	snapshotLoginPath,
	type ExecFile,
} from "../../src/path.ts"

const unixZshPath: ExecFile = (file, args, env) => {
	expect(file).toBe("/bin/zsh")
	expect([...args]).toEqual([...UNIX_LOGIN_PATH_ARGS])
	expect(env.SHELL).toBe("/bin/zsh")
	return "/login/bin:/usr/bin\n"
}

const unixDefaultSh: ExecFile = (file, args) => {
	expect(file).toBe("/bin/sh")
	expect([...args]).toEqual([...UNIX_LOGIN_PATH_ARGS])
	return "/usr/bin"
}

const windowsProfilePath: ExecFile = (file, args) => {
	expect(file).toBe("powershell.exe")
	expect([...args]).toEqual([...WINDOWS_LOGIN_PATH_ARGS])
	expect(args).not.toContain("-NoProfile")
	return "C:\\login;C:\\Windows\r\n"
}

const spawnFail: ExecFile = () => {
	throw new Error("spawn ENOENT")
}

const emptyPath: ExecFile = () => "   \n"

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
		const env = pathEnv("/login/bin", { HOME: "/home/me", PATH: "/old" })
		expect(env.PATH).toBe("/login/bin")
		expect(env.Path).toBe("/login/bin")
		expect(env.HOME).toBe("/home/me")
	})
})

describe("snapshotLoginPath", () => {
	it("reads PATH from a unix login shell", () => {
		expect(snapshotLoginPath("linux", { SHELL: "/bin/zsh", PATH: "/process" }, unixZshPath)).toEqual({
			path: "/login/bin:/usr/bin",
			source: "login",
		})
	})

	it("uses /bin/sh when SHELL is unset", () => {
		expect(snapshotLoginPath("darwin", { PATH: "/process" }, unixDefaultSh)).toEqual({
			path: "/usr/bin",
			source: "login",
		})
	})

	it("reads Path from PowerShell with a profile", () => {
		expect(snapshotLoginPath("win32", { PATH: "C:\\process" }, windowsProfilePath)).toEqual({
			path: "C:\\login;C:\\Windows",
			source: "login",
		})
	})

	it("falls back when the login spawn throws", () => {
		expect(snapshotLoginPath("linux", { PATH: "/process", SHELL: "/bin/bash" }, spawnFail)).toEqual({
			path: "/process",
			source: "process",
		})
		expect(snapshotLoginPath("win32", { PATH: "C:\\process" }, spawnFail)).toEqual({
			path: "C:\\process",
			source: "process",
		})
	})

	it("falls back when the login PATH is empty", () => {
		expect(snapshotLoginPath("linux", { PATH: "/process" }, emptyPath)).toEqual({
			path: "/process",
			source: "process",
		})
		expect(snapshotLoginPath("win32", { Path: "C:\\process" }, emptyPath)).toEqual({
			path: "C:\\process",
			source: "process",
		})
	})

	it("falls back to empty process PATH when that is empty too", () => {
		expect(snapshotLoginPath("linux", {}, emptyPath)).toEqual({ path: "", source: "process" })
	})

	it("snapshots a non-empty PATH from the real login shell on this OS", () => {
		const snap = snapshotLoginPath()
		expect(snap.path.length).toBeGreaterThan(0)
		expect(["login", "process"]).toContain(snap.source)
	})
})

describe("LOGIN_PATH_FALLBACK_WARN", () => {
	it("is a stable warning string", () => {
		expect(LOGIN_PATH_FALLBACK_WARN).toContain("login-shell PATH")
	})
})
