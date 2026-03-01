import { TokenStorage, TokenData, AuthGateway, DeviceCodeResponse, TokenResponse, TunnelGateway, TunnelLookupResult, Tunnel, TunnelConfigStore, TunnelConfig, ConnectivityMonitor, Disposable, ByteStream, ConnectionStatus, RequestHandler, NotificationHandler, TerminalCreateParams, TerminalCreateResult, TerminalAttachResult, TerminalListResult, TokenManager, TunnelResolver } from 'remote-sdk-common';
export { ConnectionStatus, Disposable } from 'remote-sdk-common';
import { Socket } from 'node:net';
import { IPty } from 'node-pty';
import { Command } from 'commander';

/**
 * KeychainTokenStorage — TokenStorage implementation using OS keychain via keytar.
 *
 * macOS: Keychain, Windows: Credential Vault, Linux: Secret Service (libsecret).
 */

declare class KeychainTokenStorage implements TokenStorage {
    load(): Promise<TokenData | null>;
    save(data: TokenData): Promise<void>;
    clear(): Promise<void>;
}

/**
 * DirectAuthGateway — AuthGateway implementation using direct HTTPS to github.com.
 *
 * Stateless HTTP transport. Returns raw GitHub responses — error classification
 * is done by TokenManager, not here.
 */

declare class DirectAuthGateway implements AuthGateway {
    requestDeviceCode(clientId: string, scopes: string): Promise<DeviceCodeResponse>;
    exchangeDeviceCode(clientId: string, deviceCode: string): Promise<TokenResponse>;
    refreshToken(clientId: string, refreshToken: string): Promise<TokenResponse>;
    private post;
}

/**
 * MgmtApiTunnelGateway — TunnelGateway implementation wrapping the MS Dev Tunnels SDK.
 *
 * Converts between the MS SDK's Tunnel type and our lean Tunnel type.
 * Each method receives a token parameter; the SDK's token callback reads from
 * a mutable `currentToken` field set before each call.
 */

declare class MgmtApiTunnelGateway implements TunnelGateway {
    private readonly client;
    private currentToken;
    constructor();
    getTunnel(tunnelId: string, clusterId: string, token: string): Promise<TunnelLookupResult | null>;
    listByLabel(label: string, token: string): Promise<Tunnel[]>;
    createTunnel(label: string, token: string): Promise<Tunnel>;
    addPort(tunnel: Tunnel, port: number, token: string): Promise<Tunnel>;
    removePorts(tunnel: Tunnel, token: string): Promise<void>;
    deleteTunnel(tunnel: Tunnel, token: string): Promise<void>;
}

/**
 * FileTunnelConfigStore — TunnelConfigStore implementation using the filesystem.
 *
 * Stores tunnel identity at ~/.copilot/agent-tunnels/host-config.json
 * so the host can reuse the same tunnel across restarts.
 *
 * Note: TunnelConfigStore is a synchronous interface — we use fs sync APIs.
 */

declare class FileTunnelConfigStore implements TunnelConfigStore {
    private readonly configPath;
    private readonly configDir;
    constructor(configDir?: string, label?: string);
    /** The full path to the config file on disk. */
    get filePath(): string;
    load(): TunnelConfig | null;
    save(config: TunnelConfig): void;
    clear(): void;
}

/**
 * NodeConnectivityMonitor — ConnectivityMonitor implementation for Node.js.
 *
 * Three detection mechanisms, consolidated into a single polling timer:
 * 1. Timer-drift sleep detection: if timer fires >30s late → onWake()
 * 2. Network interface fingerprinting: os.networkInterfaces() change → DNS check
 * 3. DNS polling: dns.resolve() failure/recovery → onConnectivityChanged()
 */

declare class NodeConnectivityMonitor implements ConnectivityMonitor {
    private _isOnline;
    private timer;
    private lastTickTime;
    private lastFingerprint;
    private readonly connectivityHandlers;
    private readonly wakeHandlers;
    get isOnline(): boolean;
    start(): void;
    stop(): void;
    onConnectivityChanged(handler: (online: boolean) => void): Disposable;
    onWake(handler: () => void): Disposable;
    private tick;
    private checkDns;
    private updateOnlineState;
    private getNetworkFingerprint;
    private emitConnectivityChanged;
    private emitWake;
}

/**
 * SocketByteStream — adapts a Node.js net.Socket to the ByteStream interface.
 *
 * Zero-copy data path: Node.js Buffer extends Uint8Array, so data events
 * already satisfy the Uint8Array contract without conversion.
 */

declare class SocketByteStream implements ByteStream {
    private readonly socket;
    constructor(socket: Socket);
    get isOpen(): boolean;
    write(data: Uint8Array): void;
    onData(handler: (data: Uint8Array) => void): Disposable;
    onClose(handler: () => void): Disposable;
    onError(handler: (error: Error) => void): Disposable;
    close(): void;
}

/**
 * HostRelay — manages the relay connection, TCP server, and client sockets.
 *
 * Two-phase connect:
 *  1. listen() — creates TCP server, returns actual port
 *  2. connectRelay(tunnelId, clusterId) — connects TunnelRelayTunnelHost to the relay
 *
 * Between steps 1 and 2, the caller registers the port on the tunnel via TunnelResolver.
 *
 * Uses ConnectionGuard to augment SDK retry with jitter, fatal error classification,
 * and rich status model.
 */

interface HostRelayConfig {
    tokenProvider: () => Promise<string | null>;
    connectivityMonitor?: ConnectivityMonitor;
    keepAliveInterval?: number;
    connectionTimeout?: number;
    socketTimeout?: number;
    shouldRetry?: (error: Error) => boolean;
    gracePeriod?: number;
    onLog?: (level: string, message: string) => void;
}
declare class HostRelay {
    private readonly config;
    private readonly keepAliveSeconds;
    private readonly connectionTimeoutMs;
    private readonly socketTimeoutMs;
    private readonly gracePeriodMs;
    private server;
    private host;
    private managementClient;
    private connectionGuard;
    private _isRelayConnected;
    private _localPort;
    private isDisposed;
    private hasEverConnected;
    private clientCounter;
    private disconnectedAt;
    private readonly clients;
    private readonly disconnectedClients;
    private graceTimer;
    private readonly _clientStream;
    private readonly _clientDisconnected;
    private readonly _relayStatusChanged;
    constructor(config: HostRelayConfig);
    get isRelayConnected(): boolean;
    get localPort(): number | null;
    listen(preferredPort?: number): Promise<number>;
    connectRelay(tunnelId: string, clusterId: string): Promise<void>;
    disconnect(): Promise<void>;
    onClientStream(handler: (stream: ByteStream, clientId: string) => void): Disposable;
    onClientDisconnected(handler: (clientId: string) => void): Disposable;
    onRelayStatusChanged(handler: (status: ConnectionStatus, context?: string) => void): Disposable;
    /**
     * Request that the relay force a reconnection cycle.
     * Used by TunnelHost when post-reconnect operations (e.g., port
     * re-registration) fail and require a fresh relay connection.
     */
    requestReconnect(context: string): void;
    private createServer;
    private connectWithTimeout;
    private wireHostEvents;
    private handleGuardStatusChange;
    private startGraceTimer;
    private clearGraceTimer;
    private attemptRecovery;
    private setupHostKeepAlive;
    private log;
}

/**
 * ClientSession — per-client protocol stack on the host side.
 *
 * Composes RpcChannel (JSON-RPC 2.0) + Heartbeat (stale detection) over a
 * ByteStream. Automatically responds to client pings and sends its own
 * pings to detect dead connections.
 *
 * Created by TunnelHost when a client connects. The consumer registers
 * request/notification handlers and uses request()/notify() to communicate.
 */

interface ClientSessionConfig {
    heartbeatInterval?: number;
    heartbeatTimeout?: number;
    heartbeatThreshold?: number;
}
declare class ClientSession {
    readonly clientId: string;
    private readonly channel;
    private readonly heartbeat;
    private userRequestHandler;
    constructor(stream: ByteStream, clientId: string, config?: ClientSessionConfig);
    request(method: string, params?: unknown, timeout?: number): Promise<unknown>;
    notify(method: string, params?: unknown): void;
    onRequest(handler: RequestHandler): Disposable;
    onNotification(handler: NotificationHandler): Disposable;
    get isClosed(): boolean;
    close(): void;
    onClose(handler: (reason?: Error) => void): Disposable;
}

/**
 * Factory interface for creating and destroying pooled resources.
 */
interface ResourceFactory<K, R> {
    /** Create a new resource for the given key. */
    create(key: K): Promise<R>;
    /** Destroy a resource (cleanup, free resources). */
    destroy(resource: R): Promise<void>;
    /** Optional health check. Unhealthy resources are recreated on next retain(). */
    isHealthy?(resource: R): boolean;
}
interface ResourcePoolConfig<K, R> {
    factory: ResourceFactory<K, R>;
    /** Grace period in ms before destroying idle resources. Default: 5000 */
    gracePeriodMs?: number;
    /** Converts a key to a string for map storage. Default: String(key) */
    keyToString?: (key: K) => string;
    /** Optional logging callback. */
    onLog?: (level: string, message: string) => void;
}
/**
 * Generic resource pool with reference counting and grace-period disposal.
 *
 * Extracts the retain/release/grace-period pattern from V1's CliPoolManager,
 * FileSystemProviderService, and GitProviderService into a single reusable component.
 */
declare class ResourcePool<K, R> {
    private readonly factory;
    private readonly gracePeriodMs;
    private readonly keyToString;
    private readonly log;
    private readonly pool;
    private readonly pendingCreations;
    private disposed;
    constructor(config: ResourcePoolConfig<K, R>);
    /**
     * Acquire a reference to a resource for the given key.
     * Creates the resource if it doesn't exist. Increments refCount.
     */
    retain(key: K): Promise<R>;
    /**
     * Release a reference to a resource. When refCount reaches 0,
     * starts a grace period timer before destroying.
     */
    release(key: K): void;
    /** Read-only access to a resource without affecting refCount. */
    get(key: K): R | undefined;
    /** Destroy all resources immediately, cancel all timers. */
    dispose(): Promise<void>;
    /** Returns pool statistics for monitoring/debugging. */
    getStats(): {
        entries: Map<string, {
            key: string;
            refCount: number;
            hasGraceTimer: boolean;
        }>;
    };
    private destroyEntry;
}

/** State reported by CopilotClient.getState(). */
type CopilotClientState = 'disconnected' | 'connecting' | 'connected' | 'error';
/** Shape of lifecycle events emitted by CopilotClient.on(). */
interface CopilotLifecycleEvent {
    type: string;
    sessionId: string;
    metadata?: {
        startTime: string;
        modifiedTime: string;
        summary?: string;
    };
}
/**
 * Interface for a CopilotClient instance.
 * Maps to the @github/copilot-sdk CopilotClient API surface.
 *
 * Lifecycle methods (start/stop/ping/getState) are used by the pool factory.
 * Session and status methods are used by RPC handlers.
 */
