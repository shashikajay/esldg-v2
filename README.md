# ESLDG V2 - Production Seedbox & Cinematic Cloud Platform

ESLDG V2 is an enterprise-grade, high-performance, self-hosted torrent management and media streaming server designed for low-overhead Unix deployments. It integrates full state-persistence with a highly responsive, modern glassmorphic web dashboard.

## Core Features
- **Low-Overhead High-Water Mark Streaming**: Memory-optimized ZIP archiver compression logic ensures files and directories can be compiled and downloaded recursively without system RAM exhaustion or stream termination.
- **Chrome Secure-Context Bypass**: Frontend utilizes atomic JavaScript `Blob` serialization array routing to circumvent browser security filters that block unencrypted HTTP `.zip` binary payloads.
- **Cinematic Media Engine**: Seamless Plyr.io integration with deep subtitle stream mapping supporting internal/external subtitle indexing, dynamically updated language tracks, custom text styling, and active `.vtt`/`.srt` dynamic file uploads.
- **Multi-Tenant State Security**: Built-in state engine tracking file ownership, explicit sub-directory chroot boundaries (`path.resolve` validation checking), robust OTP authorization sequences, and administrative system auditing metrics.

## Tech Stack
- **Runtime Environment**: Node.js (v18+ or LTS)
- **Application Engine**: Express.js
- **Persistence Layer**: SQLite3 Engine via native bindings
- **Network Pipeline**: WebTorrent, Axios Stream Controllers
- **Compression Compiler**: Archiver Stream Processor

## Configuration Setup
Environment states are governed completely by a root-level `.env` profile.

```env
PORT=3000
APP_USERNAME=admin
APP_PASSWORD=secure_master_password
APP_EMAIL=admin@your-node-instance.internal
SESSION_SECRET=high_entropy_cryptographic_random_string_82490
SMTP_HOST=smtp.your-provider.com
SMTP_PORT=587
SMTP_USER=system_notifier@your-provider.com
SMTP_PASS=smtp_account_secret_token
DOWNLOAD_DIR=./downloads