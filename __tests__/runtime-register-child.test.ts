import { execFile } from "node:child_process";
import { mkdtemp, mkdir, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { promisify } from "node:util";
import { afterEach, describe, expect, it } from "vitest";

const execFileAsync = promisify(execFile);
const roots: string[] = [];
const FIXTURE_SERVER = resolve("__tests__/fixtures/delayed-mcp-server.mjs");
const RUNTIME_PROBE = resolve("__tests__/fixtures/runtime-register-child-probe.ts");
const TOOL_CONTENT = { type: "text", text: "fixture evidence visible to the model" };

afterEach(async () => {
  await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true })));
});

function readLines(stdout: string, prefix: string): unknown[] {
  return stdout
    .split("\n")
    .filter(line => line.startsWith(`${prefix}=`))
    .map(line => JSON.parse(line.slice(prefix.length + 1)) as unknown);
}

// Pi re-emits session_start on reload, and the bridge re-registers on every
// session start, so the same name can legitimately appear more than once.
function registrationOutcome(stdout: string): { names: string[]; rejected: unknown[] } {
  const results = readLines(stdout, "RUNTIME_REGISTER_RESULT") as Array<{ name: string; ok: boolean }>;
  return {
    names: [...new Set(results.map(result => result.name))].sort(),
    rejected: results.filter(result => !result.ok),
  };
}

/** Each fixture server records its pid on spawn, so an empty directory proves it never started. */
async function spawnCount(dir: string): Promise<number> {
  return (await readdir(dir)).length;
}

function runtimeServer(
  name: string,
  options: { pidDir: string; directTools?: unknown },
): { name: string; definition: Record<string, unknown>; expectTool: string } {
  return {
    name,
    definition: {
      command: process.execPath,
      args: [FIXTURE_SERVER],
      env: { MCP_RELOAD_PID_DIR: options.pidDir },
      ...(options.directTools === undefined ? {} : { directTools: options.directTools }),
    },
    expectTool: `${name}_reload_identity`,
  };
}

async function createRoot(pidDirs: string[]): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "pi-mcp-runtime-register-"));
  roots.push(root);
  await Promise.all(pidDirs.map(dir => mkdir(join(root, dir))));
  return root;
}

async function runChild(
  root: string,
  env: Record<string, string>,
  configured: unknown = { mcpServers: {} },
): Promise<{ stdout: string; stderr: string }> {
  const agentDir = join(root, "agent");
  const projectDir = join(root, "project");
  await Promise.all([mkdir(agentDir, { recursive: true }), mkdir(projectDir, { recursive: true })]);
  const configPath = join(agentDir, "mcp.json");
  // Runtime servers are never written to disk: everything the child sees
  // arrives through the runtime-registration event, exactly like pi-acp's
  // ACP MCP bridge.
  await writeFile(configPath, JSON.stringify(configured));

  return execFileAsync(
    process.execPath,
    ["--import", "tsx", resolve("__tests__/fixtures/direct-tools-child-harness.ts")],
    {
      cwd: process.cwd(),
      env: {
        ...process.env,
        PI_CODING_AGENT_DIR: agentDir,
        MCP_CHILD_CONFIG: configPath,
        MCP_CHILD_PROJECT_DIR: projectDir,
        MCP_CHILD_ADAPTER_PATH: resolve("index.ts"),
        MCP_CHILD_RUNTIME_PROBE_PATH: RUNTIME_PROBE,
        ...env,
      },
      timeout: 30_000,
    },
  );
}

