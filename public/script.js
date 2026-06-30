let currentPath = ''; 
let pollInterval; 
let currentVideoPath = ''; 
let videoPlayerInstance = null;

const showToast = (message, type = 'success') => {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div'); 
    toast.className = `toast ${type}`;
    toast.innerHTML = `<span>${message}</span>`;
    container.appendChild(toast);
    
    setTimeout(() => toast.classList.add('show'), 10);
    setTimeout(() => { 
        toast.classList.remove('show'); 
        setTimeout(() => toast.remove(), 300); 
    }, 4000);
};

const toggleMenu = () => {
    const sidebar = document.getElementById('sidebar');
    const overlay = document.getElementById('mobile-overlay');
    sidebar.classList.toggle('open');
    overlay.style.display = sidebar.classList.contains('open') ? 'block' : 'none';
};

const switchScreen = (id) => { 
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active')); 
    document.getElementById(id).classList.add('active'); 
};

const switchTab = (id) => { 
    document.querySelectorAll('.content-body').forEach(t => t.classList.remove('active')); 
    document.getElementById(id).classList.add('active'); 
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
    
    if(id === 'tab-drive') { 
        document.getElementById('nav-drive').classList.add('active'); 
        document.getElementById('top-title').innerText = '/ Root Directory'; 
    }
    if(id === 'tab-admin') { 
        document.getElementById('nav-admin').classList.add('active'); 
        document.getElementById('top-title').innerText = 'Admin Console'; 
        loadAdminData(); 
    }
    if(window.innerWidth < 768) toggleMenu(); 
};

