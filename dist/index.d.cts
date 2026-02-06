import { Duplex } from 'node:stream';

/**
 * Type definitions for the Copilot Tunnel Host.
 *
 * This package provides a simple JSON-RPC proxy that exposes the Copilot CLI
 * over Dev Tunnels. Remote clients can use the standard @github/copilot-sdk
 * with cliUrl pointing to the tunnel.
 */

interface TunnelInfo {
    tunnelId: string;
    clusterId: string;
    /** Port for JSON-RPC protocol */
    port: number;
    /** GitHub username of the authenticated user */
    username?: string;
}
type ConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'error';
interface TunnelHostAdapterConfig {
    /** Port to expose through the tunnel */
    port: number;
    /** Minimum log level to emit (default: 'info') */
    logLevel?: 'debug' | 'info';
    /** Callback for status changes with optional disconnect reason */
    onStatusChange?: (status: ConnectionStatus, reason?: string) => void;
    /** Callback for authentication prompts (device flow) */
    onAuth?: (message: string, uri?: string, userCode?: string) => void;
    /** Logging callback */
    onLog?: (level: 'debug' | 'info' | 'warn' | 'error', message: string) => void;
}
interface TunnelHostAdapter {
    /** Start the tunnel and begin accepting connections */
    start(): Promise<TunnelInfo>;
    /** Stop the tunnel and disconnect all clients */
    stop(): Promise<void>;
    /** Register handler for client connections */
    onClientConnected(handler: (stream: Duplex, clientId: string) => void): () => void;
    /** Register handler for client disconnections */
    onClientDisconnected(handler: (clientId: string) => void): () => void;
    /** Clear stored token (call when server reports auth error) */
    clearStoredToken(): Promise<void>;
}
type Unsubscribe = () => void;

/**
 * Tunnel adapter that wraps the Dev Tunnels SDK for hosting.
 *
 * Creates a local TCP server and uses Dev Tunnels to expose it.
 * Clients connect via the tunnel relay, which proxies to the local server.
 */

