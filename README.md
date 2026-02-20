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

### Codespaces / Dev Containers

Running in a container (e.g. GitHub Codespaces) requires additional setup because there is no D-Bus session bus or secret service available by default.

1. Install dependencies:

   ```bash
   sudo apt-get install -y libsecret-1-0 dbus gnome-keyring
   ```

2. Generate a machine ID and start the D-Bus system daemon:

   ```bash
   sudo bash -c 'dbus-uuidgen > /etc/machine-id'
   sudo mkdir -p /run/dbus
   sudo dbus-daemon --system --fork
   ```

3. Run `remote-sdk-host` inside a D-Bus session with an unlocked keyring:

   ```bash
   dbus-run-session -- bash -c 'echo "" | gnome-keyring-daemon --unlock && remote-sdk-host'
   ```

## Usage

Start the host:

```bash
remote-sdk-host
```

> **Note:** In Codespaces/containers, use the `dbus-run-session` wrapper shown above instead.

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