const formatBytes = (bytes) => {
    if (bytes === 0 || isNaN(bytes)) return '0 B'; 
    const k = 1024, sizes = ['B', 'KB', 'MB', 'GB', 'TB'], i = Math.floor(Math.log(Math.abs(bytes)) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
};

// --- AUTHENTICATION ---
const login = async () => {
    try {
        const res = await fetch('/api/login', { 
            method: 'POST', 
            headers: {'Content-Type': 'application/json'}, 
            body: JSON.stringify({ 
                username: document.getElementById('login-user').value, 
                password: document.getElementById('login-pass').value 
            }) 
        });
        const data = await res.json();
        
        if (res.ok) { 
            bootDashboard(data.username, data.role); 
        } else if (data.requiresOTP) { 
            document.getElementById('otp-email').value = data.email; 
            switchScreen('screen-otp'); 
            showToast('Email verification required.', 'error'); 
        } else { 
            showToast(data.error, 'error'); 
        }
    } catch (err) { 
        showToast('Connection error. Please try again.', 'error'); 
    }
};

const register = async () => {
    const email = document.getElementById('reg-email').value;
    try {
        const res = await fetch('/api/register', { 
            method: 'POST', 
            headers: {'Content-Type': 'application/json'}, 
            body: JSON.stringify({ 
                username: document.getElementById('reg-user').value, 
                email: email, 
                password: document.getElementById('reg-pass').value 
            }) 
        });
        const data = await res.json();
        
        if (res.ok) { 
            document.getElementById('otp-email').value = email; 
            switchScreen('screen-otp'); 
            showToast(data.message); 
        } else {
            showToast(data.error, 'error');
        }
    } catch (err) { 
        showToast('Registration failed. Please try again.', 'error'); 
    }
};

const verifyOTP = async () => {
    try {
        const res = await fetch('/api/verify-otp', { 
            method: 'POST', 
            headers: {'Content-Type': 'application/json'}, 
            body: JSON.stringify({ 
                email: document.getElementById('otp-email').value, 
                otp: document.getElementById('otp-code').value 
            }) 
        });
        const data = await res.json();
        if (res.ok) { 
            showToast(data.message); 
            switchScreen('screen-login'); 
        } else { 
            showToast(data.error, 'error'); 
        }
    } catch (err) { 
        showToast('Verification timeout.', 'error'); 
    }
};

const logout = async () => { 
    await fetch('/api/logout', { method: 'POST' }); 
    location.reload(); 
};

const bootDashboard = (username, role) => {
    switchScreen('screen-dashboard');
    document.getElementById('profile-name').innerText = `@${username}`;
    if (role === 'admin') document.getElementById('nav-admin').style.display = 'flex';
    
    updateDrive();
    if(!pollInterval) pollInterval = setInterval(updateDrive, 2000);
};

// --- FILE TRANSFERS & ACTIONS ---
const addLink = async () => {
    const input = document.getElementById('link-input'); 
    if (!input.value) return;
    
    showToast('Starting transfer...');
    await fetch('/api/add', { 
        method: 'POST', 
        headers: { 'Content-Type': 'application/json' }, 
        body: JSON.stringify({ link: input.value }) 
    });
    input.value = ''; 
    updateDrive();
};

const uploadTorrent = async (input) => {
    const file = input.files[0]; 
    if (!file) return;
    
    const formData = new FormData(); 
    formData.append('torrent', file);
    showToast('Uploading .torrent file...');
    
    try {
        const res = await fetch('/api/upload', { method: 'POST', body: formData });
        if (res.ok) { 
            showToast('Transfer started successfully.'); 
            updateDrive(); 
        } else {
            showToast('Upload rejected.', 'error');
        }
    } finally { 
        input.value = ''; 
    }
};

const controlTorrent = async (hash, action) => {
    let deleteData = false;
    if (action === 'cancel') {
        if(!confirm('Are you sure you want to stop and remove this transfer?')) return;
        deleteData = confirm('Do you also want to delete the downloaded files from your storage?');
    }
    await fetch(`/api/torrent/${hash}/${action}`, { 
        method: 'POST', 
        headers: { 'Content-Type': 'application/json' }, 
        body: JSON.stringify({ deleteData }) 
    });
    updateDrive();
};

const navigate = (newPath) => { 
    currentPath = newPath; 
    document.getElementById('top-title').innerText = '/ ' + currentPath; 
    updateDrive(); 
};

const deleteFile = async (event, path) => {
    event.stopPropagation(); 
    if(!confirm('Are you sure you want to permanently delete this item?')) return;
    
    await fetch('/api/delete', { 
        method: 'POST', 
        headers: { 'Content-Type': 'application/json' }, 
        body: JSON.stringify({ path }) 
    });
    updateDrive();
};

const copyLink = async (event, filePath) => {
    event.stopPropagation();
    const username = document.getElementById('profile-name').innerText.split(' ')[0].replace('@', '');
    const encodedPath = encodeURIComponent(filePath).replace(/%2F/g, '/');
    const url = `${window.location.origin}/downloads/${username}/${encodedPath}`;
    
    if (navigator.clipboard && window.isSecureContext) { 
        try { 
            await navigator.clipboard.writeText(url); 
            showToast('Direct download link copied to clipboard.'); 
            return; 
        } catch (err) {} 
    }
    
    const textArea = document.createElement("textarea"); 
    textArea.value = url; 
    textArea.style.position = "fixed"; 
    textArea.style.opacity = "0";
    document.body.appendChild(textArea); 
    textArea.focus(); 
    textArea.select();
    
    try { 
        if (document.execCommand('copy')) showToast('Direct download link copied to clipboard.'); 
        else prompt("Copy this download link:", url); 
    } catch (err) { 
        prompt("Copy this download link:", url); 
    }
    document.body.removeChild(textArea);
};

// Fixed ZIP Archiver logic - Streams directly to disk avoiding RAM exhaustion
const downloadFolderAsBlob = (path, name) => {
    showToast('Starting folder compression and download...');
    
    const a = document.createElement('a');
    a.href = `/api/download-zip?path=${encodeURIComponent(path)}`;
    a.download = `${name}.zip`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
};

// --- VIDEO PLAYER & SUBTITLES ---
const toggleSubMenu = () => { document.getElementById('sub-menu-modal').classList.toggle('active'); };

const switchSubTab = (paneId) => {
    document.querySelectorAll('.sub-tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.sub-menu-pane').forEach(p => p.classList.remove('active'));
    event.target.classList.add('active');
    document.getElementById(paneId).classList.add('active');
};

const setSubStyle = (cssVar, value, btnElement) => {
    document.documentElement.style.setProperty(cssVar, value);
    const siblings = btnElement.parentElement.querySelectorAll('.adv-btn');
    siblings.forEach(btn => btn.classList.remove('active'));
    btnElement.classList.add('active');
};

const selectSubtitleLanguage = (langSrc, element) => {
    document.querySelectorAll('.lang-option').forEach(opt => opt.classList.remove('active'));
    element.classList.add('active');
    const video = document.getElementById('active-player');
    if (!video) return;
    
    const tracks = video.textTracks;
    for (let i = 0; i < tracks.length; i++) {
        if (!langSrc) { 
            tracks[i].mode = 'hidden'; 
        } else { 
            tracks[i].mode = (tracks[i].label === langSrc) ? 'showing' : 'hidden'; 
        }
    }
    setTimeout(() => { document.getElementById('sub-menu-modal').classList.remove('active'); }, 300);
};

const uploadCustomSubtitle = async (input) => {
    const file = input.files[0]; 
    if (!file) return;
    const formData = new FormData(); 
    formData.append('subtitle', file);
    formData.append('path', currentVideoPath.split('/').slice(0, -1).join('/'));

    showToast('Uploading subtitle track...', 'success');
    try {
        const res = await fetch('/api/upload-subtitle', { method: 'POST', body: formData });
        if (res.ok) { 
            showToast('Subtitle added successfully.', 'success'); 
            openPlayer(null, currentVideoPath); 
        } else {
            showToast('Failed to upload subtitle.', 'error');
        }
    } catch (err) { 
        showToast('Connection error during upload.', 'error'); 
    } finally { 
        input.value = ''; 
    }
};

const openPlayer = async (event, filePath) => {
    if (event) event.stopPropagation();
    currentVideoPath = filePath;
    const modal = document.getElementById('video-modal');
    const wrapper = document.getElementById('player-wrapper');
    
    if (videoPlayerInstance) { 
        videoPlayerInstance.destroy(); 
        wrapper.innerHTML = ''; 
    }
    showToast('Loading media player...', 'success');

    try {
        const subRes = await fetch(`/api/subtitles?path=${encodeURIComponent(filePath)}`);
        const subData = await subRes.json();
        const streamUrl = `/stream/${encodeURIComponent(filePath).replace(/%2F/g, '/')}`;
        
        let html = `<video id="active-player" playsinline controls style="width:100%; height:100%;"><source src="${streamUrl}" type="video/mp4" />`;
        if (subData.subtitles && subData.subtitles.length > 0) {
            subData.subtitles.forEach((sub) => { 
                html += `<track kind="captions" label="${sub.src}" srclang="en" src="${sub.src}" />`; 
            });
        }
        html += `</video>`;
        wrapper.innerHTML = html;
        
        const langList = document.getElementById('dynamic-lang-list');
        langList.innerHTML = `<div class="lang-option active" onclick="selectSubtitleLanguage('', this)">Subtitles Off</div>`;
        if (subData.subtitles) {
            subData.subtitles.forEach(sub => { 
                langList.innerHTML += `<div class="lang-option" onclick="selectSubtitleLanguage('${sub.src}', this)">${sub.name}</div>`; 
            });
        }
        
        modal.style.display = 'flex';
        videoPlayerInstance = new Plyr('#active-player', { 
            controls: ['play-large', 'play', 'progress', 'current-time', 'mute', 'volume', 'settings', 'fullscreen'] 
        });

        videoPlayerInstance.on('ready', (e) => {
            const player = e.detail.plyr; 
            const controls = player.elements.controls;
            if (controls) {
                const ccBtn = document.createElement('button');
                ccBtn.className = 'plyr__controls__item plyr__control'; 
                ccBtn.type = 'button';
                ccBtn.title = 'Subtitles & Closed Captions';
                ccBtn.innerHTML = `<svg viewBox="0 0 24 24" style="width:18px;height:18px;fill:currentColor;"><path d="M19 4H5c-1.11 0-2 .9-2 2v12c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm-8 7H9.5v-.5h-2v3h2V13H11v1c0 .55-.45 1-1 1H7c-.55 0-1-.45-1-1v-4c0-.55.45-1 1-1h3c.55 0 1 .45 1 1v1zm7 0h-1.5v-.5h-2v3h2V13H18v1c0 .55-.45 1-1 1h-3c-.55 0-1-.45-1-1v-4c0-.55.45-1 1-1h3c.55 0 1 .45 1 1v1z"/></svg>`;
                ccBtn.onclick = toggleMenu ? toggleSubMenu : null;
                
                const settingsBtn = controls.querySelector('[data-plyr="settings"]');
                if (settingsBtn && settingsBtn.parentNode) { 
                    settingsBtn.parentNode.insertBefore(ccBtn, settingsBtn); 
                } else { 
                    controls.appendChild(ccBtn); 
                }

                if (subData.subtitles && subData.subtitles.length > 0) {
                    const match = subData.subtitles.find(s => s.isMatch);
                    if (match) {
                        const optionEl = Array.from(document.querySelectorAll('.lang-option')).find(el => el.innerText === match.name);
                        if (optionEl) selectSubtitleLanguage(match.src, optionEl);
                    }
                }
            }
        });
    } catch (err) { 
        showToast('Media playback error.', 'error'); 
    }
};

const closePlayer = () => {
    document.getElementById('video-modal').style.display = 'none';
    document.getElementById('sub-menu-modal').classList.remove('active');
    if (videoPlayerInstance) { 
        videoPlayerInstance.destroy(); 
        videoPlayerInstance = null; 
        document.getElementById('player-wrapper').innerHTML = ''; 
    }
};

// --- DASHBOARD UPDATES ---
const updateDrive = async () => {
    if(document.getElementById('tab-admin').classList.contains('active')) return;
    try {
        const [statusRes, filesRes, storageRes] = await Promise.all([ 
            fetch('/api/status'), 
            fetch(`/api/files?path=${encodeURIComponent(currentPath)}`), 
            fetch('/api/storage') 
        ]);
        
        if (storageRes.ok) {
            const { used, max } = await storageRes.json();
            const available = max - used;
            document.getElementById('storage-details').innerHTML = `
                <div style="font-size:1.1rem; font-weight:700; color:var(--success);">${formatBytes(available)} <span style="font-size:0.8rem; font-weight:500;">Free Space</span></div>
                <div style="margin-top:0.25rem;">${formatBytes(used)} / ${formatBytes(max)} Used</div>`;
                
            const fillPct = Math.max(Math.min((used / max) * 100, 100), 0);
            document.getElementById('storage-fill-bar').style.width = `${fillPct}%`;
            document.getElementById('storage-fill-bar').style.background = fillPct > 90 ? 'var(--danger)' : 'linear-gradient(90deg, var(--success), var(--primary))';
        }

        if (statusRes.ok) {
            const { torrents } = await statusRes.json();
            document.getElementById('transfers-list').innerHTML = torrents.map(t => {
                let color = t.done ? 'var(--success)' : (t.paused ? 'var(--text-muted)' : 'var(--primary)');
                let statusText = t.done ? 'Complete' : (t.paused ? 'Paused' : `Downloading: ${formatBytes(t.downloadSpeed)}/s`);
                return `
                <div class="torrent-card">
                    <div class="t-header">
                        <div class="t-title" title="${t.name}">${t.name}</div>
                        <div class="t-controls">
                            ${!t.done ? `<button class="t-btn" onclick="controlTorrent('${t.infoHash}', '${t.paused ? 'resume' : 'pause'}')" title="${t.paused ? 'Resume' : 'Pause'}">${t.paused ? '▶' : '⏸'}</button>` : ''}
                            <button class="t-btn danger" onclick="controlTorrent('${t.infoHash}', 'cancel')" title="Delete Transfer">✖</button>
                        </div>
                    </div>
                    <div class="t-progress-bar"><div class="t-progress-fill" style="width:${t.progress}%; background:${color};"></div></div>
                    <div class="t-metrics">
                        <div><span style="color:${color}; font-weight:bold;">${statusText}</span></div>
                        <div>Peers: ${t.numPeers}</div>
                        <div>ETA: ${t.done ? '0m' : (t.timeRemaining ? Math.round(t.timeRemaining/60000) + 'm' : 'Calculating...')}</div>
                    </div>
                </div>`;
            }).join('');
        }

        if (filesRes.ok) {
            const { files } = await filesRes.json();
            
            let html = currentPath ? `
                <div class="file-grid-item" style="border-style:dashed;" onclick="const p = currentPath.split('/'); p.pop(); navigate(p.join('/'));">
                    <div class="file-grid-icon" style="color:var(--text-muted);">
                        <svg viewBox="0 0 24 24" style="width:24px;height:24px;fill:currentColor;"><path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z"/></svg>
                    </div>
                    <div class="file-grid-name" style="color:var(--text-muted);">Go Up One Folder</div>
                </div>` : '';
                
            if (files.length === 0 && currentPath === '') {
                html = `<div style="grid-column: 1/-1; padding: 4rem 1rem; text-align: center; color: var(--text-muted); font-size: 0.95rem; border: 1px dashed var(--border); border-radius: 8px;">Your storage folder is empty. Add a transfer above to begin downloading files.</div>`;
            }
            
            html += files.map(f => {
                const isVideo = ['.mp4', '.mkv', '.webm'].some(ext => f.name.toLowerCase().endsWith(ext));
                const icon = f.isDir ? '📁' : '📄';
                const username = document.getElementById('profile-name').innerText.split(' ')[0].replace('@', '');
                const rawPath = f.path.replace(/'/g, "\\'");
                
                const dlButton = f.isDir 
                    ? `<button class="grid-action-icon-btn" onclick="downloadFolderAsBlob('${encodeURIComponent(f.path)}', '${f.name}')" title="Download folder as ZIP archive">📦 ZIP</button>` 
                    : `<a class="grid-action-icon-btn" href="/downloads/${username}/${encodeURIComponent(f.path).replace(/%2F/g, '/')}" download title="Download File">↓ Save</a>`;
                    
                const copyButton = !f.isDir 
                    ? `<button class="grid-action-icon-btn" onclick="copyLink(event, '${rawPath}')" title="Copy File Link">🔗 Link</button>` 
                    : '';

                return `
                <div class="file-grid-item" ${f.isDir ? `onclick="navigate('${rawPath}')"` : ''}>
                    <div class="file-grid-icon" style="${f.isDir ? 'color:var(--primary);' : 'color:var(--text-muted);'}">${icon}</div>
                    <div class="file-grid-name" title="${f.name}">${f.name}</div>
                    <div style="font-size:0.75rem; color:var(--text-muted);">${f.isDir ? 'Folder' : formatBytes(f.size)}</div>
                    <div class="grid-actions">
                        ${dlButton}${copyButton}${(!f.isDir && isVideo) ? `<button class="grid-action-icon-btn" onclick="openPlayer(event, '${rawPath}')" style="color:var(--primary);" title="Play Media">▶ Play</button>` : ''}
                        <button class="grid-action-icon-btn" style="background:rgba(248,81,73,0.15); border-color:rgba(248,81,73,0.3); color:var(--danger);" onclick="deleteFile(event, '${rawPath}')" title="Delete Item">✖ Delete</button>
                    </div>
                </div>`;
            }).join('');
            document.getElementById('files-grid-root').innerHTML = html;
        }
    } catch (err) {}
};

// --- ADMIN CONTROLS ---
const loadAdminData = async () => {
    const [usersRes, logsRes] = await Promise.all([ fetch('/api/admin/users'), fetch('/api/admin/logs') ]);
    
    if (usersRes.ok) {
        const users = await usersRes.json();
        document.getElementById('admin-users-table').innerHTML = `
            <tr>
                <th>ID</th><th>Username</th><th>Email</th><th>Role</th><th>Status</th><th>Actions</th>
            </tr>` + 
            users.map(u => `
            <tr>
                <td>${u.id}</td>
                <td><strong style="color:#fff;">${u.username}</strong></td>
                <td>${u.email}</td>
                <td>${u.role}</td>
                <td><span style="color:${u.is_verified ? 'var(--success)' : 'var(--danger)'}; font-weight:600;">${u.is_verified ? 'Verified':'Unverified'}</span></td>
                <td style="white-space:nowrap;">
                    <button class="btn btn-secondary" style="padding:0.35rem 0.75rem; font-size:0.8rem; display:inline-block;" onclick="changeUserPass(${u.id})">Reset Password</button>
                    ${u.role !== 'admin' ? `<button class="btn btn-secondary" style="background:rgba(248,81,73,0.1); border-color:rgba(248,81,73,0.2); color:var(--danger); padding:0.35rem 0.75rem; font-size:0.8rem; display:inline-block; margin-left:0.5rem;" onclick="deleteUser(${u.id})">Delete User</button>` : ''}
                </td>
            </tr>`).join('');
    }
    
    if (logsRes.ok) {
        const logs = await logsRes.json();
        document.getElementById('admin-logs-table').innerHTML = `
            <tr>
                <th>Date & Time</th><th>User</th><th>Action Logged</th>
            </tr>` + 
            logs.map(l => `
            <tr>
                <td style="color:var(--text-muted); font-size:0.8rem; white-space:nowrap;">${new Date(l.timestamp).toLocaleString()}</td>
                <td style="color:var(--primary); font-weight:600;">@${l.username}</td>
                <td style="color:var(--text); font-family:monospace; font-size:0.8rem;">${l.action}</td>
            </tr>`).join('');
    }
};

const deleteUser = async (id) => { 
    if(!confirm('Are you sure you want to delete this user and permanently erase all their files?')) return; 
    await fetch(`/api/admin/user/${id}/delete`, { method: 'POST' }); 
    loadAdminData(); 
};

const changeUserPass = async (id) => { 
    const newPass = prompt('Enter a new password for this user:'); 
    if(!newPass) return; 
    
    await fetch(`/api/admin/user/${id}/password`, { 
        method: 'POST', 
        headers: {'Content-Type':'application/json'}, 
        body: JSON.stringify({newPassword: newPass}) 
    }); 
    
    showToast('User password successfully updated.'); 
    loadAdminData(); 
};

// Check active session on load
fetch('/api/me').then(res => res.ok ? res.json().then(data => bootDashboard(data.username, data.role)) : null);