interface CopilotClient {
    start(): Promise<void>;
    stop(): Promise<void>;
    ping(): Promise<unknown>;
    getState(): CopilotClientState;
    createSession(config: unknown): Promise<unknown>;
    resumeSession?(id: string, config: unknown): Promise<unknown>;
    listSessions?(): Promise<unknown[]>;
    deleteSession?(id: string): Promise<void>;
    getLastSessionId?(): Promise<string | undefined>;
    getAuthStatus?(): Promise<unknown>;
    getStatus?(): Promise<unknown>;
    listModels?(): Promise<unknown[]>;
    rpc?: {
        models: {
            list(): Promise<{
                models: unknown[];
            }>;
        };
    };
    on?(handler: (event: CopilotLifecycleEvent) => void): () => void;
}
interface CopilotServiceConfig {
    /**
     * Factory function that creates a new CopilotClient for a given cwd.
     * When wired to the real SDK, this would be:
     *   (cwd) => new SdkCopilotClient({ cwd, useStdio: true, logLevel, autoRestart: true, githubToken })
     */
    createClient: (cwd: string) => CopilotClient;
    /** Grace period before idle clients are stopped. Default: 5 minutes. */
    gracePeriodMs?: number;
    /** Optional logging callback. */
    onLog?: (level: string, message: string) => void;
}
/**
 * Manages a pool of CopilotClient instances keyed by working directory.
 *
 * Built on ResourcePool — provides reference counting, grace-period disposal,
 * health checking, and race protection for concurrent retains.
 *
 * Multiple tunnel clients working in the same directory share one CopilotClient.
 */
declare class CopilotService {
    private readonly pool;
    private readonly lifecycleHandlers;
    private readonly clientUnsubs;
    constructor(config: CopilotServiceConfig);
    /** Acquire a reference to a CopilotClient for the given cwd. */
    retain(cwd: string): Promise<CopilotClient>;
    /** Release a reference. When refCount hits 0, grace period starts. */
    release(cwd: string): void;
    /** Read-only access without affecting refCount. */
    get(cwd: string): CopilotClient | undefined;
    /**
     * Subscribe to lifecycle events from ALL pooled CopilotClients.
     * Events are forwarded as each client emits them — no extra retain is held.
     * Returns an unsubscribe function.
     */
    onLifecycleEvent(handler: (event: CopilotLifecycleEvent) => void): () => void;
    /** Stop all clients immediately. */
    dispose(): Promise<void>;
}

/**
 * Shared Type Definitions
 *
 * Core types used across the filesystem and git modules.
 */

/**
 * Event - A function that registers a listener and returns a disposable.
 *
 * This is the VS Code event pattern where:
 * - Consumers call the event function with a listener
 * - The function returns a Disposable for cleanup
 * - Only the event owner can fire events
 *
 * @typeParam T - The type of data passed to the listener
 */
type Event<T> = (listener: (e: T) => void) => Disposable;

/** Metadata about a file or directory. */
interface FileStat {
    type: 'file' | 'directory';
    size: number;
    mtime: number;
    ctime: number;
    readonly?: boolean;
}
/** An entry in a directory listing. */
interface DirectoryEntry {
    name: string;
    type: 'file' | 'directory';
    isSymlink: boolean;
    isGitignored?: boolean;
}
/** Event fired when a directory's contents change. */
interface DirectoryListingChangedEvent {
    path: string;
    entries: DirectoryEntry[];
}
/** Event fired when a file's contents change externally. */
interface FileContentChangedEvent {
    path: string;
}
/** Event fired when a file or directory is renamed. */
interface FileRenamedEvent {
    oldPath: string;
    newPath: string;
    isDirectory: boolean;
}
/** Event fired when a file or directory is deleted. */
interface FileDeletedEvent {
    path: string;
    isDirectory: boolean;
}
/** Options for delete operations. */
interface DeleteOptions {
    recursive?: boolean;
}
/**
 * The core filesystem provider interface.
 *
 * Provides unified file operations with integrated change watching.
 * All paths are absolute. The provider is scoped to a CWD but can
 * access any path on the filesystem.
 */
interface FileSystemProvider {
    readonly cwd: string;
    stat(path: string): Promise<FileStat>;
    readDirectory(dirPath: string): Promise<DirectoryEntry[]>;
    readFile(filePath: string): Promise<Uint8Array>;
    readTextFile(filePath: string): Promise<string>;
    writeFile(filePath: string, content: Uint8Array): Promise<void>;
    delete(path: string, options?: DeleteOptions): Promise<void>;
    rename(oldPath: string, newPath: string): Promise<void>;
    createDirectory(dirPath: string): Promise<void>;
    exists(path: string): Promise<boolean>;
    startWatching(): Promise<void>;
    isWatching(): boolean;
    dispose(): Promise<void>;
    readonly onDirectoryListingChanged: Event<DirectoryListingChangedEvent>;
    readonly onFileContentChanged: Event<FileContentChangedEvent>;
    readonly onFileRenamed: Event<FileRenamedEvent>;
    readonly onFileDeleted: Event<FileDeletedEvent>;
}

interface FileSystemServiceConfig {
    /**
     * Factory that creates a FileSystemProvider for a given cwd.
     * When wired to the real provider:
     *   (cwd) => new DiskFileSystemProvider(cwd)
     */
    createProvider: (cwd: string) => FileSystemProvider;
    /** Grace period before idle providers are disposed. Default: 5000ms. */
    gracePeriodMs?: number;
    /**
     * Callback fired when a file's content changes.
     * Wired by the application layer to GitService.notifyFileChanged().
     * Fire-and-forget: errors are the caller's responsibility to handle.
     */
    onFileChanged?: (filePath: string) => void;
    /** Optional logging callback. */
    onLog?: (level: string, message: string) => void;
}
/**
 * Manages filesystem providers keyed by working directory.
 *
 * Built on ResourcePool — provides reference counting, grace-period disposal,
 * and race protection for concurrent retains.
 *
 * During grace period, the provider stays fully functional (watching for changes,
 * forwarding notifications). This is simpler than V1's approach of tearing down
 * subscriptions at refCount=0 — the cost of a few extra git notifications during
 * a 5s grace window is negligible, and re-acquisition is faster since the provider
 * is already warmed up.
 */
declare class FileSystemService {
    private readonly pool;
    constructor(config: FileSystemServiceConfig);
    /**
     * Acquire a filesystem provider for the given cwd.
     * Creates the provider and starts watching if it doesn't exist.
     */
    retain(cwd: string): Promise<FileSystemProvider>;
    /** Release a reference. When refCount hits 0, grace period starts. */
    release(cwd: string): void;
    /** Read-only access without affecting refCount. */
    get(cwd: string): FileSystemProvider | undefined;
    /** Stop all providers and clean up. */
    dispose(): Promise<void>;
}

/**
 * Git Provider v2 - Core Type Definitions
 *
 * This module defines the foundational types for the Git abstraction layer.
 * Unlike FileSystemProvider (CWD-scoped), GitProvider is repository-scoped -
 * multiple CWDs within the same repository share one provider instance.
 *
 * Design Philosophy:
 * - Repository-scoped: One provider per git root, not per CWD
 * - Semantic events: Events describe what changed, not how we detected it
 * - Efficient payloads: Include both full state and delta for flexibility
 */

/**
 * Possible states for a file in a git repository.
 *
 * These map to git's porcelain status output but with clearer names.
 */
type GitFileStatusCode = "added" | "modified" | "deleted" | "renamed" | "copied" | "untracked" | "ignored" | "unmerged";
/**
 * Status information for a single file.
 */
interface GitFileStatus {
    /** Relative path from git root */
    path: string;
    /** Current status of the file */
    status: GitFileStatusCode;
    /** Whether the file is staged for commit */
    staged: boolean;
    /** Original path if file was renamed (undefined otherwise) */
    originalPath?: string;
    /**
     * Whether the file has changes in the git index (staging area).
     *
     * This is particularly useful for unstaged entries of partially staged files.
     * When true on an unstaged entry, it indicates that the diff should be
     * shown as Index → Working Directory, not HEAD → Working Directory.
     *
     * For staged entries, this is always true (implied by staged: true).
     */
    hasIndexChanges?: boolean;
}
/**
 * Complete repository status.
 *
 * Provides a snapshot of the git state including branch info
 * and all changed files.
 */
interface GitStatus {
    /** Current branch name (or 'HEAD' if detached) */
    branch: string;
    /** Upstream tracking branch (e.g., 'origin/main') */
    upstream?: string;
    /** Number of commits ahead of upstream */
    ahead: number;
    /** Number of commits behind upstream */
    behind: number;
    /**
     * Map of file paths to their status.
     *
     * Key is relative path from git root.
     * Only includes files with changes (not unchanged files).
     */
    files: Map<string, GitFileStatus>;
}
/**
 * Information about a git commit.
 */
interface GitCommit {
    /** Full 40-character SHA hash */
    hash: string;
    /** Short hash (first 7 characters) for display */
    shortHash: string;
    /** Author name */
    author: string;
    /** Author email */
    email: string;
    /** Commit date */
    date: Date;
    /** Commit message (first line only for summary) */
    message: string;
    /** Parent commit hashes (usually 1, 2+ for merges) */
    parents: string[];
}
/**
 * Extended commit information for history display.
 *
 * This extends GitCommit with additional fields needed for
 * commit graph visualization and history browsing.
 */
interface HistoryCommit {
    /** Full 40-character SHA hash */
    id: string;
    /** Short hash (first 7 characters) for display */
    shortId: string;
    /** Commit subject (first line of message) */
    subject: string;
    /** Full commit message including body */
    message: string;
    /** Author name */
    author: string;
    /** Author email */
    authorEmail: string;
    /** Commit timestamp (milliseconds since epoch) */
    timestamp: number;
    /** Parent commit hashes (empty for root commits, 2+ for merges) */
    parentIds: string[];
    /** Refs pointing to this commit (branch names, tags) */
    refs?: string[];
}
/**
 * File changed in a commit.
 *
 * Represents a single file modification within a commit,
 * including its status (added/modified/deleted/renamed).
 */
interface CommitFile {
    /** Relative path from git root */
    path: string;
    /** Change status */
    status: GitFileStatusCode;
    /** Original path if renamed (undefined otherwise) */
    originalPath?: string;
    /** Lines added (0 for binary/deleted files) */
    additions: number;
    /** Lines removed (0 for binary/added files) */
    deletions: number;
    /** True if file is binary */
    isBinary: boolean;
}
/**
 * Options for fetching commit history.
 */
interface GetCommitHistoryOptions {
    /**
     * Maximum number of commits to return.
     * @default 50
     */
    limit?: number;
    /**
     * Number of commits to skip (for pagination).
     * @default 0
     */
    skip?: number;
    /**
     * Branch or ref to get history for.
     * Defaults to current HEAD.
     */
    ref?: string;
}
/**
 * Result of fetching commit history.
 */
interface CommitHistoryResult {
    /** The commits (newest first) */
    commits: HistoryCommit[];
    /** Whether there are more commits available */
    hasMore: boolean;
    /** Total count of commits (if available) */
    totalCount?: number;
}
/**
 * Options for creating a commit.
 */
interface GitCommitOptions {
    /** Specific files to commit (default: all staged) */
    files?: string[];
    /** Amend the previous commit instead of creating new */
    amend?: boolean;
    /** Add Signed-off-by trailer */
    signoff?: boolean;
}
/**
 * Options for checking out a branch or ref.
 */
interface GitCheckoutOptions {
    /**
     * Force checkout, discarding local changes.
     * Use with caution - will discard uncommitted modifications.
     */
    force?: boolean;
}
/**
 * Information about a git branch.
 */
interface GitBranch {
    /** Branch name (e.g., 'main', 'feature/foo') */
    name: string;
    /** Whether this is a remote-tracking branch */
    isRemote: boolean;
    /** Whether this is the currently checked-out branch */
    isCurrent: boolean;
    /** Commit hash the branch points to */
    commit: string;
    /** Upstream tracking branch (e.g., 'origin/main') */
    upstream?: string;
    /** Commits ahead of upstream (if tracking) */
    ahead?: number;
    /** Commits behind upstream (if tracking) */
    behind?: number;
    /** Date of the last commit on this branch */
    lastCommitDate?: Date;
    /** Message of the last commit on this branch */
    lastCommitMessage?: string;
}
/**
 * Statistics about uncommitted changes.
 */
