---
title: Building a Unified SSH and VPN Connection Manager for Linux
date: 2026-10-28 22:03:00
tags: [Linux, SSH, VPN, SOCKS5, Proxy, Port Forwarding, KeePassXC, OpenConnect, Bash]
---

# Building a Unified SSH and VPN Connection Manager for Linux

As a software engineer, I frequently connect to remote servers, establish SSH tunnels, and switch between different VPN environments.

Although tools like SSH, OpenVPN, and OpenConnect are powerful, repeatedly entering connection parameters, usernames, passwords, and two-factor authentication codes can become tedious.

I wanted a simpler workflow: **one command to manage all my SSH and VPN connections, integrated with KeePassXC for credential management.**

The result is a shell utility called `tun`, built using shell functions, `fzf`, SSH, KeePassXC, and OpenConnect.

## What Does It Do?

The `tun` command provides a unified interface for:

- Regular SSH connections
- Local SSH port forwarding (`-L`)
- Reverse SSH port forwarding (`-R`)
- SOCKS5 proxies (`-D`)
- OpenConnect and OpenVPN connections
- Automatic credential retrieval from KeePassXC
- Optional TOTP-based two-factor authentication
- Automatic VPN reconnection after session expiration

It supports both interactive selection through `fzf` and direct command-line arguments.

## 1. A Unified Command-Line Interface

Instead of remembering different commands for different connection types, I can simply execute:

```bash
tun
```

This opens an interactive `fzf` menu:

```text
Select Connection Type

> VPN
  SSH Connection
  Local (-L)
  Reverse (-R)
  SOCKS5 (-D)
```

After selecting a connection type, the script displays available hosts or VPN configurations.

For example, choosing SSH displays the aliases and addresses defined in `~/.ssh/config`:

```text
Select SSH Host

work/kubernetes                 10.0.0.10
work/database                   10.0.0.20
homelab/proxmox                 192.168.1.100
```

The script uses `ssh -G` to retrieve effective hostnames, so configuration options such as `HostName`, `Port`, and `ProxyJump` are respected.

For my setup, only SSH aliases containing `/` appear in the interactive selection menu. This allows me to organize hosts by environment.

### Direct Command-Line Arguments

Sometimes an interactive menu is unnecessary, especially when repeating a connection.

The script also supports direct arguments:

```bash
# Regular SSH connection
tun ssh work/kubernetes

# Local port forwarding
tun local work/kubernetes 9191 443

# Reverse port forwarding
tun reverse work/kubernetes 9000 3000

# SOCKS5 proxy (default port: 9090)
tun socks work/kubernetes

# SOCKS5 proxy with a custom port
tun socks work/kubernetes 1080

# VPN connection
tun vpn work
```

This makes the same utility useful for both occasional interactive connections and frequently used commands.

## 2. Managing SSH Hosts with SSH Config

Instead of maintaining a separate hosts database, the script reads `~/.ssh/config`.

Example:

```sshconfig
Host work/kubernetes
    HostName 10.0.0.10
    User admin
    Port 2222

Host work/database
    HostName 10.0.0.20
    User developer
    Port 22

Host homelab/proxmox
    HostName 192.168.1.100
    User root
    IdentityFile ~/.ssh/id_ed25519
    IdentitiesOnly yes
```

Using SSH configuration provides several advantages:

- Connection details stay in one place.
- Standard SSH features work without additional implementation.
- Configuration changes are reflected when the script runs.
- Authentication can be configured independently for each server.

### SSH Key Detection

One requirement was avoiding unnecessary password prompts for servers configured with SSH keys.

The script checks whether an explicit `IdentityFile` is configured.

If a key is configured, it uses ordinary SSH authentication without retrieving credentials from KeePass.

Otherwise, it attempts to retrieve a username and password from KeePassXC.

## 3. Integrating KeePassXC for SSH Credentials

I use KeePassXC to manage credentials, so I wanted the connection utility to retrieve them automatically.

My KeePass database follows a structure that mirrors SSH host aliases:

```text
SSH/
├── work/
│   ├── kubernetes/
│   │   ├── Administrator
│   │   └── Developer
│   └── database/
│       └── DBA
└── homelab/
    └── server/
        └── Admin
```

