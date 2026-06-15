import json
import logging
import ssl
import urllib.request
import requests
from datetime import datetime
from pathlib import Path

from config import (
    TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID,
    NOTIFY_BOT_TOKEN, NOTIFY_CHAT_ID
)

log = logging.getLogger(__name__)

def tg_send_file(file_path: Path, caption: str = "") -> bool:
    """ส่งไฟล์ไปยัง Telegram (TELEGRAM_BOT)"""
    try:
        with open(file_path, "rb") as f:
            r = requests.post(
                f"https://api.telegram.org/bot{TELEGRAM_BOT_TOKEN}/sendDocument",
                data={"chat_id": TELEGRAM_CHAT_ID, "caption": caption},
                files={"document": f},
                timeout=60,
            )
            r.raise_for_status()
        log.info(f"[TG] File sent ✓  {file_path.name}")
        return True
    except Exception as e:
        log.error(f"[TG] File send error: {e}")
        return False

def _telegram_post(bot_token: str, chat_id: str, text: str, label: str = "") -> bool:
    url = f"https://api.telegram.org/bot{bot_token}/sendMessage"
    payload = json.dumps({
        "chat_id": chat_id, "text": text, "parse_mode": "HTML",
    }).encode("utf-8")
    ssl_ctx = ssl.create_default_context()
    ssl_ctx.check_hostname = False
    ssl_ctx.verify_mode = ssl.CERT_NONE
    try:
        req = urllib.request.Request(
            url, data=payload,
            headers={"Content-Type": "application/json"}, method="POST",
        )
        with urllib.request.urlopen(req, timeout=15, context=ssl_ctx) as resp:
            ok = json.loads(resp.read()).get("ok", False)
            if ok:
                log.info(f"📨 Telegram{' ' + label if label else ''}: ส่งสำเร็จ")
            return ok
    except Exception as e:
        log.error(f"📨 Telegram{' ' + label if label else ''} error: {e}")
        return False

def telegram_send(text: str) -> bool:
    """ส่งไปกลุ่มหลัก (TELEGRAM_BOT)"""
    return _telegram_post(TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID, text)

def telegram_send_notify(text: str) -> bool:
    """ส่งไปกลุ่ม Notify (NOTIFY_BOT)"""
    return _telegram_post(NOTIFY_BOT_TOKEN, NOTIFY_CHAT_ID, text, label="[Notify]")

def _build_status_msg(title: str, online: int, offline: int,
                       total: int, extra_lines: list[str] = None,
                       footer: str = "") -> str:
    """สร้างข้อความ Network Status Report รูปแบบมาตรฐาน"""
    pct     = online  / total * 100 if total else 0
    bar     = "█" * int(pct / 100 * 12) + "░" * (12 - int(pct / 100 * 12))
    off_warn = " ⚠️" if offline > 0 else ""
    ts = datetime.now()

    lines = [
        f"📡 <b>{title}</b>",
        f"{'─'*24}",
        f"📅 Date: {ts.strftime('%d/%m/%Y')} | Time: {ts.strftime('%H:%M:%S')}",
        f"📊 Total Devices: {total:,} Units",
        "",
        "Device Health:",
        f"🟢 Online: {online:,} ({pct:.2f}%)",
        f"🔴 Offline: {offline:,}{off_warn}",
    ]
    if extra_lines:
        lines.extend(extra_lines)
    lines += [
        "",
        "System Summary:",
        f"[{bar}] {pct:.1f}% Healthy",
        f"{'─'*24}",
    ]
    if footer:
        lines.append(footer)
    return "\n".join(lines)

def telegram_msg_nms(counts: dict) -> str:
    return _build_status_msg(
        "NMS Interface Box Status Report",
        counts.get("online", 0),
        counts.get("offline", 0),
        counts.get("total", 0),
    )

def telegram_msg_error(stage: str, error: str) -> str:
    return (
        f"🚨 <b>Automation_4G ERROR</b>\n"
        f"⚠ ขั้นตอน: {stage}\n"
        f"❌ {error}\n"
        f"🕐 {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}"
    )
