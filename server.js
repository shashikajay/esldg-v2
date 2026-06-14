import express from 'express';
import session from 'express-session';
import WebTorrent from 'webtorrent';
import axios from 'axios';
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import multer from 'multer';
import sqlite3 from 'sqlite3';
import bcrypt from 'bcrypt';
import nodemailer from 'nodemailer';
import * as archiver from 'archiver';
import { fileURLToPath } from 'url';
import { exec } from 'child_process';

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const client = new WebTorrent();

const PORT = process.env.PORT || 3000;
const DOWNLOAD_DIR = path.resolve(__dirname, process.env.DOWNLOAD_DIR || './downloads');
const UPLOAD_DIR = path.resolve(__dirname, './uploads');

if (!fs.existsSync(DOWNLOAD_DIR)) fs.mkdirSync(DOWNLOAD_DIR, { recursive: true });
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const upload = multer({ dest: UPLOAD_DIR });

// --- DATABASE SETUP ---
const db = new sqlite3.Database('./database.sqlite');
db.serialize(() => {
    db.run(`CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY AUTOINCREMENT, username TEXT UNIQUE, email TEXT UNIQUE, password TEXT, role TEXT DEFAULT 'user', is_verified INTEGER DEFAULT 0, otp TEXT)`);
    db.run(`CREATE TABLE IF NOT EXISTS logs (id INTEGER PRIMARY KEY AUTOINCREMENT, username TEXT, action TEXT, timestamp DATETIME DEFAULT CURRENT_TIMESTAMP)`);
    db.run(`CREATE TABLE IF NOT EXISTS torrents (id INTEGER PRIMARY KEY AUTOINCREMENT, username TEXT, magnet TEXT, infoHash TEXT, status TEXT DEFAULT 'active')`);

    db.get(`SELECT * FROM users WHERE username = ?`, [process.env.APP_USERNAME], async (err, row) => {
        if (!row) {
            const hash = await bcrypt.hash(process.env.APP_PASSWORD || 'admin123', 10);
            db.run(`INSERT INTO users (username, email, password, role, is_verified) VALUES (?, ?, ?, 'admin', 1)`, 
                [process.env.APP_USERNAME || 'admin', process.env.APP_EMAIL || 'admin@admin.com']);
        }
    });

    db.all(`SELECT * FROM torrents WHERE status IN ('active', 'paused')`, [], (err, rows) => {
        if (rows) {
            rows.forEach(t => {
                const userDir = path.join(DOWNLOAD_DIR, t.username);
                if (!fs.existsSync(userDir)) fs.mkdirSync(userDir, { recursive: true });
                client.add(t.magnet, { path: userDir }, (torrent) => {
                    if(t.status === 'paused') torrent.pause();
                });
            });
        }
    });
});

const logAction = (username, action) => db.run(`INSERT INTO logs (username, action) VALUES (?, ?)`, [username, action]);
const transporter = nodemailer.createTransport({ host: process.env.SMTP_HOST, port: process.env.SMTP_PORT, secure: false, auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } });

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(session({ secret: process.env.SESSION_SECRET || 'esldg-secret', resave: false, saveUninitialized: false, cookie: { maxAge: 24 * 60 * 60 * 1000 } }));

const requireAuth = (req, res, next) => req.session.loggedIn ? next() : res.status(401).json({ error: 'Unauthorized' });
const requireAdmin = (req, res, next) => (req.session.loggedIn && req.session.role === 'admin') ? next() : res.status(403).json({ error: 'Forbidden' });
const getUserDir = (username) => { const dir = path.join(DOWNLOAD_DIR, username); if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true }); return dir; };

app.use('/downloads', express.static(DOWNLOAD_DIR));

// --- AUTHENTICATION ---
app.post('/api/register', async (req, res) => {
    const { username, email, password } = req.body;
    if (!username || !email || !password) return res.status(400).json({ error: 'All fields required' });
    const hash = await bcrypt.hash(password, 10);
    const otp = Math.floor(100000 + Math.random() * 900000).toString();

    db.run(`INSERT INTO users (username, email, password, otp) VALUES (?, ?, ?, ?)`, [username, email, hash, otp], async function(err) {
        if (err) return res.status(400).json({ error: 'Username or Email exists' });
        try { await transporter.sendMail({ from: process.env.SMTP_USER, to: email, subject: 'ESLDG V2 OTP', text: `Verification code: ${otp}` }); } 
        catch (mailErr) { console.log(`[MAIL ERROR] OTP for ${email}: ${otp}`); }
        logAction(username, 'Account created');
        res.json({ success: true, message: 'OTP sent' });
    });
});