For example, selecting `work/kubernetes` makes the script search:

```bash
keepass ls -R -f "SSH/work/kubernetes"
```

The `keepass` command is a custom shell function wrapping `keepassxc-cli` with my default database path.

### Automatic Credential Selection

The script handles three scenarios:

**No credentials found:** It asks for a username and password.

**One credential found:** It automatically selects that credential.

**Multiple credentials found:** It displays an `fzf` menu containing entry names and usernames.

```text
Select SSH Credential

Administrator                    root
Developer                        ubuntu
Service Account                  deploy
```

After selection, it retrieves both attributes:

```bash
keepass show \
    -a username \
    -a password \
    "SSH/work/kubernetes/Administrator"
```

### Passing Passwords to SSH

OpenSSH doesn't provide a standard command-line option for supplying passwords non-interactively.

For password-based connections, I use `sshpass` with a dedicated file descriptor:

```bash
sshpass -d 3 ssh \
    -l "$username" \
    "$server" 3<<< "$password"
```

Unlike `sshpass -p`, this avoids placing the password directly in the process command-line arguments.

SSH key authentication is still preferable where available, but this provides a practical integration with an existing password manager.

## 4. Managing VPN Profiles with OpenConnect and OpenVPN

The script supports two VPN configuration extensions:

| Extension | VPN client |
|---|---|
| `.conf` | OpenConnect |
| `.ovpn` | OpenVPN |

My VPN directory looks like this:

```text
~/vpn/
├── work.conf
├── customer.conf
├── production.conf
└── home.ovpn
```

Running:

```bash
tun vpn
```

opens an `fzf` menu containing these profiles.

Alternatively, I can connect directly:

```bash
tun vpn work
```

The script automatically selects `work.conf` when it uniquely matches the supplied name.

### OpenConnect Configuration

OpenConnect supports several VPN protocols, including Cisco AnyConnect, Fortinet, and GlobalProtect.

Rather than hardcoding protocol-specific settings in the shell function, I store them directly in each VPN profile.

Example `work.conf`:

```ini
server=vpn.work.com:443
protocol=fortinet

interface=vpn-work
useragent=FortiSSLVPN

no-external-auth
reconnect-timeout=3600

script= vpn-slice 192.168.10.0/24 freeipa.work.test=192.168.10.128 rancher.work.test=192.168.10.114 dev.rancher.work.test=192.168.10.114 haproxy.dev.rancher.work.test=192.168.10.115
```

This example also uses `vpn-slice` for split tunneling, allowing selected networks to be routed through the VPN rather than sending all traffic through it.

The `script` directive requires `vpn-slice` to be installed at the specified location. Other options, such as `no-external-auth`, should be enabled only when compatible with the VPN gateway.

## 5. Automatic VPN Authentication with KeePassXC

For VPN connections, I use a simpler KeePass structure than for SSH:

```text
VPN/
├── work
├── customer
├── production
└── home
```

The script matches the VPN configuration filename, without its extension, to the KeePass entry title.

For example:

```text
VPN profile:   ~/vpn/work.conf
KeePass entry: VPN/work
```

This avoids opening another credential-selection menu.

If the matching KeePass entry cannot be retrieved, the script launches the VPN client normally and lets it handle authentication interactively.

### Supporting Two-Factor Authentication

Some VPN servers require a password followed by a separate time-based one-time password (TOTP).

KeePassXC can generate these codes when a TOTP secret is configured for the entry.

The script attempts to retrieve all three values:

```bash
keepass show \
    -a username \
    -a password \
    -t \
    "VPN/work"
```

If TOTP isn't configured, KeePassXC may return an error. In that case, the script retries without `-t` and continues with the username and password.

This makes TOTP optional on a per-entry basis.

## 6. Automatic VPN Reconnection

Another problem was session expiration.

OpenConnect provides a `reconnect-timeout` option for recovering interrupted connections. However, once a VPN authentication session expires, a new login may be required.

To handle this, I added a reconnection supervisor.

The workflow is:

1. Connect to the VPN.
2. Keep the VPN client running in the foreground.
3. Detect when the VPN process exits.
4. Retrieve credentials and a fresh TOTP code.
5. Wait five seconds.
6. Attempt to establish a new VPN session.

The retry loop is conceptually simple:

```bash
while :; do
    # Retrieve fresh credentials and TOTP
    # Start the VPN connection

    rc=$?

    # Stop on normal or intentional termination
    [ "$rc" -eq 0 ] && break

    sleep 5
done
```

The implementation also tracks connection duration and stops after three rapid failures, reducing the risk of repeated authentication failures.

Reconnection begins only after the VPN client exits. The script does not independently monitor the authentication cookie's expiration time.

For unattended reconnection, KeePass must remain accessible, and any required privileges or MFA approvals must still be satisfied.


## 7. Complete Installation Guide

Here is an end-to-end installation guide for Fedora, Arch Linux and Ubuntu/Debian. The shell functions support both Bash and Zsh.

### Step 1: Install Dependencies

**Fedora:**

```bash
sudo dnf install \
    openssh-clients \
    fzf \
    sshpass \
    keepassxc \
    openconnect \
    openvpn
```

**Arch Linux:**

```bash
sudo pacman -Syu --needed \
    openssh \
    fzf \
    sshpass \
    keepassxc \
    openconnect \
    openvpn
```

**Ubuntu / Debian:**

```bash
sudo apt update

sudo apt install \
    openssh-client \
    fzf \
    sshpass \
    keepassxc \
    openconnect \
    openvpn
```

### Step 2: Create the Directory Structure

Create the directories for your configuration files and shell functions:

```bash
mkdir -p \
    "$HOME/.config/shell" \
    "$HOME/.ssh" \
    "$HOME/vpn"
```

The resulting structure will look like this:

```text
~/
├── .config/
│   └── shell/
│       └── conn-tun.sh
├── .ssh/
│   └── config
├── vpn/
│   ├── work.conf
│   └── home.ovpn
└── Vault.kdbx
```

### Step 3: Install the Connection Script

Save the complete `conn-tun.sh` script containing the `tun` and `conn-vpn` functions.

From the directory containing the downloaded script, run:

```bash
install -m 600 ./conn-tun.sh \
    "$HOME/.config/shell/conn-tun.sh"
```

The script is designed to be sourced into your existing shell rather than launched as a separate executable.

### Step 4: Configure the KeePassXC Helper

I use a small shell function to avoid specifying the KeePass database path every time.

Add the following to `~/.zshrc` or `~/.bashrc`:

```bash
keepass() {
    local db="$HOME/Vault.kdbx"
    local cmd="${1:-}"

    if [ -z "$cmd" ]; then
        printf 'Usage: keepass <command> [options]\n'
        return 1
    fi

    shift

    keepassxc-cli "$cmd" "$db" "$@"
}
```

Replace `~/Vault.kdbx` with the actual location of your KeePass database.

Now, instead of running:

```bash
keepassxc-cli ls ~/Vault.kdbx SSH
```

I can simply use:

```bash
keepass ls SSH
```

Test the helper:

```bash
keepass ls -f VPN
```

KeePassXC may request the database master password when executing CLI commands, even if the graphical application is already unlocked.

### Step 5: Configure SSH Hosts

Create or update `~/.ssh/config`:

```sshconfig
# Kubernetes server - password authentication
Host work/kubernetes
    HostName 10.0.0.10
    User ubuntu
    Port 2222
    ServerAliveInterval 30

# Database server - password authentication
Host work/database
    HostName 10.0.0.20
    User developer
    Port 22

# Proxmox server - SSH key authentication
Host homelab/proxmox
    HostName 192.168.1.100
    User root
    IdentityFile ~/.ssh/id_ed25519
    IdentitiesOnly yes

# Shared defaults
Host *
    ServerAliveInterval 30
    ServerAliveCountMax 3
    ConnectTimeout 10
```

Apply appropriate file permissions:

```bash
chmod 700 ~/.ssh
chmod 600 ~/.ssh/config
```

Verify that OpenSSH can read the configuration:

```bash
ssh -G work/kubernetes |
    grep -E '^(hostname|user|port) '
```

Expected output:

```text
hostname 10.0.0.10
user ubuntu
port 2222
```

The `tun` function will use these aliases automatically.

### Step 6: Configure KeePassXC SSH Credentials

Open your KeePassXC database and create the following groups and entries:

```text
SSH/
└── work/
    ├── kubernetes/
    │   └── Administrator
    └── database/
        └── Developer
```

Example fields for the `Administrator` entry:

| Field | Value |
|---|---|
| Title | Administrator |
| Username | ubuntu |
| Password | Your SSH password |

The matching group is determined by the SSH alias:

```text
SSH alias:     work/kubernetes
KeePass group: SSH/work/kubernetes
```

You can verify the entry using:

```bash
keepass ls -R -f "SSH/work/kubernetes"
```

And retrieve its username:

```bash
keepass show \
    -a username \
    "SSH/work/kubernetes/Administrator"
```

For `homelab/proxmox`, which uses an SSH key, a KeePass entry isn't necessary.

### Step 7: Create VPN Configurations

For OpenConnect, create `~/vpn/work.conf`:

```bash
cat > "$HOME/vpn/work.conf" <<'EOF'
server=vpn.example.com:443
protocol=fortinet
interface=vpn-work
reconnect-timeout=3600
EOF
```

Replace the example address and options with those required by your VPN gateway.

Additional options can be added when needed:

```ini
useragent=FortiSSLVPN
no-external-auth
servercert=pin-sha256:YOUR_ACTUAL_CERTIFICATE_PIN
```

If you use `servercert`, obtain and verify the actual server certificate pin through a trusted source. Do not use the placeholder shown above.

For OpenVPN, copy a valid `.ovpn` configuration supplied by your VPN administrator:

```bash
cp /path/to/your/openvpn-profile.ovpn \
    "$HOME/vpn/home.ovpn"
```

OpenVPN and OpenConnect use different configuration formats, so keep their files separate.

### Step 8: Configure KeePassXC VPN Credentials

In KeePassXC, create a group called `VPN` with an entry named `work`.

```text
VPN/
├── work
└── home
```

Example fields:

| Field | Value |
|---|---|
| Title | work |
| Username | employee |
| Password | Your VPN password |
| TOTP | Optional TOTP secret |

To configure TOTP in KeePassXC, open the entry and use its TOTP configuration option to add the secret provided during your VPN MFA enrollment.

The filename and KeePass entry title must match:

```text
VPN profile:   work.conf
KeePass entry: VPN/work
```

Test retrieval:

```bash
keepass show \
    -a username \
    -a password \
    "VPN/work"
```

If you configured TOTP:

```bash
keepass show -t "VPN/work"
```

Do not print real credentials or OTP codes in shared terminals, screenshots, or logs.

### Step 9: Load the Shell Functions

Add this line to `~/.zshrc`:

```bash
source "$HOME/.config/shell/conn-tun.sh"
```

For Bash, add it to `~/.bashrc` instead.

Reload your shell configuration:

```bash
source ~/.zshrc
```

Verify that both functions are available:

```bash
type tun
type conn-vpn
type keepass
```

All three should be recognized as shell functions.

### Step 10: Prepare VPN Permissions

The VPN script launches OpenConnect or OpenVPN using `sudo -n`, which does not prompt for a password.

For an initial test, authenticate sudo first:

```bash
sudo -v
tun vpn work
```

For unattended reconnection after the sudo authentication ticket expires, the VPN process needs an appropriate privilege arrangement.

Avoid giving arbitrary user-writable scripts or VPN configurations unrestricted root execution through broad `NOPASSWD` rules. A controlled root-owned launcher or narrowly scoped service is a safer option.

## 8. Complete Usage Examples

With installation finished, here are practical examples of using the utility.

### Example 1: Connect to a Server with KeePassXC

Execute:

```bash
tun ssh work/kubernetes
```

The script performs the following actions:

1. Resolves `work/kubernetes` using `~/.ssh/config`.
2. Checks whether an explicit `IdentityFile` exists.
3. Searches `SSH/work/kubernetes` in KeePassXC.
4. Automatically selects the credential if there is only one entry.
5. Connects using the retrieved username and password.