declare class DevTunnelHostAdapter implements TunnelHostAdapter {
    private config;
    private server;
    private tunnel;
    private host;
    private managementClient;
    private clientHandlers;
    private disconnectHandlers;
    private clientCounter;
    private clients;
    private disconnectedClients;
    private isDisposed;
    private username;
    private currentToken;
    private hasEverConnected;
    private lastDisconnectReason;
    private disconnectedAt;
    private lastNetworkInterfaces;
    private networkCheckTimer;
    private lastNetworkCheckTime;
    private isNetworkAvailable;
    private retryCount;
    private sleepDetectionTimer;
    private lastSleepCheckTime;
    private readonly logLevel;
    constructor(config: TunnelHostAdapterConfig);
    private log;
    /**
     * Get a fingerprint of current network interfaces.
     * Changes indicate network state changed (e.g., wifi reconnected).
     */
    private getNetworkFingerprint;
    /**
     * Check if network is available by attempting DNS resolution with timeout.
     */
    private checkNetworkAvailable;
    /**
     * Start monitoring network for changes and system sleep/wake events.
     * When network is restored or system wakes from sleep, resets retryCount
     * so the next SDK retry will happen faster.
     */
    private startNetworkMonitoring;
    /**
     * Handle detected network interface change.
     */
    private handleNetworkChange;
    /**
     * Handle system wake from sleep.
     * Forces a reconnection attempt by resetting retry state, regardless of
     * whether network interfaces changed (they often don't when waking to same WiFi).
     */
    private handleSystemWake;
    /**
     * Stop network monitoring.
     */
    private stopNetworkMonitoring;
    /**
     * Start always-on sleep detection.
     * This runs even when connected to detect system wake events that may have
     * left the connection in a stale state.
     */
    private startSleepDetection;
    /**
     * Stop sleep detection.
     */
    private stopSleepDetection;
    /**
     * Handle system wake while tunnel is connected.
     * The underlying connection may be stale after sleep, so we trigger
     * a keepAlive to verify and potentially force reconnection.
     */
    private handleConnectedWake;
    /**
     * Handle connection status change from SDK.
     */
    private handleConnectionStatusChange;
    /**
     * Handle SDK retry event - speed up the first retry after network restoration.
     */
    private handleRetryEvent;
    /**
     * Check if an error indicates the tunnel doesn't exist (404).
     */
    private isTunnelNotFoundError;
    /**
     * Connect to the tunnel relay and set up event handlers.
     */
    private connectToTunnel;
    /**
     * Workaround for Dev Tunnels SDK bug: manually configure keepAlive on the host's SSH session.
     * The SDK only configures keepAlive for client→host sessions, not host→relay sessions.
     */
    private setupHostKeepAlive;
    /**
     * Create (or recreate) the tunnel management client.
     * The token callback reads from this.currentToken so it always uses
     * the latest token without closure issues.
     */
    private createManagementClient;
    /**
     * Check if an error indicates a 401 Unauthorized response from the tunnel service.
     */
    private isUnauthorizedError;
    /**
     * Execute a management client operation with automatic 401 retry.
     *
     * If the operation fails with 401:
     * 1. Try refreshing the access token using the stored refresh token
     * 2. If refresh succeeds, save new tokens, recreate management client, retry
     * 3. If refresh fails or no refresh token, clear tokens, run device flow, retry
     *
     * Only retries ONCE to prevent infinite loops.
     */
    private withAuthRetry;
    start(): Promise<TunnelInfo>;
    stop(): Promise<void>;
    onClientConnected(handler: (stream: Duplex, clientId: string) => void): () => void;
    onClientDisconnected(handler: (clientId: string) => void): () => void;
    private createServer;
    private connectWithTimeout;
    /**
     * Get a GitHub token for tunnel management.
     * Returns the stored access token if one exists (no expiry check — if it's
     * invalid, withAuthRetry() will handle the 401 and refresh/re-auth).
     * If no stored token exists, runs device flow to authenticate.
     * Also sets this.username for display purposes.
     */
    private getStoredOrNewToken;
    /**
     * Refresh an access token using a refresh token.
     */
    private refreshAccessToken;
    /**
     * Fetch the GitHub username for the given token.
     * Returns undefined if the fetch fails.
     */
    private fetchGitHubUsername;
    /**
     * Clear the stored token. Call this when the server reports an auth error.
     */
    clearStoredToken(): Promise<void>;
    /**
     * Authenticate using GitHub device code flow.
     * This allows users to authenticate without providing a token upfront.
     */
    private authenticateWithDeviceFlow;
    private sleep;
}
/**
 * Create a tunnel host adapter.
 */
declare function createTunnelHostAdapter(config: TunnelHostAdapterConfig): TunnelHostAdapter;

/**
 * Tunnel configuration persistence.
 *
 * Stores tunnel info in ~/.copilot/agent-tunnels/host-config.json
 * This allows the host to reuse the same tunnel across restarts.
 */
/**
 * Stored tunnel configuration.
 */
interface StoredTunnelConfig {
    tunnelId: string;
    clusterId: string;
    /** ISO timestamp when tunnel was created */
    createdAt: string;
}
/**
 * Get the full path to the config file.
 */
declare function getConfigPath(): string;
/**
 * Load stored tunnel config.
 * Returns null if no config exists or read fails.
 */
declare function loadTunnelConfig(): Promise<StoredTunnelConfig | null>;
/**
 * Save tunnel config to disk.
 * Creates the config directory if it doesn't exist.
 */
declare function saveTunnelConfig(config: StoredTunnelConfig): Promise<void>;
/**
 * Clear stored tunnel config.
 */
declare function clearTunnelConfig(): Promise<void>;

