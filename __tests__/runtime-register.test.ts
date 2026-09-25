import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  initializeMcp: vi.fn(),
  lazyConnect: vi.fn(),
  updateStatusBar: vi.fn(),
  flushMetadataCache: vi.fn(),
  notifyToolMetadataUpdated: vi.fn(),
  initializeOAuth: vi.fn().mockResolvedValue(undefined),
  createOAuthRuntime: vi.fn((signal: AbortSignal) => ({ signal })),
  shutdownOAuth: vi.fn().mockResolvedValue(undefined),
  loadMcpConfig: vi.fn(() => ({ mcpServers: {} })),
  cloneMcpConfig: vi.fn((config: unknown) => structuredClone(config)),
  discoverConfiguredClaudePluginSkills: vi.fn(() => []),
  resolveConfiguredClaudePluginMcp: vi.fn((config: unknown) => structuredClone(config)),
  loadMetadataCache: vi.fn(() => null),
  isServerCacheValid: vi.fn(() => true),
  reconstructToolMetadata: vi.fn(() => []),
  buildProxyDescription: vi.fn(() => "MCP gateway"),
  createDirectToolExecutor: vi.fn(() => vi.fn()),
  getMissingConfiguredDirectToolServers: vi.fn(() => []),
  resolveDirectTools: vi.fn(() => []),
  showStatus: vi.fn(),
  showTools: vi.fn(),
  showPrompts: vi.fn(),
  reconnectServer: vi.fn(),
  reconnectServers: vi.fn(),
  authenticateServer: vi.fn(),
  logoutServer: vi.fn(),
  manageBearerToken: vi.fn(),
  openMcpAuthPanel: vi.fn(),
  openMcpPanel: vi.fn(),
  openMcpSetup: vi.fn(),
  writeProjectServerDisabledOverride: vi.fn(() => ({ path: "/tmp/project/.pi/mcp.json", changed: true })),
  executeAuthComplete: vi.fn(),
  executeAuthStart: vi.fn(),
  executeCall: vi.fn(),
  executeConnect: vi.fn(),
  executeDescribe: vi.fn(),
  executeInstructions: vi.fn(),
  executeList: vi.fn(),
  executeSearch: vi.fn(),
  executeStatus: vi.fn(),
  executeUiMessages: vi.fn(),
  getConfigPathFromArgv: vi.fn(() => undefined),
  normalizeDirectToolInputSchema: vi.fn((schema: unknown) => schema),
  truncateAtWord: vi.fn((text: string) => text),
}));

vi.mock("../init.ts", () => ({
  initializeMcp: mocks.initializeMcp,
  lazyConnect: mocks.lazyConnect,
  updateStatusBar: mocks.updateStatusBar,
  flushMetadataCache: mocks.flushMetadataCache,
  notifyToolMetadataUpdated: mocks.notifyToolMetadataUpdated,
}));

vi.mock("../mcp-auth-flow.ts", () => ({
  initializeOAuth: mocks.initializeOAuth,
  createOAuthRuntime: mocks.createOAuthRuntime,
  shutdownOAuth: mocks.shutdownOAuth,
}));

vi.mock("../config.ts", () => ({
  loadMcpConfig: mocks.loadMcpConfig,
  cloneMcpConfig: mocks.cloneMcpConfig,
  discoverConfiguredClaudePluginSkills: mocks.discoverConfiguredClaudePluginSkills,
  resolveConfiguredClaudePluginMcp: mocks.resolveConfiguredClaudePluginMcp,
  writeProjectServerDisabledOverride: mocks.writeProjectServerDisabledOverride,
}));

vi.mock("../metadata-cache.ts", () => ({
  loadMetadataCache: mocks.loadMetadataCache,
  isServerCacheValid: mocks.isServerCacheValid,
  reconstructToolMetadata: mocks.reconstructToolMetadata,
}));

vi.mock("../direct-tool-surface.ts", () => ({
  buildProxyDescription: mocks.buildProxyDescription,
  getLargeDirectToolsAdvisory: vi.fn(() => undefined),
  getMissingConfiguredDirectToolServers: mocks.getMissingConfiguredDirectToolServers,
  prepareDirectToolArguments: vi.fn((_schema: unknown, args: unknown) => args),
  resolveDirectTools: mocks.resolveDirectTools,
}));

vi.mock("../direct-tools.ts", () => ({
  createDirectToolExecutor: mocks.createDirectToolExecutor,
}));

vi.mock("../commands.ts", () => ({
  showStatus: mocks.showStatus,
  showTools: mocks.showTools,
  showPrompts: mocks.showPrompts,
  reconnectServer: mocks.reconnectServer,
  reconnectServers: mocks.reconnectServers,
  authenticateServer: mocks.authenticateServer,
  logoutServer: mocks.logoutServer,
  manageBearerToken: mocks.manageBearerToken,
  openMcpAuthPanel: mocks.openMcpAuthPanel,
  openMcpPanel: mocks.openMcpPanel,
  openMcpSetup: mocks.openMcpSetup,
}));

vi.mock("../proxy-modes.ts", () => ({
  executeAuthComplete: mocks.executeAuthComplete,
  executeAuthStart: mocks.executeAuthStart,
  executeCall: mocks.executeCall,
  executeConnect: mocks.executeConnect,
  executeDescribe: mocks.executeDescribe,
  executeInstructions: mocks.executeInstructions,
  executeList: mocks.executeList,
  executeSearch: mocks.executeSearch,
  executeStatus: mocks.executeStatus,
  executeUiMessages: mocks.executeUiMessages,
}));

