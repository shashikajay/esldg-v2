# ESLDG V2 - Self-Hosted Media & Torrent Server

ESLDG V2 is an enterprise-grade, high-performance seedbox and media streaming platform. Built for low-overhead deployments, it features secure multi-tenant user access, direct torrent management, and a highly responsive, modern glassmorphic web interface.

## Core Features
- **Memory-Optimized Folder Downloads:** Utilizes an efficient ZIP archiver pipeline that streams data directly to the disk, allowing for massive recursive folder downloads (e.g., full seasons or large datasets) without exhausting system RAM or crashing the browser.
- **Cinematic Media Engine:** Seamless `Plyr.io` integration for direct in-browser streaming. Features dynamic subtitle mapping, allowing users to select internal `.vtt`/`.srt` tracks, upload custom subtitles on the fly, and customize text appearance.
- **Multi-Tenant State Security:** Built-in SQLite state engine tracking file ownership, strictly enforced directory boundaries to prevent path traversal, secure OTP email verification for new registrations, and a dedicated admin console for user and system auditing.
- **Resilient WebTorrent Pipeline:** Integrated WebTorrent backend that gracefully handles magnet URIs and `.torrent` files, automatically resumes paused transfers on server boot, and safely manages database connections during system shutdowns.

## Tech Stack
- **Runtime Environment:** Node.js (v18+ or LTS)
- **Application Engine:** Express.js
- **Persistence Layer:** SQLite3 Engine via native bindings
- **Network Pipeline:** WebTorrent, Axios Stream Controllers
- **Compression Compiler:** Archiver Stream Processor

## Installation & Setup

1. **Clone the repository:**
   ```bash
   git clone [https://github.com/shashikajay/esldg-v2.git](https://github.com/shashikajay/esldg-v2.git)
   cd esldg-v2

   Install dependencies:

Bash
npm install
Configure the Environment:
Create a .env file in the root directory based on the configuration below:

Code snippet
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
Start the Server:

Bash
node server.js
Administrative Access
If you ever lose access to the master administrator account, you can forcibly reset the password via the terminal:

Bash
node reset-admin.js new_secure_password