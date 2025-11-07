"""
Müşteri Destek Sistemi - Ana Flask Uygulaması
"""

import os
import logging
from flask import Flask, render_template, send_from_directory
from flask_cors import CORS
from config import Config
from modules.database import init_db
from modules.telegram_bot import TelegramBot
from routes.chat import chat_bp
from routes.admin import admin_bp
from routes.files import files_bp
from routes.telegram import telegram_bp, init_telegram

# Logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Flask App
app = Flask(__name__)
app.config.from_object(Config)
app.config['SESSION_COOKIE_SECURE'] = Config.FLASK_ENV == 'production'
app.config['SESSION_COOKIE_HTTPONLY'] = True
app.config['SESSION_COOKIE_SAMESITE'] = 'Lax'
CORS(app, supports_credentials=True)

# Upload klasörlerini oluştur
os.makedirs(Config.IMAGE_UPLOAD_FOLDER, exist_ok=True)
os.makedirs(Config.VOICE_UPLOAD_FOLDER, exist_ok=True)

# Database initialize
init_db()

# Telegram initialize
telegram_bot = None
if Config.TELEGRAM_BOT_TOKEN and Config.TELEGRAM_ADMIN_CHAT_ID:
    telegram_bot = TelegramBot(Config.TELEGRAM_BOT_TOKEN, Config.TELEGRAM_ADMIN_CHAT_ID)
    init_telegram(Config.TELEGRAM_BOT_TOKEN, Config.TELEGRAM_ADMIN_CHAT_ID)
    logger.info("Telegram bot initialized")
else:
    logger.warning("Telegram credentials not found")

# Telegram Notifications Hook (BEFORE register)
@chat_bp.after_request
def notify_telegram(response):
    """Yeni kullanıcı/mesaj bildirimleri"""
    if telegram_bot and response.status_code == 200:
        try:
            from flask import request
            if request.endpoint == 'chat.register_user':
                data = request.get_json()
                telegram_bot.notify_new_user(data.get('user_id'), data.get('name'))
            elif request.endpoint == 'chat.send_message':
                data = request.get_json()
                if data.get('sender_type') == 'customer':
                    from modules.database import get_user
                    user = get_user(data.get('user_id'))
                    telegram_bot.notify_new_message(
                        data.get('user_id'),
                        user['name'] if user else 'Anonim',
                        data.get('message_type'),
                        data.get('content')
                    )
        except Exception as e:
            logger.error(f"Telegram notification error: {e}")
    return response

@files_bp.after_request
def notify_telegram_files(response):
    """Dosya yükleme bildirimleri"""
    if telegram_bot and response.status_code == 200:
        try:
            from flask import request
            if request.endpoint in ['files.upload_image', 'files.upload_voice']:
                user_id = request.form.get('user_id')
                sender_type = request.form.get('sender_type')
                
                if sender_type == 'customer':
                    from modules.database import get_user, get_messages
                    user = get_user(user_id)
                    messages = get_messages(user_id)
                    last_msg = messages[-1] if messages else None
                    
                    if last_msg:
                        telegram_bot.notify_new_message(
                            user_id,
                            user['name'] if user else 'Anonim',
                            last_msg['message_type'],
                            last_msg['content']
                        )
        except Exception as e:
            logger.error(f"Telegram file notification error: {e}")
    return response

@admin_bp.after_request
def send_otp_telegram(response):
    """OTP'yi Telegram'a gönder"""
    if telegram_bot and response.status_code == 200:
        try:
            from flask import request
            if request.endpoint == 'admin.request_otp':
                import json
                data = json.loads(response.get_data())
                if data.get('success') and data.get('otp'):
                    telegram_bot.send_message(f"🔐 <b>Admin OTP</b>\n\nKod: <code>{data['otp']}</code>\n\n⏰ 5 dakika geçerli")
        except Exception as e:
            logger.error(f"OTP send error: {e}")
    return response

# Register Blueprints (AFTER hooks)
app.register_blueprint(chat_bp, url_prefix='/api')
app.register_blueprint(admin_bp, url_prefix='/api/admin')
app.register_blueprint(files_bp, url_prefix='/api/files')
app.register_blueprint(telegram_bp, url_prefix='/api/telegram')

# Routes
@app.route('/')
def index():
    """Müşteri sayfası"""
    return render_template('index.html')

@app.route('/admin')
def admin():
    """Admin paneli"""
    return render_template('admin.html')

@app.route('/static/uploads/<path:filename>')
def serve_upload(filename):
    """Upload dosyalarını servis et"""
    return send_from_directory('static/uploads', filename)



# Error Handlers
@app.errorhandler(404)
def not_found(e):
    return {'success': False, 'error': 'Not found'}, 404

@app.errorhandler(500)
def server_error(e):
    logger.error(f"Server error: {e}")
    return {'success': False, 'error': 'Internal server error'}, 500

if __name__ == '__main__':
    port = int(os.getenv('PORT', 5000))
    app.run(host='0.0.0.0', port=port, debug=Config.FLASK_ENV == 'development')