vi.mock("../utils.ts", () => ({
  formatMcpFooterStatus: () => "MCP",
  formatTerminalError: (error: unknown) => error instanceof Error ? error.message : String(error),
  getConfigPathFromArgv: mocks.getConfigPathFromArgv,
  normalizeDirectToolInputSchema: mocks.normalizeDirectToolInputSchema,
  sanitizeTerminalText: (text: string) => text,
  truncateAtWord: mocks.truncateAtWord,
}));

function createState() {
  return {
    manager: {
      getAllConnections: () => new Map(),
      getConnection: vi.fn(() => undefined),
      close: vi.fn().mockResolvedValue(undefined),
    },
    lifecycle: {
      gracefulShutdown: vi.fn().mockResolvedValue(undefined),
      ensureConverged: vi.fn().mockResolvedValue(undefined),
      registerServer: vi.fn(),
      markKeepAlive: vi.fn(),
      unregisterServer: vi.fn(),
    },
    toolMetadata: new Map(),
    config: { mcpServers: {} } as { mcpServers: Record<string, unknown> },
    oauthRuntime: { signal: new AbortController().signal },
    failureTracker: new Map(),
    uiResourceHandler: {},
    consentManager: {},
    uiServer: null,
    completedUiSessions: [],
    openBrowser: vi.fn(),
  } as any;
}

function createEventBus() {
  const listeners = new Map<string, Set<(data: unknown) => void>>();
  return {
    emit(channel: string, data: unknown) {
      for (const listener of listeners.get(channel) ?? []) listener(data);
    },
    on(channel: string, listener: (data: unknown) => void) {
      const channelListeners = listeners.get(channel) ?? new Set();
      channelListeners.add(listener);
      listeners.set(channel, channelListeners);
      return () => channelListeners.delete(listener);
    },
  };
}

function createPi(events = createEventBus()) {
  const handlers = new Map<string, (...args: any[]) => unknown>();
  let activeTools = ["bash", "mcp"];
  return {
    handlers,
    api: {
      registerTool: vi.fn(),
      unregisterTool: vi.fn(() => true),
      registerFlag: vi.fn(),
      registerCommand: vi.fn(),
      on: vi.fn((event: string, handler: (...args: any[]) => unknown) => {
        handlers.set(event, handler);
      }),
      events,
      getAllTools: vi.fn(() => []),
      getActiveTools: vi.fn(() => activeTools),
      setActiveTools: vi.fn((nextActiveTools: string[]) => {
        activeTools = nextActiveTools;
      }),
    } as any,
  };
}

async function settle(): Promise<void> {
  await new Promise((resolve) => setImmediate(resolve));
  await new Promise((resolve) => setImmediate(resolve));
}