interface GitDiffStats {
    /** Total lines added */
    added: number;
    /** Total lines removed */
    removed: number;
    /** Number of files with changes */
    files: number;
}
/**
 * Per-file diff statistics (lines added/removed).
 */
interface FileDiffStat {
    /** Lines added in this file */
    added: number;
    /** Lines removed from this file */
    removed: number;
}
/**
 * Map of file paths to their diff statistics.
 * Key is the relative path from git root.
 */
type PerFileDiffStats = Map<string, FileDiffStat>;
/**
 * Split diff statistics for staged and unstaged changes.
 */
interface SplitPerFileDiffStats {
    /** Stats for staged changes (index vs HEAD) */
    staged: PerFileDiffStats;
    /** Stats for unstaged changes (working tree vs index) */
    unstaged: PerFileDiffStats;
}
/**
 * File with its modification timestamp.
 */
interface FileWithTime {
    /** Relative path from git root */
    path: string;
    /** Modification time in milliseconds since epoch */
    mtime: number;
}
/**
 * Type of tracked branch for color-coding in the commit graph.
 *
 * VS Code-style coloring:
 * - current: Blue - commits ahead of upstream (local only)
 * - upstream: Purple - commits on upstream but ahead of base
 * - base: Orange - commits on the base branch (e.g., origin/main)
 */
type TrackedBranchType = "current" | "upstream" | "base";
/**
 * Information about a single tracked branch.
 */
interface TrackedBranch {
    /** Branch name (e.g., "main", "feature/foo") */
    name: string;
    /** Display name for badges (e.g., "main", "origin/main") */
    displayName: string;
    /** Type of tracked branch */
    type: TrackedBranchType;
    /** Commit ID this branch points to */
    commitId: string;
    /** Remote name (for upstream/base branches) */
    remote?: string;
}
/**
 * Complete tracked branch information for the current HEAD.
 *
 * Used to determine:
 * 1. Ref badges to display (with distinct colors)
 * 2. Swimlane color segments in the commit graph
 *
 * @example
 * ```typescript
 * const tracked = await git.getTrackedBranches();
 * // {
 * //   current: { name: "feature/foo", commitId: "abc123", type: "current" },
 * //   upstream: { name: "origin/feature/foo", commitId: "def456", type: "upstream" },
 * //   base: { name: "origin/main", commitId: "ghi789", type: "base" }
 * // }
 * ```
 */
interface TrackedBranchInfo {
    /** Current branch (where HEAD points) - Blue color */
    current: TrackedBranch | null;
    /** Upstream tracking branch - Purple color */
    upstream: TrackedBranch | null;
    /** Base branch (where feature was created from) - Orange color */
    base: TrackedBranch | null;
}
/**
 * Event fired when git status changes.
 *
 * Includes both the full status (for complete refresh) and delta
 * information (for incremental updates). Consumers can choose
 * which is more appropriate for their use case.
 */
interface GitStatusChangedEvent {
    /** Complete current status */
    status: GitStatus;
    /** Files added since last status (new changes) */
    added: string[];
    /** Files whose status changed since last status */
    modified: string[];
    /** Files no longer in changed state (reverted or committed) */
    removed: string[];
}
/**
 * Event fired when the current branch changes.
 *
 * Triggered by checkout, branch creation while checked out, etc.
 */
interface GitBranchChangedEvent {
    /** Previous branch name */
    previousBranch: string;
    /** New current branch name */
    currentBranch: string;
}
/**
 * Event fired when a commit is created.
 */
interface GitCommitCreatedEvent {
    /** The newly created commit */
    commit: GitCommit;
}
/**
 * Event fired when HEAD changes.
 *
 * More general than branch change - includes reset, rebase, etc.
 */
interface GitHeadChangedEvent {
    /** Previous HEAD commit hash */
    previousHead: string;
    /** New HEAD commit hash */
    currentHead: string;
    /** Whether this was a branch switch (vs reset/rebase) */
    isBranchSwitch: boolean;
}
/**
 * The core Git provider interface.
 *
 * Provides unified git operations with integrated status watching.
 * Scoped to a git repository (not CWD) - the service finds the
 * repository root automatically.
 *
 * Key Design Points:
 * 1. Repository-scoped: Multiple CWDs in same repo share one provider
 * 2. Debounced status: 100ms debounce prevents thrashing during operations
 * 3. Smart .git/ watching: Ignores noisy paths like objects/
 * 4. Operation tracking: Doesn't refresh during active git operations
 *
 * @example
 * ```typescript
 * const provider = await gitService.getProvider('/project/src');
 * // Returns provider for /project (the git root)
 *
 * const status = await provider.getStatus();
 * console.log('Branch:', status.branch);
 * console.log('Changed files:', status.files.size);
 *
 * provider.onStatusChanged((event) => {
 *   console.log('Status changed, added:', event.added.length);
 * });
 * ```
 */
interface GitProvider {
    /** The git repository root directory */
    readonly gitRoot: string;
    /** The CWD used to create this provider (for relative path resolution) */
    readonly cwd: string;
    /**
     * Get complete repository status.
     *
     * Returns branch info and all changed files.
     */
    getStatus(): Promise<GitStatus>;
    /**
     * Get status for a specific file.
     *
     * @param filePath - Relative path from git root
     * @returns null if file has no changes (is clean)
     */
    getFileStatus(filePath: string): Promise<GitFileStatus | null>;
    /**
     * Get current branch name.
     *
     * @returns 'HEAD' if in detached HEAD state
     */
    getCurrentBranch(): Promise<string>;
    /**
     * Get all branches (local and remote).
     */
    getBranches(): Promise<GitBranch[]>;
    /**
     * Get diff for a specific file.
     *
     * @param filePath - Relative path from git root
     * @param staged - If true, show staged changes; if false, unstaged changes
     * @returns Unified diff string
     */
    getFileDiff(filePath: string, staged?: boolean): Promise<string>;
    /**
     * Get file content at a specific ref (commit, branch, tag).
     *
     * Useful for showing the "original" version in diff views.
     *
     * @param filePath - Relative path from git root
     * @param ref - Git ref (e.g., 'HEAD', 'main', commit hash)
     * @throws If file doesn't exist at that ref
     */
    getFileAtRef(filePath: string, ref: string): Promise<string>;
    /**
     * Check if there are uncommitted changes.
     */
    hasUncommittedChanges(): Promise<boolean>;
    /**
     * Check if there are commits not pushed to upstream.
     */
    hasUnpushedCommits(): Promise<boolean>;
    /**
     * Get files changed between current HEAD and a base branch.
     *
     * Useful for "compare to main" feature - shows all files
     * in the current branch that differ from the base.
     *
     * @param baseBranch - Branch to compare against (e.g., 'main')
     * @returns Array of relative file paths
     */
    getChangedFilesFromBranch(baseBranch: string): Promise<string[]>;
    /**
     * Get git status relative to a base branch.
     *
     * Returns files that have been added, modified, or deleted
     * in the current branch compared to the base branch, WITH their proper
     * status (added, modified, deleted, renamed).
     *
     * Also overlays working tree changes (uncommitted modifications).
     *
     * @param baseBranch - Branch to compare against (e.g., 'main')
     * @returns Map of relative file paths to their GitFileStatus
     */
    getStatusFromBranch(baseBranch: string): Promise<Map<string, GitFileStatus>>;
    /**
     * Get diff statistics for uncommitted changes (lines added/removed).
     *
     * @returns Statistics about uncommitted changes
     */
    getUncommittedDiffStats(): Promise<GitDiffStats>;
    /**
     * Get per-file diff statistics for uncommitted changes.
     *
     * Returns lines added/removed for each changed file, split by staged/unstaged.
     * Useful for displaying diff stats next to file names in the UI.
     *
     * @returns Staged and unstaged stats separately
     */
    getPerFileDiffStats(): Promise<SplitPerFileDiffStats>;
    /**
     * Get the most recently modified dirty file.
     *
     * Useful for auto-selecting a file when opening the editor.
     *
     * @returns Relative path from git root, or null if no dirty files
     */
    getMostRecentDirtyFile(): Promise<string | null>;
    /**
     * Get all dirty files with their modification timestamps.
     *
     * Useful for sorting files by modification time in Follow mode.
     *
     * @returns Array of files with their modification times, sorted most recent first
     */
    getDirtyFilesWithTimes(): Promise<FileWithTime[]>;
    /**
     * Get the most recently modified file from recent commits.
     *
     * Fallback when there are no dirty files.
     *
     * @param commitLimit - Number of recent commits to check (default: 10)
     * @returns Relative path from git root, or null if none found
     */
    getMostRecentCommittedFile(commitLimit?: number): Promise<string | null>;
    /**
     * Revert changes to files (discard local modifications).
     *
     * For staged files, unstages them first then reverts.
     * For unstaged files, reverts directly.
     *
     * @param files - Relative paths from git root
     */
    revert(files: string[]): Promise<void>;
    /**
     * Get commit history with pagination support.
     *
     * Returns commits in topological order (newest first), which is required
     * for correct swimlane graph computation.
     *
     * @param options - Pagination and filtering options
     * @returns Paginated commit history result
     *
     * @example
     * ```typescript
     * // Get first 50 commits
     * const result = await provider.getCommitHistory({ limit: 50 });
     *
     * // Load more commits
     * if (result.hasMore) {
     *   const more = await provider.getCommitHistory({ limit: 50, skip: 50 });
     * }
     * ```
     */
    getCommitHistory(options?: GetCommitHistoryOptions): Promise<CommitHistoryResult>;
    /**
     * Get a single commit by its hash.
     *
     * @param commitId - Full or short commit hash
     * @returns The commit, or null if not found
     */
    getCommit(commitId: string): Promise<HistoryCommit | null>;
    /**
     * Get files changed in a specific commit.
     *
     * Returns the list of files modified by the commit with their
     * status (added/modified/deleted/renamed) and diff statistics.
     *
     * @param commitId - Full or short commit hash
     * @returns Array of files changed in the commit
     */
    getCommitFiles(commitId: string): Promise<CommitFile[]>;
    /**
     * Get tracked branch information for VS Code-style graph coloring.
     *
     * Returns information about three special branches:
     * 1. Current branch (where HEAD points) - for blue color segment
     * 2. Upstream tracking branch - for purple color segment
     * 3. Base branch (where feature was created from) - for orange color segment
     *
     * Used to:
     * - Display ref badges with distinct colors
     * - Color swimlane segments in the commit graph
     *
     * @returns Tracked branch info, with null for unavailable branches
     */
    getTrackedBranches(): Promise<TrackedBranchInfo>;
    /**
     * Get file content at a specific commit.
     *
     * Retrieves the content of a file as it existed at a particular commit.
     * Used for displaying historical diffs.
     *
     * @param commitId - Full or short commit hash
     * @param filePath - Relative path from git root
     * @returns File content, or null if file doesn't exist at that commit
     */
    getFileAtCommit(commitId: string, filePath: string): Promise<string | null>;
    /**
     * Stage files for commit.
     *
     * @param files - Relative paths from git root
     */
    stage(files: string[]): Promise<void>;
    /**
     * Unstage files (remove from index).
     *
     * @param files - Relative paths from git root
     */
    unstage(files: string[]): Promise<void>;
    /**
     * Create a commit.
     *
     * @param message - Commit message
     * @param options - Commit options (files, amend, signoff)
     * @returns The created commit
     */
    commit(message: string, options?: GitCommitOptions): Promise<GitCommit>;
    /**
     * Checkout a branch or ref.
     *
     * @param ref - Branch name, tag, or commit hash
     * @param options - Checkout options (force)
     */
    checkout(ref: string, options?: GitCheckoutOptions): Promise<void>;
    /**
     * Create a new branch and optionally switch to it.
     *
     * @param branchName - Name for the new branch
     * @param checkout - Whether to switch to the new branch (default: true)
     * @param startPoint - Optional ref to start the branch from (default: HEAD)
     */
    createBranch(branchName: string, checkout?: boolean, startPoint?: string): Promise<void>;
    /**
     * Stash current uncommitted changes.
     *
     * Saves both staged and unstaged changes to the stash.
     * Optionally includes a message to identify the stash.
     *
     * @param message - Optional message for the stash entry
     */
    stash(message?: string): Promise<void>;
    /**
     * Apply and remove the most recent stash entry.
     *
     * Restores the previously stashed changes to the working directory.
     * Throws if there are no stash entries or if applying fails due to conflicts.
     */
    stashPop(): Promise<void>;
    /**
     * Push commits to remote.
     *
     * @param force - If true, use --force-with-lease for safer force push
     * @param setUpstream - If true, set upstream tracking (for new branches)
     */
    push(force?: boolean, setUpstream?: boolean): Promise<void>;
    /**
     * Pull changes from remote.
     *
     * @param rebase - If true, use rebase instead of merge
     */
    pull(rebase?: boolean): Promise<void>;
    /**
     * Check if the current branch has an upstream (tracking) branch configured.
     *
     * @returns true if an upstream is configured, false otherwise
     */
    hasUpstream(): Promise<boolean>;
    /** Fired when any file's git status changes */
    readonly onStatusChanged: Event<GitStatusChangedEvent>;
    /** Fired when the current branch changes */
    readonly onBranchChanged: Event<GitBranchChangedEvent>;
    /** Fired when a commit is created */
    readonly onCommitCreated: Event<GitCommitCreatedEvent>;
    /** Fired when HEAD moves (checkout, reset, rebase, etc.) */
    readonly onHeadChanged: Event<GitHeadChangedEvent>;
    /**
     * Start watching the .git directory for changes.
     *
     * This should be called after setting up event listeners.
     */
    startWatching(): Promise<void>;
    /**
     * Check if currently watching for changes.
     */
    isWatching(): boolean;
    /**
     * Trigger a status refresh.
     *
     * This is called when working directory files change (detected by FileSystemV2).
     * Uses the same debouncing as internal .git directory changes.
     */
    triggerStatusRefresh(): void;
    /**
     * Clean up resources (stop .git/ watcher, clear timers, etc.).
     *
     * Called automatically by GitProviderService when reference
     * count drops to zero and grace period expires.
     */
    dispose(): void;
}
/**
 * Serialized git status for IPC transport.
 *
 * The files Map is converted to a plain object for JSON serialization.
 */
