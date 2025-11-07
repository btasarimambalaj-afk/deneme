// Müşteri Destek Sistemi - Ana JavaScript
let userId = localStorage.getItem('user_id');
let userName = localStorage.getItem('user_name') || 'Anonim';
let eventSource = null;
let mediaRecorder = null;
let audioChunks = [];

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    if (!userId) {
        showNameModal();
    } else {
        initChat();
    }
    
    setupEventListeners();
});

// Name Modal
function showNameModal() {
    document.getElementById('nameModal').classList.add('active');
}

document.getElementById('nameSubmitBtn').addEventListener('click', async () => {
    const name = document.getElementById('nameInput').value.trim() || 'Anonim';
    userId = 'user_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    userName = name;
    
    localStorage.setItem('user_id', userId);
    localStorage.setItem('user_name', userName);
    
    await registerUser();
    document.getElementById('nameModal').classList.remove('active');
    initChat();
});

// Register User
async function registerUser() {
    try {
        const res = await fetch('/api/users', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({user_id: userId, name: userName})
        });
        const data = await res.json();
        console.log('Register response:', data);
        if (!data.success) {
            showToast('Kayıt başarısız: ' + data.error, 'error');
        }
        return data.success;
    } catch (error) {
        console.error('Register error:', error);
        showToast('Kayıt başarısız', 'error');
        return false;
    }
}

// Init Chat
function initChat() {
    loadMessages();
    // connectSSE(); // Temporarily disabled
}

// Load Messages
async function loadMessages() {
    try {
        const res = await fetch(`/api/messages/${userId}`);
        const data = await res.json();
        
        if (data.success) {
            document.getElementById('messagesContainer').innerHTML = '<div class="welcome-banner"><div class="welcome-icon">👋</div><div class="welcome-title">Hoş Geldiniz!</div><div class="welcome-text">Size nasıl yardımcı olabiliriz?</div></div>';
            data.messages.forEach(msg => addMessage(msg));
        }
    } catch (error) {
        console.error('Load messages error:', error);
    }
}

// SSE Connection
function connectSSE() {
    eventSource = new EventSource(`/api/stream/${userId}`);
    
    eventSource.onmessage = (e) => {
        const data = JSON.parse(e.data);
        if (data.type !== 'ping') {
            addMessage(data);
        }
    };
    
    eventSource.onerror = () => {
        setTimeout(connectSSE, 5000);
    };
}

// Add Message to UI
function addMessage(msg) {
    const container = document.getElementById('messagesContainer');
    const div = document.createElement('div');
    div.className = `message ${msg.sender_type}`;
    
    const avatar = document.createElement('div');
    avatar.className = 'message-avatar';
    avatar.textContent = msg.sender_type === 'customer' ? userName[0].toUpperCase() : '🛡️';
    
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
    
    scrollToBottom();
}

// Send Text Message
async function sendMessage() {
    const input = document.getElementById('messageInput');
    const text = input.value.trim();
    
    if (!text) return;
    
    try {
        const res = await fetch('/api/messages', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({
                user_id: userId,
                sender_type: 'customer',
                message_type: 'text',
                content: text
            })
        });
        
        if (res.ok) {
            addMessage({
                user_id: userId,
                sender_type: 'customer',
                message_type: 'text',
                content: text,
                created_at: new Date().toISOString()
            });
            input.value = '';
            input.style.height = 'auto';
            document.getElementById('sendBtn').disabled = true;
        } else {
            const error = await res.json();
            console.error('Send error:', error);
            showToast(error.error || 'Mesaj gönderilemedi', 'error');
        }
    } catch (error) {
        console.error('Send exception:', error);
        showToast('Mesaj gönderilemedi', 'error');
    }
}

// Upload Image
async function uploadImage(file) {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('user_id', userId);
    formData.append('sender_type', 'customer');
    
    try {
        const res = await fetch('/api/files/upload/image', {
            method: 'POST',
            body: formData
        });
        
        if (res.ok) {
            showToast('Resim gönderildi', 'success');
            setTimeout(() => loadMessages(), 500);
        }
    } catch (error) {
        showToast('Resim gönderilemedi', 'error');
    }
}

// Voice Recording
async function startRecording() {
    try {
        const stream = await navigator.mediaDevices.getUserMedia({audio: true});
        mediaRecorder = new MediaRecorder(stream);
        audioChunks = [];
        
        mediaRecorder.ondataavailable = (e) => audioChunks.push(e.data);
        mediaRecorder.onstop = uploadVoice;
        
        mediaRecorder.start();
        document.getElementById('voiceBtn').classList.add('recording');
        document.getElementById('voiceBtn').textContent = '⏹️';
    } catch (error) {
        showToast('Mikrofon erişimi reddedildi', 'error');
    }
}

function stopRecording() {
    if (mediaRecorder && mediaRecorder.state === 'recording') {
        mediaRecorder.stop();
        mediaRecorder.stream.getTracks().forEach(track => track.stop());
        document.getElementById('voiceBtn').classList.remove('recording');
        document.getElementById('voiceBtn').textContent = '🎤';
    }
}

async function uploadVoice() {
    const blob = new Blob(audioChunks, {type: 'audio/webm'});
    const formData = new FormData();
    formData.append('file', blob, 'voice.webm');
    formData.append('user_id', userId);
    formData.append('sender_type', 'customer');
    
    try {
        const res = await fetch('/api/files/upload/voice', {
            method: 'POST',
            body: formData
        });
        
        if (res.ok) {
            showToast('Ses kaydı gönderildi', 'success');
            setTimeout(() => loadMessages(), 500);
        }
    } catch (error) {
        showToast('Ses gönderilemedi', 'error');
    }
}

// Event Listeners
function setupEventListeners() {
    const input = document.getElementById('messageInput');
    const sendBtn = document.getElementById('sendBtn');
    
    input.addEventListener('input', () => {
        sendBtn.disabled = !input.value.trim();
        input.style.height = 'auto';
        input.style.height = Math.min(input.scrollHeight, 100) + 'px';
    });
    
    input.addEventListener('keypress', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendMessage();
        }
    });
    
    sendBtn.addEventListener('click', sendMessage);
    
    document.getElementById('imageBtn').addEventListener('click', () => {
        document.getElementById('imageInput').click();
    });
    
    document.getElementById('imageInput').addEventListener('change', (e) => {
        if (e.target.files[0]) {
            uploadImage(e.target.files[0]);
        }
    });
    
    let isRecording = false;
    document.getElementById('voiceBtn').addEventListener('click', () => {
        if (isRecording) {
            stopRecording();
        } else {
            startRecording();
        }
        isRecording = !isRecording;
    });
}

// Utilities
function formatTime(timestamp) {
    const date = new Date(timestamp);
    return date.toLocaleTimeString('tr-TR', {hour: '2-digit', minute: '2-digit'});
}

function scrollToBottom() {
    const container = document.getElementById('messagesContainer');
    container.scrollTop = container.scrollHeight;
}

function showToast(message, type = 'info') {
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;
    document.body.appendChild(toast);
    
    setTimeout(() => toast.remove(), 3000);
}
