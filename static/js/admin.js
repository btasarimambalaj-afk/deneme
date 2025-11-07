// Admin Panel JavaScript
let users = [];
let currentUser = null;
let selectedUsers = new Set();
let eventSources = {};
let adminToken = null;

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    setupLoginListeners();
});

// Login
function setupLoginListeners() {
    document.getElementById('requestOtpBtn').addEventListener('click', requestOTP);
    document.getElementById('loginBtn').addEventListener('click', verifyOTP);
    document.getElementById('otpInput').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') verifyOTP();
    });
}

async function requestOTP() {
    try {
        const res = await fetch('/api/admin/request-otp', {method: 'POST'});
        const data = await res.json();
        
        if (data.success) {
            adminToken = data.token;
            showToast('OTP Telegram\'a gönderildi', 'success');
            console.log('OTP:', data.otp); // Dev only
        }
    } catch (error) {
        showToast('OTP gönderilemedi', 'error');
    }
}

async function verifyOTP() {
    const otp = document.getElementById('otpInput').value.trim();
    
    if (!otp || !adminToken) return;
    
    try {
        const res = await fetch('/api/admin/verify-otp', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({otp, token: adminToken})
        });
        
        const data = await res.json();
        
        if (data.success) {
            adminToken = data.token;
            document.getElementById('loginModal').classList.remove('active');
            document.getElementById('adminPanel').classList.remove('hidden');
            initAdmin();
        } else {
            showToast(data.error, 'error');
        }
    } catch (error) {
        showToast('Giriş başarısız', 'error');
    }
}

// Init Admin
function initAdmin() {
    loadUsers();
    loadStats();
    setupAdminListeners();
    setInterval(loadStats, 30000);
    setInterval(loadUsers, 60000); // Kullanıcıları her dakika yenile
}

// Load Users
async function loadUsers() {
    try {
        const res = await fetch('/api/admin/users', {
            headers: {'X-Admin-Token': adminToken}
        });
        const data = await res.json();
        
        if (data.success) {
            users = data.users;
            renderUsers();
        }
    } catch (error) {
        console.error('Load users error:', error);
    }
}

// Render Users
function renderUsers() {
    const container = document.getElementById('usersList');
    container.innerHTML = '';
    
    if (users.length === 0) {
        container.innerHTML = '<div class="loading">Henüz kullanıcı yok</div>';
        return;
    }
    
    users.forEach(user => {
        const card = document.createElement('div');
        card.className = 'user-card';
        if (selectedUsers.has(user.id)) card.classList.add('selected');
        
        card.innerHTML = `
            <input type="checkbox" class="user-checkbox" data-user-id="${user.id}" 
                ${selectedUsers.has(user.id) ? 'checked' : ''}>
            <div class="user-avatar-wrapper">
                <div class="user-avatar">${user.name[0].toUpperCase()}</div>
            </div>
            <div class="user-info">
                <div class="user-name">
                    ${user.name}
                    ${user.message_count > 0 ? `<span class="unread-badge">${user.message_count}</span>` : ''}
                </div>
                <div class="user-message">${getLastMessagePreview(user.last_message)}</div>
            </div>
            <div class="user-meta">
                <div class="user-time">${formatTime(user.last_seen)}</div>
            </div>
        `;
        
        card.querySelector('.user-checkbox').addEventListener('change', (e) => {
            e.stopPropagation();
            toggleUserSelection(user.id);
        });
        
        card.addEventListener('click', () => openChat(user));
        
        container.appendChild(card);
    });
    
    updateActionBar();
}

// Load Stats
async function loadStats() {
    try {
        const res = await fetch('/api/admin/stats', {
            headers: {'X-Admin-Token': adminToken}
        });
        const data = await res.json();
        
        if (data.success) {
            document.getElementById('totalMessages').textContent = data.stats.total_messages;
            document.getElementById('totalUsers').textContent = data.stats.total_users;
            document.getElementById('activeConnections').textContent = data.stats.active_connections || 0;
        }
    } catch (error) {
        console.error('Load stats error:', error);
    }
}

// Open Chat
function openChat(user) {
    currentUser = user;
    document.getElementById('chatView').classList.remove('hidden');
    document.getElementById('chatAvatar').textContent = user.name[0].toUpperCase();
    document.getElementById('chatName').textContent = user.name;
    
    loadChatMessages(user.id);
    connectUserSSE(user.id);
}

