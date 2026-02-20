# Remote SDK Host

Host application that exposes the GitHub Copilot SDK over Microsoft Dev Tunnels, enabling browser-based clients to interact with Copilot.

## Installation

```bash
npm install -g github:avanderhoorn/tunnel-proxy-release
```

**Prerequisites:**
- Node.js 20+
- **Linux:** `libsecret-1-0` (required by the [keytar](https://github.com/atom/node-keytar) dependency for secure credential storage)

  On Ubuntu/Debian:
  ```bash
  sudo apt-get install -y libsecret-1-0
  ```

  On macOS, the native keychain is used and no extra dependencies are needed.

## Usage

Start the host:

```bash
remote-sdk-host
```

On first run, you'll be prompted to authenticate with GitHub via device flow. The tunnel ID and cluster will be displayed — use these to connect from the web client.

### Commands

```bash
remote-sdk-host              # Start the tunnel host
remote-sdk-host logout       # Clear stored GitHub credentials
remote-sdk-host tunnel       # Show stored tunnel configuration
remote-sdk-host tunnel clear # Clear stored tunnel configuration
```

### Options

```bash
-d, --debug    Enable verbose debug logging
-p, --port     Port for local SDK connection (default: auto)
-V, --version  Show version number
-h, --help     Show help
```

## Web Client

Connect to your running host using the web client:

**https://gh.io/copilot-tunnel**

Enter the tunnel ID and cluster displayed by the host to establish a connection.

## Updating

To update to the latest version:

```bash
npm install -g github:avanderhoorn/tunnel-proxy-release
```
