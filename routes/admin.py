"""
Admin Routes - Admin API
- OTP gönderme/doğrulama
- Kullanıcı listesi
- İstatistikler
- Kullanıcı silme
"""

from flask import Blueprint, request, jsonify, session
from modules.database import get_all_users, delete_user, get_messages, get_stats
from modules.otp_manager import OTPManager
from modules.security import SecurityManager
from functools import wraps
import os

admin_bp = Blueprint('admin', __name__)
otp_manager = OTPManager()
security = SecurityManager()

def admin_required(f):
    """Admin authentication decorator"""
    @wraps(f)
    def decorated_function(*args, **kwargs):
        token = request.headers.get('X-Admin-Token') or request.cookies.get('admin_token')
        if not token or not otp_manager.is_authenticated(token):
            return jsonify({'success': False, 'error': 'Yetkisiz erişim'}), 401
        return f(*args, **kwargs)
    return decorated_function

@admin_bp.route('/request-otp', methods=['POST'])
@security.rate_limit
def request_otp():
    """OTP kodu iste"""
    token = os.urandom(16).hex()
    otp_code = otp_manager.generate_otp(token)
    
    # Telegram'a gönder (app.py'de handle edilecek)
    return jsonify({
        'success': True,
        'message': 'OTP Telegram\'a gönderildi',
        'token': token,
        'otp': otp_code  # Sadece development için
    })

@admin_bp.route('/verify-otp', methods=['POST'])
@security.rate_limit
def verify_otp():
    """OTP doğrula"""
    data = request.get_json()
    otp_code = data.get('otp')
    token = data.get('token')
    
    if not token:
        return jsonify({'success': False, 'error': 'Token bulunamadı'}), 400
    
    result = otp_manager.verify_otp(token, otp_code)
    
    if result['success']:
        resp = jsonify({'success': True, 'message': 'Giriş başarılı', 'token': token})
        resp.set_cookie('admin_token', token, max_age=36000, httponly=True, samesite='Lax')
        return resp
    else:
        return jsonify({'success': False, 'error': result['error']}), 400

@admin_bp.route('/logout', methods=['POST'])
def logout():
    """Çıkış yap"""
    session_id = session.get('session_id')
    if session_id:
        otp_manager.logout(session_id)
        session.clear()
    return jsonify({'success': True})

@admin_bp.route('/users', methods=['GET'])
@admin_required
def list_users():
    """Tüm kullanıcıları listele"""
    users = get_all_users()
    
    # Her kullanıcı için son mesajı ekle
    for user in users:
        messages = get_messages(user['id'])
        user['message_count'] = len(messages)
        user['last_message'] = messages[-1] if messages else None
    
    return jsonify({'success': True, 'users': users})

@admin_bp.route('/users/<user_id>', methods=['DELETE'])
@admin_required
def remove_user(user_id):
    """Kullanıcıyı sil"""
    if not security.validate_user_id(user_id):
        return jsonify({'success': False, 'error': 'Geçersiz user ID'}), 400
    
    # Dosyaları sil
    messages = get_messages(user_id)
    for msg in messages:
        if msg['message_type'] in ['image', 'voice']:
            if os.path.exists(msg['content']):
                try:
                    os.remove(msg['content'])
                except Exception as e:
                    print(f"File delete error: {e}")
    
    # Database'den sil
    delete_user(user_id)
    
    return jsonify({'success': True, 'message': 'Kullanıcı silindi'})

@admin_bp.route('/stats', methods=['GET'])
@admin_required
def get_statistics():
    """İstatistikler"""
    stats = get_stats()
    otp_stats = otp_manager.get_stats()
    security_stats = security.get_stats()
    
    return jsonify({
        'success': True,
        'stats': {
            **stats,
            **otp_stats,
            **security_stats
        }
    })
