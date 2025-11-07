"""
Files Routes - Dosya Upload API
- Resim yükleme
- Ses yükleme
- Dosya servisi
"""

from flask import Blueprint, request, jsonify, send_file
from modules.voice_message import send_voice_message
from modules.image_upload import send_image_message
from modules.security import SecurityManager
from modules.database import update_last_seen
from modules.sse_manager import sse_manager
import os

files_bp = Blueprint('files', __name__)
security = SecurityManager()

@files_bp.route('/upload/image', methods=['POST'])
@security.rate_limit
def upload_image():
    """Resim yükle"""
    try:
        user_id = request.form.get('user_id')
        sender_type = request.form.get('sender_type', 'customer')
        
        if not security.validate_user_id(user_id):
            return jsonify({'success': False, 'error': 'Geçersiz user ID'}), 400
        
        if 'file' not in request.files:
            return jsonify({'success': False, 'error': 'Dosya bulunamadı'}), 400
        
        file = request.files['file']
        
        if not security.validate_file_extension(file.filename, {'png', 'jpg', 'jpeg', 'gif', 'webp'}):
            return jsonify({'success': False, 'error': 'Geçersiz dosya formatı'}), 400
        
        # Resmi kaydet
        message_id = send_image_message(user_id, sender_type, file)
        
        if not message_id:
            return jsonify({'success': False, 'error': 'Dosya yüklenemedi'}), 500
        
        # Last seen güncelle
        update_last_seen(user_id)
        
        # SSE ile bildir
        from modules.database import get_messages
        messages = get_messages(user_id)
        last_msg = messages[-1] if messages else None
        
        if last_msg:
            sse_manager.notify(user_id, {
                'id': message_id,
                'user_id': user_id,
                'sender_type': sender_type,
                'message_type': 'image',
                'content': last_msg['content'],
                'created_at': last_msg['created_at']
            })
        
        return jsonify({'success': True, 'message_id': message_id})
    except Exception as e:
        import logging
        logging.error(f"Image upload error: {e}", exc_info=True)
        return jsonify({'success': False, 'error': str(e)}), 500

@files_bp.route('/upload/voice', methods=['POST'])
@security.rate_limit
def upload_voice():
    """Ses yükle"""
    try:
        user_id = request.form.get('user_id')
        sender_type = request.form.get('sender_type', 'customer')
        
        if not security.validate_user_id(user_id):
            return jsonify({'success': False, 'error': 'Geçersiz user ID'}), 400
        
        if 'file' not in request.files:
            return jsonify({'success': False, 'error': 'Dosya bulunamadı'}), 400
        
        file = request.files['file']
        
        if not security.validate_file_extension(file.filename, {'webm', 'ogg', 'mp3', 'wav'}):
            return jsonify({'success': False, 'error': 'Geçersiz dosya formatı'}), 400
        
        # Sesi kaydet
        message_id = send_voice_message(user_id, sender_type, file)
        
        if not message_id:
            return jsonify({'success': False, 'error': 'Dosya yüklenemedi'}), 500
        
        # Last seen güncelle
        update_last_seen(user_id)
        
        # SSE ile bildir
        from modules.database import get_messages
        messages = get_messages(user_id)
        last_msg = messages[-1] if messages else None
        
        if last_msg:
            sse_manager.notify(user_id, {
                'id': message_id,
                'user_id': user_id,
                'sender_type': sender_type,
                'message_type': 'voice',
                'content': last_msg['content'],
                'created_at': last_msg['created_at']
            })
        
        return jsonify({'success': True, 'message_id': message_id})
    except Exception as e:
        import logging
        logging.error(f"Voice upload error: {e}", exc_info=True)
        return jsonify({'success': False, 'error': str(e)}), 500

@files_bp.route('/serve/<path:filename>')
def serve_file(filename):
    """Dosya servis et"""
    # Güvenlik için sadece uploads klasöründen servis et
    if filename.startswith('static/uploads/'):
        if os.path.exists(filename):
            return send_file(filename)
    
    return jsonify({'success': False, 'error': 'Dosya bulunamadı'}), 404