describe("runtime MCP server registration", () => {
  beforeEach(() => {
    vi.resetModules();
    for (const value of Object.values(mocks)) {
      if (typeof value === "function" && "mockReset" in value) value.mockReset();
    }
    mocks.initializeOAuth.mockResolvedValue(undefined);
    mocks.lazyConnect.mockResolvedValue(true);
    mocks.createOAuthRuntime.mockImplementation((signal: AbortSignal) => ({ signal }));
    mocks.shutdownOAuth.mockResolvedValue(undefined);
    mocks.loadMcpConfig.mockReturnValue({ mcpServers: {} });
    mocks.cloneMcpConfig.mockImplementation((config: unknown) => structuredClone(config));
    mocks.loadMetadataCache.mockReturnValue(null);
    mocks.isServerCacheValid.mockReturnValue(true);
    mocks.reconstructToolMetadata.mockReturnValue([]);
    mocks.buildProxyDescription.mockReturnValue("MCP gateway");
    mocks.createDirectToolExecutor.mockReturnValue(vi.fn());
    mocks.getMissingConfiguredDirectToolServers.mockReturnValue([]);
    mocks.resolveDirectTools.mockReturnValue([]);
    mocks.getConfigPathFromArgv.mockReturnValue(undefined);
    mocks.truncateAtWord.mockImplementation((text: string) => text);
  });

  it("throws when no adapter is installed for the Pi instance", async () => {
    const { registerMcpServer } = await import("../index.ts");
    const { api } = createPi();
    expect(() => registerMcpServer({ pi: api, name: "plugin", definition: { url: "https://example.test/mcp" } }))
      .toThrow("pi-mcp-adapter is not installed for this Pi instance");
  });

  it("registers from a distinct extension wrapper over the shared event bus", async () => {
    const state = createState();
    mocks.initializeMcp.mockResolvedValue(state);
    const { default: mcpAdapter, MCP_RUNTIME_REGISTER_EVENT } = await import("../index.ts");
    const events = createEventBus();
    const { api: adapterApi, handlers } = createPi(events);
    const { api: consumerApi } = createPi(events);
    mcpAdapter(adapterApi);
    await handlers.get("session_start")?.({}, {});
    await settle();

    const request = {
      version: 1 as const,
      name: "plugin-event",
      definition: { url: "https://event.test/mcp" },
    } as any;
    consumerApi.events.emit(MCP_RUNTIME_REGISTER_EVENT, request);

    expect(request.result).toMatchObject({ ok: true });
    expect(state.config.mcpServers["plugin-event"]).toMatchObject({
      url: "https://event.test/mcp",
      directTools: false,
    });
  });

  it("returns event registration failures in the mutable result", async () => {
    mocks.loadMcpConfig.mockReturnValue({ mcpServers: { configured: { url: "https://configured.test/mcp" } } });
    const state = createState();
    state.config.mcpServers = { configured: { url: "https://configured.test/mcp" } };
    mocks.initializeMcp.mockResolvedValue(state);
    const { default: mcpAdapter, MCP_RUNTIME_REGISTER_EVENT } = await import("../index.ts");
    const events = createEventBus();
    const { api, handlers } = createPi(events);
    mcpAdapter(api);
    await handlers.get("session_start")?.({}, {});
    await settle();

    const request = { version: 1, name: "configured", definition: { url: "https://other.test/mcp" } } as any;
    expect(() => events.emit(MCP_RUNTIME_REGISTER_EVENT, request)).not.toThrow();
    expect(request.result).toMatchObject({
      ok: false,
      error: expect.objectContaining({ message: 'MCP server "configured" is already registered' }),
    });
  });

  it("leaves a prefilled event result untouched", async () => {
    const state = createState();
    mocks.initializeMcp.mockResolvedValue(state);
    const { default: mcpAdapter, MCP_RUNTIME_REGISTER_EVENT } = await import("../index.ts");
    const events = createEventBus();
    const { api, handlers } = createPi(events);
    mcpAdapter(api);
    const registration = { dispose: vi.fn().mockResolvedValue(undefined) };
    const request = {
      version: 1,
      name: "ignored",
      definition: { url: "https://ignored.test/mcp" },
      result: { ok: true, registration },
    } as any;

    events.emit(MCP_RUNTIME_REGISTER_EVENT, request);
    await handlers.get("session_start")?.({}, {});
    await settle();

    expect(request.result.registration).toBe(registration);
    expect(state.config.mcpServers["ignored"]).toBeUndefined();
  });

  it("falls back to the shared event bus for a distinct extension wrapper", async () => {
    const state = createState();
    mocks.initializeMcp.mockResolvedValue(state);
    const { default: mcpAdapter, registerMcpServer } = await import("../index.ts");
    const events = createEventBus();
    const { api: adapterApi, handlers } = createPi(events);
    const { api: consumerApi } = createPi(events);
    mcpAdapter(adapterApi);
    await handlers.get("session_start")?.({}, {});
    await settle();

    registerMcpServer({ pi: consumerApi, name: "plugin-helper", definition: { url: "https://helper.test/mcp" } });

    expect(state.config.mcpServers["plugin-helper"]).toMatchObject({
      url: "https://helper.test/mcp",
      directTools: false,
    });
  });

  it("returns an isolated snapshot with the original direct-tool definition", async () => {
    const state = createState();
    mocks.initializeMcp.mockResolvedValue(state);
    const { default: mcpAdapter, registerMcpServer, getRuntimeMcpServerSnapshot } = await import("../index.ts");
    const { api, handlers } = createPi();
    mcpAdapter(api);
    await handlers.get("session_start")?.({}, {});
    await settle();

    const definition = {
      url: "https://snapshot.test/mcp",
      directTools: ["search"],
      headers: { Authorization: "Bearer test" },
    };
    registerMcpServer({ pi: api, name: "snapshot", definition });

    const first = getRuntimeMcpServerSnapshot({ pi: api, name: "snapshot" });
    expect(first).toEqual({ name: "snapshot", definition, runtime: true, persisted: false });
    expect(state.config.mcpServers["snapshot"]).toMatchObject({ directTools: ["search"] });
    expect(first.definition).not.toBe(definition);
    first.definition.headers!.Authorization = "Bearer changed";

    expect(getRuntimeMcpServerSnapshot({ pi: api, name: "snapshot" }).definition).toEqual(definition);
  });

  it("snapshots through a distinct extension wrapper and fails after disposal", async () => {
    const state = createState();
    mocks.initializeMcp.mockResolvedValue(state);
    const { default: mcpAdapter, registerMcpServer, getRuntimeMcpServerSnapshot, MCP_RUNTIME_SNAPSHOT_EVENT } = await import("../index.ts");
    const events = createEventBus();
    const { api: adapterApi, handlers } = createPi(events);
    const { api: consumerApi } = createPi(events);
    mcpAdapter(adapterApi);
    await handlers.get("session_start")?.({}, {});
    await settle();

    expect(() => getRuntimeMcpServerSnapshot({ pi: consumerApi, name: "missing" }))
      .toThrow('MCP runtime server "missing" is not registered or has been disposed');

    const registration = registerMcpServer({ pi: consumerApi, name: "event-snapshot", definition: { url: "https://event-snapshot.test/mcp" } });
    expect(getRuntimeMcpServerSnapshot({ pi: consumerApi, name: "event-snapshot" })).toMatchObject({
      name: "event-snapshot",
      definition: { url: "https://event-snapshot.test/mcp" },
      runtime: true,
      persisted: false,
    });

    const unsupported = { version: 99, name: "event-snapshot" } as any;
    events.emit(MCP_RUNTIME_SNAPSHOT_EVENT, unsupported);
    expect(unsupported.result).toMatchObject({
      ok: false,
      error: expect.objectContaining({ message: "Unsupported MCP runtime snapshot version: 99" }),
    });

    await registration.dispose();
    expect(() => getRuntimeMcpServerSnapshot({ pi: consumerApi, name: "event-snapshot" }))
      .toThrow('MCP runtime server "event-snapshot" is not registered or has been disposed');
  });

  it("registers after init, exposes the server in state, and disposes cleanly", async () => {
    const state = createState();
    mocks.initializeMcp.mockResolvedValue(state);
    const { default: mcpAdapter, registerMcpServer } = await import("../index.ts");
    const { api, handlers } = createPi();
    mcpAdapter(api);
    await handlers.get("session_start")?.({}, {});
    await settle();

    const registration = registerMcpServer({ pi: api, name: "plugin-a", definition: { url: "https://example.test/mcp" } });
    expect(state.config.mcpServers["plugin-a"]).toMatchObject({
      url: "https://example.test/mcp",
      directTools: false,
    });
    expect(state.lifecycle.registerServer).toHaveBeenCalledWith(
      "plugin-a",
      expect.objectContaining({ url: "https://example.test/mcp" }),
      undefined,
    );
    expect(mocks.lazyConnect).not.toHaveBeenCalled();

    await registration.dispose();
    expect(state.config.mcpServers["plugin-a"]).toBeUndefined();
    expect(state.lifecycle.unregisterServer).toHaveBeenCalledWith("plugin-a");
    expect(state.manager.close).toHaveBeenCalledWith("plugin-a");

    // Dispose is idempotent.
    await registration.dispose();
    expect(state.manager.close).toHaveBeenCalledTimes(1);
  });

  it("promotes a runtime registration with directTools into the native tool surface", async () => {
    const state = createState();
    mocks.initializeMcp.mockResolvedValue(state);
    mocks.resolveDirectTools.mockImplementation((config: any) =>
      config.mcpServers["plugin-direct"]?.directTools === true
        ? [
            {
              serverName: "plugin-direct",
              originalName: "echo",
              prefixedName: "plugin-direct_echo",
              description: "Echo",
              inputSchema: { type: "object" },
            },
          ]
        : [],
    );
    const { default: mcpAdapter, registerMcpServer } = await import("../index.ts");
    const { api, handlers } = createPi();
    mcpAdapter(api);
    await handlers.get("session_start")?.({}, {});
    await settle();

    const registration = registerMcpServer({
      pi: api,
      name: "plugin-direct",
      definition: { url: "https://direct.test/mcp", directTools: true },
    });
    await settle();

    expect(state.config.mcpServers["plugin-direct"]).toMatchObject({
      url: "https://direct.test/mcp",
      directTools: true,
      // Native tools are refreshed from the live catalog, so the fork keeps such
      // a server ready instead of letting it idle out.
      lifecycle: "lazy-keep-alive",
    });
    expect(state.lifecycle.registerServer).toHaveBeenCalledWith(
      "plugin-direct",
      expect.objectContaining({ url: "https://direct.test/mcp" }),
      { idleTimeout: 0 },
    );
    expect(mocks.lazyConnect).toHaveBeenCalledWith(state, "plugin-direct");
    expect(api.registerTool).toHaveBeenCalledWith(
      expect.objectContaining({ name: "plugin-direct_echo" }),
    );

    await registration.dispose();
  });

  it("auto-connects a runtime registration that selects directTools search mode", async () => {
    const state = createState();
    mocks.initializeMcp.mockResolvedValue(state);
    mocks.resolveDirectTools.mockImplementation((config: any) =>
      config.mcpServers["plugin-search"]?.directTools === "search"
        ? [
            {
              serverName: "plugin-search",
              originalName: "find",
              prefixedName: "plugin-search_find",
              description: "Find",
              inputSchema: { type: "object" },
            },
          ]
        : [],
    );
    const { default: mcpAdapter, registerMcpServer } = await import("../index.ts");
    const { api, handlers } = createPi();
    mcpAdapter(api);
    await handlers.get("session_start")?.({}, {});
    await settle();

    const registration = registerMcpServer({
      pi: api,
      name: "plugin-search",
      definition: { url: "https://search.test/mcp", directTools: "search" },
    });
    await settle();

    // Search-mode tools are only reachable through mcp({ search }), which reads
    // live metadata, so the mode survives the runtime direct-tools default and
    // still has to connect.
    expect(state.config.mcpServers["plugin-search"]).toMatchObject({
      url: "https://search.test/mcp",
      directTools: "search",
    });
    expect(state.config.mcpServers["plugin-search"]).not.toHaveProperty("lifecycle");
    expect(state.lifecycle.registerServer).toHaveBeenCalledWith(
      "plugin-search",
      expect.objectContaining({ url: "https://search.test/mcp" }),
      undefined,
    );
    expect(mocks.lazyConnect).toHaveBeenCalledWith(state, "plugin-search");
    expect(api.registerTool).toHaveBeenCalledWith(
      expect.objectContaining({ name: "plugin-search_find" }),
    );

    await registration.dispose();
  });

  it("keeps an explicit lifecycle on a runtime direct-tool registration", async () => {
    const state = createState();
    mocks.initializeMcp.mockResolvedValue(state);
    const { default: mcpAdapter, registerMcpServer } = await import("../index.ts");
    const { api, handlers } = createPi();
    mcpAdapter(api);
    await handlers.get("session_start")?.({}, {});
    await settle();

    const registration = registerMcpServer({
      pi: api,
      name: "plugin-explicit",
      definition: { url: "https://explicit.test/mcp", directTools: true, lifecycle: "lazy" },
    });
    await settle();

    expect(state.config.mcpServers["plugin-explicit"]).toMatchObject({
      url: "https://explicit.test/mcp",
      directTools: true,
      lifecycle: "lazy",
    });
    expect(state.lifecycle.registerServer).toHaveBeenCalledWith(
      "plugin-explicit",
      expect.objectContaining({ url: "https://explicit.test/mcp" }),
      undefined,
    );

    await registration.dispose();
  });

  // A non-null metadata cache makes the adapter take its deferred-session path,
  // so every case here starts with the cache absent (real initialization) and
  // only then installs the cached catalog the registration should report.
  const CACHED_ENTRY = { configHash: "hash", tools: [{ name: "echo", description: "Echo" }], resources: [] };

  async function startInitializedSession() {
    const state = createState();
    mocks.initializeMcp.mockResolvedValue(state);
    const { api, handlers } = createPi();
    const { default: mcpAdapter, registerMcpServer } = await import("../index.ts");
    mcpAdapter(api);
    await handlers.get("session_start")?.({}, {});
    await settle();
    expect(mocks.initializeMcp).toHaveBeenCalled();
    return { state, api, registerMcpServer };
  }

  it("wakes deferred initialization when a runtime server registers", async () => {
    mocks.loadMetadataCache.mockReturnValue({
      version: 1,
      servers: { "plugin-cached": { configHash: "hash", tools: [{ name: "echo" }], resources: [] } },
    });
    const { api, handlers } = createPi();
    const { default: mcpAdapter, registerMcpServer } = await import("../index.ts");
    mcpAdapter(api);
    await handlers.get("session_start")?.({}, { hasUI: false });
    await settle();

    // A cache-backed install with no configured servers defers initialization,
    // because deferring waits for live metadata of configured servers.
    expect(mocks.initializeMcp).not.toHaveBeenCalled();

    // A runtime registration is the first thing that needs the adapter, so it is
    // what wakes the deferred runtime rather than a later adapter tool call.
    registerMcpServer({
      pi: api,
      name: "plugin-cached",
      definition: { url: "https://cached.test/mcp", directTools: true },
    });
    await settle();

    expect(mocks.initializeMcp).toHaveBeenCalled();
  });

  it("reports the cached catalog for an opt-in registration with no live session", async () => {
    const { state, api, registerMcpServer } = await startInitializedSession();
    mocks.loadMetadataCache.mockReturnValue({ version: 1, servers: { "plugin-cached": CACHED_ENTRY } });
    mocks.reconstructToolMetadata.mockReturnValue([
      { name: "plugin-cached_echo", originalName: "echo", description: "Echo", inputSchema: { type: "object" } },
    ]);

    const registration = registerMcpServer({
      pi: api,
      name: "plugin-cached",
      definition: { url: "https://cached.test/mcp", directTools: true },
    });
    await settle();

    // The native tools for this server come from the cache, so the reported
    // catalog has to come from the same place until a live refresh replaces it.
    expect(mocks.reconstructToolMetadata).toHaveBeenCalledWith(
      "plugin-cached",
      expect.objectContaining({ configHash: "hash" }),
      "server",
      expect.objectContaining({ url: "https://cached.test/mcp" }),
      expect.any(Object),
      expect.any(Object),
    );
    expect(state.toolMetadata.get("plugin-cached")).toEqual([
      expect.objectContaining({ name: "plugin-cached_echo" }),
    ]);

    await registration.dispose();
  });

  it("clears a cached runtime catalog when the registration is disposed before replacement", async () => {
    const { state, api, registerMcpServer } = await startInitializedSession();
    mocks.loadMetadataCache.mockReturnValue({ version: 1, servers: { "plugin-reused": CACHED_ENTRY } });
    mocks.reconstructToolMetadata.mockReturnValue([
      { name: "plugin-reused_echo", originalName: "echo", description: "Old", inputSchema: { type: "object" } },
    ]);

    const original = registerMcpServer({
      pi: api,
      name: "plugin-reused",
      definition: { url: "https://old.test/mcp", directTools: true },
    });
    await settle();
    expect(state.toolMetadata.get("plugin-reused")).toEqual([
      expect.objectContaining({ description: "Old" }),
    ]);

    await original.dispose();
    expect(state.toolMetadata.has("plugin-reused")).toBe(false);

    const replacement = registerMcpServer({
      pi: api,
      name: "plugin-reused",
      definition: { url: "https://new.test/mcp", directTools: "search" },
    });
    await settle();
    expect(state.toolMetadata.has("plugin-reused")).toBe(false);
    await replacement.dispose();
  });

  it("drops cached runtime metadata after the cache entry expires", async () => {
    const { state, api, registerMcpServer } = await startInitializedSession();
    let cacheValid = true;
    mocks.isServerCacheValid.mockImplementation(() => cacheValid);
    mocks.loadMetadataCache.mockReturnValue({ version: 1, servers: { "plugin-expiring": CACHED_ENTRY } });
    mocks.reconstructToolMetadata.mockReturnValue([
      { name: "plugin-expiring_echo", originalName: "echo", description: "Cached", inputSchema: { type: "object" } },
    ]);

    const registration = registerMcpServer({
      pi: api,
      name: "plugin-expiring",
      definition: { url: "https://expiring.test/mcp", directTools: true },
    });
    await settle();
    expect(state.toolMetadata.has("plugin-expiring")).toBe(true);

    cacheValid = false;
    const trigger = registerMcpServer({
      pi: api,
      name: "plugin-trigger",
      definition: { url: "https://trigger.test/mcp" },
    });
    await settle();
    expect(state.toolMetadata.has("plugin-expiring")).toBe(false);

    await trigger.dispose();
    await registration.dispose();
  });

  it("clears cache-derived metadata when a runtime server is disposed and replaced", async () => {
    const { state, api, registerMcpServer } = await startInitializedSession();
    mocks.loadMetadataCache.mockReturnValue({ version: 1, servers: { "plugin-reused": CACHED_ENTRY } });
    mocks.reconstructToolMetadata.mockReturnValue([
      { name: "plugin-reused_echo", originalName: "echo", description: "Old", inputSchema: { type: "object" } },
    ]);

    const original = registerMcpServer({
      pi: api,
      name: "plugin-reused",
      definition: { url: "https://old.test/mcp", directTools: true },
    });
    await settle();
    expect(state.toolMetadata.get("plugin-reused")).toEqual([
      expect.objectContaining({ description: "Old" }),
    ]);

    await original.dispose();
    expect(state.toolMetadata.has("plugin-reused")).toBe(false);

    const replacement = registerMcpServer({
      pi: api,
      name: "plugin-reused",
      definition: { url: "https://new.test/mcp", directTools: "search" },
    });
    await settle();
    expect(state.toolMetadata.has("plugin-reused")).toBe(false);
    await replacement.dispose();
  });

  it("disposes a runtime registration after the MCP panel clones its definition", async () => {
    const { state, api, registerMcpServer } = await startInitializedSession();
    mocks.loadMetadataCache.mockReturnValue({ version: 1, servers: { "plugin-panel": CACHED_ENTRY } });
    mocks.reconstructToolMetadata.mockReturnValue([
      { name: "plugin-panel_echo", originalName: "echo", description: "Cached", inputSchema: { type: "object" } },
    ]);
    const registration = registerMcpServer({
      pi: api,
      name: "plugin-panel",
      definition: { url: "https://panel.test/mcp", directTools: true },
    });
    await settle();
    expect(state.toolMetadata.has("plugin-panel")).toBe(true);

    mocks.openMcpPanel.mockImplementation(async (_state, _pi, _ctx, _path, applyChanges) => {
      applyChanges(new Map([["plugin-panel", ["echo"]]]));
      return { configChanged: false };
    });
    const mcpCommand = api.registerCommand.mock.calls.find(([name]: [string]) => name === "mcp")?.[1];
    expect(mcpCommand).toBeDefined();
    await mcpCommand.handler("", {
      hasUI: true,
      cwd: "/tmp/project",
      ui: { notify: vi.fn(), setStatus: vi.fn(), theme: { fg: (_name: string, text: string) => text } },
      reload: vi.fn(),
    });

    expect(state.config.mcpServers["plugin-panel"]).toMatchObject({ directTools: ["echo"] });
    await registration.dispose();
    expect(state.config.mcpServers["plugin-panel"]).toBeUndefined();
    expect(state.toolMetadata.has("plugin-panel")).toBe(false);
  });

  it("does not delete new-session live metadata using an old runtime cache marker", async () => {
    const firstState = createState();
    const secondState = createState();
    const liveDefinition = { url: "https://configured.test/mcp", lifecycle: "eager" as const };
    secondState.config.mcpServers = { "plugin-shared": liveDefinition };
    secondState.toolMetadata.set("plugin-shared", [
      { name: "plugin-shared_current", originalName: "current", description: "Current", inputSchema: { type: "object" } },
    ]);
    mocks.initializeMcp.mockReset().mockResolvedValueOnce(firstState).mockResolvedValueOnce(secondState);
    mocks.loadMetadataCache.mockReturnValue({ version: 1, servers: { "plugin-shared": CACHED_ENTRY } });
    mocks.reconstructToolMetadata.mockReturnValue([
      { name: "plugin-shared_old", originalName: "old", description: "Old cached", inputSchema: { type: "object" } },
    ]);

    const { api, handlers } = createPi();
    const { default: mcpAdapter, registerMcpServer } = await import("../index.ts");
    mcpAdapter(api);
    await handlers.get("session_start")?.({}, {});
    await settle();

    const registration = registerMcpServer({
      pi: api,
      name: "plugin-shared",
      definition: { url: "https://old.test/mcp", directTools: true },
    });
    await settle();
    expect(firstState.toolMetadata.get("plugin-shared")).toEqual([
      expect.objectContaining({ description: "Old cached" }),
    ]);

    // The next session now has a configured server with the same name; the
    // runtime registration is skipped as shadowed, but its old cache marker must
    // not delete the new state's already-discovered live metadata.
    mocks.loadMcpConfig.mockReturnValue({ mcpServers: { "plugin-shared": liveDefinition } });
    await handlers.get("session_start")?.({}, {});
    await settle();

    expect(secondState.toolMetadata.get("plugin-shared")).toEqual([
      expect.objectContaining({ description: "Current" }),
    ]);
    await registration.dispose();
  });

  it("expires cached report metadata on failure notifications while direct tools are frozen", async () => {
    const state = createState();
    mocks.initializeMcp.mockResolvedValue(state);
    mocks.loadMcpConfig.mockReturnValue({ settings: { freezeDirectTools: true }, mcpServers: {} });
    mocks.loadMetadataCache.mockReturnValue({ version: 1, servers: { "plugin-frozen": CACHED_ENTRY } });
    mocks.reconstructToolMetadata.mockReturnValue([
      { name: "plugin-frozen_echo", originalName: "echo", description: "Cached", inputSchema: { type: "object" } },
    ]);
    let cacheValid = true;
    mocks.isServerCacheValid.mockImplementation(() => cacheValid);

    const { default: mcpAdapter, registerMcpServer } = await import("../index.ts");
    const { api, handlers } = createPi();
    mcpAdapter(api);
    await handlers.get("session_start")?.({}, {});
    await settle();

    const registration = registerMcpServer({
      pi: api,
      name: "plugin-frozen",
      definition: { url: "https://frozen.test/mcp", directTools: true },
    });
    await settle();
    expect(state.toolMetadata.has("plugin-frozen")).toBe(true);

    cacheValid = false;
    state.onToolMetadataUpdated?.("plugin-frozen", "failure-backoff-started");
    await settle();
    expect(state.toolMetadata.has("plugin-frozen")).toBe(false);

    await registration.dispose();
  });

  it("drops cache-derived metadata when its cache entry expires", async () => {
    const { state, api, registerMcpServer } = await startInitializedSession();
    let cacheValid = true;
    mocks.isServerCacheValid.mockImplementation(() => cacheValid);
    mocks.loadMetadataCache.mockReturnValue({ version: 1, servers: { "plugin-expiring": CACHED_ENTRY } });
    mocks.reconstructToolMetadata.mockReturnValue([
      { name: "plugin-expiring_echo", originalName: "echo", description: "Cached", inputSchema: { type: "object" } },
    ]);

    const registration = registerMcpServer({
      pi: api,
      name: "plugin-expiring",
      definition: { url: "https://expiring.test/mcp", directTools: true },
    });
    await settle();
    expect(state.toolMetadata.has("plugin-expiring")).toBe(true);

    // Failure notifications keep the catalog cache-derived; later expiry must
    // still invalidate it instead of treating it as live metadata.
    expect(state.onToolMetadataUpdated).toEqual(expect.any(Function));
    state.onToolMetadataUpdated("plugin-expiring", "failure-backoff-started");
    await settle();
    expect(state.toolMetadata.has("plugin-expiring")).toBe(true);

    cacheValid = false;
    const trigger = registerMcpServer({
      pi: api,
      name: "plugin-trigger",
      definition: { url: "https://trigger.test/mcp" },
    });
    await settle();
    expect(state.toolMetadata.has("plugin-expiring")).toBe(false);

    await trigger.dispose();
    await registration.dispose();
  });

  it("does not expire live metadata after it replaces a cache-derived catalog", async () => {
    const { state, api, registerMcpServer } = await startInitializedSession();
    let cacheValid = true;
    mocks.isServerCacheValid.mockImplementation(() => cacheValid);
    mocks.loadMetadataCache.mockReturnValue({ version: 1, servers: { "plugin-live-update": CACHED_ENTRY } });
    mocks.reconstructToolMetadata.mockReturnValue([
      { name: "plugin-live-update_echo", originalName: "echo", description: "Cached", inputSchema: { type: "object" } },
    ]);

    const registration = registerMcpServer({
      pi: api,
      name: "plugin-live-update",
      definition: { url: "https://live-update.test/mcp", directTools: true },
    });
    await settle();
    expect(state.toolMetadata.get("plugin-live-update")).toEqual([
      expect.objectContaining({ description: "Cached" }),
    ]);

    const liveMetadata = [
      { name: "plugin-live-update_echo", originalName: "echo", description: "Live", inputSchema: { type: "object" } },
    ];
    state.toolMetadata.set("plugin-live-update", liveMetadata);
    state.onToolMetadataUpdated("plugin-live-update", "lifecycle-reconnect");
    await settle();

    cacheValid = false;
    const trigger = registerMcpServer({
      pi: api,
      name: "plugin-trigger-live",
      definition: { url: "https://trigger-live.test/mcp" },
    });
    await settle();
    expect(state.toolMetadata.get("plugin-live-update")).toEqual(liveMetadata);

    await trigger.dispose();
    await registration.dispose();
  });

  it("keeps the cached catalog out of a search-mode-only runtime registration", async () => {
    const { state, api, registerMcpServer } = await startInitializedSession();
    mocks.loadMetadataCache.mockReturnValue({ version: 1, servers: { "plugin-search": CACHED_ENTRY } });
    mocks.reconstructToolMetadata.mockReturnValue([
      { name: "plugin-search_echo", originalName: "echo", description: "Echo", inputSchema: { type: "object" } },
    ]);

    registerMcpServer({
      pi: api,
      name: "plugin-search",
      definition: { url: "https://search.test/mcp", directTools: "search" },
    });
    await settle();

    // Search mode reads live metadata on purpose, so a cached list must not be
    // presented as the server's catalog.
    expect(mocks.reconstructToolMetadata).not.toHaveBeenCalled();
    expect(state.toolMetadata.has("plugin-search")).toBe(false);
  });

  it("prefers live metadata over the cached catalog", async () => {
    const { state, api, registerMcpServer } = await startInitializedSession();
    state.toolMetadata.set("plugin-live", [
      { name: "plugin-live_echo", originalName: "echo", description: "Live", inputSchema: { type: "object" } },
    ]);
    mocks.loadMetadataCache.mockReturnValue({ version: 1, servers: { "plugin-live": CACHED_ENTRY } });
    mocks.reconstructToolMetadata.mockReturnValue([
      { name: "plugin-live_echo", originalName: "echo", description: "Stale", inputSchema: { type: "object" } },
    ]);

    registerMcpServer({
      pi: api,
      name: "plugin-live",
      definition: { url: "https://live.test/mcp", directTools: true },
    });
    await settle();

    expect(mocks.reconstructToolMetadata).not.toHaveBeenCalled();
    expect(state.toolMetadata.get("plugin-live")).toEqual([
      expect.objectContaining({ description: "Live" }),
    ]);
  });

  it("fails closed on duplicate names against config and other registrations", async () => {
    mocks.loadMcpConfig.mockReturnValue({
      mcpServers: { configured: { url: "https://configured.test/mcp" } },
    });
    const state = createState();
    state.config.mcpServers = { configured: { url: "https://configured.test/mcp" } };
    mocks.initializeMcp.mockResolvedValue(state);
    const { default: mcpAdapter, registerMcpServer } = await import("../index.ts");
    const { api, handlers } = createPi();
    mcpAdapter(api);
    await handlers.get("session_start")?.({}, {});
    await settle();

    expect(() => registerMcpServer({ pi: api, name: "configured", definition: { url: "https://other.test/mcp" } }))
      .toThrow('MCP server "configured" is already registered');
    registerMcpServer({ pi: api, name: "plugin-a", definition: { url: "https://a.test/mcp" } });
    expect(() => registerMcpServer({ pi: api, name: "plugin-a", definition: { url: "https://b.test/mcp" } }))
      .toThrow('MCP server "plugin-a" is already registered');
  });

  it("queues pre-init registrations and drains them when init completes", async () => {
    const state = createState();
    mocks.initializeMcp.mockResolvedValue(state);
    const { default: mcpAdapter, registerMcpServer, getRuntimeMcpServerSnapshot } = await import("../index.ts");
    const { api, handlers } = createPi();
    mcpAdapter(api);

    registerMcpServer({
      pi: api,
      name: "early-plugin",
      definition: { url: "https://early.test/mcp", directTools: true },
    });
    expect(() => getRuntimeMcpServerSnapshot({ pi: api, name: "early-plugin" }))
      .toThrow('MCP runtime server "early-plugin" is unavailable because the adapter has no active state');

    await handlers.get("session_start")?.({}, {});
    await settle();

    expect(state.config.mcpServers["early-plugin"]).toMatchObject({
      url: "https://early.test/mcp",
      directTools: true,
    });
    expect(mocks.lazyConnect).toHaveBeenCalledWith(state, "early-plugin");
    expect(getRuntimeMcpServerSnapshot({ pi: api, name: "early-plugin" })).toMatchObject({
      name: "early-plugin",
      definition: { url: "https://early.test/mcp" },
      runtime: true,
      persisted: false,
    });
  });

  it("reapplies registrations across session restarts and keeps configured servers on collision", async () => {
    const firstState = createState();
    const secondState = createState();
    secondState.config.mcpServers = { "plugin-a": { url: "https://now-configured.test/mcp" } };
    mocks.initializeMcp.mockResolvedValueOnce(firstState).mockResolvedValueOnce(secondState);
    const { default: mcpAdapter, registerMcpServer, getRuntimeMcpServerSnapshot } = await import("../index.ts");
    const { api, handlers } = createPi();
    mcpAdapter(api);
    await handlers.get("session_start")?.({}, {});
    await settle();

    registerMcpServer({ pi: api, name: "plugin-a", definition: { url: "https://plugin.test/mcp" } });
    registerMcpServer({ pi: api, name: "plugin-b", definition: { url: "https://plugin-b.test/mcp" } });

    await handlers.get("session_start")?.({}, {});
    await settle();

    // Collision after restart: the configured server wins, fail closed.
    expect(secondState.config.mcpServers["plugin-a"]).toMatchObject({ url: "https://now-configured.test/mcp" });
    expect(secondState.config.mcpServers["plugin-b"]).toMatchObject({ url: "https://plugin-b.test/mcp" });
    expect(() => getRuntimeMcpServerSnapshot({ pi: api, name: "plugin-a" }))
      .toThrow('MCP runtime server "plugin-a" is shadowed by a configured server');
    expect(getRuntimeMcpServerSnapshot({ pi: api, name: "plugin-b" })).toMatchObject({
      name: "plugin-b",
      runtime: true,
      persisted: false,
    });
  });
});