interface SerializedGitStatus {
    branch: string;
    upstream?: string;
    ahead: number;
    behind: number;
    files: Record<string, GitFileStatus>;
}
/**
 * Serialize a GitStatus for IPC transport.
 *
 * Converts the files Map to a plain object.
 */
declare function serializeGitStatus(status: GitStatus): SerializedGitStatus;
/**
 * Deserialize a GitStatus from IPC transport.
 *
 * Converts the files object back to a Map.
 */
declare function deserializeGitStatus(serialized: SerializedGitStatus): GitStatus;

interface GitServiceConfig {
    /**
     * Factory that creates a GitProvider for a given git root directory.
     * When wired to the real provider:
     *   (gitRoot) => new DiskGitProvider(gitRoot)
     */
    createProvider: (gitRoot: string) => GitProvider;
    /** Grace period before idle providers are disposed. Default: 5000ms. */
    gracePeriodMs?: number;
    /**
     * Override git root discovery. Default: walks up directory tree looking for .git.
     * Accepts a path and returns the git root, or null if not in a git repo.
     */
    findGitRoot?: (startPath: string) => Promise<string | null>;
    /**
     * Override git availability check. Default: checks if `git --version` succeeds.
     * Used to detect if git is installed on the system.
     */
    checkGitAvailable?: () => Promise<boolean>;
    /** Optional logging callback. */
    onLog?: (level: string, message: string) => void;
}
/**
 * Manages git providers keyed by repository root.
 *
 * Built on ResourcePool — provides reference counting, grace-period disposal,
 * health checking, and race protection for concurrent retains.
 *
 * Key difference from FileSystemService: resources are keyed by git root,
 * not by cwd. Multiple cwds in the same repo share one provider.
 * retain(cwd) discovers the git root internally.
 */
declare class GitService {
    private readonly pool;
    private readonly log;
    private readonly findGitRootFn;
    private readonly checkGitAvailableFn;
    /** Cached result of isAvailable(). */
    private gitAvailableCache;
    /** Cache: normalized cwd → normalized git root (avoids re-walking for same cwd). */
    private readonly gitRootCache;
    constructor(config: GitServiceConfig);
    /**
     * Acquire a git provider for the repository containing `cwd`.
     *
     * Discovers the git root for the given path, then retains by git root.
     * Multiple cwds in the same repo share one provider.
     *
     * @returns The provider and the normalized git root path.
     * @throws If the path is not within a git repository.
     */
    retain(cwd: string): Promise<{
        provider: GitProvider;
        gitRoot: string;
    }>;
    /**
     * Release a reference to a git provider.
     * @param gitRoot - The normalized git root (as returned by retain()).
     */
    release(gitRoot: string): void;
    /**
     * Notify that a file changed, triggering a git status refresh.
     *
     * Fire-and-forget: errors are silently swallowed.
     * If the file is not in a git repo or no provider exists, this is a no-op.
     */
    notifyFileChanged(filePath: string): Promise<void>;
    /**
     * Find the git root for a path. Results are cached per normalized path.
     * Returns the normalized git root, or null if not in a git repo.
     */
    findGitRoot(startPath: string): Promise<string | null>;
    /**
     * Check if git is available on the system. Result is cached.
     */
    isAvailable(): Promise<boolean>;
    /** Dispose all providers and clear caches. */
    dispose(): Promise<void>;
    /**
     * Walk up the directory tree looking for a .git directory or file.
     * Handles both regular repos (.git is a directory) and worktrees (.git is a file).
     */
    static defaultFindGitRoot(startPath: string): Promise<string | null>;
}

/**
 * Path helper functions for skill discovery.
 *
 * Copied from: copilot-agent-runtime/src/helpers/path-helpers.ts (subset)
 * See UPSTREAM.md for sync instructions.
 *
 * Only the functions needed by the skill loader are included here.
 * The RuntimeSettings type is replaced with a minimal inline type since
 * the loader only accesses settings.configDir.
 */
/**
 * Minimal settings type — the skill loader only uses configDir.
 * Replaces the full RuntimeSettings from the upstream codebase.
 */
type SkillSettings = {
    configDir?: string;
};

/**
 * Skill types and schemas.
 *
 * Copied from: copilot-agent-runtime/src/skills/types.ts
 * See UPSTREAM.md for sync instructions.
 */

/**
 * Source location of a skill, determines priority order.
 * - project: .github/skills/ or .claude/skills/ in current working directory (highest priority)
 * - inherited: .github/skills/ or .claude/skills/ in parent directories (monorepo support)
 * - personal-copilot: ~/.copilot/skills/
 * - personal-claude: ~/.claude/skills/
 * - plugin: From an installed plugin
 * - custom: Added via COPILOT_SKILLS_DIRS env var or config (lowest priority)
 */
type SkillSource = "project" | "inherited" | "personal-copilot" | "personal-claude" | "plugin" | "custom";
/**
 * A fully loaded skill definition.
 */
interface Skill {
    /** Unique identifier for the skill (from frontmatter). */
    name: string;
    /** Description of what the skill does (from frontmatter). */
    description: string;
    /** The source location type of this skill. */
    source: SkillSource;
    /** Absolute path to the SKILL.md file (or command .md file). */
    filePath: string;
    /** Absolute path to the skill's base directory (parent of SKILL.md, or commands directory for commands). */
    baseDir: string;
    /** Optional list of tools that are auto-allowed when skill is active. */
    allowedTools?: string[];
    /** The full raw content of SKILL.md or command file (for injection into conversation). */
    content: string;
    /** Whether this skill can be invoked by the user as a slash command. Defaults to true. */
    userInvocable: boolean;
    /** Name of the plugin this skill came from (only set when source is "plugin"). */
    pluginName?: string;
    /** Whether this is a command (from .claude/commands/) rather than a skill. */
    isCommand?: boolean;
}
/**
 * A skill directory with its source type for priority ordering.
 */
interface SkillDirectorySource {
    /** Absolute path to the skills directory. */
    path: string;
    /** The source type for skills from this directory. */
    source: SkillSource;
    /** Name of the plugin (only set when source is "plugin"). */
    pluginName?: string;
}

/**
 * Skill and command loader.
 *
 * Copied from: copilot-agent-runtime/src/skills/loader.ts
 * See UPSTREAM.md for sync instructions.
 *
 * Modifications:
 * - Imports use local modules instead of upstream paths
 * - RuntimeSettings replaced with SkillSettings (minimal type)
 */

/** Result type for loading skills with warnings and errors */
interface SkillLoadResult {
    skills: Skill[];
    /** Warnings for skills that loaded successfully but had unknown fields ignored */
    warnings: string[];
    /** Errors for skills that failed to load entirely (validation failures, file read errors, etc.) */
    errors: string[];
}
/**
 * Gets the list of skill directories to scan, in priority order.
 */
declare function getSkillDirectories(repoRoot?: string, customDirs?: string[], settings?: SkillSettings, additionalSources?: SkillDirectorySource[], cwd?: string): SkillDirectorySource[];
/**
 * Gets the list of command directories to scan, in priority order.
 * Commands only use .claude/commands/ paths (not .github/).
 */
declare function getCommandDirectories(repoRoot?: string, cwd?: string): SkillDirectorySource[];
/**
 * Loads all skills and commands from configured directories.
 * Skills are loaded in priority order and deduplicated by canonical path (handles symlinks).
 * Commands from .claude/commands/ are loaded after skills, with skills taking priority.
 */
declare function loadSkills(projectRoot?: string, customDirs?: string[], useCache?: boolean, settings?: SkillSettings, additionalSources?: SkillDirectorySource[], cwd?: string): Promise<SkillLoadResult>;
/**
 * Clears the skills cache. Call this when skills need to be reloaded.
 */
declare function clearSkillsCache(): void;

/**
 * Slash command types for the tunnel RPC protocol.
 */
type SlashCommandCategory = 'session' | 'auth' | 'config' | 'permissions' | 'ui' | 'info' | 'mcp' | 'skill';
type SlashCommandDialogKind = 'help' | 'model-picker' | 'session' | 'mcp-config' | 'agent-picker' | 'user-switcher' | 'feedback' | 'login';
interface SlashCommandInfo {
    name: `/${string}`;
    aliases?: `/${string}`[];
    args?: string;
    help: string;
    category: SlashCommandCategory;
    requiresRemote: boolean;
    opensDialog?: SlashCommandDialogKind;
}
type SlashCommandMessageType = 'info' | 'error' | 'warning' | 'success';
type SlashCommandResultPayload = {
    kind: 'noop';
} | {
    kind: 'message';
    type: SlashCommandMessageType;
    text: string;
} | {
    kind: 'agent-message';
    displayMessage: string;
    agentPrompt: string;
} | {
    kind: 'model-changed';
    model: string;
    displayName?: string;
} | {
    kind: 'cwd-changed';
    newCwd: string;
} | {
    kind: 'session-cleared';
} | {
    kind: 'open-dialog';
    dialog: SlashCommandDialogKind;
    data?: unknown;
} | {
    kind: 'auth-state-changed';
    status: 'logged-in' | 'logged-out';
} | {
    kind: 'exit';
};
interface ExecuteSlashCommandResponse {
    success: boolean;
    result: SlashCommandResultPayload;
}

