"""
Telegram Routes - Telegram Webhook
- Webhook kurulumu
- Telegram'dan mesaj alma
"""

from flask import Blueprint, request, jsonify
from modules.telegram_webhook import TelegramWebhook
from modules.telegram_bot import TelegramBot
from config import Config

telegram_bp = Blueprint('telegram', __name__)

# Telegram instances (app.py'de initialize edilecek)
telegram_webhook = None
telegram_bot = None

def init_telegram(bot_token, admin_chat_id):
    """Telegram disabled temporarily"""
    pass

@telegram_bp.route('/webhook', methods=['POST'])
def webhook():
    """Telegram webhook endpoint"""
    if not telegram_webhook:
        return jsonify({'success': False, 'error': 'Telegram not initialized'}), 500
    
    update_data = request.get_json()
    result = telegram_webhook.process_update(update_data)
    
    return jsonify(result)

@telegram_bp.route('/set-webhook', methods=['POST'])
def set_webhook():
    """Webhook URL'ini Telegram'a kaydet"""
    if not Config.TELEGRAM_BOT_TOKEN:
        return jsonify({'success': False, 'error': 'Bot token not configured'}), 500
    
    # Railway URL'ini al (environment variable'dan)
    import os
    domain = os.getenv('RAILWAY_PUBLIC_DOMAIN')
    if domain:
        base_url = f"https://{domain}"
    else:
        base_url = 'http://localhost:5000'
    webhook_url = f"{base_url}/api/telegram/webhook"
    
    import requests
    url = f"https://api.telegram.org/bot{Config.TELEGRAM_BOT_TOKEN}/setWebhook"
    response = requests.post(url, json={'url': webhook_url})
    
    if response.status_code == 200:
        return jsonify({'success': True, 'webhook_url': webhook_url})
    else:
        return jsonify({'success': False, 'error': response.text}), 500
