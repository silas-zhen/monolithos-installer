# Monolithos Installer

Official installer for **Monolithos** - The Executive Life Operating System for Obsidian.

## What This Plugin Does

This plugin provides a simple way for licensed Monolithos users to install the full Monolithos plugin package into their existing Obsidian vault.

### Installation Flow

1. **License Verification** - User enters their license key, which is verified against the Monolithos API
2. **Package Download** - Upon successful verification, the plugin downloads the Monolithos package
3. **Automatic Installation** - Files are extracted and installed to the appropriate locations in your vault

## Data & Privacy

### What We Collect
**Nothing.** This plugin does not collect, store, or transmit any user data.

### What We Verify
- Only your license key is sent to our server for verification
- No personal information, vault contents, or usage data is ever transmitted

### Network Requests
This plugin makes requests only to official Monolithos servers:

| Endpoint | Purpose |
|----------|---------|
| `https://api.monolithos.ai/verify` | License key verification |
| `https://api.monolithos.ai/download/*` | Plugin package download |

No third-party services are used.

## Source & Transparency

- **Developer**: Monolithos LLC
- **Website**: [monolithos.ai](https://monolithos.ai)
- **Source Code**: [GitHub](https://github.com/silas-zhen/monolithos-installer)
- **Plugin Package Source**: `api.monolithos.ai` (our own server infrastructure)

## What Gets Installed

When you run the installer, the following files are installed to your vault:

```
.obsidian/
├── plugins/
│   └── monolithos/          # Main plugin files
│       ├── main.js
│       ├── manifest.json
│       ├── styles.css
│       └── assets/
└── snippets/                 # CSS theme files
    ├── monolithos-fonts.css
    ├── monolithos-light.css
    ├── sovereign-editor.css
    └── ...
```

## Requirements

- Obsidian v1.0.0 or higher
- Valid Monolithos license key (purchase at [monolithos.ai](https://monolithos.ai))

## Usage

1. Install this plugin from Obsidian Community Plugins
2. Click the download icon in the ribbon, or use command palette: "Open Monolithos Installer"
3. Enter your license key
4. Click "Verify & Install"
5. Enable the Monolithos plugin in Settings → Community Plugins

## Support

- Documentation: [monolithos.ai/docs](https://monolithos.ai)
- Email: support@monolithos.ai
- Discord: [Join the Syndicate](https://discord.gg/TZytzbDx6E)

## License

MIT License - see LICENSE file for details.

---

**Monolithos** - Silence. Structure. Sovereignty. Soul.