/**
 * SkillService — thin wrapper around the skill loader for the application layer.
 *
 * Provides slash command listing and execution. Stateless with caching
 * delegated to the underlying loadSkills() function.
 */

interface SkillServiceConfig {
    customDirs?: string[];
    onLog?: (level: string, message: string) => void;
}
declare class SkillService {
    private readonly customDirs;
    private readonly log;
    constructor(config?: SkillServiceConfig);
    /**
     * Load skills for a working directory.
     */
    loadSkills(cwd: string): Promise<SkillLoadResult>;
    /**
     * Get slash commands (built-in + skills) for the tunnel client UI.
     */
    getSlashCommands(cwd: string): Promise<SlashCommandInfo[]>;
    /**
     * Get skill directory paths for SDK SessionConfig.skillDirectories.
     */
    getSkillDirectories(cwd: string): Promise<string[]>;
    /**
     * Execute a slash command. Parses the command string and dispatches.
     */
    executeSlashCommand(command: string, cwd: string, _sessionId?: string): Promise<ExecuteSlashCommandResponse>;
    /**
     * Clear the cached skills so they're reloaded on next access.
     */
    invalidate(): void;
    private executeBuiltIn;
    private executeSkill;
}

/**
 * File Search Types
 *
 * Types for @-mention file picking functionality.
 */
/**
 * A single file search result.
 */
interface FileSearchResult {
    /** Relative path from cwd */
    path: string;
    /** Type: file or directory */
    type: 'file' | 'directory';
    /** Match score (higher = better match) */
    score: number;
}
/**
 * Request to search files in a directory.
 */
interface SearchFilesRequest {
    /** Search query (fuzzy match, or glob if contains *) */
    query: string;
    /** Working directory to search in */
    cwd: string;
    /** Maximum results to return (default: 50) */
    maxResults?: number;
    /** Include directories in results (default: false) */
    includeDirs?: boolean;
}
/**
 * Response from file search.
 */
interface SearchFilesResponse {
    /** Matching files/directories */
    results: FileSearchResult[];
    /** Total number of files in the index */
    totalIndexed: number;
    /** True if index was freshly built (first search or cache expired) */
    freshIndex: boolean;
}

/**
 * File Search Service
 *
 * Provides fast file search capabilities for @-mention file picking.
 * Uses fdir for crawling, picomatch for globs, and simple fuzzy matching.
 */

interface FileSearchServiceOptions {
    /** Cache TTL in milliseconds (default: 5 minutes) */
    cacheTtl?: number;
}
declare class FileSearchService {
    private indexes;
    private readonly cacheTtl;
    constructor(options?: FileSearchServiceOptions);
    /**
     * Search for files matching a query.
     */
    search(request: SearchFilesRequest): Promise<SearchFilesResponse>;
    /**
     * Force refresh index for a working directory.
     */
    invalidate(cwd: string): void;
    private getIndex;
    private buildIndex;
    private loadIgnorePatterns;
    private performSearch;
    private calculateScore;
    private getType;
}

interface CallbackChannelConfig {
    /** Function to send a request to the tunnel client (e.g. ClientSession.request()). */
    send: (method: string, params: unknown) => Promise<unknown>;
    /** Function to send a fire-and-forget notification (e.g. ClientSession.notify()). */
    notify?: (method: string, params: unknown) => void;
    /** Optional logger for debugging callback flow. */
    log?: (level: string, message: string) => void;
}
/**
 * Manages host-initiated requests to the tunnel client.
 *
 * Used inside SDK callback handlers to bridge tool calls, permission requests,
 * and user input to the browser. Wraps the underlying session.request() with
 * timeout and disposal semantics.
 */
declare class CallbackChannel {
    private readonly send;
    private readonly _notify?;
    private readonly log?;
    private disposed;
    private readonly pending;
    constructor(config: CallbackChannelConfig);
    /**
     * Send a request to the tunnel client and await a response.
     * Rejects if the channel is disposed or the timeout expires.
     */
    request(method: string, params: unknown, timeoutMs: number): Promise<unknown>;
    /**
     * Send a fire-and-forget notification to the tunnel client.
     * No response is awaited. Returns false if disposed or no notify function configured.
     */
    notify(method: string, params: unknown): boolean;
    /** Reject all in-flight requests and prevent new ones. */
    dispose(): void;
    get isDisposed(): boolean;
}

/**
 * SessionEventBroker — manages session event subscriptions across multiple
 * tunnel clients that may share the same Copilot SDK session.
 *
 * Problem: When CopilotClients are pooled by cwd, two tunnel clients can
 * resume the same session on the same CopilotClient. The SDK creates a new
 * session object on each resume, replacing the old one in its internal map.
 * The first client's `session.on()` subscription becomes dead because events
 * are dispatched to the new object.
 *
 * Solution: This broker maintains a single SDK `session.on()` subscription
 * per session and fans out events to all registered CallbackChannels. When a
 * new session object is registered for the same sessionId (from another
 * client's resume), it re-subscribes on the new object automatically.
 */

type ProcessingChangeHandler = (sessionId: string, isProcessing: boolean) => void;
type SummaryChangeHandler = (sessionId: string, summary: string) => void;
declare class SessionEventBroker {
    private readonly sessions;
    private readonly log;
    private readonly processingChangeHandlers;
    private readonly summaryChangeHandlers;
    /** Tracks current processing state per session for deduplication and queries. */
    private readonly processingState;
    /** Captured session summaries from assistant.message events. */
    private readonly sessionSummaries;
    constructor(onLog?: (level: string, message: string) => void);
    /**
     * Register a client's interest in a session's events.
     *
     * If another client already registered for this session with a different
     * session object (e.g. the SDK created a new one on resume), the broker
     * re-subscribes on the new object so all clients continue receiving events.
     */
    register(sessionId: string, clientId: string, session: CopilotSession, callbacks: CallbackChannel): void;
    /** Unregister a single client from a specific session. */
    unregister(sessionId: string, clientId: string): void;
    /** Unregister a client from ALL sessions (called on client disconnect). */
    unregisterClient(clientId: string): void;
    /** Get the current session object for a session ID. */
    getSession(sessionId: string): CopilotSession | undefined;
    /** Check if a session is currently processing (last known state). */
    isProcessing(sessionId: string): boolean;
    /**
     * Subscribe to processing state changes across ALL sessions.
     * Fires when turn.start, turn.end, session.idle, session.error, or abort
     * events are detected. Used by ApplicationHost to broadcast processing
     * state to all connected clients (not just those registered for a session).
     */
    onProcessingChange(handler: ProcessingChangeHandler): {
        dispose: () => void;
    };
    /** Get the captured summary for a session, if any. */
    getSummary(sessionId: string): string | undefined;
    /**
     * Subscribe to summary changes across ALL sessions.
     * Fires when a user.message event provides the first summary for a session.
     */
    onSummaryChanged(handler: SummaryChangeHandler): {
        dispose: () => void;
    };
    private subscribe;
    private dispatch;
    private emitProcessingChange;
    private extractSummary;
    dispose(): void;
}

type SubscriptionType = 'fs' | 'git';
interface Subscription {
    id: string;
    type: SubscriptionType;
    cleanup: () => void;
}
/**
 * Tracks a single tunnel client's active subscriptions (fs watches, git watches)
 * with cleanup on disconnect.
 */
declare class SubscriptionSet {
    private readonly subscriptions;
    private nextId;
    /**
     * Add a subscription. Returns the generated subscription ID.
     */
    add(type: SubscriptionType, cleanup: () => void): string;
    /**
     * Remove a subscription by ID. Calls cleanup(), returns true if found.
     */
    remove(id: string): boolean;
    /**
     * Remove and clean up all subscriptions.
     */
    dispose(): void;
    /** Number of active subscriptions. */
    get size(): number;
    /** Get a subscription by ID. */
    get(id: string): Subscription | undefined;
    /** List all subscriptions of a given type. */
    byType(type: SubscriptionType): Subscription[];
}

interface SessionTrackerConfig {
    /** CopilotService for releasing client references on dispose. */
    copilotService: CopilotService;
    /** Shared broker for coordinating session event subscriptions. */
    sessionEventBroker: SessionEventBroker;
    /** The tunnel client ID that owns this tracker. */
    clientId: string;
    /** The tunnel client's callback channel for event delivery. */
    callbacks: CallbackChannel;
    /** Optional logging callback. */
    onLog?: (level: string, message: string) => void;
}
/**
 * Tracks which Copilot SDK sessions belong to a single tunnel client,
 * and which CopilotClient serves each session.
 *
 * Created per-client on connect, disposed on disconnect.
 *
 * Simplification over V1: one Map<sessionId, TrackedSession> instead of
 * five separate Maps. The SDK provides typed session objects directly.
 */
declare class SessionTracker {
    private readonly sessions;
    private readonly copilotService;
    private readonly sessionEventBroker;
    private readonly clientId;
    private readonly callbacks;
    private readonly log;
    constructor(config: SessionTrackerConfig);
    /**
     * Track a new session. Called after session.create / session.resume.
     */
    trackSession(sessionId: string, cwd: string, client: CopilotClient, session: CopilotSession): void;
    /**
     * Stop tracking a session. Unregisters from the event broker but does
     * NOT destroy the session or release the CopilotClient — that's the
     * handler's job.
     */
    untrackSession(sessionId: string): void;
    /** Check if this client is tracking a session (without resolving the object). */
    isTracking(sessionId: string): boolean;
    /** Get the CopilotClient for a session. */
    getClientForSession(sessionId: string): CopilotClient | undefined;
    /**
     * Get the CopilotSession for a session.
     *
     * Prefers the broker's session object — it has the latest instance when
     * another client resumed the same session on a shared CopilotClient.
     */
    getSessionForId(sessionId: string): CopilotSession | undefined;
    /** Get the cwd for a session. */
    getCwdForSession(sessionId: string): string | undefined;
    /** All currently tracked session IDs. */
    get sessionIds(): ReadonlySet<string>;
    /** Number of tracked sessions. */
    get size(): number;
    /**
     * Dispose all tracked sessions.
     * Destroys each session, releases CopilotClient references,
     * and clears the tracker.
     */
    dispose(): Promise<void>;
}

/**
 * ScrollbackBuffer - Rolling buffer of terminal output chunks.
 *
 * Keeps the last N characters of output (default 100KB) for replay
 * when a client attaches to an existing terminal session.
 * See docs/terminal-design.md §5.7.
 */
declare class ScrollbackBuffer {
    private buffer;
    private totalLength;
    private readonly maxLength;
    constructor(maxLength?: number);
    /**
     * Append data to the scrollback buffer. Trims oldest chunks
     * when totalLength exceeds maxLength.
     */
    append(data: string): void;
    /**
     * Get the current buffer contents as a single string.
     */
    getSnapshot(): string;
    /**
     * Current total length of buffered data.
     */
    get length(): number;
    private trim;
}

/**
 * TerminalSession - Wraps a single node-pty IPty instance with a lifecycle state machine.
 *
 * State machine: running → draining → exited → destroyed
 * See docs/terminal-design.md §5.2 for design.
 */

