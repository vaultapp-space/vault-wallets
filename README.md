# 🛡️ VAULT (VLT) — Desktop Core GUI Wallet (macOS & Windows)

[![Website](https://img.shields.io/badge/Website-vaultapp.space-00f2fe?style=for-the-badge&logo=googlechrome&logoColor=white)](https://vaultapp.space)
[![X / Twitter](https://img.shields.io/badge/X%2F%20Twitter-@VaultMessenger-1DA1F2?style=for-the-badge&logo=x&logoColor=white)](https://x.com/VaultMessenger)
[![Telegram](https://img.shields.io/badge/Telegram-@Vault__Space-26A5E4?style=for-the-badge&logo=telegram&logoColor=white)](https://t.me/Vault_Space)
[![Discord](https://img.shields.io/badge/Discord-Join_Community-5865F2?style=for-the-badge&logo=discord&logoColor=white)](https://discord.gg/VZyvT)
[![Blockchain Explorer](https://img.shields.io/badge/Explorer-explorer.vaultapp.space-7f00ff?style=for-the-badge&logo=express&logoColor=white)](https://explorer.vaultapp.space)
[![macOS Core Wallet](https://img.shields.io/badge/macOS_Core_Wallet-v1.1.0-ff007f?style=for-the-badge&logo=apple&logoColor=white)](https://github.com/vaultapp-space/vault-wallets/releases/download/v1.1.0/VAULT-Wallet-1.1.0-arm64.dmg)
[![Windows Core Wallet](https://img.shields.io/badge/Windows_Core_Wallet-v1.1.0-10b981?style=for-the-badge&logo=windows&logoColor=white)](https://github.com/vaultapp-space/vault-wallets/releases/download/v1.1.0/VAULT-Wallet.1.1.0.exe)
[![Daemon Source](https://img.shields.io/badge/Daemon_Source-VAULT-ff6b6b?style=for-the-badge&logo=github&logoColor=white)](https://github.com/vaultapp-space/VAULT)

Welcome to the official repository for the **VAULT (VLT) Core GUI Wallet** — available as native pre-built core wallet installers for **macOS (Apple Silicon)** and **Windows (64-bit)**.

VAULT is an untraceable, privacy-centric cryptocurrency built on CryptoNote and Ring Confidential Transactions (RingCT).

---

## 🌐 Official Channels & Social Links

- **🌐 Website**: [https://vaultapp.space](https://vaultapp.space)
- **𝕏 / Twitter**: [@VaultMessenger](https://x.com/VaultMessenger)
- **💬 Telegram Community**: [@Vault_Space](https://t.me/Vault_Space)
- **👾 Discord Server**: [Join Discord Community](https://discord.gg/VZyvT)
- **🔍 Block Explorer**: [https://explorer.vaultapp.space](https://explorer.vaultapp.space)
- **⚙️ C++ Daemon Repository**: [https://github.com/vaultapp-space/VAULT](https://github.com/vaultapp-space/VAULT)

---

## 🚀 Downloads (Latest Release v1.1.0)

### 🍎 macOS Releases
| Download Package | Installer File | Notes |
| :--- | :--- | :--- |
| **[Download .DMG Installer](https://github.com/vaultapp-space/vault-wallets/releases/download/v1.1.0/VAULT-Wallet-1.1.0-arm64.dmg)** | `VAULT-Wallet-1.1.0-arm64.dmg` | Native Apple Silicon M1/M2/M3 Disk Image |
| **[Download .ZIP Archive](https://github.com/vaultapp-space/vault-wallets/releases/download/v1.1.0/VAULT-Wallet-1.1.0-arm64-mac.zip)** | `VAULT-Wallet-1.1.0-arm64-mac.zip` | Standalone Mac Release Archive |

### 🪟 Windows Releases
| Download Package | Installer File | Notes |
| :--- | :--- | :--- |
| **[Download Setup Installer](https://github.com/vaultapp-space/vault-wallets/releases/download/v1.1.0/VAULT-Wallet.Setup.1.1.0.exe)** | `VAULT-Wallet Setup 1.1.0.exe` | Standard Windows Installation Wizard |
| **[Download Portable .EXE](https://github.com/vaultapp-space/vault-wallets/releases/download/v1.1.0/VAULT-Wallet.1.1.0.exe)** | `VAULT-Wallet 1.1.0.exe` | Standalone Executable (Runs without setup) |
| **[Download .ZIP Archive](https://github.com/vaultapp-space/vault-wallets/releases/download/v1.1.0/VAULT-Wallet-1.1.0-win.zip)** | `VAULT-Wallet-1.1.0-win.zip` | Windows Zip Release Bundle |

---

## 🌟 Desktop Core GUI Wallet Features

The VAULT GUI Wallet features a **Pure Pitch Black Theme (`#000000`)** designed to match [vaultapp.space](https://vaultapp.space).

### Key Features
- **⚡ Native C++ Daemon Integration**: Includes compiled `vaultd` binary for native local node execution.
- **📊 Interactive Dashboard**: Real-time balance breakdown (Spendable vs. Confirming/Locked), network height, difficulty, and live blockchain sync progress bar.
- **🔄 Live Background Blockchain Syncer**: Automatically fetches and imports blocks directly into your local database (`~/Library/Application Support/vault-gui-wallet/vault-blockchain/lmdb/data.mdb`).
- **💸 Send & Receive VLT**:
  - **Send Max**: Auto-calculates fees and populates 100% of spendable funds.
  - **Live Fee Preview**: Displays estimated network fee (`~0.000120 VLT`) and confirmation time.
  - **Disposable Subaddresses**: Create untraceable subaddresses for enhanced transaction privacy.
  - **QR Code Generator**: Generates 2D QR codes for instant mobile receiving.
- **📖 Address Book & Contacts**: Save frequently used recipient addresses with custom labels for one-click transfers.
- **📜 Transaction History & CSV Export**: Real-time transfer history with filter controls (All/Received/Sent/Pending) and one-click **"Export CSV"** to Desktop.
- **🔒 Security & Backup Tool**: Retrieve 25-word Electrum recovery seed phrases and export encrypted wallet backups directly to your Desktop.
- **🔔 Native Desktop Notifications**: macOS and Windows system notifications for incoming payments.

---

## 💻 Installation & Quick Start

### 🍎 1. macOS Installation (.DMG)
1. Download **[VAULT-Wallet-1.1.0-arm64.dmg](https://github.com/vaultapp-space/vault-wallets/releases/download/v1.1.0/VAULT-Wallet-1.1.0-arm64.dmg)**.
2. Double-click the `.dmg` file to open the installer disk image.
3. Drag **VAULT Wallet** into your **Applications** folder.
4. Open **VAULT Wallet** from your Launchpad or Applications folder.

---

### 🪟 2. Windows Installation (.EXE)
1. Download **[VAULT-Wallet Setup 1.1.0.exe](https://github.com/vaultapp-space/vault-wallets/releases/download/v1.1.0/VAULT-Wallet.Setup.1.1.0.exe)** or **[VAULT-Wallet 1.1.0.exe](https://github.com/vaultapp-space/vault-wallets/releases/download/v1.1.0/VAULT-Wallet.1.1.0.exe)**.
2. Double-click to launch and run the wallet.

---

## ⚙️ Network Specifications

| Parameter | Value |
| :--- | :--- |
| **Ticker** | `VLT` |
| **Address Prefix** | `d5` |
| **Target Block Time** | `60 seconds` |
| **Daemon RPC Port** | `29081` |
| **Wallet RPC Port** | `29083` |
| **Explorer Web Port** | `3000` |
| **Daemon Source** | [github.com/vaultapp-space/VAULT](https://github.com/vaultapp-space/VAULT) |
| **Website** | [https://vaultapp.space](https://vaultapp.space) |

---

## 📄 License & Credits
Powered by **[vaultapp.space](https://vaultapp.space)** &bull; Privacy First &bull; RingCT CryptoNote Engine
