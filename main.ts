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

// ═══════════════════════════════════════════════════════════════════════════
// MAIN PLUGIN CLASS
// ═══════════════════════════════════════════════════════════════════════════

export default class MonolithosInstaller extends Plugin {
    settings: MonolithosInstallerSettings;

    async onload() {
        console.log('🏛️ Monolithos Installer: Loading...');
        
        await this.loadSettings();
        
        // Add settings tab
        this.addSettingTab(new MonolithosInstallerSettingTab(this.app, this));
        
        // Add ribbon icon
        this.addRibbonIcon('download', 'Monolithos Installer', () => {
            new InstallModal(this.app, this).open();
        });
        
        // Add command
        this.addCommand({
            id: 'open-monolithos-installer',
            name: 'Open Monolithos Installer',
            callback: () => {
                new InstallModal(this.app, this).open();
            }
        });
        
        console.log('🏛️ Monolithos Installer: Ready!');
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
        
        try {
            // 1. Download ZIP
            onProgress('Downloading Monolithos...');
            console.log('[Installer] Downloading from:', PLUGIN_DOWNLOAD_URL);
            
            const response = await requestUrl({
                url: PLUGIN_DOWNLOAD_URL,
                method: 'GET'
            });
            
            const zipData = response.arrayBuffer;
            console.log('[Installer] Downloaded:', zipData.byteLength, 'bytes');

            // 2. Unzip
            onProgress('Extracting files...');
            const zip = await JSZip.loadAsync(zipData);
            
            // 3. Process files
            const files: { path: string; content: ArrayBuffer }[] = [];
            
            for (const [relativePath, zipEntry] of Object.entries(zip.files)) {
                if (!(zipEntry as any).dir) {
                    const content = await (zipEntry as any).async('arraybuffer');
                    files.push({ path: relativePath, content });
                }
            }
            
            console.log('[Installer] Files to install:', files.length);

            // 4. Write files
            onProgress('Installing files...');
            
            for (const file of files) {
                let targetPath = '';
                
                // Determine target path based on file location in zip
                if (file.path.includes('plugins/monolithos/')) {
                    // Plugin files → .obsidian/plugins/monolithos/
                    const fileName = file.path.substring(file.path.indexOf('plugins/monolithos/'));
                    targetPath = `.obsidian/${fileName}`;
                } else if (file.path.includes('snippets/')) {
                    // CSS snippets → .obsidian/snippets/
                    const fileName = file.path.substring(file.path.indexOf('snippets/'));
                    targetPath = `.obsidian/${fileName}`;
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
                console.log('[Installer] Written:', targetPath);
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
        const appearancePath = '.obsidian/appearance.json';
        
        try {
            let appearance: any = {};
            
            // Read existing appearance.json if it exists
            if (await adapter.exists(appearancePath)) {
                const content = await adapter.read(appearancePath);
                appearance = JSON.parse(content);
            }
            
            // Get list of installed snippets
            const snippetsPath = '.obsidian/snippets';
            if (await adapter.exists(snippetsPath)) {
                const snippetFiles = await adapter.list(snippetsPath);
                const snippetNames = snippetFiles.files
                    .filter(f => f.endsWith('.css'))
                    .map(f => f.replace('.obsidian/snippets/', '').replace('.css', ''));
                
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
                console.log('[Installer] Enabled snippets:', appearance.enabledCssSnippets);
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
        contentEl.createEl('h2', { text: '🏛️ Monolithos Installer' });
        
        // Description
        contentEl.createEl('p', { 
            text: 'Enter your license key to install the complete Monolithos system.',
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
            text: 'Verify & Install',
            cls: 'installer-btn-primary'
        });
        
        const cancelBtn = buttonContainer.createEl('button', {
            text: 'Cancel',
            cls: 'installer-btn-secondary'
        });

        // Install handler
        installBtn.addEventListener('click', async () => {
            if (this.isInstalling) return;
            
            const licenseKey = input.value.trim();
            if (!licenseKey) {
                statusEl.textContent = '❌ Please enter a license key';
                statusEl.className = 'installer-status error';
                return;
            }

            this.isInstalling = true;
            installBtn.disabled = true;
            installBtn.textContent = 'Verifying...';
            statusEl.textContent = '⏳ Verifying license...';
            statusEl.className = 'installer-status';

            // Step 1: Verify license
            const result = await this.plugin.verifyLicense(licenseKey);
            
            if (!result.valid) {
                statusEl.textContent = `❌ ${result.error}`;
                statusEl.className = 'installer-status error';
                installBtn.disabled = false;
                installBtn.textContent = 'Verify & Install';
                this.isInstalling = false;
                return;
            }

            // Save license key
            this.plugin.settings.licenseKey = licenseKey;
            await this.plugin.saveSettings();

            statusEl.textContent = `✅ License valid! Tier: ${result.tier}`;
            installBtn.textContent = 'Installing...';

            // Step 2: Install
            try {
                await this.plugin.installMonolithos((status) => {
                    statusEl.textContent = `⏳ ${status}`;
                });

                statusEl.textContent = '✅ Installation complete!';
                statusEl.className = 'installer-status success';
                installBtn.textContent = 'Done!';
                
                // Show success message
                setTimeout(() => {
                    this.close();
                    new Notice('🏛️ Monolithos installed! Please enable it in Settings → Community Plugins');
                }, 1500);

            } catch (error) {
                statusEl.textContent = `❌ Installation failed: ${error.message}`;
                statusEl.className = 'installer-status error';
                installBtn.disabled = false;
                installBtn.textContent = 'Retry';
                this.isInstalling = false;
            }
        });

        // Cancel handler
        cancelBtn.addEventListener('click', () => {
            if (!this.isInstalling) {
                this.close();
            }
        });

        // Styles
        const style = contentEl.createEl('style');
        style.textContent = `
            .monolithos-installer-modal {
                padding: 20px;
                max-width: 400px;
            }
            .monolithos-installer-modal h2 {
                margin: 0 0 16px 0;
                font-size: 20px;
            }
            .installer-description {
                color: var(--text-muted);
                margin-bottom: 20px;
            }
            .installer-input-container {
                margin-bottom: 16px;
            }
            .installer-input {
                width: 100%;
                padding: 10px 12px;
                font-family: monospace;
                font-size: 14px;
                border: 1px solid var(--background-modifier-border);
                border-radius: 4px;
                background: var(--background-primary);
                color: var(--text-normal);
            }
            .installer-input:focus {
                outline: none;
                border-color: var(--interactive-accent);
            }
            .installer-status {
                min-height: 24px;
                margin-bottom: 16px;
                font-size: 14px;
            }
            .installer-status.error {
                color: var(--text-error);
            }
            .installer-status.success {
                color: var(--text-success);
            }
            .installer-buttons {
                display: flex;
                gap: 10px;
                justify-content: flex-end;
            }
            .installer-btn-primary {
                background: var(--interactive-accent);
                color: var(--text-on-accent);
                border: none;
                padding: 8px 16px;
                border-radius: 4px;
                cursor: pointer;
                font-weight: 500;
            }
            .installer-btn-primary:disabled {
                opacity: 0.6;
                cursor: not-allowed;
            }
            .installer-btn-secondary {
                background: transparent;
                color: var(--text-muted);
                border: 1px solid var(--background-modifier-border);
                padding: 8px 16px;
                border-radius: 4px;
                cursor: pointer;
            }
        `;
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

        containerEl.createEl('h2', { text: 'Monolithos Installer' });

        // Status
        new Setting(containerEl)
            .setName('Installation Status')
            .setDesc(this.plugin.settings.installed 
                ? `✅ Monolithos v${this.plugin.settings.installedVersion} installed` 
                : '❌ Not installed')
            .addButton(button => button
                .setButtonText(this.plugin.settings.installed ? 'Reinstall' : 'Install')
                .onClick(() => {
                    new InstallModal(this.app, this.plugin).open();
                }));

        // License key (hidden)
        if (this.plugin.settings.licenseKey) {
            new Setting(containerEl)
                .setName('License Key')
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
        containerEl.createEl('h3', { text: 'Need Help?' });
        containerEl.createEl('p', { text: 'Visit monolithos.ai for documentation and support.' });
    }
}