Example output:

```text
Looking for KeePass entries: SSH/work/kubernetes
Using KeePass entry: Administrator

Connecting to work/kubernetes...
Authenticating as ubuntu (KeePass)
```

No additional `fzf` selection is needed because the host was supplied directly.

### Example 2: Connect Using an SSH Key

Execute:

```bash
tun ssh homelab/proxmox
```

Because `homelab/proxmox` has an `IdentityFile` configured, the script skips KeePass credential retrieval and uses the configured SSH identity.

This is useful for frequently accessed infrastructure servers.

### Example 3: Create a Local SSH Tunnel

Suppose a remote server exposes an HTTPS service on port 443, but you want to access it through local port 9191.

Execute:

```bash
tun local work/kubernetes 9191 443
```

The resulting forwarding operation is equivalent to:

```bash
ssh -N -T \
    -L 127.0.0.1:9191:127.0.0.1:443 \
    work/kubernetes
```

Now test the connection locally:

```bash
curl -vk https://127.0.0.1:9191
```

You can also specify another destination host reachable from the SSH server:

```bash
tun local work/kubernetes 9191 443 10.0.0.50
```

This forwards your local port 9191 to `10.0.0.50:443` through the SSH server.

### Example 4: Create a Reverse SSH Tunnel

Suppose you're running a development application locally on port 3000, and you want to expose it to the remote SSH server on port 9000.

Execute:

```bash
tun reverse work/kubernetes 9000 3000
```

The equivalent SSH command is:

```bash
ssh -N -T \
    -R 127.0.0.1:9000:127.0.0.1:3000 \
    work/kubernetes
```

From the remote SSH server, test:

```bash
curl http://127.0.0.1:9000
```

Reverse forwarding requires the server's SSH daemon to allow remote TCP forwarding.

A restrictive configuration can use:

```sshconfig
AllowTcpForwarding remote
GatewayPorts no
```

The tunnel also remains subject to any `PermitListen`, key-specific forwarding restrictions, and port conflicts.

### Example 5: Create a SOCKS5 Proxy

Execute:

```bash
tun socks work/kubernetes
```

This creates a local SOCKS5 proxy on port `9090`.

Equivalent SSH command:

```bash
ssh -N -T \
    -D 127.0.0.1:9090 \
    work/kubernetes
```

To test it:

```bash
curl \
    --socks5-hostname 127.0.0.1:9090 \
    https://ifconfig.me
```

The request is routed through the SSH server.

Using `--socks5-hostname` also delegates hostname resolution to the proxy side.

To use a different SOCKS5 port:

```bash
tun socks work/kubernetes 1080
```

### Example 6: Connect to a VPN Automatically

Execute:

```bash
tun vpn work
```

The script finds `~/vpn/work.conf`, then searches for the corresponding KeePass entry:

```text
VPN/work
```

Example output:

```text
Selected VPN: work.conf
Looking for KeePass entry: VPN/work
Using KeePass: VPN/work

Connecting to work.conf...
```

OpenConnect receives the username and password from KeePass, along with a TOTP code when configured.

If the entry isn't available, OpenConnect starts directly and handles authentication interactively.

### Example 7: Reconnect After VPN Session Expiration

When the VPN authentication session expires and OpenConnect exits with a failure, the script retries automatically.

Example:

```text
Selected VPN: work.conf
Looking for KeePass entry: VPN/work
Using KeePass: VPN/work

Connecting to work.conf...

VPN disconnected (exit code: 2).
Retrying in 5 seconds...

Looking for KeePass entry: VPN/work
Using KeePass: VPN/work

Connecting to work.conf...
```

A fresh TOTP is retrieved for each authentication attempt.

The script stops after three rapid connection failures, preventing an endless sequence of unsuccessful authentication attempts.

Successful unattended reconnection still depends on the availability of KeePass credentials, necessary privileges, and the VPN server's MFA policy.

### Example 8: Use the Interactive Menu

When I don't remember the exact connection name, I simply execute:

```bash
tun
```

After selecting `VPN`, an example profile menu looks like this:

```text
Select VPN Configuration

customer.conf
home.ovpn
production.conf
work.conf
```

