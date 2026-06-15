# 📡 Automation_4G (NMS Standalone Project)

โครงการระบบอัตโนมัติสำหรับการตรวจสอบสถานะและดึงข้อมูลอุปกรณ์ 4G จากระบบ **NMS (4G / PTGK Monitoring System)** พร้อมระบบอัปโหลดข้อมูลเข้า Google Sheets และแจ้งเตือนผ่าน Telegram บอต

---

## 📌 ภาพรวมและสถาปัตยกรรมการทำงาน (Overview & Architecture)

ระบบจะทำงานเป็นแบบกระบวนการทำงานอัตโนมัติรอบเดียว (Standalone Task) ซึ่งทำหน้าที่เชื่อมต่อกับระบบบริหารจัดการ NMS ดึงข้อมูลสถานะอุปกรณ์ สรุปผลการเชื่อมต่อ ส่งรายงานทาง Telegram และส่งข้อมูลไปบันทึกย้อนหลังใน Google Sheets

```mermaid
flowchart TD
    Start([เริ่มทำงาน]) --> Login[เข้าสู่ระบบ NMS<br>login]
    Login -->|ไม่สำเร็จ| ErrLogin[ส่งแจ้งเตือน Error NMS Login<br>ไปยัง Telegram]
    Login -->|สำเร็จ| GetCount[ดึงจำนวนอุปกรณ์ทั้งหมด/Online/Offline<br>get_online_count]
    GetCount --> SendReport[ส่งรายงาน NMS 4G Status Report<br>ไปยัง Telegram]
    SendReport --> Export[ส่งคำขอ Export ข้อมูลอุปกรณ์<br>export_data]
    
    Export -->|ได้ข้อมูล| SaveCSV[บันทึกข้อมูลเป็นไฟล์ CSV<br>ในโฟลเดอร์ IFBox_Export]
    SaveCSV --> UploadGAS[อัปโหลดข้อมูลไปยัง Google Sheets<br>ผ่าน GAS_UPLOAD_URL]
    
    UploadGAS -->|สำเร็จ| SendGASOk[ส่งแจ้งเตือนสำเร็จ<br>ไปยัง Telegram]
    UploadGAS -->|ล้มเหลว| SendGASErr[ส่งแจ้งเตือน Error Upload GAS<br>ไปยัง Telegram]
    
    Export -->|ไม่ได้ข้อมูล / ล้มเหลว| FallbackCSV[ดึงข้อมูลด้วยวิธีสำรอง 1<br>export_report_csv]
    FallbackCSV -->|สำเร็จ| SendFileTG[ส่งไฟล์ CSV/Excel<br>ไปยัง Telegram]
    FallbackCSV -->|ล้มเหลว| FallbackJSON[ดึงข้อมูลด้วยวิธีสำรอง 2<br>get_device_list_json]
    
    FallbackJSON -->|สำเร็จ| SaveJSONCSV[แปลง JSON เป็น CSV และบันทึก]
    SaveJSONCSV --> SendFileTG
    FallbackJSON -->|ล้มเหลว| SendExportErr[ส่งแจ้งเตือน Error Export<br>ไปยัง Telegram]
    
    SendGASOk --> End([จบการทำงาน])
    SendGASErr --> End
    SendFileTG --> End
    SendExportErr --> End
    ErrLogin --> End
```

---

## ✨ คุณสมบัติเด่น (Features)