app.post('/api/verify-otp', (req, res) => {
    const { email, otp } = req.body;
    db.get(`SELECT * FROM users WHERE email = ? AND otp = ?`, [email, otp], (err, user) => {
        if (!user) return res.status(400).json({ error: 'Invalid OTP' });
        db.run(`UPDATE users SET is_verified = 1, otp = NULL WHERE id = ?`, [user.id]);
        logAction(user.username, 'Account verified');
        res.json({ success: true, message: 'Account verified!' });
    });
});

app.post('/api/login', (req, res) => {
    const { username, password } = req.body;
    db.get(`SELECT * FROM users WHERE username = ?`, [username], async (err, user) => {
        if (!user || !(await bcrypt.compare(password, user.password))) return res.status(401).json({ error: 'Invalid credentials' });
        if (user.is_verified === 0) return res.status(403).json({ error: 'Verify email', requiresOTP: true, email: user.email });
        req.session.loggedIn = true; req.session.username = user.username; req.session.role = user.role;
        logAction(user.username, 'Logged in');
        res.json({ success: true, role: user.role, username: user.username });
    });
});
app.get('/api/me', requireAuth, (req, res) => res.json({ username: req.session.username, role: req.session.role }));
app.post('/api/logout', (req, res) => { req.session.destroy(); res.json({ success: true }); });

// --- ADMIN ---
app.get('/api/admin/users', requireAdmin, (req, res) => db.all(`SELECT id, username, email, role, is_verified FROM users`, [], (err, rows) => res.json(rows)));
app.get('/api/admin/logs', requireAdmin, (req, res) => db.all(`SELECT * FROM logs ORDER BY timestamp DESC LIMIT 100`, [], (err, rows) => res.json(rows)));
app.post('/api/admin/user/:id/delete', requireAdmin, (req, res) => {
    db.get(`SELECT username FROM users WHERE id = ?`, [req.params.id], (err, user) => {
        if (user && user.username !== process.env.APP_USERNAME) {
            db.run(`DELETE FROM users WHERE id = ?`, [req.params.id]);
            const userDir = path.join(DOWNLOAD_DIR, user.username);
            if (fs.existsSync(userDir)) fs.rmSync(userDir, { recursive: true, force: true });
            logAction(req.session.username, `Deleted user: ${user.username}`);
            res.json({ success: true });
        } else res.status(400).json({ error: 'Cannot delete master admin' });
    });
});
app.post('/api/admin/user/:id/password', requireAdmin, async (req, res) => {
    const newHash = await bcrypt.hash(req.body.newPassword, 10);
    db.run(`UPDATE users SET password = ? WHERE id = ?`, [newHash, req.params.id]);
    res.json({ success: true });
});

// --- TORRENTS ---
app.post('/api/add', requireAuth, (req, res) => {
    const { link } = req.body;
    const userDir = getUserDir(req.session.username);
    logAction(req.session.username, `Added link: ${link.substring(0, 30)}...`);

    if (link.startsWith('magnet:')) {
        client.add(link, { path: userDir }, (torrent) => {
            db.run(`INSERT INTO torrents (username, magnet, infoHash, status) VALUES (?, ?, ?, 'active')`, [req.session.username, link, torrent.infoHash]);
        });
        res.json({ success: true, message: 'Torrent added' });
    } else if (link.startsWith('http')) {
        const fileName = path.basename(new URL(link).pathname) || `download_${Date.now()}`;
        axios({ url: link, method: 'GET', responseType: 'stream' }).then(response => response.data.pipe(fs.createWriteStream(path.join(userDir, fileName))));
        res.json({ success: true, message: 'HTTP stream started' });
    } else res.status(400).json({ error: 'Unsupported link' });
});

app.post('/api/upload', requireAuth, upload.single('torrent'), (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'No file' });
    const userDir = getUserDir(req.session.username);
    client.add(req.file.path, { path: userDir }, (torrent) => {
        db.run(`INSERT INTO torrents (username, magnet, infoHash, status) VALUES (?, ?, ?, 'active')`, [req.session.username, torrent.magnetURI, torrent.infoHash]);
        fs.unlink(req.file.path, () => {});
    });
    res.json({ success: true, message: 'Torrent started' });
});

