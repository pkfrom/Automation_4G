# 📡 Automation_4G (NMS Standalone Project)

โครงการย่อยแยกเฉพาะระบบตรวจสอบ **NMS (Interface Box / PTGK monitoring system)** จากระบบ 442MHz Online Automation

## ⚙️ การติดตั้ง (Setup)
1. ติดตั้ง Python 3 (แนะนำเวอร์ชัน 3.9 ขึ้นไป)
2. ติดตั้ง library ที่เกี่ยวข้อง:
   ```bash
   pip install -r requirements.txt
   ```
3. คัดลอกไฟล์ `.env.example` เป็น `.env` และตั้งค่าต่าง ๆ:
   - `NMS_URL` 
   - `NMS_USER` และ `NMS_PASS` (ข้อมูลเข้าสู่ระบบ NMS)
   - `GAS_UPLOAD_URL` (URL ของ Google Apps Script สำหรับ Upload)
   - `TELEGRAM_BOT_TOKEN` และ `TELEGRAM_CHAT_ID` (สำหรับแจ้งเตือนทาง Telegram)

## 🚀 การรันระบบ (Running)
คุณสามารถสั่งทำงานในรูปแบบ Standalone ได้โดยการรันคำสั่ง:
```bash
python nms.py
```