describe("runtime MCP registration in a child Pi process", () => {
  it("materializes opt-in direct tools registered at session start and later in the session", async () => {
    const root = await createRoot(["early", "late"]);
    const { stdout, stderr } = await runChild(root, {
      MCP_CHILD_TOOLS: "runtimefx_reload_identity,latefx_reload_identity",
      MCP_CHILD_RUNTIME_SERVERS: JSON.stringify([
        runtimeServer("runtimefx", { pidDir: join(root, "early"), directTools: true }),
      ]),
      MCP_CHILD_RUNTIME_LATE_SERVERS: JSON.stringify([
        runtimeServer("latefx", { pidDir: join(root, "late"), directTools: ["reload_identity"] }),
      ]),
      MCP_CHILD_INVOKE_TOOL: "latefx_reload_identity",
    });

    expect(stderr).not.toContain("MCP initialization failed");
    expect(registrationOutcome(stdout)).toEqual({ names: ["latefx", "runtimefx"], rejected: [] });
    expect(readLines(stdout, "RUNTIME_TOOLS_READY")).toEqual([{ runtimefx_reload_identity: true }]);
    expect(readLines(stdout, "RUNTIME_LATE_TOOLS_READY")).toEqual([{ latefx_reload_identity: true }]);
    expect(readLines(stdout, "DIRECT_TOOL_RESULT")).toEqual([[TOOL_CONTENT]]);
    expect(await spawnCount(join(root, "early"))).toBeGreaterThan(0);
    expect(await spawnCount(join(root, "late"))).toBeGreaterThan(0);
  });

  it("wakes cache-deferred startup when runtime registration arrives before adapter session_start", async () => {
    const root = await createRoot(["deferred"]);
    await mkdir(join(root, "agent"), { recursive: true });
    await writeFile(join(root, "agent", "mcp-cache.json"), JSON.stringify({ version: 1, servers: {} }));

    const { stdout, stderr } = await runChild(root, {
      MCP_CHILD_TOOLS: "runtimefx_reload_identity",
      MCP_CHILD_RUNTIME_WAIT_MS: "1500",
      MCP_CHILD_RUNTIME_PROBE_FIRST: "1",
      MCP_CHILD_RUNTIME_SERVERS: JSON.stringify([
        runtimeServer("runtimefx", { pidDir: join(root, "deferred"), directTools: true }),
      ]),
    });

    expect(stderr).not.toContain("MCP initialization failed");
    expect(registrationOutcome(stdout)).toEqual({ names: ["runtimefx"], rejected: [] });
    expect(readLines(stdout, "RUNTIME_TOOLS_READY")).toEqual([{ runtimefx_reload_identity: true }]);
    expect(await spawnCount(join(root, "deferred"))).toBeGreaterThan(0);
  });

  it("leaves a runtime registration without direct-tool opt-in proxy-only", async () => {
    const root = await createRoot(["noopt"]);
    const { stdout, stderr } = await runChild(root, {
      MCP_CHILD_TOOLS: "runtimefx_reload_identity",
      MCP_CHILD_RUNTIME_WAIT_MS: "1500",
      MCP_CHILD_RUNTIME_SERVERS: JSON.stringify([
        runtimeServer("runtimefx", { pidDir: join(root, "noopt") }),
      ]),
    });

    expect(stderr).not.toContain("MCP initialization failed");
    expect(registrationOutcome(stdout)).toEqual({ names: ["runtimefx"], rejected: [] });
    expect(readLines(stdout, "RUNTIME_TOOLS_READY")).toEqual([{ runtimefx_reload_identity: false }]);
    // Proxy-only means the server is never started at all, not merely that no
    // tool was published for it.
    expect(await spawnCount(join(root, "noopt"))).toBe(0);
  });

  it("keeps the same opt-in rule when the registration is queued before initialization finishes", async () => {
    const root = await createRoot(["opt", "noopt"]);
    const { stdout, stderr } = await runChild(
      root,
      {
        MCP_CHILD_TOOLS: "optfx_reload_identity",
        MCP_CHILD_RUNTIME_WAIT_MS: "3000",
        MCP_CHILD_RUNTIME_SERVERS: JSON.stringify([
          runtimeServer("optfx", { pidDir: join(root, "opt"), directTools: true }),
          runtimeServer("nooptfx", { pidDir: join(root, "noopt") }),
        ]),
        MCP_CHILD_INVOKE_TOOL: "optfx_reload_identity",
      },
      {
        mcpServers: {
          // Holds initialization open past the session_start registration, so
          // the adapter queues it and drains it after init. Verified from the
          // covered mutation: removing the drain-time opt-in guard fails here.
          bootfx: {
            command: process.execPath,
            args: [FIXTURE_SERVER],
            lifecycle: "eager",
            env: { MCP_FIXTURE_STARTUP_DELAY_MS: "1200" },
          },
        },
      },
    );

    expect(stderr).not.toContain("MCP initialization failed");
    expect(registrationOutcome(stdout)).toEqual({ names: ["nooptfx", "optfx"], rejected: [] });
    expect(readLines(stdout, "RUNTIME_TOOLS_READY")).toEqual([
      { nooptfx_reload_identity: false, optfx_reload_identity: true },
    ]);
    expect(readLines(stdout, "DIRECT_TOOL_RESULT")).toEqual([[TOOL_CONTENT]]);
    expect(await spawnCount(join(root, "opt"))).toBeGreaterThan(0);
    expect(await spawnCount(join(root, "noopt"))).toBe(0);
  }, 20_000);
});
