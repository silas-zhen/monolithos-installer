/**
 * ═══════════════════════════════════════════════════════════════════════════
 * MONOLITHOS INSTALLER
 * ═══════════════════════════════════════════════════════════════════════════
 * Official installer for Monolithos - The Executive Life Operating System.
 * 
 * This plugin:
 * 1. Verifies your license key with api.monolithos.ai
 * 2. Downloads the full Monolithos plugin package
 * 3. Installs it to your vault automatically
 * 
 * No user data is collected. All verification is done via your license key only.
 * Source: https://github.com/silas-zhen/monolithos-installer
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { App, Plugin, PluginSettingTab, Setting, Notice, Modal, requestUrl } from 'obsidian';
import JSZip from 'jszip';

// ═══════════════════════════════════════════════════════════════════════════
// CONFIGURATION
// ═══════════════════════════════════════════════════════════════════════════

const API_BASE = 'https://api.monolithos.ai';
const VERIFY_URL = `${API_BASE}/verify`;
const PLUGIN_DOWNLOAD_URL = `${API_BASE}/download/MONOLITHOS_PLUGIN_v1.0.zip`;

interface MonolithosInstallerSettings {
    licenseKey: string;
    installed: boolean;
    installedVersion: string;
}

const DEFAULT_SETTINGS: MonolithosInstallerSettings = {
    licenseKey: '',
    installed: false,
    installedVersion: ''
};

interface AppearanceConfig {
    enabledCssSnippets?: string[];
    [key: string]: unknown;
}

interface JSZipEntry {
    dir: boolean;
    async(type: 'arraybuffer'): Promise<ArrayBuffer>;
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN PLUGIN CLASS
// ═══════════════════════════════════════════════════════════════════════════

export default class MonolithosInstaller extends Plugin {
    settings: MonolithosInstallerSettings;

    async onload() {
        console.debug('Monolithos Installer: loading');
        
        await this.loadSettings();
        
        // Add settings tab
        this.addSettingTab(new MonolithosInstallerSettingTab(this.app, this));
        
        // Add ribbon icon
        this.addRibbonIcon('download', 'Open installer', () => {
            new InstallModal(this.app, this).open();
        });
        
        // Add command
        this.addCommand({
            id: 'open-installer',
            name: 'Open installer',
            callback: () => {
                new InstallModal(this.app, this).open();
            }
        });
        
        console.debug('Monolithos Installer: ready');
    }

    async loadSettings() {
        this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
    }

    async saveSettings() {
        await this.saveData(this.settings);
    }

    /**
     * Verify license key with Monolithos API
     */
    async verifyLicense(licenseKey: string): Promise<{ valid: boolean; tier?: string; error?: string }> {
        try {
            const response = await requestUrl({
                url: VERIFY_URL,
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ license_key: licenseKey })
            });
            
            const data = response.json;
            
            if (data.valid) {
                return { valid: true, tier: data.tier };
            } else {
                return { valid: false, error: data.message || 'Invalid license key' };
            }
        } catch (error) {
            console.error('License verification error:', error);
            return { valid: false, error: 'Could not connect to server' };
        }
    }

    /**
     * Download and install the full Monolithos package
     */
    async installMonolithos(onProgress: (status: string) => void): Promise<boolean> {
        const adapter = this.app.vault.adapter;
        const configDir = this.app.vault.configDir;
        
        try {
            // 1. Download ZIP
            onProgress('Downloading Monolithos...');
            console.debug('[Installer] Downloading from:', PLUGIN_DOWNLOAD_URL);
            
            const response = await requestUrl({
                url: PLUGIN_DOWNLOAD_URL,
                method: 'GET'
            });
            
            const zipData = response.arrayBuffer;
            console.debug('[Installer] Downloaded:', zipData.byteLength, 'bytes');

            // 2. Unzip
            onProgress('Extracting files...');
            const zip = await JSZip.loadAsync(zipData);
            
            // 3. Process files
            const files: { path: string; content: ArrayBuffer }[] = [];
            
            for (const [relativePath, zipEntry] of Object.entries(zip.files)) {
                const entry = zipEntry as JSZipEntry;
                if (!entry.dir) {
                    const content = await entry.async('arraybuffer');
                    files.push({ path: relativePath, content });
                }
            }
            
            console.debug('[Installer] Files to install:', files.length);

            // 4. Write files
            onProgress('Installing files...');
            
            for (const file of files) {
                let targetPath = '';
                
                // Determine target path based on file location in zip
                if (file.path.includes('plugins/monolithos/')) {
                    // Plugin files → <configDir>/plugins/monolithos/
                    const fileName = file.path.substring(file.path.indexOf('plugins/monolithos/'));
                    targetPath = `${configDir}/${fileName}`;
                } else if (file.path.includes('snippets/')) {
                    // CSS snippets → <configDir>/snippets/
                    const fileName = file.path.substring(file.path.indexOf('snippets/'));
                    targetPath = `${configDir}/${fileName}`;
                } else {
                    // Skip unknown files
                    continue;
                }
                
                // Ensure directory exists
                const dir = targetPath.substring(0, targetPath.lastIndexOf('/'));
                if (dir && !(await adapter.exists(dir))) {
                    await adapter.mkdir(dir);
                }
                
                // Write file
                await adapter.writeBinary(targetPath, file.content);
                console.debug('[Installer] Written:', targetPath);
            }

            // 5. Enable CSS snippets in appearance.json
            onProgress('Configuring appearance...');
            await this.enableSnippets();

            onProgress('Installation complete!');
            
            // Update settings
            this.settings.installed = true;
            this.settings.installedVersion = '1.0.0';
            await this.saveSettings();
            
            return true;
            
        } catch (error) {
            console.error('[Installer] Installation failed:', error);
            throw error;
        }
    }

    /**
     * Enable installed CSS snippets in Obsidian
     */
    async enableSnippets(): Promise<void> {
        const adapter = this.app.vault.adapter;
        const configDir = this.app.vault.configDir;
        const appearancePath = `${configDir}/appearance.json`;
        
        try {
            let appearance: AppearanceConfig = {};
            
            // Read existing appearance.json if it exists
            if (await adapter.exists(appearancePath)) {
                const content = await adapter.read(appearancePath);
                appearance = JSON.parse(content) as AppearanceConfig;
            }
            
            // Get list of installed snippets
            const snippetsPath = `${configDir}/snippets`;
            if (await adapter.exists(snippetsPath)) {
                const snippetFiles = await adapter.list(snippetsPath);
                const snippetNames = snippetFiles.files
                    .filter((f: string) => f.endsWith('.css'))
                    .map((f: string) => {
                        const parts = f.split('/');
                        return parts[parts.length - 1].replace('.css', '');
                    });
                
                // Enable all Monolithos snippets
                if (!appearance.enabledCssSnippets) {
                    appearance.enabledCssSnippets = [];
                }
                
                for (const name of snippetNames) {
                    if (name.includes('monolithos') || name.includes('sovereign') || 
                        name.includes('archive') || name.includes('chamber') || 
                        name.includes('oracle') || name.includes('canvas')) {
                        if (!appearance.enabledCssSnippets.includes(name)) {
                            appearance.enabledCssSnippets.push(name);
                        }
                    }
                }
                
                // Write updated appearance.json
                await adapter.write(appearancePath, JSON.stringify(appearance, null, 2));
                console.debug('[Installer] Enabled snippets:', appearance.enabledCssSnippets);
            }
        } catch (error) {
            console.error('[Installer] Could not enable snippets:', error);
            // Non-fatal error, continue
        }
    }
}