app.post('/api/torrent/:hash/pause', requireAuth, (req, res) => {
    const torrent = client.get(req.params.hash);
    if (torrent) { torrent.pause(); db.run(`UPDATE torrents SET status = 'paused' WHERE infoHash = ?`, [req.params.hash]); }
    res.json({ success: true });
});

app.post('/api/torrent/:hash/resume', requireAuth, (req, res) => {
    const torrent = client.get(req.params.hash);
    if (torrent) { torrent.resume(); db.run(`UPDATE torrents SET status = 'active' WHERE infoHash = ?`, [req.params.hash]); }
    res.json({ success: true });
});

app.post('/api/torrent/:hash/cancel', requireAuth, (req, res) => {
    const torrent = client.get(req.params.hash);
    const deleteData = req.body.deleteData;
    if (torrent) {
        const torrentPath = path.join(getUserDir(req.session.username), torrent.name);
        torrent.destroy(() => { if (deleteData && fs.existsSync(torrentPath)) fs.rmSync(torrentPath, { recursive: true, force: true }); });
        db.run(`DELETE FROM torrents WHERE infoHash = ?`, [req.params.hash]);
    }
    res.json({ success: true });
});

app.get('/api/status', requireAuth, (req, res) => {
    const userDir = getUserDir(req.session.username);
    const torrents = client.torrents.filter(t => t.path === userDir).map(t => ({
        infoHash: t.infoHash, name: t.name, progress: (t.progress * 100).toFixed(1),
        downloadSpeed: t.downloadSpeed, uploadSpeed: t.uploadSpeed, downloaded: t.downloaded, length: t.length,
        timeRemaining: t.timeRemaining, numPeers: t.numPeers, paused: t.paused, done: t.done
    }));
    res.json({ torrents });
});

// --- FILES & ZIP ENGINE ---
app.get('/api/files', requireAuth, (req, res) => {
    const userDir = getUserDir(req.session.username);
    const targetDir = path.resolve(userDir, req.query.path || '');
    if (!targetDir.startsWith(userDir) || !fs.existsSync(targetDir)) return res.json({ files: [] });
    const files = fs.readdirSync(targetDir).map(file => {
        const stats = fs.statSync(path.join(targetDir, file));
        return { name: file, path: path.join(req.query.path || '', file).split(path.sep).join('/'), size: stats.size, isDir: stats.isDirectory() };
    });
    files.sort((a, b) => a.isDir === b.isDir ? a.name.localeCompare(b.name) : (a.isDir ? -1 : 1));
    res.json({ files });
});

app.get('/api/download-zip', requireAuth, (req, res) => {
    const targetDir = path.resolve(getUserDir(req.session.username), req.query.path || '');
    if (!targetDir.startsWith(getUserDir(req.session.username)) || !fs.existsSync(targetDir)) {
        return res.status(403).send('Denied');
    }
    try {
        const folderName = path.basename(targetDir) || 'ESLDG_Archive';
        res.setHeader('Content-Type', 'application/octet-stream');
        res.setHeader('Content-Disposition', `attachment; filename="${folderName}.zip"`);
        const createArchive = archiver.default || archiver;
        const archive = createArchive('zip', { zlib: { level: 5 } });
        archive.on('error', (err) => {
            console.error('[ZIP Error]', err);
            if (!res.headersSent) res.status(500).end();
        });
        archive.pipe(res);
        archive.directory(targetDir, false);
        archive.finalize();
    } catch (err) {
        console.error('[ZIP Fatal Error]', err);
        if (!res.headersSent) res.status(500).send('Server Error generating ZIP');
    }
});

app.post('/api/delete', requireAuth, (req, res) => {
    const fullPath = path.resolve(getUserDir(req.session.username), req.body.path);
    if (fullPath.startsWith(getUserDir(req.session.username)) && fs.existsSync(fullPath)) fs.rmSync(fullPath, { recursive: true, force: true });
    res.json({ success: true });
});

