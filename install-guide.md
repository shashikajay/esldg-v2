It appears you are referring to Debian 12 (often mistakenly called "Linux 12"), as the Linux kernel itself is currently on version 6.x.

Based on the repository documentation for ESLDG V2, it is a Node.js-based self-hosted torrent management and media streaming server. It requires Node.js (v18+ or LTS) and uses SQLite3.

Here is the step-by-step guide to installing and configuring it on a Debian 12 (Bookworm) server or any similar modern Linux distribution.

Step 1: Update Your System
First, ensure your package lists and system are fully up to date. Open your terminal and run:

Bash
sudo apt update && sudo apt upgrade -y
Step 2: Install Node.js and Git
ESLDG V2 requires Node.js v18 or higher. Debian 12 conveniently includes Node.js v18 in its default repositories. You will also need git to clone the repository, and build-essential to compile the SQLite3 native bindings.

Bash
sudo apt install nodejs npm git build-essential sqlite3 -y
(Verify your Node version by running node -v to ensure it is v18 or above).

Step 3: Clone the Repository
Clone the project directly from GitHub and navigate into the directory:

Bash
git clone https://github.com/shashikajay/esldg-v2.git
cd esldg-v2

Step 4: Initialize a New Package File
Make sure you are still inside the /root/esldg-v2/ directory, and run this command to generate a fresh package.json file automatically:

Bash
npm init -y
Step 5: Manually Install the Dependencies
Based on the developer's notes (Express, WebTorrent, SQLite3, Archiver, Axios) and the environment variables (SMTP requires a mailer, sessions require session management), run the following command to install the missing libraries:

Bash
npm install express dotenv sqlite3 webtorrent axios archiver nodemailer express-session
Note: Because the developer didn't provide exact version numbers, this will install the latest versions of these packages. In 99% of cases, this works perfectly fine.

Step 6: Run the Server
Once that installation finishes without the ENOENT error, you should be able to start the server normally as planned:

Bash
node server.js
If server.js throws an error about any other missing modules (e.g., Error: Cannot find module 'bcrypt'), you can simply install that specific missing module by running npm install <module-name> and then try starting the server again.

Step 7: Install Dependencies
Once inside the esldg-v2 folder, use Node Package Manager (NPM) to install all required backend and frontend dependencies (such as Express.js, WebTorrent, Archiver, etc.):

Bash
npm install
Step 8: Configure the Environment (.env)
The application relies strictly on environment variables for its configuration, authentication, and state management.

Create a new .env file:

Bash
nano .env
Paste the following default configuration into the file. Be sure to change the APP_PASSWORD, SESSION_SECRET, and SMTP details to your own secure values:

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
Save and exit (in Nano, press Ctrl+O, Enter, then Ctrl+X).  

Step 9: Create the Downloads Directory
The .env file specifies a local ./downloads folder. Create it to avoid runtime errors when the server tries to save media:

Bash
mkdir downloads
Step 10: Start the Server
You can now start the application using Node:

Bash
node server.js
The server will boot up and bind to the port defined in your .env (default is 3000). You can now access your web dashboard by navigating to http://YOUR_SERVER_IP:3000 in your browser.

Optional but Recommended (Running as a Background Service):
If you want the application to stay online after you close your terminal, install pm2 (a production process manager for Node.js):

Bash
sudo npm install -g pm2
pm2 start server.js --name "esldg-v2"
pm2 save
pm2 startup