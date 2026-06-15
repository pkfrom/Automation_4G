# -*- coding: utf-8 -*-
"""
config.py — ค่า configuration สำหรับ Automation_4G (NMS Standalone)
"""

import os
from pathlib import Path
from dotenv import load_dotenv

load_dotenv(Path(__file__).parent / ".env")

# ════════════════════════════════════════════════════════════════
#  NMS (Interface Box)
# ════════════════════════════════════════════════════════════════
NMS_URL  = os.getenv("NMS_URL") # URL ของระบบ Interface Box (NMS)
NMS_USER = os.getenv("NMS_USER", "admin")             # ชื่อผู้ใช้ NMS
NMS_PASS = os.getenv("NMS_PASS", "")                  # รหัสผ่าน NMS

# ════════════════════════════════════════════════════════════════
#  Google Apps Script
# ════════════════════════════════════════════════════════════════
GAS_UPLOAD_URL = os.getenv("GAS_UPLOAD_URL", "")   # URL สำหรับอัปโหลดข้อมูล NMS ไปยัง Google Sheets

# ════════════════════════════════════════════════════════════════
#  Telegram
# ════════════════════════════════════════════════════════════════
TELEGRAM_BOT_TOKEN = os.getenv("TELEGRAM_BOT_TOKEN", "")
TELEGRAM_CHAT_ID   = os.getenv("TELEGRAM_CHAT_ID",   "")

NOTIFY_BOT_TOKEN = os.getenv("NOTIFY_BOT_TOKEN", "")
NOTIFY_CHAT_ID   = os.getenv("NOTIFY_CHAT_ID",   "")

# ════════════════════════════════════════════════════════════════
#  Paths
# ════════════════════════════════════════════════════════════════
def get_config_path(env_key: str, default_name: str) -> Path:
    path_str = os.getenv(env_key, default_name)
    p = Path(path_str)
    return p if p.is_absolute() else Path(__file__).parent / p

NMS_EXPORT_DIR    = get_config_path("NMS_EXPORT_DIR",    "IFBox_Export")  # โฟลเดอร์เก็บไฟล์จาก NMS
