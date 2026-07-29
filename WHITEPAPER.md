# 🛡️ VAULT (VLT) — Technical Whitepaper
**A Next-Generation Untraceable Cryptographic Currency & Decentralized Privacy Ecosystem**

* **Website**: [https://vaultapp.space](https://vaultapp.space)
* **Web Wallet**: [https://webwallet.vaultapp.space](https://webwallet.vaultapp.space)
* **Block Explorer**: [https://explorer.vaultapp.space](https://explorer.vaultapp.space)
* **Source Code**: [https://github.com/vaultapp-space/VAULT](https://github.com/vaultapp-space/VAULT)
* **GUI Wallets**: [https://github.com/vaultapp-space/vault-wallets](https://github.com/vaultapp-space/vault-wallets)
* **Version**: `1.1.0` — July 2026

---

## Abstract

**VAULT (`VLT`)** is an untraceable, privacy-first cryptocurrency designed to restore financial autonomy and confidential transactions in a modern digital economy. Engineered upon an advanced CryptoNote core enhanced with Ring Confidential Transactions (RingCT), dual-key Stealth Addresses, and Ring Signatures, VAULT obfuscates transaction amounts, sender identities, and receiver destinations at the protocol level.

Alongside its native C++ daemon and cross-platform Desktop Core GUI Wallet (macOS & Windows), VAULT offers a zero-trust browser-based **Web Application (`vaultapp.space`)** enabling instant, light-client interaction without downloading the full blockchain ledger.

---

## 1. Introduction & Background

Most public blockchain architectures (such as Bitcoin and Ethereum) operate on fully transparent, pseudonymous ledgers. Every account balance, output history, and transaction amount is publicly queryable and permanently stored on-chain. Through chain-analysis algorithms, cluster heuristics, and KYC exchange gateways, user privacy is routinely compromised.

VAULT addresses these fundamental vulnerabilities by enforcing **mandatory, protocol-level privacy**. In VAULT, privacy is not an opt-in feature; every transaction on the network is mathematically anonymized by default.

---

## 2. Core Cryptographic Architecture

VAULT combines three primary cryptographic primitives to achieve multi-dimensional transaction anonymity:

```
                  +-------------------------------------------------+
                  |          VAULT TRANSACTION ANONYMITY            |
                  +-----------------------+-------------------------+
                                          |
        +---------------------------------+---------------------------------+
        |                                 |                                 |
        v                                 v                                 v
+---------------+                 +---------------+                 +---------------+
| Ring Signatures|                | RingCT        |                 | Stealth Addr. |
| Sender Hidden |                | Amount Hidden |                 | Receiver Hidden|
+---------------+                 +---------------+                 +---------------+
```

### 2.1 Ring Signatures (Sender Anonymity)
Sender identity is protected via **Spontaneous Anonymous Group (SAG) Ring Signatures**. When a transaction output is spent, the sender's real spending key is combined with multiple decoy public keys sampled from historical blockchain outputs. An outside observer can only prove that *one* member of the ring created the signature, but cannot determine which one was the actual sender.

* **Key Images**: To prevent double-spending without revealing the spent output, each ring signature outputs a unique cryptographic **Key Image** ($I = x H_p(P)$). The network checks that no Key Image is submitted twice.

### 2.2 Ring Confidential Transactions (RingCT)
To conceal transfer amounts, VAULT implements **RingCT using Pedersen Commitments**:

$$C = a G + x H$$

Where:
- $a$ is the secret transaction amount (atomic units).
- $x$ is a secret blinding factor (mask).
- $G$ and $H$ are fixed public generator points on the elliptic curve.

The network verifies that the sum of input commitments equals the sum of output commitments (plus network fees) without ever learning the raw numerical values ($a$).

### 2.3 Dual-Key Stealth Addresses (Receiver Anonymity)
Receivers publish a standard public address beginning with the `d5` prefix. Each VAULT address consists of two 256-bit public keys:
1. **Public Spend Key ($A$)**
2. **Public View Key ($B$)**

For every transaction, the sender generates a one-time random scalar $r$ and derives an ephemeral public stealth address $P$:

$$P = H_s(r A) G + B$$

The receiver scans the blockchain using their Private View Key ($b$). Only the intended recipient can derive the matching Private Spend Key ($p = H_s(r A) + b$) to spend the funds, preventing third parties from linking payments to the recipient's public address.

---

## 3. Network Parameters & Emission Schedule

| Parameter | Specification / Value |
| :--- | :--- |
| **Ticker Symbol** | `VLT` |
| **Address Prefix** | `d5` (Standard public address length: 96 hex-encoded characters) |
| **Target Block Time** | `60 seconds` |
| **Initial Block Reward** | `~17.578350 VLT` per block (`17,578,350,278,193` atomic units) |
| **Atomic Unit Divisor** | $10^{12}$ (1 VLT = 1,000,000,000,000 atomic units) |
| **Block Confirmation Lock** | `60 blocks` (~60 minutes for block maturity) |
| **Default P2P Port** | `29080` |
| **Daemon RPC Port** | `29081` |
| **Wallet RPC Port** | `29083` |
| **Block Explorer Web Port**| `3000` |
| **Consensus Algorithm** | CryptoNote / RandomX Proof-of-Work (PoW) |

---

## 4. VAULT Core Desktop GUI Wallet (macOS & Windows v1.1.0)

The **VAULT Core GUI Wallet** is a cross-platform desktop application built with Electron, Node.js, and an embedded native C++ daemon integration.

```
+-----------------------------------------------------------------------+
|                       VAULT DESKTOP GUI WALLET                        |
|                                                                       |
|   +-----------------------+               +-----------------------+   |
|   | Pure Pitch Black UI   |               | Live Node Syncer      |   |
|   | Hex #000000 Theme     |               | Local LMDB + Remote   |   |
|   +-----------------------+               +-----------------------+   |
|   | Transaction Manager   |               | Security & Backup     |   |
|   | Real-time CSV Export  |               | 25-Word Mnemonic      |   |
|   +-----------------------+               +-----------------------+   |
+-----------------------------------------------------------------------+
```

### Key Desktop Features
1. **Pure Pitch Black Aesthetic (`#000000`)**: Designed with sleek glassmorphism panels, vibrant cyan/magenta highlights, and dark-mode ergonomics.
2. **Native C++ Daemon Bundle**: Includes pre-built `vaultd` and `vault-wallet-rpc` binaries, allowing single-click local node sync (`~/Library/Application Support/vault-gui-wallet/vault-blockchain/lmdb/data.mdb`).
3. **Dual Sync Engine**: Automatically switches between local full-node synchronization and instant remote SSL bootstrap (`https://node.vaultapp.space`).
4. **Send & Receive Features**:
   - **Send Max Calculator**: Automatically calculates maximum spendable balance while reserving network fees (~0.000120 VLT).
   - **2D QR Code Generator**: Generates mobile-scannable QR codes for instant payment receipts.
   - **Disposable Subaddresses**: Create secondary stealth subaddresses for untraceable contact sharing.
5. **Transaction Manager**: Real-time transfers table (All / Received / Sent / Pending) with one-click **CSV Exporter** to Desktop.
6. **25-Word Mnemonic Recovery**: Full 25-word mnemonic seed generation and restoration.

---

## 5. VAULT Web Application & Ecosystem (`vaultapp.space`)

The **VAULT Web Application** hosted at [https://vaultapp.space](https://vaultapp.space) serves as the primary decentralized portal for the VAULT ecosystem. It combines privacy-first financial operations with end-to-end encrypted communication primitives to deliver a unified, zero-trust web experience.

```
+-----------------------------------------------------------------------+
|                    VAULTAPP.SPACE WEB ECOSYSTEM                       |
|                                                                       |
|   +------------------------+             +------------------------+   |
|   | Web Wallet Application |             | Encrypted Messaging    |   |
|   | webwallet.vaultapp.space             | Double-Ratchet E2EE    |   |
|   +------------------------+             +------------------------+   |
|   | Remote SSL Daemon Node |             | Block Explorer         |   |
|   | node.vaultapp.space    |             | explorer.vaultapp.space|   |
|   +------------------------+             +------------------------+   |
+-----------------------------------------------------------------------+
```

### 5.1 Zero-Trust Web Wallet (`https://webwallet.vaultapp.space`)
- **Client-Side Cryptography**: Cryptographic key derivation and seed generation occur 100% locally within browser memory using Web Crypto APIs. No plain-text private keys, seed phrases, or spending credentials ever leave the client device.
- **Light-Client Remote Node Bridge**: Connects seamlessly over encrypted HTTPS JSON-RPC (`https://node.vaultapp.space/json_rpc`) hosted on high-availability Google Cloud infrastructure, allowing instant balance retrieval and transaction broadcast without downloading the full blockchain database.
- **25-Word Mnemonic Management**: Complete generation, validation, and deterministic wallet restoration supporting standard 25-word mnemonic seed phrases.
- **Responsive QR Code Generator & Scanner**: Features integrated responsive QR rendering powered by QRious for effortless mobile payments and address sharing.
- **Subaddress & Contact Management**: Supports creating secondary stealth subaddresses and saving recipient contact profiles directly in local encrypted browser storage (`localStorage`).

### 5.2 End-to-End Encrypted Anonymous Messaging
- **Double-Ratchet Signal Protocol**: Implements state-of-the-art Double-Ratchet E2EE algorithms providing forward secrecy and post-compromise security for peer-to-peer messaging.
- **Zero Personally Identifiable Information (Zero PII)**: Requires zero phone numbers, email addresses, or real-world identity verification. User identities are tied strictly to cryptographic key pairs.
- **Zero Persistence & 24-Hour Auto-Delete**: All message payloads and ephemeral session metadata automatically expire and purge after 24 hours, ensuring zero permanent digital footprint on server relays or client storage.
- **Confidential Voice & Video Calls**: Provides encrypted peer-to-peer audio and video communication routes layered with WebRTC and obfuscated transport nodes.
- **zk-SNARK Payment Rails**: Integrates client-side zero-knowledge proof payment rails enabling private settlement directly within communication sessions.

### 5.3 Block Explorer (`https://explorer.vaultapp.space`)
- **Privacy-Preserving Inspection**: Real-time visualization of network metrics (block height, cumulative difficulty, transaction counts, and block header hashes) without exposing ring signature members or confidential transfer values.
- **RESTful API Endpoint**: Exposes high-throughput JSON API endpoints for developer integration, transaction verification, and network monitoring.

---

## 6. Security & Threat Model

VAULT is engineered to mitigate standard vector attacks in decentralized networks:
- **Sybil Resistance**: Proof-of-Work prevents malicious nodes from overwhelming the peer list.
- **Double-Spending Mitigation**: Key Images strictly enforce single-spend semantics per output.
- **Chain Analysis Defense**: RingCT + Ring Signatures defeat transaction graph clustering and balance tracking.
- **Sanitized Desktop & RPC Communications**: RPC bindings restrict standard interface ports (`29081`, `29083`) with local loopback controls (`127.0.0.1`) and encrypted SSL tunneling for remote nodes.

---

## 7. Official Resources & Community

- **Official Website**: [https://vaultapp.space](https://vaultapp.space)
- **Web Wallet**: [https://webwallet.vaultapp.space](https://webwallet.vaultapp.space)
- **Block Explorer**: [https://explorer.vaultapp.space](https://explorer.vaultapp.space)
- **𝕏 / Twitter**: [@VaultMessenger](https://x.com/VaultMessenger)
- **Telegram**: [@Vault_Space](https://t.me/Vault_Space)
- **Discord**: [Join Community](https://discord.gg/VZyvT)
- **Source Code**: [https://github.com/vaultapp-space/VAULT](https://github.com/vaultapp-space/VAULT)

---
*Copyright © 2026 VAULT Core Developers & Ecosystem. Released under open-source MIT License.*