type TerminalState = 'running' | 'draining' | 'exited' | 'destroyed';
interface AttachedClient {
    /** Send notification to this client */
    notify: (method: string, params: unknown) => void;
    cols: number;
    rows: number;
    lastAckedSeq: number;
    unackedCharCount: number;
}
declare class TerminalSession {
    readonly terminalId: string;
    readonly shell: string;
    private _state;
    private _pty;
    /** Attached clients */
    readonly clients: Map<string, AttachedClient>;
    /** Output buffering */
    outputBuffer: string;
    flushTimer: ReturnType<typeof setTimeout> | null;
    seq: number;
    /** Flow control (character-count based, aligned with VS Code) */
    unackedCharCount: number;
    paused: boolean;
    /** Scrollback buffer for attach/reconnection (§5.7) */
    readonly scrollbackBuffer: ScrollbackBuffer;
    /** Dimensions */
    currentCols: number;
    currentRows: number;
    /** Lifecycle tracking */
    title: string;
    exitCode?: number;
    exitSignal?: number;
    exitedAt?: number;
    /** Current working directory (updated via OSC 7 from shell integration) */
    currentCwd: string;
    /** Drain lifecycle (§5.6) */
    drainTimer: ReturnType<typeof setTimeout> | null;
    private drainStartedAt;
    private pendingExitCode;
    private pendingExitSignal?;
    /** Grace period timer for orphaned terminals (no attached clients) */
    graceTimer: ReturnType<typeof setTimeout> | null;
    /** Event subscriptions for cleanup */
    private dataDisposable;
    private exitDisposable;
    constructor(terminalId: string, pty: IPty, shell: string, cols: number, rows: number, onData: (data: string) => void, onExit: (exitInfo: {
        exitCode: number;
        signal?: number;
    }) => void);
    get state(): TerminalState;
    get pty(): IPty | null;
    get pid(): number;
    setState(state: TerminalState): void;
    /**
     * Write user input to the PTY. Only accepted while running.
     */
    handleInput(data: string): void;
    /**
     * Handle PTY data output. Buffers output and flushes on a 5ms timer
     * or immediately when the buffer exceeds 64KB.
     * During drain phase, extends the drain window (see §5.6).
     * See docs/terminal-design.md §5.4.
     */
    handlePtyData(data: string): void;
    /**
     * Flush buffered output to all attached clients.
     * Updates per-client and global unackedCharCount, checks flow control.
     */
    flush(): void;
    /**
     * Check if PTY should be paused due to high unacked character count.
     */
    private checkFlowControl;
    /**
     * Check per-client unacked caps. Force-detaches any client exceeding
     * CLIENT_UNACKED_CAP (512K) to prevent one slow client from stalling
     * the terminal for everyone in a shared session.
     * Called after each flush.
     */
    checkClientCaps(): void;
    /**
     * Handle flow control acknowledgment from a client.
     * Decrements per-client unackedCharCount, recalculates global,
     * and resumes PTY if below low water mark.
     */
    handleAck(seq: number, charCount: number, clientId: string): void;
    /**
     * Handle PTY exit. Transitions to draining state and starts drain timer.
     * See docs/terminal-design.md §5.6.
     */
    handlePtyExit(exitCode: number, signal?: number): void;
    /**
     * Handle PTY data arriving during drain phase. Appends to buffer and
     * resets the drain timer if under the hard cap.
     */
    private handlePtyDataDuringDrain;
    /**
     * Schedule (or reschedule) the drain flush timer. When it fires,
     * flushes remaining output, transitions to exited, and notifies clients.
     */
    private scheduleDrainFlush;
    /**
     * Pause the flush timer. Used during atomic attach to prevent
     * output from being sent between snapshot capture and client addition.
     */
    pauseFlushTimer(): void;
    /**
     * Resume the flush timer if there is buffered output waiting.
     * Called after atomic attach to resume normal output flow.
     */
    resumeFlushTimer(): void;
    /**
     * Parse OSC 7 (file:// URI) sequences from PTY output to track CWD.
     * Format: ESC ] 7 ; file://hostname/path BEL
     */
    private parseOscSequences;
    /**
     * Start grace period when last client disconnects from a running terminal.
     * On expiry, calls the provided callback and destroys the session.
     */
    startGracePeriod(onExpired: () => void): void;
    /**
     * Cancel grace period (e.g., when a client re-attaches).
     */
    cancelGracePeriod(): void;
    /**
     * Destroy the PTY and all resources.
     */
    destroy(): void;
    /**
     * Release PTY resources without changing state (used after drain → exited).
     */
    destroyPty(): void;
}

/**
 * HostTerminalManager - Manages all terminal sessions on the host.
 *
 * Responsible for spawning PTY processes, routing input, and managing lifecycle.
 * See docs/terminal-design.md §5.1 for design.
 */

declare class HostTerminalManager {
    private terminals;
    private readonly EXITED_TTL_MS;
    /**
     * Create a new terminal session by spawning a PTY process.
     */
    create(params: TerminalCreateParams, clientId: string): TerminalCreateResult;
    /**
     * Destroy a terminal session.
     */
    destroy(terminalId: string): void;
    /**
     * Write user input to a terminal.
     */
    input(terminalId: string, data: string): void;
    /**
     * Atomically attach a client to an existing terminal session.
     *
     * This is synchronous — no await between snapshot capture and client addition.
     * The flush timer is paused to prevent output from being sent during the gap.
     * See docs/terminal-design.md §5.7 for design.
     */
    attach(terminalId: string, clientId: string, notify: (method: string, params: unknown) => void): TerminalAttachResult;
    /**
     * List all terminals. Includes exited entries with status and exitCode.
     * Lazily cleans up exited entries older than 60s.
     */
    list(): TerminalListResult;
    /**
     * Detach a single client from a terminal session.
     * If the last client detaches from a running terminal, a grace period
     * starts to allow reconnection. The terminal is destroyed if no client
     * re-attaches within the grace window.
     */
    detach(terminalId: string, clientId: string): void;
    /**
     * Get a terminal session by ID.
     */
    getSession(terminalId: string): TerminalSession | undefined;
    /**
     * Get all terminal sessions.
     */
    getAllSessions(): Map<string, TerminalSession>;
    /**
     * Resize a terminal. Updates per-client dimensions, applies last-resize-wins
     * policy, flushes buffered output before resize, and notifies other clients.
     * See docs/terminal-design.md §5.8.
     */
    resize(terminalId: string, cols: number, rows: number, clientId: string): void;
    /**
     * Handle a flow control ack for a terminal from a specific client.
     */
    handleAck(terminalId: string, seq: number, charCount: number, clientId: string): void;
    /**
     * Handle a client disconnecting. Removes the client from all terminal sessions.
     * If the last client detaches from a running terminal, a grace period starts.
     */
    handleClientDisconnected(clientId: string): void;
    /**
     * Handle PTY data output. Delegates to session's batching logic.
     */
    private handlePtyData;
    /**
     * Handle PTY process exit. Delegates to session's drain lifecycle.
     * See docs/terminal-design.md §5.6.
     */
    private handlePtyExit;
}

/**
 * Holder for shared service references. Created at application startup,
 * shared across all tunnel client connections.
 */
interface ServiceContainer {
    copilot: CopilotService;
    fileSystem: FileSystemService;
    git: GitService;
    skills: SkillService;
    fileSearch: FileSearchService;
    /** Shared broker for session event fan-out across multiple tunnel clients. */
    sessionEventBroker: SessionEventBroker;
    /** Shared terminal manager for PTY sessions. */
    terminalManager: HostTerminalManager;
}
/**
 * Context passed to every RPC handler invocation.
 *
 * Contains both per-client state (session tracker, subscriptions, callbacks)
 * and shared services. This is the "handler's view of the world" — handlers
 * never import services directly, they access everything through context.
 */
interface HandlerContext {
    /** Unique tunnel client ID. */
    clientId: string;
    /** Human-readable client label (e.g. "alice (Chrome 131/macOS)"). Defaults to clientId. */
    clientLabel: string;
    /** Per-client session tracking (sessionId → CopilotClient/CopilotSession). */
    session: SessionTracker;
    /** Per-client subscription tracking (fs watches, git watches). */
    subscriptions: SubscriptionSet;
    /** Per-client host→client request bridge (tool calls, permission requests). */
    callbacks: CallbackChannel;
    /** Shared services (copilot, fs, git, etc.). */
    services: ServiceContainer;
    /** Optional logging callback for handler diagnostics. */
    log?: (level: string, message: string) => void;
}
/**
 * Minimal interface for a CopilotSession instance.
 * Maps to the @github/copilot-sdk CopilotSession API surface.
 */
interface CopilotSession {
    /** Send a message and return immediately with a message ID. */
    send(params: {
        prompt: string;
        attachments?: unknown[];
        mode?: string;
    }): Promise<string>;
    /** Send a message and wait for the session to become idle. */
    sendAndWait(params: {
        prompt: string;
        attachments?: unknown[];
        mode?: string;
    }, timeout?: number): Promise<unknown>;
    /** Get all messages in this session. */
    getMessages(): Promise<unknown[]>;
    /** Abort the current operation. */
    abort(): Promise<void>;
    /** Destroy this session on the CLI side. */
    destroy(): Promise<void>;
    /** Subscribe to session events. Returns unsubscribe function. */
    on(handler: (event: unknown) => void): () => void;
    /** The workspace path for this session. */
    readonly workspacePath?: string;
    rpc?: {
        model: {
            getCurrent(): Promise<{
                modelId?: string;
            }>;
            switchTo(params: {
                modelId: string;
            }): Promise<{
                modelId?: string;
            }>;
        };
    };
}

/**
 * Handler function signature for RPC methods.
 * Context is the fully-typed HandlerContext from session/types.
 */
type HandlerFn = (params: unknown, context: HandlerContext) => Promise<unknown>;
/**
 * Error thrown when dispatch is called for an unregistered method.
 */
declare class MethodNotFoundError extends Error {
    constructor(method: string);
}
/**
 * Dispatches incoming RPC methods to registered handler functions.
 *
 * Replaces the V1 ClientConnection.handleMessage() if/else chain
 * with an explicit, auditable method registry.
 */
declare class MethodRouter {
    private readonly handlers;
    /**
     * Register a handler for a specific method name.
     * Throws if a handler is already registered for this method.
     */
    register(method: string, handler: HandlerFn): void;
    /**
     * Register multiple handlers under a namespace prefix.
     * e.g. registerNamespace('fs', { readFile, stat }) registers 'fs.readFile', 'fs.stat'.
     */
    registerNamespace(prefix: string, handlers: Record<string, HandlerFn>): void;
    /**
     * Dispatch a method call to the registered handler.
     * Throws MethodNotFoundError if no handler is registered.
     */
    dispatch(method: string, params: unknown, context: HandlerContext): Promise<unknown>;
    /** Returns the set of registered method names. */
    methods(): string[];
    /** Returns true if a handler is registered for the given method. */
    has(method: string): boolean;
}

/**
 * EventEmitter - A simple, type-safe event emitter implementation.
 *
 * Follows VS Code's event pattern where:
 * - The emitter owns the event (private `fire()` method)
 * - Consumers subscribe via a public `event` property
 * - Subscriptions return a disposable for cleanup
 */

/**
 * A type-safe event emitter.
 *
 * @typeParam T - The type of data passed to event listeners
 */
declare class EventEmitter<T> {
    private listeners;
    private disposed;
    /**
     * The public event property for subscribing.
     */
    readonly event: Event<T>;
    /**
     * Fire the event, notifying all listeners.
     *
     * Listeners are called synchronously in insertion order.
     * Errors in listeners are caught to prevent one bad listener from breaking others.
     */
    fire(data: T): void;
    /** Check if there are any registered listeners. */
    hasListeners(): boolean;
    /** Get the number of registered listeners. */
    get listenerCount(): number;
    /**
     * Dispose the emitter, clearing all listeners.
     * After disposal, new subscriptions return no-op disposables and fire() is a no-op.
     */
    dispose(): void;
}