app.get('/api/storage', requireAuth, (req, res) => {
    exec(`df -B1 ${DOWNLOAD_DIR}`, (error, stdout) => {
        const fallbackMax = 5 * 1024 * 1024 * 1024;
        let maxBytes = fallbackMax;
        if (!error && stdout.split('\n').length > 1) maxBytes = parseInt(stdout.trim().split('\n')[1].replace(/\s+/g, ' ').split(' ')[1], 10);
        let usedBytes = 0;
        const getDirSize = (dirPath) => {
            if (!fs.existsSync(dirPath)) return 0;
            let size = 0;
            fs.readdirSync(dirPath).forEach(item => {
                const itemPath = path.join(dirPath, item);
                const stats = fs.statSync(itemPath);
                size += stats.isDirectory() ? getDirSize(itemPath) : stats.size;
            });
            return size;
        };
        usedBytes = getDirSize(DOWNLOAD_DIR);
        res.json({ used: usedBytes, max: maxBytes });
    });
});

// --- SUBTITLES & STREAMING ---
app.get('/api/subtitles', requireAuth, (req, res) => {
    const userDir = getUserDir(req.session.username);
    const fullVideoPath = path.resolve(userDir, req.query.path);
    if (!fullVideoPath.startsWith(userDir) || !fs.existsSync(path.dirname(fullVideoPath))) return res.json({ subtitles: [] });
    const dir = path.dirname(fullVideoPath);
    const baseName = path.parse(fullVideoPath).name;
    const subtitles = fs.readdirSync(dir).filter(f => f.endsWith('.vtt') || f.endsWith('.srt')).map(f => ({
        name: f, src: `/downloads/${req.session.username}/${encodeURIComponent(path.join(path.dirname(req.query.path), f)).replace(/%2F/g, '/')}`, isMatch: f.includes(baseName)
    }));
    res.json({ subtitles });
});

app.post('/api/upload-subtitle', requireAuth, upload.single('subtitle'), (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'No file' });
    const userDir = getUserDir(req.session.username);
    const destDir = path.resolve(userDir, req.body.path || '');
    if (destDir.startsWith(userDir)) fs.renameSync(req.file.path, path.join(destDir, req.file.originalname));
    res.json({ success: true });
});

app.get('/stream/*', requireAuth, (req, res) => {
    const userDir = getUserDir(req.session.username);
    const filePath = path.resolve(userDir, req.params[0]);
    if (!filePath.startsWith(userDir) || !fs.existsSync(filePath)) return res.status(404).send('Not found');
    const stat = fs.statSync(filePath);
    const ext = path.extname(filePath).toLowerCase();
    let mimeType = 'video/mp4'; if (ext === '.mkv') mimeType = 'video/x-matroska'; if (ext === '.webm') mimeType = 'video/webm';
    if (req.headers.range) {
        const parts = req.headers.range.replace(/bytes=/, "").split("-");
        const start = parseInt(parts[0], 10);
        const end = parts[1] ? parseInt(parts[1], 10) : stat.size - 1;
        res.writeHead(206, { 'Content-Range': `bytes ${start}-${end}/${stat.size}`, 'Accept-Ranges': 'bytes', 'Content-Length': (end - start) + 1, 'Content-Type': mimeType });
        fs.createReadStream(filePath, { start, end }).pipe(res);
    } else {
        res.writeHead(200, { 'Content-Length': stat.size, 'Content-Type': mimeType });
        fs.createReadStream(filePath).pipe(res);
    }
});

app.use(express.static(path.join(__dirname, 'public')));
app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));
app.listen(PORT, () => console.log(`ESLDG V2 System Active on Port ${PORT}`));
app.get('/api/download-zip', requireAuth, (req, res) => {
    const userDir = getUserDir(req.session.username);
    const targetDir = path.resolve(userDir, req.query.path || '');
    
    if (!targetDir.startsWith(userDir) || !fs.existsSync(targetDir)) return res.status(403).send('Denied');
    
    try {
        const folderName = path.basename(targetDir) || 'ESLDG_Archive';
        res.setHeader('Content-Type', 'application/zip');
        res.setHeader('Content-Disposition', `attachment; filename="${folderName}.zip"`);
        
        // --- MEMORY OPTIMIZED ARCHIVER ---
        const archive = archiver('zip', {
            zlib: { level: 1 } // Low compression level = lower CPU/RAM usage
        });

        archive.on('error', (err) => {
            console.error('[ZIP Error]', err);
            res.end();
        });

        // Pipe to response
        archive.pipe(res);
        
        // Append directory without buffer loading
        archive.directory(targetDir, false);
        
        archive.finalize();
        
    } catch (err) {
        console.error('[ZIP Fatal Error]', err);
        if (!res.headersSent) res.status(500).send('Error');
    }
});