// ═══════════════════════════════════════════════════════════════════════════
// INSTALL MODAL
// ═══════════════════════════════════════════════════════════════════════════

class InstallModal extends Modal {
    plugin: MonolithosInstaller;
    isInstalling: boolean = false;

    constructor(app: App, plugin: MonolithosInstaller) {
        super(app);
        this.plugin = plugin;
    }

    onOpen() {
        const { contentEl } = this;
        contentEl.empty();
        contentEl.addClass('monolithos-installer-modal');

        // Header
        contentEl.createEl('h2', { text: 'Monolithos installer' });
        
        // Description
        contentEl.createEl('p', { 
            text: 'Enter your license key to install the complete system.',
            cls: 'installer-description'
        });

        // License key input
        const inputContainer = contentEl.createDiv({ cls: 'installer-input-container' });
        const input = inputContainer.createEl('input', {
            type: 'text',
            placeholder: 'UFO_sk_xxxxxxxxxxxxxxxx',
            cls: 'installer-input'
        });
        input.value = this.plugin.settings.licenseKey;

        // Status message
        const statusEl = contentEl.createEl('p', { cls: 'installer-status' });

        // Buttons
        const buttonContainer = contentEl.createDiv({ cls: 'installer-buttons' });
        
        const installBtn = buttonContainer.createEl('button', {
            text: 'Verify & install',
            cls: 'installer-btn-primary'
        });
        
        const cancelBtn = buttonContainer.createEl('button', {
            text: 'Cancel',
            cls: 'installer-btn-secondary'
        });

        // Install handler — wrap async in void to satisfy void return expectation
        installBtn.addEventListener('click', () => {
            void this.handleInstall(input, statusEl, installBtn);
        });

        // Cancel handler
        cancelBtn.addEventListener('click', () => {
            if (!this.isInstalling) {
                this.close();
            }
        });
    }