/**
 * ParcelFileWatcher - File system change detection using @parcel/watcher.
 *
 * Features:
 * - Native OS-level watching (FSEvents on macOS, inotify on Linux)
 * - Intelligent rename detection (correlates DELETE+CREATE events)
 * - Debounced event emission to prevent event storms
 * - Configurable ignore patterns
 */

/** Event emitted when a file or directory is created. */
interface FileCreatedEvent {
    path: string;
    isDirectory: boolean;
}
/** Options for configuring the file watcher. */
interface ParcelFileWatcherOptions {
    ignored?: string[];
}
declare class ParcelFileWatcher {
    readonly path: string;
    private readonly realPath;
    private readonly ignored;
    private subscription;
    private watching;
    private renameDetector;
    private debounceTimers;
    private readonly _onCreated;
    private readonly _onModified;
    private readonly _onDeleted;
    private readonly _onRenamed;
    readonly onCreated: Event<FileCreatedEvent>;
    readonly onModified: Event<FileContentChangedEvent>;
    readonly onDeleted: Event<FileDeletedEvent>;
    readonly onRenamed: Event<FileRenamedEvent>;
    constructor(watchPath: string, options?: ParcelFileWatcherOptions);
    watch(): Promise<void>;
    unwatch(): Promise<void>;
    isWatching(): boolean;
    dispose(): Promise<void>;
    private getBackend;
    private handleEvents;
    private shouldIgnore;
    private matchPattern;
    private handleCreate;
    private handleUpdate;
    private handleDelete;
    private emitRename;
    private isDirectory;
    private debounce;
    private cancelDebounce;
    private clearDebounceTimers;
}

/**
 * DiskFileSystemProvider - Filesystem provider for local disk operations.
 *
 * Core implementation of the FileSystemProvider interface with:
 * 1. Integrated watching via ParcelFileWatcher
 * 2. Smart caching via DirectoryCache with automatic invalidation
 * 3. Event-driven semantic events for all file changes
 * 4. Debounced directory refreshes
 * 5. Background prefetching for instant navigation
 */

declare class DiskFileSystemProvider implements FileSystemProvider {
    readonly cwd: string;
    private watcher;
    private disposed;
    private refreshTimers;
    private activePrefetches;
    private lastVerifyTime;
    private gitRoot;
    private readonly _onDirectoryListingChanged;
    private readonly _onFileContentChanged;
    private readonly _onFileRenamed;
    private readonly _onFileDeleted;
    readonly onDirectoryListingChanged: Event<DirectoryListingChangedEvent>;
    readonly onFileContentChanged: Event<FileContentChangedEvent>;
    readonly onFileRenamed: Event<FileRenamedEvent>;
    readonly onFileDeleted: Event<FileDeletedEvent>;
    constructor(cwd: string, watcherOptions?: ParcelFileWatcherOptions);
    private initializeGitRoot;
    stat(path: string): Promise<FileStat>;
    readDirectory(dirPath: string): Promise<DirectoryEntry[]>;
    readFile(filePath: string): Promise<Uint8Array>;
    readTextFile(filePath: string): Promise<string>;
    writeFile(filePath: string, content: Uint8Array): Promise<void>;
    delete(path: string, options?: DeleteOptions): Promise<void>;
    rename(oldPath: string, newPath: string): Promise<void>;
    createDirectory(dirPath: string): Promise<void>;
    exists(path: string): Promise<boolean>;
    startWatching(): Promise<void>;
    isWatching(): boolean;
    dispose(): Promise<void>;
    private isPathIgnored;
    private buildCacheEntry;
    private refreshGitignoreAffectedDirectories;
    private setupWatcherEvents;
    private getGitRoot;
    private readDirectoryFromDisk;
    private sortEntries;
    private scheduleRefresh;
    private refreshDirectory;
    private scheduleVerifyCache;
    private verifyCache;
    private prefetchChildren;
    private prefetchDirectory;
    private isReadonly;
}

/**
 * DirectoryCache - High-performance LRU cache for directory listings.
 *
 * Module-level singleton cache for directory entries. Designed to make
 * file tree rendering instant by avoiding repeated disk I/O.
 *
 * Key Design Decisions:
 * 1. Module-level singleton: persists across component mount/unmount cycles
 * 2. Version-based invalidation: stale data served immediately while fresh data is fetched
 * 3. LRU eviction: limits memory usage (default 500 entries ≈ 500KB)
 * 4. Path normalization: handles trailing slashes and case sensitivity
 */

/** A cached directory entry with metadata for cache management. */
interface CacheEntry {
    entries: DirectoryEntry[];
    version: number;
    timestamp: number;
}
/** Listener callback for cache change notifications. */
type CacheChangeListener = (path: string, entry: CacheEntry | null) => void;
declare class DirectoryCacheImpl {
    private cache;
    private listeners;
    private accessOrder;
    private maxSize;
    get(dirPath: string): CacheEntry | undefined;
    set(dirPath: string, entries: DirectoryEntry[]): void;
    has(dirPath: string): boolean;
    getVersion(dirPath: string): number;
    addEntry(dirPath: string, entry: DirectoryEntry): void;
    removeEntry(dirPath: string, entryName: string): void;
    invalidate(dirPath: string): void;
    delete(dirPath: string): void;
    clear(): void;
    subscribe(dirPath: string, listener: CacheChangeListener): Disposable;
    setMaxSize(size: number): void;
    get size(): number;
    getPathsUnder(prefix: string): string[];
    private normalizePath;
    private entryNamesMatch;
    private updateAccessOrder;
    private evictLRU;
    private notifyListeners;
}
/** The global directory cache instance. */
declare const DirectoryCache: DirectoryCacheImpl;

/**
 * GitIgnoreCache - Shared cache for gitignore lookups using the `ignore` npm package.
 *
 * Provides efficient gitignore matching with:
 * - Pure JavaScript regex matching (no git process spawning for checks)
 * - Cached matchers per git root
 * - Support for nested .gitignore files
 * - Automatic invalidation when .gitignore changes
 */
declare class GitIgnoreCacheImpl {
    private gitRootCache;
    private matcherCache;
    private loadedGitignoreFiles;
    private normalizeCacheKey;
    getGitRoot(dirPath: string): Promise<string | null>;
    private findGitRoot;
    private getOrCreateMatcher;
    private loadGitignoreFile;
    getIgnoredEntries(dirPath: string, entries: Array<{
        name: string;
        isDirectory: boolean;
    }>, gitRoot?: string | null): Promise<Set<string>>;
    /**
     * Check if a single path is ignored (synchronous, for watcher filtering).
     * Requires git root to be pre-resolved.
     */
    isIgnored(gitRoot: string, filePath: string): boolean;
    invalidateForGitignore(gitignorePath: string): void;
    clear(): void;
    getStats(): {
        gitRootEntries: number;
        matcherCount: number;
        loadedGitignoreFiles: number;
    };
}
/** Singleton instance. */
declare const GitIgnoreCache: GitIgnoreCacheImpl;

/**
 * Path utilities for filesystem operations.
 *
 * Provides cross-platform helpers for path manipulation,
 * especially for case-insensitive filesystem handling on macOS and Windows.
 */
/**
 * Whether the current platform has a case-insensitive filesystem.
 * True for macOS (darwin) and Windows, false for Linux.
 */
declare const isCaseInsensitiveFS: boolean;
/**
 * Normalize a path for case-insensitive comparison.
 * On case-insensitive filesystems, lowercases the path.
 */
declare function normalizePathForComparison(filePath: string): string;
/**
 * Check if two paths are equal, handling case sensitivity correctly.
 */
declare function pathEquals(path1: string, path2: string): boolean;
/**
 * Check if a path starts with a prefix, handling case sensitivity correctly.
 */
declare function pathStartsWith(filePath: string, prefix: string): boolean;
/**
 * Get the relative path between two paths, handling case sensitivity correctly.
 */
declare function safeRelativePath(from: string, to: string): string;
/**
 * Check if a relative path indicates the target is outside the base.
 */
declare function isPathOutside(relativePath: string): boolean;

/**
 * Git utility constants and path helpers.
 *
 * Extracted from DiskGitProvider for independent testability.
 * All functions are pure (except findGitRoot/isGitAvailable which shell out to git).
 */
/** Structured logging function used throughout git modules. */
type GitLogFn = (level: "error" | "warn" | "debug", message: string, ...args: unknown[]) => void;
/**
 * Find the git root directory for a given path.
 * Returns null if the path is not in a git repository.
 */
declare function findGitRoot(cwd: string): Promise<string | null>;
/**
 * Check if git is available on the system.
 */
declare function isGitAvailable(): Promise<boolean>;

/**
 * DiskGitProvider - Orchestrator for git operations.
 *
 * Thin class that delegates to extracted modules for:
 * - Queries: git-queries.ts
 * - Commit History: git-commit-history.ts
 * - Operations: git-operations.ts
 * - Status Parsing: git-status-parser.ts
 * - Utilities: git-utils.ts
 *
 * This class owns:
 * - Lifecycle (constructor, dispose, file watcher)
 * - Event emitters (status changed, branch changed, commit created, head changed)
 * - Operation tracking (suppresses refresh during active operations)
 * - Refresh scheduling (debounced status refresh + delta detection)
 * - Per-file diff stats cache
 */

declare class DiskGitProvider implements GitProvider {
    readonly gitRoot: string;
    readonly cwd: string;
    private git;
    private watcher;
    private watcherSubscriptions;
    private disposed;
    private readonly log;
    /** Count of active git operations (don't refresh while > 0) */
    private activeOperations;
    /** Pending status refresh timer (debouncing) */
    private refreshTimer;
    /** Last known status (for delta calculation) */
    private lastStatus;
    /** Last known branch (for branch change detection) */
    private lastBranch;
    /** Last known HEAD commit (for head change detection) */
    private lastHead;
    /** Cached per-file diff stats */
    private perFileDiffStatsCache;
    /** Cache TTL for diff stats (ms) */
    private static readonly DIFF_STATS_CACHE_TTL_MS;
    private readonly _onStatusChanged;
    private readonly _onBranchChanged;
    private readonly _onCommitCreated;
    private readonly _onHeadChanged;
    readonly onStatusChanged: Event<GitStatusChangedEvent>;
    readonly onBranchChanged: Event<GitBranchChangedEvent>;
    readonly onCommitCreated: Event<GitCommitCreatedEvent>;
    readonly onHeadChanged: Event<GitHeadChangedEvent>;
    constructor(gitRoot: string, cwd: string, logger?: GitLogFn);
    startWatching(): Promise<void>;
    isWatching(): boolean;
    triggerStatusRefresh(): void;
    dispose(): void;
    getStatus(): Promise<GitStatus>;
    getFileStatus(filePath: string): Promise<GitFileStatus | null>;
    getCurrentBranch(): Promise<string>;
    getBranches(): Promise<GitBranch[]>;
    getFileDiff(filePath: string, staged?: boolean): Promise<string>;
    getFileAtRef(filePath: string, ref: string): Promise<string>;
    hasUncommittedChanges(): Promise<boolean>;
    hasUnpushedCommits(): Promise<boolean>;
    hasUpstream(): Promise<boolean>;
    getChangedFilesFromBranch(baseBranch: string): Promise<string[]>;
    getStatusFromBranch(baseBranch: string): Promise<Map<string, GitFileStatus>>;
    /**
     * Get diff statistics for uncommitted changes.
     * Derives aggregated stats from the cached per-file diff stats.
     */
    getUncommittedDiffStats(): Promise<GitDiffStats>;
    /**
     * Get per-file diff statistics with caching.
     */
    getPerFileDiffStats(): Promise<SplitPerFileDiffStats>;
    getMostRecentDirtyFile(): Promise<string | null>;
    getDirtyFilesWithTimes(): Promise<FileWithTime[]>;
    getMostRecentCommittedFile(commitLimit?: number): Promise<string | null>;
    getCommitHistory(options?: GetCommitHistoryOptions): Promise<CommitHistoryResult>;
    getCommit(commitId: string): Promise<HistoryCommit | null>;
    getCommitFiles(commitId: string): Promise<CommitFile[]>;
    getFileAtCommit(commitId: string, filePath: string): Promise<string | null>;
    getTrackedBranches(): Promise<TrackedBranchInfo>;
    stage(files: string[]): Promise<void>;
    unstage(files: string[]): Promise<void>;
    commit(message: string, options?: GitCommitOptions): Promise<GitCommit>;
    revert(files: string[]): Promise<void>;
    checkout(ref: string, options?: GitCheckoutOptions): Promise<void>;
    createBranch(branchName: string, checkout?: boolean, startPoint?: string): Promise<void>;
    stash(message?: string): Promise<void>;
    stashPop(): Promise<void>;
    push(force?: boolean, setUpstream?: boolean): Promise<void>;
    pull(rebase?: boolean): Promise<void>;
    private initializeState;
    private getHeadCommit;
    private scheduleStatusRefresh;
    private refreshStatus;
    private withOperationTracking;
}

