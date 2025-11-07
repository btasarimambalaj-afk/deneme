"""
Chat Routes - Mesajlaşma API
- Mesaj gönderme (müşteri/admin)
- Mesaj alma
- SSE (Server-Sent Events)
"""

from flask import Blueprint, request, jsonify, Response
from modules.database import create_user, get_user, get_messages, update_last_seen
from modules.text_message import send_text_message
from modules.security import SecurityManager
from modules.sse_manager import sse_manager
import json

chat_bp = Blueprint('chat', __name__)
security = SecurityManager()

@chat_bp.route('/users', methods=['POST'])
@security.rate_limit
def register_user():
    """Yeni kullanıcı kaydı"""
    data = request.get_json()
    user_id = data.get('user_id')
    name = data.get('name', 'Anonim')
    
    if not security.validate_user_id(user_id):
        return jsonify({'success': False, 'error': 'Geçersiz user ID'}), 400
    
    if not security.validate_name(name):
        return jsonify({'success': False, 'error': 'Geçersiz isim'}), 400
    
    # Kullanıcı zaten var mı?
    existing = get_user(user_id)
    if existing:
        return jsonify({'success': True, 'user': existing})
    
    # Yeni kullanıcı oluştur
    create_user(user_id, name)
    
    # Telegram bildirimi (app.py'de handle edilecek)
    return jsonify({'success': True, 'user_id': user_id})

@chat_bp.route('/messages', methods=['POST'])
@security.rate_limit
def send_message():
    """Mesaj gönder"""
    try:
        data = request.get_json()
        user_id = data.get('user_id')
        sender_type = data.get('sender_type', 'customer')
        message_type = data.get('message_type', 'text')
        content = data.get('content')
        
        if not security.validate_user_id(user_id):
            return jsonify({'success': False, 'error': 'Geçersiz user ID'}), 400
        
        if message_type == 'text' and not security.validate_message(content):
            return jsonify({'success': False, 'error': 'Geçersiz mesaj'}), 400
        
        # Mesajı kaydet
        message_id = send_text_message(user_id, sender_type, content)
        
        # Last seen güncelle
        update_last_seen(user_id)
        
        # SSE ile bildir
        from datetime import datetime
        sse_manager.notify(user_id, {
            'id': message_id,
            'user_id': user_id,
            'sender_type': sender_type,
            'message_type': message_type,
            'content': content,
            'created_at': datetime.now().isoformat()
        })
        
        return jsonify({'success': True, 'message_id': message_id})
    except Exception as e:
        import logging
        logging.error(f"Send message error: {e}", exc_info=True)
        return jsonify({'success': False, 'error': str(e)}), 500

@chat_bp.route('/messages/<user_id>', methods=['GET'])
def get_user_messages(user_id):
    """Kullanıcının mesajlarını getir"""
    if not security.validate_user_id(user_id):
        return jsonify({'success': False, 'error': 'Geçersiz user ID'}), 400
    
    messages = get_messages(user_id)
    return jsonify({'success': True, 'messages': messages})

@chat_bp.route('/stream/<user_id>')
def stream_messages(user_id):
    """SSE - Real-time mesaj akışı"""
    if not security.validate_user_id(user_id):
        return jsonify({'success': False, 'error': 'Geçersiz user ID'}), 400
    
    # Queue oluştur
    q = sse_manager.create_queue(user_id)
    
    def event_stream():
        import queue
        while True:
            try:
                message = q.get(timeout=30)
                yield f"data: {json.dumps(message)}\n\n"
            except queue.Empty:
                yield f"data: {json.dumps({'type': 'ping'})}\n\n"
    
    return Response(event_stream(), mimetype='text/event-stream')
