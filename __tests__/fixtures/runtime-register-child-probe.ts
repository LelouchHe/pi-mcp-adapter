import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

/**
 * Drives the runtime-registration contract that pi-acp's ACP MCP bridge uses
 * (`pi-mcp-adapter:runtime-register:v1` on the shared event bus) against the
 * real adapter, so child-process tests exercise the integration seam instead
 * of a mocked one.
 *
 * Servers in `MCP_CHILD_RUNTIME_SERVERS` register on `session_start`, which is
 * the bridge's real timing. Whether that lands before or after the adapter
 * finishes initializing depends on how fast initialization completes, so the
 * queued-before-init path is pinned by a case whose configured server holds
 * initialization open. Servers in `MCP_CHILD_RUNTIME_LATE_SERVERS` register
 * after the first batch's tools are visible, which is always post-init.
 */
const REGISTER_EVENT = "pi-mcp-adapter:runtime-register:v1";

type Registration = { dispose(): Promise<void> };
type RuntimeRegistrationRequest = {
  version: 1;
  name: string;
  definition: Record<string, unknown>;
  result?: { ok: true; registration: Registration } | { ok: false; error: Error };
};
type RuntimeServerInput = { name: string; definition: Record<string, unknown>; expectTool?: string };

function parseServers(raw: string | undefined): RuntimeServerInput[] {
  if (!raw) return [];
  const parsed: unknown = JSON.parse(raw);
  if (!Array.isArray(parsed)) throw new Error("MCP_CHILD_RUNTIME_SERVERS must be a JSON array");
  return parsed as RuntimeServerInput[];
}

export default function runtimeRegisterChildProbe(pi: ExtensionAPI): void {
  const servers = parseServers(process.env.MCP_CHILD_RUNTIME_SERVERS);
  const lateServers = parseServers(process.env.MCP_CHILD_RUNTIME_LATE_SERVERS);
  const waitMs = Number(process.env.MCP_CHILD_RUNTIME_WAIT_MS ?? "5000");
  const registrations: Registration[] = [];

  function register(server: RuntimeServerInput): void {
    const request: RuntimeRegistrationRequest = { version: 1, name: server.name, definition: server.definition };
    pi.events.emit(REGISTER_EVENT, request);
    if (!request.result) {
      console.log(`RUNTIME_REGISTER_RESULT=${JSON.stringify({ name: server.name, ok: false, error: "the adapter recorded no result" })}`);
      return;
    }
    if (!request.result.ok) {
      console.log(`RUNTIME_REGISTER_RESULT=${JSON.stringify({ name: server.name, ok: false, error: request.result.error.message })}`);
      return;
    }
    registrations.push(request.result.registration);
    console.log(`RUNTIME_REGISTER_RESULT=${JSON.stringify({ name: server.name, ok: true })}`);
  }

  async function waitForTools(batch: RuntimeServerInput[]): Promise<Record<string, boolean>> {
    const wanted = batch.filter(server => server.expectTool).map(server => server.expectTool!);
    const deadline = Date.now() + waitMs;
    const ready = (): Record<string, boolean> =>
      Object.fromEntries(wanted.map(name => [name, pi.getAllTools().some(tool => tool.name === name)]));
    // Opt-in runtime servers connect without blocking session startup, so the
    // tools may materialize after the current event handler begins.
    while (Date.now() < deadline && Object.values(ready()).some(value => !value)) {
      await new Promise(resolve => setTimeout(resolve, 25));
    }
    return ready();
  }

  pi.on("session_start", () => {
    for (const server of servers) register(server);
  });

  pi.on("agent_start", async () => {
    if (servers.length > 0) {
      console.log(`RUNTIME_TOOLS_READY=${JSON.stringify(await waitForTools(servers))}`);
    }
    if (lateServers.length === 0) return;
    for (const server of lateServers) register(server);
    console.log(`RUNTIME_LATE_TOOLS_READY=${JSON.stringify(await waitForTools(lateServers))}`);
  });

  pi.on("session_shutdown", async () => {
    await Promise.all(registrations.splice(0).map(registration => registration.dispose()));
  });
}