After selecting `SSH Connection`, the host menu looks like this:

```text
Select SSH Host

homelab/proxmox                 192.168.1.100
work/database                   10.0.0.20
work/kubernetes                 10.0.0.10
```

This is particularly useful when working with many different environments.

## 9. Troubleshooting

### KeePassXC Keeps Asking for the Master Password

`keepassxc-cli` opens the KeePass database independently of the graphical KeePassXC application.

The connection script doesn't bypass database authentication. A secure unlocked credential provider or a persistent CLI session is needed to avoid repeated master-password prompts.

### SSH Reports "Administratively Prohibited"

If an SSH tunnel reports:

```text
channel 1: open failed: administratively prohibited: open failed
```

Check the SSH server's forwarding configuration:

```bash
sudo sshd -T |
    grep -E '^(allowtcpforwarding|disableforwarding|permitopen|permitlisten) '
```

The server may be configured to reject TCP forwarding.

### Reverse Port Forwarding Fails

If a reverse tunnel reports:

```text
Error: remote port forwarding failed for listen port 9090
```

Check whether the port is occupied:

```bash
sudo ss -ltnp | grep ':9090'
```

Also verify that the SSH server allows remote forwarding.

### OpenConnect Cannot Reconnect

Check whether OpenConnect has exited or is still attempting to recover the existing session.

The wrapper only starts a new authentication attempt after the VPN process exits.

Also check sudo permissions, KeePass availability, and whether the VPN requires additional interactive authentication.

## 10. Security Considerations

Automating SSH and VPN authentication introduces several security considerations.

The main principles I followed were:

- **Avoid hardcoded passwords.** Credentials remain in KeePassXC rather than in scripts.
- **Prefer SSH keys.** Hosts configured with an explicit `IdentityFile` bypass password retrieval.
- **Avoid passwords in command-line arguments.** SSH credentials are passed through file descriptors.
- **Preserve SSH host-key verification.** The script does not disable SSH server identity checks.
- **Limit connection retries.** Repeated rapid VPN failures cause the supervisor to stop.
- **Avoid shell tracing.** Running credential-handling functions with `set -x` could expose sensitive values.
- **Restrict privileged operations.** VPN network configuration should not allow arbitrary untrusted scripts to execute as root.

Credentials still exist temporarily in shell memory, and automation does not eliminate the security implications of storing passwords and TOTP secrets together.

## Bonus: Unlocking KeePassXC Automatically with Secret Service

One inconvenience with `keepassxc-cli` is that it normally asks for the database master password every time a command is executed.

This becomes particularly annoying when the connection manager needs multiple KeePass operations or automatically reconnects to a VPN after session expiration.

To solve this, I integrated `secret-tool` with `keepassxc-cli`.

### How It Works

`secret-tool` communicates with the Linux Secret Service API, which is commonly provided by GNOME Keyring or KDE Wallet.

Instead of entering the KeePassXC database master password every time, we can securely store it in the desktop keyring and retrieve it when executing CLI commands.

The workflow is:

```text
tun
 └── keepass
      ├── secret-tool
      │    └── GNOME Keyring
      │         └── KeePassXC master password
      │
      └── keepassxc-cli
           └── Unlock KeePass database
                └── Retrieve SSH/VPN credentials
```

This approach doesn't require modifying the `tun` or `conn-vpn` functions.

### Step 1: Install Secret Service Tools

**Fedora:**

```bash
sudo dnf install libsecret
```

**Arch Linux:**

```bash
sudo pacman -S --needed libsecret
```

**Ubuntu / Debian:**

```bash
sudo apt install libsecret-tools
```

Make sure your desktop session has an available Secret Service provider, such as GNOME Keyring.

Verify the installation:

```bash
command -v secret-tool
```

### Step 2: Configure the KeePassXC Database Path

Add the following environment variable to your `~/.zshrc` or `~/.bashrc`:

```bash
export KEEPASS_DB_PATH="$HOME/Vault.kdbx"
```

Replace the path with the location of your actual KeePassXC database.

Reload your shell configuration:

```bash
source ~/.zshrc
```

### Step 3: Store the KeePassXC Master Password