/**
 * Register all RPC method handlers on the router.
 *
 * Called once at application startup. This is the single place where
 * the method inventory is defined — makes it explicit and auditable.
 */
declare function registerAllHandlers(router: MethodRouter): void;

/**
 * Create a new Copilot session.
 *
 * 1. Retains a CopilotClient for the given cwd
 * 2. Bridges tools/permissions/hooks to the tunnel client via CallbackChannel
 * 3. Creates a CopilotSession via the SDK
 * 4. Subscribes to session events → forwards as notifications
 * 5. Tracks the session in SessionTracker
 */
declare const createSession: HandlerFn;
declare const sendMessage: HandlerFn;
declare const sendAndWait: HandlerFn;
declare const getMessages: HandlerFn;
declare const abortSession: HandlerFn;
declare const destroySession: HandlerFn;
/**
 * List all sessions known to the Copilot SDK.
 *
 * Queries the SDK directly (like v1) — returns all persisted sessions
 * regardless of which tunnel client created them. Enriches results with
 * locally tracked cwd where available.
 */
declare const listSessions: HandlerFn;
declare const sessionHandlers: Record<string, HandlerFn>;

declare const filesystemHandlers: Record<string, HandlerFn>;

declare const gitHandlers: Record<string, HandlerFn>;

/**
 * ping handler — returns timestamp, version, and confirms connection.
 */
declare const pingHandler: HandlerFn;
/**
 * getState handler — retains a CopilotClient and pings it to check health.
 */
declare const getStateHandler: HandlerFn;
/**
 * models.list handler — queries the SDK for live model data via RPC,
 * falling back to a static model list if the RPC is unavailable or fails.
 */
declare const modelsListHandler: HandlerFn;
/**
 * auth.getStatus handler — retains a CopilotClient and queries auth status.
 */
declare const authStatusHandler: HandlerFn;
/**
 * searchFiles handler — fuzzy file search for @-mention picking.
 */
declare const searchFilesHandler: HandlerFn;
/**
 * listSlashCommands handler — list available slash commands.
 */
declare const listSlashCommandsHandler: HandlerFn;
/**
 * executeSlashCommand handler — execute a slash command by name.
 */
declare const executeSlashCommandHandler: HandlerFn;

/**
 * Plugin skill discovery.
 *
 * Reads ~/.copilot/config.json to find installed plugins and returns
 * their skill directory sources. This replicates what the CLI does in
 * copilot-agent-runtime/src/plugins/skills.ts + copilot-agent-runtime/src/plugins/manager.ts
 * without pulling in the full plugin manager dependency tree.
 *
 * See UPSTREAM.md for details.
 */

/**
 * Gets skill directory sources from installed plugins.
 * Reads ~/.copilot/config.json for the installed_plugins list,
 * then checks each plugin's cache directory for a skills/ subdirectory.
 */
declare function getPluginSkillSources(settings?: SkillSettings): Promise<SkillDirectorySource[]>;

/**
 * TunnelHost — top-level orchestrator that wires TokenManager + TunnelResolver + HostRelay.
 *
 * start() sequence:
 *  1. Get or authenticate a token via TokenManager
 *  2. Start TCP server via HostRelay.listen()
 *  3. Find or create tunnel via TunnelResolver (with auth retry)
 *  4. Register port on tunnel (with auth retry)
 *  5. Wire relay events — create ClientSession per client
 *  6. Connect relay
 *  7. Return { tunnelId, clusterId, port }
 */

interface TunnelInfo {
    tunnelId: string;
    clusterId: string;
    port: number;
}
interface TunnelHostConfig {
    tokenManager: TokenManager;
    tunnelResolver: TunnelResolver;
    hostRelay: HostRelay;
    preferredPort?: number;
    clientSession?: ClientSessionConfig;
    onLog?: (level: string, message: string) => void;
}
declare class TunnelHost {
    private readonly tokenManager;
    private readonly tunnelResolver;
    private readonly hostRelay;
    private readonly sessionConfig?;
    private readonly preferredPort?;
    private readonly log;
    private readonly subscriptions;
    private readonly sessions;
    private registeredTunnelId;
    private registeredClusterId;
    private registeredPort;
    /** Tracks whether the initial relay connection has been established. */
    private initialConnectDone;
    /** Consecutive re-registration failures — circuit breaker for reconnect loops. */
    private reRegistrationAttempts;
    private readonly _clientConnected;
    private readonly _clientDisconnected;
    private readonly _statusChanged;
    constructor(config: TunnelHostConfig);
    start(): Promise<TunnelInfo>;
    stop(): Promise<void>;
    onClientConnected(handler: (session: ClientSession) => void): Disposable;
    onClientDisconnected(handler: (clientId: string) => void): Disposable;
    onStatusChanged(handler: (status: ConnectionStatus, context?: string) => void): Disposable;
    private wireRelayEvents;
    private reRegisterPort;
}

/**
 * ApplicationHost — composes the connectivity layer (TunnelHost) with the
 * application layer (shared services + RPC handlers + per-client state).
 *
 * start() → tunnel auth + connect, then for each tunnel client:
 *   1. Create per-client state (SessionTracker, SubscriptionSet, CallbackChannel)
 *   2. Wire session.onRequest → router.dispatch(method, params, context)
 *   3. On disconnect → dispose per-client state
 *
 * stop() → dispose all per-client state, dispose shared services, stop tunnel.
 */

interface ApplicationHostConfig {
    tunnelHost: TunnelHost;
    services: ServiceContainer;
    router: MethodRouter;
    onLog?: (level: string, message: string) => void;
}
declare class ApplicationHost {
    private readonly tunnelHost;
    private readonly services;
    private readonly router;
    private readonly log;
    private readonly clients;
    private readonly hostDisposables;
    private _tunnelInfo;
    /**
     * Per-client active-session viewing state, reported by clients via
     * session.reportActiveState notifications. Used to make needsAttention
     * decisions when processing ends.
     */
    private readonly clientActiveState;
    constructor(config: ApplicationHostConfig);
    get tunnelInfo(): TunnelInfo | null;
    start(): Promise<TunnelInfo>;
    stop(): Promise<void>;
    private handleClientConnected;
    private handleClientDisconnected;
    private handleClientIdentify;
    /**
     * Broadcast a session.viewed lifecycle event to all clients except the sender.
     * This allows other clients to clear their blue dot (needsAttention) indicator.
     */
    private handleSessionMarkViewed;
    /**
     * Update the tracked viewing state for a client.
     * Each notification fully replaces the previous state for that client.
     */
    private handleReportActiveState;
    /**
     * Check if ANY connected client with a visible tab is viewing the given session.
     */
    private isSessionViewedByAnyClient;
    /**
     * Check if a specific client is viewing the given session (with visible tab).
     */
    private isClientViewingSession;
    /**
     * Subscribe to lifecycle events from ALL pooled CopilotClients and forward
     * them (throttled) to this tunnel client. Also retains a dedicated client
     * for process.cwd() so events are generated even when no sessions are active.
     */
    private wireLifecycleEvents;
    private disposeClient;
}

/**
 * CLI entry point — wires everything together with Commander.
 *
 * Commands:
 *   remote-sdk-host [--debug] [--port <n>]   Start the host
 *   remote-sdk-host logout                    Clear stored credentials
 *   remote-sdk-host tunnel                    Show stored tunnel info
 *   remote-sdk-host tunnel clear              Delete tunnels + clear config
 *   remote-sdk-host tunnel regenerate         Clear + create fresh
 */

declare function createCli(): Command;

export { ApplicationHost, type ApplicationHostConfig, type AttachedClient, CallbackChannel, type CallbackChannelConfig, ClientSession, type ClientSessionConfig, type CommitFile, type CommitHistoryResult, type CopilotClient, type CopilotClientState, CopilotService, type CopilotServiceConfig, type CopilotSession, type DeleteOptions, DirectAuthGateway, DirectoryCache, type DirectoryEntry, type DirectoryListingChangedEvent, DiskFileSystemProvider, DiskGitProvider, type Event, EventEmitter, type ExecuteSlashCommandResponse, type FileContentChangedEvent, type FileDeletedEvent, type FileDiffStat, type FileRenamedEvent, type FileSearchResult, FileSearchService, type FileStat, type FileSystemProvider, FileSystemService, type FileSystemServiceConfig, FileTunnelConfigStore, type FileWithTime, type GetCommitHistoryOptions, type GitBranch, type GitBranchChangedEvent, type GitCheckoutOptions, type GitCommit, type GitCommitCreatedEvent, type GitCommitOptions, type GitDiffStats, type GitFileStatus, type GitFileStatusCode, type GitHeadChangedEvent, GitIgnoreCache, type GitProvider, GitService, type GitServiceConfig, type GitStatus, type GitStatusChangedEvent, type HandlerContext, type HandlerFn, type HistoryCommit, HostRelay, type HostRelayConfig, HostTerminalManager, KeychainTokenStorage, MethodNotFoundError, MethodRouter, MgmtApiTunnelGateway, NodeConnectivityMonitor, ParcelFileWatcher, type PerFileDiffStats, type ResourceFactory, ResourcePool, type ResourcePoolConfig, type SearchFilesRequest, type SearchFilesResponse, type SerializedGitStatus, type ServiceContainer, SessionTracker, type Skill, type SkillDirectorySource, type SkillLoadResult, SkillService, type SkillServiceConfig, type SkillSource, type SlashCommandCategory, type SlashCommandInfo, type SlashCommandResultPayload, SocketByteStream, type SplitPerFileDiffStats, type Subscription, SubscriptionSet, type SubscriptionType, TerminalSession, type TerminalState, type TrackedBranch, type TrackedBranchInfo, type TrackedBranchType, TunnelHost, type TunnelHostConfig, type TunnelInfo, abortSession, authStatusHandler, clearSkillsCache, createCli, createSession, deserializeGitStatus, destroySession, executeSlashCommandHandler, filesystemHandlers, findGitRoot, getCommandDirectories, getMessages, getPluginSkillSources, getSkillDirectories, getStateHandler, gitHandlers, isCaseInsensitiveFS, isGitAvailable, isPathOutside, listSessions, listSlashCommandsHandler, loadSkills, modelsListHandler, normalizePathForComparison, pathEquals, pathStartsWith, pingHandler, registerAllHandlers, safeRelativePath, searchFilesHandler, sendAndWait, sendMessage, serializeGitStatus, sessionHandlers };