- 🔐 **Auto Login**: จัดการการตรวจสอบสิทธิ์เข้าใช้งาน NMS โดยอัตโนมัติ (รองรับ CSRF Token `__hash__`)
- 📊 **Status Monitoring**: สรุปยอดอุปกรณ์ Online, Offline และคำนวณเปอร์เซ็นต์ความเสถียร (Health Rate)
- 📈 **Telegram Alerts**: แจ้งเตือนสถิติผ่านกลุ่มหลักด้วยข้อความรายงานสไตล์ Dashboard และมีบอตสำหรับแจ้งเตือนสถานะความผิดพลาดแยกต่างหาก
- 💾 **Data Export**: บันทึกข้อมูลรายงานอุปกรณ์ในรูปแบบไฟล์ CSV เข้ารหัส UTF-8-sig (รองรับการเปิดใน Excel ภาษาไทยโดยภาษาไม่เพี้ยน)
- ☁️ **Google Sheets Integration**: อัปโหลดตารางข้อมูลขึ้น Google Sheets โดยตรงผ่าน Google Apps Script (GAS) Web App API
- 🔄 **Multi-level Fallbacks**: หากระบบส่งออกรายงานหลักล้มเหลว จะพยายามเปลี่ยนไปดาวน์โหลดเป็นไฟล์ Binary หรือดาวน์โหลดผ่าน JSON API มาแปลงเป็น CSV เพื่อลดโอกาสงานหยุดชะงัก

---

## 📁 โครงสร้างโฟลเดอร์โปรเจกต์ (Project Structure)