// Load Chat Messages
async function loadChatMessages(userId) {
    try {
        const res = await fetch(`/api/messages/${userId}`);
        const data = await res.json();
        
        const container = document.getElementById('chatMessages');
        container.innerHTML = '';
        
        if (data.success) {
            data.messages.forEach(msg => addChatMessage(msg));
        }
    } catch (error) {
        console.error('Load chat messages error:', error);
    }
}

// Connect User SSE
function connectUserSSE(userId) {
    if (eventSources[userId]) return;
    
    const es = new EventSource(`/api/stream/${userId}`);
    es.onmessage = (e) => {
        const data = JSON.parse(e.data);
        if (data.type !== 'ping' && currentUser?.id === userId) {
            addChatMessage(data);
        }
    };
    
    eventSources[userId] = es;
}

// Add Chat Message
function addChatMessage(msg) {
    const container = document.getElementById('chatMessages');
    const div = document.createElement('div');
    div.className = `message ${msg.sender_type}`;
    
    const avatar = document.createElement('div');
    avatar.className = 'message-avatar';
    avatar.textContent = msg.sender_type === 'customer' ? currentUser.name[0].toUpperCase() : '🛡️';
    
    const content = document.createElement('div');
    content.className = 'message-content';
    
    const bubble = document.createElement('div');
    bubble.className = 'message-bubble';
    
    if (msg.message_type === 'text') {
        bubble.textContent = msg.content;
    } else if (msg.message_type === 'image') {
        const img = document.createElement('img');
        img.src = `/${msg.content}`;
        img.className = 'message-image';
        img.style.maxWidth = '200px';
        bubble.appendChild(img);
    } else if (msg.message_type === 'voice') {
        const audio = document.createElement('audio');
        audio.src = `/${msg.content}`;
        audio.controls = true;
        audio.style.maxWidth = '200px';
        bubble.appendChild(audio);
    }
    
    const time = document.createElement('div');
    time.className = 'message-time';
    time.textContent = formatTime(msg.created_at);
    
    content.appendChild(bubble);
    content.appendChild(time);
    div.appendChild(avatar);
    div.appendChild(content);
    container.appendChild(div);
    
    container.scrollTop = container.scrollHeight;
}

// Send Admin Message
async function sendAdminMessage() {
    const input = document.getElementById('adminMessageInput');
    const text = input.value.trim();
    
    if (!text || !currentUser) return;
    
    try {
        await fetch('/api/messages', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({
                user_id: currentUser.id,
                sender_type: 'admin',
                message_type: 'text',
                content: text
            })
        });
        
        input.value = '';
        input.style.height = 'auto';
    } catch (error) {
        showToast('Mesaj gönderilemedi', 'error');
    }
}

// User Selection
function toggleUserSelection(userId) {
    if (selectedUsers.has(userId)) {
        selectedUsers.delete(userId);
    } else {
        selectedUsers.add(userId);
    }
    renderUsers();
}

function selectAll() {
    if (selectedUsers.size === users.length) {
        selectedUsers.clear();
    } else {
        users.forEach(u => selectedUsers.add(u.id));
    }
    renderUsers();
}

async function deleteSelected() {
    if (selectedUsers.size === 0) return;
    
    if (!confirm(`${selectedUsers.size} kullanıcı silinecek. Emin misiniz?`)) return;
    
    try {
        await Promise.all(
            Array.from(selectedUsers).map(id =>
                fetch(`/api/admin/users/${id}`, {
                    method: 'DELETE',
                    headers: {'X-Admin-Token': adminToken}
                })
            )
        );
        
        selectedUsers.clear();
        loadUsers();
        showToast('Kullanıcılar silindi', 'success');
    } catch (error) {
        showToast('Silme işlemi başarısız', 'error');
    }
}

function updateActionBar() {
    document.getElementById('deleteBtn').disabled = selectedUsers.size === 0;
}

// Upload Admin Image
async function uploadAdminImage(file) {
    if (!currentUser) return;
    
    const formData = new FormData();
    formData.append('file', file);
    formData.append('user_id', currentUser.id);
    formData.append('sender_type', 'admin');
    
    try {
        const res = await fetch('/api/files/upload/image', {
            method: 'POST',
            body: formData
        });
        
        if (res.ok) {
            showToast('Resim gönderildi', 'success');
        }
    } catch (error) {
        showToast('Resim gönderilemedi', 'error');
    }
}