/**
 * JSON-RPC Proxy for Copilot CLI
 *
 * This module proxies JSON-RPC messages between tunnel clients and the Copilot CLI
 * running in --server mode. Communication with the CLI uses JSON-RPC over stdio
 * with LSP message framing.
 *
 * Architecture:
 * - Each tunnel client connection gets a ClientConnection
 * - A single CliProcess is shared across all sessions for a given working directory
 * - Each session.create creates a new session via the CLI
 * - Messages are routed to the correct session based on sessionId
 *
 * Protocol Methods (CLI protocol):
 *
 * Client methods:
 * - ping() -> {}
 * - getState() -> ConnectionState (derived from ping)
 * - session.create(config) -> { sessionId }
 * - session.resume(sessionId, config) -> { sessionId }
 * - session.list() -> { sessions }
 * - getLastSessionId() -> string | undefined (derived from session.list)
 * - session.delete(sessionId) -> void
 *
 * Session methods:
 * - session.send(sessionId, prompt, mode?) -> {}
 * - session.sendAndWait(sessionId, prompt, timeout?) -> events (implemented as send + wait for idle)
 * - session.getMessages(sessionId) -> { events }
 * - session.abort(sessionId) -> {}
 * - session.destroy(sessionId) -> {}
 *
 * Notifications (CLI -> host -> client):
 * - session.event(sessionId, event)
 *
 * Incoming requests from CLI (host responds):
 * - tool.call(sessionId, toolCallId, toolName, arguments) -> ToolResult
 *
 * Callbacks (host -> client, expecting response):
 * - tool.call (forwarded from CLI)
 * - permission.request
 */

interface JsonRpcProxyOptions {
    /** Path to the copilot CLI executable (default: "copilot") */
    cliPath?: string;
    /** Default working directory for the CLI (used if not specified in session.create) */
    cwd?: string;
    /** Log level for the CLI subprocess */
    cliLogLevel?: 'none' | 'error' | 'warning' | 'info' | 'debug' | 'all';
    /** Minimum log level to emit to onLog (default: 'info') */
    logLevel?: 'debug' | 'info';
    /** Logging callback */
    onLog?: (level: 'debug' | 'info' | 'warn' | 'error', message: string) => void;
    /**
     * GitHub token for Copilot authentication.
     * If provided, this token is passed to the CLI via COPILOT_GITHUB_TOKEN env var,
     * bypassing the keychain. This is useful when running headlessly or when you want
     * to use a specific token instead of stored credentials.
     */
    copilotToken?: string;
    /** Grace period in ms before killing unused CLI processes (default: 5 minutes) */
    cliGracePeriodMs?: number;
}
/**
 * JSON-RPC Proxy Host
 *
 * Accepts tunnel connections and manages client connections.
 * Uses Copilot CLI in --server mode for session management.
 * CLI processes are pooled and shared across connections with reference counting.
 */
declare class JsonRpcProxyHost {
    private clients;
    private readonly options;
    private readonly cliPoolManager;
    private readonly fsService;
    private readonly gitService;
    constructor(options?: JsonRpcProxyOptions);
    /**
     * Handle a new client connection from the tunnel.
     */
    handleClient(stream: Duplex, clientId: string): Promise<void>;
    /**
     * Handle client disconnection.
     */
    handleClientDisconnect(clientId: string): void;
    /**
     * Stop all client connections and dispose of CLI pool.
     */
    stop(): Promise<void>;
    /**
     * Get current CLI pool statistics (for debugging/monitoring).
     */
    getCliPoolStats(): {
        cwd: string;
        refCount: number;
        hasGraceTimer: boolean;
    }[];
}

export { type ConnectionStatus, DevTunnelHostAdapter, JsonRpcProxyHost, type JsonRpcProxyOptions, type StoredTunnelConfig, type TunnelHostAdapter, type TunnelHostAdapterConfig, type TunnelInfo, type Unsubscribe, clearTunnelConfig, createTunnelHostAdapter, getConfigPath, loadTunnelConfig, saveTunnelConfig };