- [IFBox_Export/](file:///D:/Playground/Automation_4G/IFBox_Export): โฟลเดอร์ที่ใช้บันทึกไฟล์รายงาน CSV (จัดเก็บแบบ Local) *[Git-ignored]*
- [.env](file:///D:/Playground/Automation_4G/.env): ไฟล์ตั้งค่า Environment Variables ส่วนบุคคล *[Git-ignored]*
- [.env.example](file:///D:/Playground/Automation_4G/.env.example): แม่แบบสำหรับการสร้างไฟล์ `.env`
- [.gitignore](file:///D:/Playground/Automation_4G/.gitignore): ไฟล์กำหนดข้อยกเว้นสำหรับระบบจัดการโค้ด Git
- [config.py](file:///D:/Playground/Automation_4G/config.py): ตัวจัดการอ่านค่าคอนฟิกูเรชันจากไฟล์ `.env`
- [nms.py](file:///D:/Playground/Automation_4G/nms.py): สคริปต์หลักสำหรับการดึงข้อมูล NMS และการอัปโหลดข้อมูล
- [notify.py](file:///D:/Playground/Automation_4G/notify.py): โมดูลฟังก์ชันการส่งข้อความและการรายงานผลทาง Telegram
- [requirements.txt](file:///D:/Playground/Automation_4G/requirements.txt): ไฟล์ระบุแพ็กเกจภายนอกที่จำเป็นสำหรับ Python

---

## ⚙️ การติดตั้งระบบ (Installation)

### 1. ความต้องการของระบบ (Prerequisites)
- **Python**: เวอร์ชัน 3.9 ขึ้นไป
- สิทธิ์ในการเข้าถึงระบบเครือข่ายของระบบ **NMS (4G / PTGK)**

### 2. การติดตั้งโมดูล
เปิด Terminal หรือ PowerShell ในโฟลเดอร์โปรเจกต์นี้ จากนั้นรันคำสั่ง:
```bash
pip install -r requirements.txt
```

### 3. การตั้งค่าสภาพแวดล้อม (.env)
คัดลอกไฟล์ `.env.example` ไปสร้างเป็นไฟล์ใหม่ชื่อ `.env` ในระดับเดียวกันของโปรเจกต์:
```bash
cp .env.example .env
```
จากนั้นให้เปิดไฟล์ `.env` และกำหนดค่าต่าง ๆ ตามตารางอธิบายด้านล่าง:

| ชื่อตัวแปร (Variable Name) | รายละเอียด (Description) | ตัวอย่างการกำหนดค่า |
| :--- | :--- | :--- |
| `NMS_URL` | URL หลักของระบบ Interface Box (NMS) | `http://192.168.1.10` |
| `NMS_USER` | ชื่อผู้ใช้ในการเข้าสู่ระบบ NMS | `admin` |
| `NMS_PASS` | รหัสผ่านในการเข้าสู่ระบบ NMS | `your_secret_password` |
| `NMS_EXPORT_DIR` | โฟลเดอร์เก็บไฟล์รายงานย้อนหลังในเครื่อง (เป็น Option เสริม) | `IFBox_Export` |
| `GAS_UPLOAD_URL` | Web App URL จาก Google Apps Script (สำหรับส่งข้อมูลไป Google Sheets) | `https://script.google.com/macros/s/.../exec` |
| `TELEGRAM_BOT_TOKEN` | Token ของ Telegram Bot หลักสำหรับส่งรายงานผลและแชร์ไฟล์รายงาน | `123456789:ABCdefGhIJKlmNoPQRsTUVwxyZ` |
| `TELEGRAM_CHAT_ID` | Chat ID ของกลุ่มหลักที่ผู้ใช้งานรับข้อมูลรายงาน | `-100123456789` |
| `NOTIFY_BOT_TOKEN` | Token ของ Telegram Bot ตัวสำรองใช้ส่งรายงานความผิดพลาดของระบบ (ถ้ามี) | `987654321:XYZabc...` |
| `NOTIFY_CHAT_ID` | Chat ID ของกลุ่ม/ช่องทางที่ต้องการรับแจ้งเตือนความผิดพลาดระบบ | `-100987654321` |

---

## 🚀 การรันระบบ (Execution)

เพื่อรันการดึงข้อมูลและรายงานผลแบบทำงานทันที สามารถรันคำสั่งนี้:

```bash
python nms.py
```

### ⏱️ การตั้งเวลารันอัตโนมัติ (Automated Scheduling)
เพื่อให้ระบบทำงานได้ตลอดเวลาโดยไม่ต้องกดรันเอง แนะนำให้ตั้งค่าตัวช่วยตั้งเวลาทำงาน (Scheduler):
- **Windows**: ตั้งค่าผ่าน **Task Scheduler** โดยสั่งรัน `python.exe nms.py` และกำหนดค่า **Start in** ไปยังโฟลเดอร์ของโปรเจกต์
- **Linux / macOS**: ตั้งค่าผ่าน **Cron Job** ตัวอย่างเช่น:
  ```text
  0 * * * * /usr/bin/python3 /path/to/Automation_4G/nms.py >> /path/to/Automation_4G/cron_run.log 2>&1
  ```

---

## 🛠️ รายละเอียดสถาปัตยกรรมระดับซอร์สโค้ด

- **[config.py](file:///D:/Playground/Automation_4G/config.py)**: โหลดค่าการตั้งค่าจากไฟล์ `.env` และระบุพาธส่งออกไฟล์ (`NMS_EXPORT_DIR`) โดยแปลงเป็นรูปแบบ `Path` ที่มีความเสถียรทั้งในระบบ Windows และ Linux
- **[notify.py](file:///D:/Playground/Automation_4G/notify.py)**:
  - `telegram_send`: ส่งรายงานเป็นข้อความ HTML ไปยังผู้รับกลุ่มหลัก
  - `tg_send_file`: อัปโหลดและส่งเอกสารแนบ (เช่น ไฟล์ CSV) ไปยังแชทหลัก
  - `_build_status_msg`: ประกอบข้อความสรุปสถานะสุขภาพเครือข่าย วาดแถบกราฟิกแสดงสถานะเช่น `[██████████░░] 85.0% Healthy` และแจ้งยอด Online / Offline
- **[nms.py](file:///D:/Playground/Automation_4G/nms.py)**:
  - ทำหน้าที่เป็นกระบวนการหลัก โดยสืบทอดเซสชันการเชื่อมต่อในคลาส `NMSClient`
  - ทำการ login, ตรวจหาค่าสถานะ รวมไปถึงการดึงข้อมูล และส่งผ่านข้อมูลไปยัง API ของ Google Apps Script (`upload_to_gas_nms`)
  - มีกลไกดึงข้อมูลสำรองหลายระดับ (Fallback Mechanisms) เพื่อให้แน่ใจว่าจะได้รับรายงานแม้ API หลักจะมีปัญหา