// Upload Admin Voice
async function uploadAdminVoice() {
    if (!currentUser) return;
    
    try {
        const stream = await navigator.mediaDevices.getUserMedia({audio: true});
        const mediaRecorder = new MediaRecorder(stream);
        const audioChunks = [];
        
        mediaRecorder.ondataavailable = (e) => audioChunks.push(e.data);
        mediaRecorder.onstop = async () => {
            const blob = new Blob(audioChunks, {type: 'audio/webm'});
            const formData = new FormData();
            formData.append('file', blob, 'voice.webm');
            formData.append('user_id', currentUser.id);
            formData.append('sender_type', 'admin');
            
            try {
                const res = await fetch('/api/files/upload/voice', {
                    method: 'POST',
                    body: formData
                });
                
                if (res.ok) {
                    showToast('Ses gönderildi', 'success');
                }
            } catch (error) {
                showToast('Ses gönderilemedi', 'error');
            }
            
            stream.getTracks().forEach(track => track.stop());
            document.getElementById('adminVoiceBtn').textContent = '🎤';
        };
        
        mediaRecorder.start();
        document.getElementById('adminVoiceBtn').textContent = '⏹️';
        
        setTimeout(() => {
            if (mediaRecorder.state === 'recording') {
                mediaRecorder.stop();
            }
        }, 60000);
        
        document.getElementById('adminVoiceBtn').onclick = () => {
            if (mediaRecorder.state === 'recording') {
                mediaRecorder.stop();
            }
        };
    } catch (error) {
        showToast('Mikrofon erişimi reddedildi', 'error');
    }
}

// Setup Admin Listeners
function setupAdminListeners() {
    document.getElementById('logoutBtn').addEventListener('click', logout);
    document.getElementById('selectAllBtn').addEventListener('click', selectAll);
    document.getElementById('deleteBtn').addEventListener('click', deleteSelected);
    document.getElementById('backBtn').addEventListener('click', () => {
        document.getElementById('chatView').classList.add('hidden');
        currentUser = null;
    });
    
    const input = document.getElementById('adminMessageInput');
    const sendBtn = document.getElementById('adminSendBtn');
    
    input.addEventListener('input', () => {
        sendBtn.disabled = !input.value.trim();
    });
    
    sendBtn.addEventListener('click', sendAdminMessage);
    
    document.getElementById('adminImageBtn').addEventListener('click', () => {
        document.getElementById('adminImageInput').click();
    });
    
    document.getElementById('adminImageInput').addEventListener('change', (e) => {
        if (e.target.files[0]) {
            uploadAdminImage(e.target.files[0]);
        }
    });
    
    document.getElementById('adminVoiceBtn').addEventListener('click', uploadAdminVoice);
    
    document.getElementById('searchInput').addEventListener('input', (e) => {
        const term = e.target.value.toLowerCase();
        document.querySelectorAll('.user-card').forEach(card => {
            const name = card.querySelector('.user-name').textContent.toLowerCase();
            card.style.display = name.includes(term) ? 'flex' : 'none';
        });
    });
}

// Logout
async function logout() {
    try {
        await fetch('/api/admin/logout', {
            method: 'POST',
            headers: {'X-Admin-Token': adminToken}
        });
        location.reload();
    } catch (error) {
        location.reload();
    }
}

// Utilities
function getLastMessagePreview(message) {
    if (!message) return 'Henüz mesaj yok';
    
    if (message.message_type === 'text') {
        return message.content.length > 30 ? message.content.substring(0, 30) + '...' : message.content;
    } else if (message.message_type === 'image') {
        return '📷 Resim gönderdi';
    } else if (message.message_type === 'voice') {
        return '🎤 Ses kaydı gönderdi';
    }
    return 'Mesaj';
}

function formatTime(timestamp) {
    const date = new Date(timestamp);
    const now = new Date();
    const diff = now - date;
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);
    
    if (minutes < 1) return 'Şimdi';
    if (minutes < 60) return minutes + 'dk';
    if (hours < 24) return hours + 'sa';
    return days + 'g';
}

function showToast(message, type = 'info') {
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;
    document.body.appendChild(toast);
    
    setTimeout(() => toast.remove(), 3000);
}
