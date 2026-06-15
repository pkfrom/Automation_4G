import csv
import json
import re
import requests
import logging
from datetime import datetime
from pathlib import Path
from bs4 import BeautifulSoup

from config import (
    NMS_URL, NMS_USER, NMS_PASS, GAS_UPLOAD_URL, NMS_EXPORT_DIR
)
from notify import tg_send_file, telegram_send, telegram_msg_nms, telegram_msg_error

log = logging.getLogger(__name__)

NMS_BASE = NMS_URL + "/index.php"
NMS_REPORT_DIR = NMS_EXPORT_DIR

class NMSClient:
    def __init__(self):
        self.s = requests.Session()
        self.s.headers.update({
            "User-Agent":      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                               "AppleWebKit/537.36 Chrome/146.0.0.0 Safari/537.36",
            "Accept-Language": "th,th-TH;q=0.9",
            "Accept":          "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        })

    def login(self) -> bool:
        LOGIN_GET  = NMS_BASE + "/Index/index.html"
        LOGIN_POST = NMS_BASE + "/Index/checkLogin.html"
        self.s.get(NMS_URL + "/", timeout=10, allow_redirects=True)
        r        = self.s.get(LOGIN_GET, timeout=10)
        soup     = BeautifulSoup(r.text, "html.parser")
        h_el     = soup.find("input", {"name": "__hash__"})
        hash_val = h_el["value"] if h_el else ""
        lt_el    = soup.find("input", {"name": "login_type"})
        lt_val   = lt_el["value"] if lt_el else ""
        if not hash_val:
            log.warning("[NMS] WARNING: __hash__ not found")
        r = self.s.post(
            LOGIN_POST,
            data={"na": NMS_USER, "pa": NMS_PASS,
                  "login_type": lt_val, "__hash__": hash_val, "remember": ""},
            headers={"Referer": LOGIN_GET, "Origin": NMS_URL,
                     "Content-Type": "application/x-www-form-urlencoded"},
            timeout=10, allow_redirects=True,
        )
        ok = "ptgk" in r.url or "logout" in r.text.lower()
        log.info(f"[NMS] Login {'✓' if ok else '✗'}  url={r.url}")
        return ok

    def get_online_count(self) -> dict:
        try:
            r    = self.s.get(NMS_BASE + "/Information/ptgkStatisticalInfo.html", timeout=10)
            data = json.loads(r.text)
            box  = data["statics_info"]["info_box_online"].replace("\\", "")
            parts   = box.split("/")
            online  = int(parts[0])
            total   = int(parts[1]) if len(parts) > 1 else 0
            offline = total - online
            log.info(f"[NMS] Online={online}  Offline={offline}  Total={total}")
            return {"online": online, "offline": offline, "total": total}
        except Exception as e:
            log.warning(f"[NMS] get_online_count error: {e} — ลอง fallback regex")

        try:
            r = self.s.get(NMS_BASE + "/Information/ptgkStatisticalInfo.html", timeout=10)
            m = re.search(r'"info_box_online"\s*:\s*"(\d+)\\?/(\d+)"', r.text)
            if m:
                online, total = int(m.group(1)), int(m.group(2))
                return {"online": online, "offline": total - online, "total": total}
        except Exception:
            pass

        return {"online": 0, "offline": 0, "total": 0}

    def _export_post(self):
        today     = datetime.now().strftime("%Y%m%d")
        startdate = datetime.now().replace(day=1).strftime("%Y%m%d")
        return self.s.post(
            NMS_BASE + "/Term/exportTerm.html",
            data={
                "dest": "all", "gid": "-10", "term_list": "",
                "type": "0", "export_type": "cpu",
                "startdate": startdate, "enddate": today, "sim": "0",
            },
            headers={
                "Referer":          NMS_BASE + "/Term/jklb.html",
                "Origin":           NMS_URL,
                "Content-Type":     "application/x-www-form-urlencoded",
                "X-Requested-With": "XMLHttpRequest",
                "Accept":           "application/json, text/javascript, */*; q=0.01",
            },
            timeout=60,
        )

    def export_data(self) -> tuple[list, list]:
        try:
            r     = self._export_post()
            js    = r.json()
            inner = js.get("data", js)
            hdrs  = inner.get("header") or []
            rows  = (inner.get("body") or inner.get("data") or
                     inner.get("rows") or [])
            log.info(f"[NMS Export] {len(rows)} rows × {len(hdrs)} cols")
            return hdrs, rows
        except Exception as e:
            log.error(f"[NMS Export] Error: {e}")
            return [], []

    def export_report_csv(self, filepath: Path) -> Path | None:
        try:
            r  = self._export_post()
            ct = r.headers.get("content-type", "")
            if "json" in ct or r.content[:1] == b"{":
                js    = r.json()
                inner = js.get("data", js)
                hdrs  = (inner.get("header") or inner.get("headers") or
                         inner.get("columns") or [])
                rows  = (inner.get("body") or inner.get("data") or
                         inner.get("rows") or inner.get("items") or [])
                if hdrs and rows:
                    csv_path = filepath.with_suffix(".csv")
                    with open(csv_path, "w", newline="", encoding="utf-8-sig") as f:
                        w = csv.writer(f)
                        w.writerow(hdrs)
                        for row in rows:
                            w.writerow(row if isinstance(row, list)
                                       else [row.get(h, "") for h in hdrs])
                    log.info(f"[NMS] CSV saved → {csv_path.name}  ({len(rows)} rows)")
                    return csv_path
            elif len(r.content) > 500:
                ext = ("xlsx" if b"PK\x03\x04" in r.content[:4] else
                       "xls"  if b"\xd0\xcf\x11\xe0" in r.content[:4] else "csv")
                out = filepath.with_suffix(f".{ext}")
                out.write_bytes(r.content)
                log.info(f"[NMS] Binary file saved → {out.name}")
                return out
        except Exception as e:
            log.error(f"[NMS] export_report_csv error: {e}")
        return None

    def get_device_list_json(self) -> list:
        try:
            r = self.s.get(
                NMS_BASE + "/Term/loadTermData.html", timeout=15,
                headers={"X-Requested-With": "XMLHttpRequest",
                         "Accept": "application/json, text/javascript, */*; q=0.01",
                         "Referer": NMS_BASE + "/Term/jklb.html"})
            if r.status_code == 200:
                data = r.json()
                if isinstance(data, list):
                    return data
                for k in ("rows", "data", "items", "result"):
                    if isinstance(data.get(k), list):
                        return data[k]
        except Exception as e:
            log.error(f"[NMS TermData] error: {e}")
        return []

def upload_to_gas_nms(data_2d: list, action: str = "importInterfaceBox") -> bool:
    try:
        r = requests.post(
            GAS_UPLOAD_URL,
            json={"action": action, "data": data_2d},
            headers={"Content-Type": "application/json"},
            timeout=120, allow_redirects=True,
        )
        log.info(f"[GAS NMS] status={r.status_code}  body={r.text[:200]}")
        if r.status_code == 200:
            try:
                js = r.json()
                ok = bool(js.get("success"))
                if ok:
                    log.info(f"[GAS NMS] ✅ Upload สำเร็จ  {js.get('count', 0)} rows")
                else:
                    log.warning(f"[GAS NMS] ⚠️  {js.get('error', 'unknown')}")
                return ok
            except Exception:
                if "error" not in r.text.lower():
                    log.info("[GAS NMS] ✅ Upload สำเร็จ")
                    return True
    except Exception as e:
        log.error(f"[GAS NMS] Exception: {e}")
    return False

async def run_nms():
    log.info("=" * 45)
    ts_str = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
    log.info(f"🖥️  NMS เริ่มทำงาน: {ts_str}")
    NMS_REPORT_DIR.mkdir(exist_ok=True)

    nms = NMSClient()

    if not nms.login():
        telegram_send(telegram_msg_error("NMS Login", "Login ไม่สำเร็จ"))
        return

    counts = nms.get_online_count()
    telegram_send(telegram_msg_nms(counts))

    ts_str = datetime.now().strftime("%Y%m%d_%H%M%S")
    hdrs, rows = nms.export_data()

    if hdrs and rows:
        data_2d  = [hdrs] + [r if isinstance(r, list) else list(r) for r in rows]
        csv_path = NMS_REPORT_DIR / f"device_report_{ts_str}.csv"
        with open(csv_path, "w", newline="", encoding="utf-8-sig") as f:
            csv.writer(f).writerows(data_2d)
        log.info(f"[NMS] CSV saved → {csv_path.name}  ({len(rows)} rows)")

        gas_ok = upload_to_gas_nms(data_2d)
        if gas_ok:
            telegram_send(
                f"✅ <b>NMS 4G Report อัพเดทแล้ว</b>\n"
                f"🟢 Online: {counts['online']:,}  "
                f"🔴 Offline: {counts['offline']:,}  "
                f"📦 Total: {counts['total']:,}\n"
                f"📊 Google Sheet อัพเดท {len(rows):,} แถว\n"
                f"🕐 {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}"
            )
        else:
            telegram_send(telegram_msg_error("NMS Upload GAS", "อัพโหลดไม่สำเร็จ"))
    else:
        log.warning("[NMS] export_data ไม่ได้ข้อมูล — ลอง fallback CSV")
        base   = NMS_REPORT_DIR / f"device_report_{ts_str}"
        saved  = nms.export_report_csv(base)
        if not saved:
            devices = nms.get_device_list_json()
            if devices:
                csv_path = base.with_suffix(".csv")
                all_keys = list({k for d in devices for k in d.keys()})
                with open(csv_path, "w", newline="", encoding="utf-8-sig") as f:
                    w = csv.DictWriter(f, fieldnames=all_keys, extrasaction="ignore")
                    w.writeheader()
                    w.writerows(devices)
                log.info(f"[NMS] JSON fallback CSV saved → {csv_path.name}  ({len(devices)} rows)")
                saved = csv_path
        if saved:
            tg_send_file(saved, caption=f"NMS Device Report {ts_str}")
        else:
            telegram_send(telegram_msg_error("NMS Export", "ไม่สามารถ Export ข้อมูลได้"))

if __name__ == "__main__":
    import asyncio
    import sys
    
    logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s", stream=sys.stdout)
    
    async def main():
        try:
            await run_nms()
        except Exception as e:
            log.error(f"❌ Error: {e}")
            from notify import telegram_msg_error
            telegram_send(telegram_msg_error("NMS Standalone", str(e)))
            
    asyncio.run(main())