    /**
     * Handle the install flow (verify + install)
     */
    private async handleInstall(
        input: HTMLInputElement,
        statusEl: HTMLElement,
        installBtn: HTMLButtonElement
    ): Promise<void> {
        if (this.isInstalling) return;

        const licenseKey = input.value.trim();
        if (!licenseKey) {
            statusEl.textContent = 'Please enter a license key';
            statusEl.className = 'installer-status error';
            return;
        }

        this.isInstalling = true;
        installBtn.disabled = true;
        installBtn.textContent = 'Verifying...';
        statusEl.textContent = 'Verifying license...';
        statusEl.className = 'installer-status';

        // Step 1: Verify license
        const result = await this.plugin.verifyLicense(licenseKey);

        if (!result.valid) {
            statusEl.textContent = result.error ?? 'Verification failed';
            statusEl.className = 'installer-status error';
            installBtn.disabled = false;
            installBtn.textContent = 'Verify & install';
            this.isInstalling = false;
            return;
        }

        // Save license key
        this.plugin.settings.licenseKey = licenseKey;
        await this.plugin.saveSettings();

        statusEl.textContent = `License valid! Tier: ${result.tier}`;
        installBtn.textContent = 'Installing...';

        // Step 2: Install
        try {
            await this.plugin.installMonolithos((status) => {
                statusEl.textContent = status;
            });

            statusEl.textContent = 'Installation complete!';
            statusEl.className = 'installer-status success';
            installBtn.textContent = 'Done!';

            // Show success message
            setTimeout(() => {
                this.close();
                new Notice('Installation complete. Please enable the plugin in settings → community plugins.');
            }, 1500);

        } catch (error) {
            const msg = error instanceof Error ? error.message : 'Unknown error';
            statusEl.textContent = `Installation failed: ${msg}`;
            statusEl.className = 'installer-status error';
            installBtn.disabled = false;
            installBtn.textContent = 'Retry';
            this.isInstalling = false;
        }
    }

    onClose() {
        const { contentEl } = this;
        contentEl.empty();
    }
}

// ═══════════════════════════════════════════════════════════════════════════
// SETTINGS TAB
// ═══════════════════════════════════════════════════════════════════════════

class MonolithosInstallerSettingTab extends PluginSettingTab {
    plugin: MonolithosInstaller;

    constructor(app: App, plugin: MonolithosInstaller) {
        super(app, plugin);
        this.plugin = plugin;
    }

    display(): void {
        const { containerEl } = this;
        containerEl.empty();

        new Setting(containerEl).setName('Settings').setHeading();

        // Status
        new Setting(containerEl)
            .setName('Installation status')
            .setDesc(this.plugin.settings.installed 
                ? `Monolithos v${this.plugin.settings.installedVersion} installed` 
                : 'Not installed')
            .addButton(button => button
                .setButtonText(this.plugin.settings.installed ? 'Reinstall' : 'Install')
                .onClick(() => {
                    new InstallModal(this.app, this.plugin).open();
                }));

        // License key (hidden)
        if (this.plugin.settings.licenseKey) {
            new Setting(containerEl)
                .setName('License key')
                .setDesc('Your license key is saved')
                .addButton(button => button
                    .setButtonText('Clear')
                    .onClick(async () => {
                        this.plugin.settings.licenseKey = '';
                        await this.plugin.saveSettings();
                        this.display();
                    }));
        }

        // Help
        new Setting(containerEl).setName('Need help?').setHeading();
        containerEl.createEl('p', { text: 'Visit monolithos.ai for documentation and support.' });
    }
}