Store your database master password in the system keyring:

```bash
secret-tool store \
    --label="KeePassXC Database" \
    application keepassxc \
    database "$KEEPASS_DB_PATH"
```

The command prompts for the password securely through the terminal.

The stored secret is identified by two attributes:

| Attribute | Value |
|---|---|
| `application` | `keepassxc` |
| `database` | Path specified in `KEEPASS_DB_PATH` |

These attributes allow us to retrieve the correct password later.

The keyring must be unlocked for the password to be retrieved without additional interaction.

### Step 4: Create the KeePass Helper Script

Create an executable named `keepass` in `~/.local/bin/keepass`.

```bash
mkdir -p "$HOME/.local/bin"
```

Use the following script:

```bash
#!/usr/bin/env bash

set -o pipefail

cmd="${1:-}"

if [ -z "$cmd" ]; then
    echo "Usage: keepass <command> [options] [args]" >&2
    exit 1
fi

: "${KEEPASS_DB_PATH:?KEEPASS_DB_PATH is not set}"

shift

secret-tool lookup \
    application keepassxc \
    database "$KEEPASS_DB_PATH" |
    keepassxc-cli "$cmd" -q "$KEEPASS_DB_PATH" "$@"
```

Make it executable:

```bash
chmod 700 "$HOME/.local/bin/keepass"
```

Ensure `~/.local/bin` is included in your `PATH`. If you previously defined a `keepass` shell function, remove it or update it to invoke this executable.

### Step 5: Test the Integration

List the KeePass groups:

```bash
keepass ls
```

Retrieve SSH credentials:

```bash
keepass ls -R -f "SSH/work/kubernetes"
```

Retrieve a username:

```bash
keepass show \
    -a username \
    "SSH/work/kubernetes/Administrator"
```

Retrieve a VPN TOTP code:

```bash
keepass show -t "VPN/work"
```

With the system keyring unlocked and the correct master password stored, these commands can execute without prompting for the KeePassXC master password each time.

### Security Considerations

This approach improves convenience but changes the security model.

The KeePassXC database master password is now stored in a second credential store. Anyone or any process that can retrieve that secret from the unlocked keyring could potentially unlock the database.

It is important to keep the following in mind:

- Use a password-protected system keyring.
- Ensure the keyring locks when the user session is locked or terminated, according to your security requirements.
- Avoid storing the master password in shell history, environment variables, or plaintext configuration files.
- Run the KeePass helper as your normal user, not through `sudo`.
- Prefer an independent Secret Service provider, such as GNOME Keyring, for this approach. Using KeePassXC itself as the provider for its own master password creates a circular dependency when the database is locked.

For environments with stronger security requirements, manually unlocking KeePassXC or using dedicated hardware-backed authentication may be preferable.

### Final Result

With this integration, the entire connection workflow becomes:

```bash
# Interactive connection selection
tun

# SSH connection with KeePass credentials
tun ssh work/kubernetes

# SOCKS5 proxy on port 9090
tun socks work/kubernetes

# VPN connection with KeePass and optional TOTP
tun vpn work
```

The connection manager can retrieve credentials using the same `keepass` interface without repeatedly asking for the database master password, provided the system keyring is available and unlocked.

This is especially useful for automatic VPN reauthentication, where the script needs to retrieve a new TOTP code after the previous VPN session expires.

## Conclusion

What started as a few SSH aliases eventually became a small connection-management utility.

By combining **OpenSSH, OpenConnect, OpenVPN, KeePassXC, sshpass, and fzf**, I eliminated much of the repetitive work involved in connecting to remote infrastructure.

The most useful improvements have been:

- A single command for different connection types.
- Centralized SSH and VPN configuration.
- Creating SSH tunnels and SOCKS5 proxy
- Automatic credential retrieval from KeePassXC.
- Optional TOTP authentication.
- VPN reconnection with fresh authentication credentials.
- Interactive and non-interactive connection workflows.

The implementation relies mostly on existing Linux tools rather than introducing a new connection-management service.

For anyone who frequently switches between servers, SSH tunnels, and VPN environments, a lightweight shell-based solution like this can make everyday infrastructure work considerably more convenient.
