const TIMEZONE = "Asia/Bangkok";

/**
 * ฟังก์ชันสำหรับเริ่มการทำงาน Web App
 * รองรับการเปิดหน้า Dashboard เป็นหน้าหลัก และเปิดหน้าอัปเดตข้อมูลด้วย URL parameter (e.g. ?page=upload)
 */
function doGet(e) {
  const page = (e && e.parameter && e.parameter.page) || "dashboard";
  
  if (page.toLowerCase() === "upload" || page.toLowerCase() === "index") {
    return HtmlService.createHtmlOutputFromFile('Index')
        .setTitle('ระบบอัปเดตข้อมูล Device Interface')
        .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
  }
  
  return HtmlService.createHtmlOutputFromFile('Dashboard')
      .setTitle('4G Router — Online Dashboard')
      .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

/**
 * ฟังก์ชันรับข้อมูลจากหน้าเว็บและบันทึกลง Google Sheet (บันทึกเฉพาะในชีต NMS)
 * @param {Array[]} data - อาร์เรย์ 2 มิติของข้อมูล
 * @return {Object} ผลลัพธ์การทำงาน
 */
function importData(data) {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    let sheet = ss.getSheetByName("NMS");
    if (!sheet) {
      sheet = ss.insertSheet("NMS");
    }
    const MAX_COLUMNS = 37; 

    if (!data || data.length === 0) {
      throw new Error("ไม่พบข้อมูลในไฟล์");
    }

    const processedData = data.map(row => {
      if (row.length > MAX_COLUMNS) {
        return row.slice(0, MAX_COLUMNS);
      } else {
        const padding = new Array(MAX_COLUMNS - row.length).fill("");
        return row.concat(padding);
      }
    });

    const startRow = 1; 
    const lastRow = sheet.getLastRow();
    if (lastRow >= startRow) {
      sheet.getRange(startRow, 1, lastRow - startRow + 1, MAX_COLUMNS).clearContent();
    }

    if (processedData.length > 0) {
      sheet.getRange(startRow, 1, processedData.length, MAX_COLUMNS).setValues(processedData);
    }

    // หาวันที่และเวลาอัปเดตปัจจุบัน
    const now = new Date();
    const formattedDate = Utilities.formatDate(now, TIMEZONE, "dd/MM/yyyy");
    const formattedTime = Utilities.formatDate(now, TIMEZONE, "HH:mm");
    
    // คำนวณหา trend และบันทึกลง Properties
    calculateAndSaveTrends(processedData);

    // บันทึกเวลาอัปเดตล่าสุด
    PropertiesService.getDocumentProperties().setProperties({
      "last_updated_4g": formattedDate,
      "last_updated_time_4g": formattedTime
    });

    return { success: true, count: processedData.length };

  } catch (e) {
    return { success: false, error: e.toString() };
  }
}

/**
 * ฟังก์ชันช่วยค้นหาคอลัมน์จากชื่อหัวข้อแบบ Case-Insensitive
 */
function findColIdx(headers, name) {
  if (!headers) return -1;
  const lowerName = name.toLowerCase();
  for (let i = 0; i < headers.length; i++) {
    const h = String(headers[i]).toLowerCase().trim();
    if (h === lowerName || h.indexOf(lowerName) !== -1) {
      return i;
    }
  }
  return -1;
}

/**
 * คำนวณและบันทึก Trends เพื่อเปรียบเทียบกับครั้งก่อนหน้า
 */
function calculateAndSaveTrends(data) {
  if (data.length < 2) return;
  const headers = data[0];
  const statusIdx = findColIdx(headers, "status");
  const vpnIdx = findColIdx(headers, "vpn");
  const signalIdx = findColIdx(headers, "signal");

  if (statusIdx === -1) return;

  let nmsOnlineCount = 0;
  let vpnOnlineCount = 0;
  let goodSignalCount = 0;

  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    const status = String(row[statusIdx]).trim().toLowerCase();
    const vpn = vpnIdx !== -1 ? String(row[vpnIdx]).trim() : "";
    const signalStr = signalIdx !== -1 ? String(row[signalIdx]).trim() : "";

    const isNmsOnline = status === "online";
    const isVpnOnline = vpn.indexOf("openvpn(Online)") !== -1;

    let signalVal = 0;
    let hasSignal = false;
    if (signalStr && signalStr !== "NONE") {
      const match = signalStr.match(/\d+/);
      if (match) {
        signalVal = parseInt(match[0], 10);
        hasSignal = true;
      }
    }

    if (isNmsOnline) nmsOnlineCount++;
    if (isVpnOnline) vpnOnlineCount++;
    if (hasSignal && signalVal >= 20) goodSignalCount++;
  }

  const documentProperties = PropertiesService.getDocumentProperties();
  const prevNmsOnline = parseInt(documentProperties.getProperty("prev_nms_online") || "0", 10);
  const prevVpnOnline = parseInt(documentProperties.getProperty("prev_vpn_online") || "0", 10);
  const prevGoodSignal = parseInt(documentProperties.getProperty("prev_good_signal") || "0", 10);
  
  const trendNms = prevNmsOnline ? (nmsOnlineCount - prevNmsOnline) : 0;
  const trendVpn = prevVpnOnline ? (vpnOnlineCount - prevVpnOnline) : 0;
  const trendGoodSignal = prevGoodSignal ? (goodSignalCount - prevGoodSignal) : 0;

  documentProperties.setProperties({
    "prev_nms_online": String(nmsOnlineCount),
    "prev_vpn_online": String(vpnOnlineCount),
    "prev_good_signal": String(goodSignalCount),
    "trend_nms": String(trendNms),
    "trend_vpn": String(trendVpn),
    "trend_good_signal": String(trendGoodSignal)
  });
}

/**
 * ฟังก์ชันช่วยในการเปิดชีตตามชื่ออย่างปลอดภัย (Case-Insensitive & Substring fallback)
 */
function getSheetHelper(name) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(name);
  if (sheet) return sheet;
  
  const sheets = ss.getSheets();
  const lowerName = name.toLowerCase();
  for (let i = 0; i < sheets.length; i++) {
    const sName = sheets[i].getName().toLowerCase();
    if (sName.indexOf(lowerName) !== -1 || lowerName.indexOf(sName) !== -1) {
      return sheets[i];
    }
  }
  return null;
}

/**
 * ฟังก์ชันสำหรับดึงข้อมูลจากชีต "สรุป" และ "ข้อมูลรายเขต" นำมาประมวลผลแสดงที่ Dashboard
 */
function getDashboardData() {
  try {
    const summarySheet = getSheetHelper("สรุป");
    const districtSheet = getSheetHelper("ข้อมูลรายเขต");
    
    const documentProperties = PropertiesService.getDocumentProperties();
    const lastUpdated = documentProperties.getProperty("last_updated_4g") || "--/--/----";
    const lastUpdatedTime = documentProperties.getProperty("last_updated_time_4g") || "--:--";
    const trendNms = parseInt(documentProperties.getProperty("trend_nms") || "0", 10);
    const trendVpn = parseInt(documentProperties.getProperty("trend_vpn") || "0", 10);
    const trendGoodSignal = parseInt(documentProperties.getProperty("trend_good_signal") || "0", 10);

    if (!summarySheet || !districtSheet) {
      throw new Error("ไม่พบชีต 'สรุป' หรือ 'ข้อมูลรายเขต' ใน Spreadsheet");
    }
    
    const summaryValues = summarySheet.getDataRange().getValues();
    const districtValues = districtSheet.getDataRange().getValues();
    
    // ค้นหาและแยกแยะวันที่อัปเดตล่าสุดจากชีต "สรุป" (ถ้ามีระบุในชีต)
    let sheetScadaUpdated = "";
    let sheetScadaUpdatedTime = "";
    let sheetNmsUpdated = "";
    let sheetNmsUpdatedTime = "";

    function parseDateTimeFromString(str) {
      if (!str) return null;
      const match = str.match(/(\d{1,2}[/\-.]\d{1,2}[/\-.]\d{2,4})\s+(\d{1,2}:\d{2}(:\d{2})?)/);
      if (match) return { date: match[1], time: match[2] };
      const matchDateOnly = str.match(/(\d{1,2}[/\-.]\d{1,2}[/\-.]\d{2,4})/);
      if (matchDateOnly) return { date: matchDateOnly[1], time: "" };
      return null;
    }

    // ดึงค่า 4G Update โดยตรงจากชีต "สรุป" เซลล์ C10
    try {
      const cellC10 = summarySheet.getRange("C10").getValue();
      let parsed = null;
      if (cellC10 instanceof Date) {
        parsed = {
          date: Utilities.formatDate(cellC10, TIMEZONE, "dd/MM/yyyy"),
          time: Utilities.formatDate(cellC10, TIMEZONE, "HH:mm")
        };
      } else {
        parsed = parseDateTimeFromString(String(cellC10 || ""));
      }
      if (parsed) {
        sheetNmsUpdated = parsed.date;
        sheetNmsUpdatedTime = parsed.time;
      }
    } catch (err) {
      Logger.log("Error reading cell C10: " + err.toString());
    }

    for (let i = 0; i < summaryValues.length; i++) {
      const row = summaryValues[i];
      if (!row || row.length < 2) continue;
      
      const colB = String(row[1] || "").trim();
      const colC = row[2];
      const combinedText = (colB + " " + String(colC || "")).toLowerCase();
      
      if (combinedText.includes("อัปเดต") || combinedText.includes("อัพเดท") || combinedText.includes("update") || combinedText.includes("ล่าสุด")) {
        let parsed = null;
        if (colC instanceof Date) {
            parsed = {
              date: Utilities.formatDate(colC, TIMEZONE, "dd/MM/yyyy"),
              time: Utilities.formatDate(colC, TIMEZONE, "HH:mm")
            };
        } else {
          parsed = parseDateTimeFromString(String(colC || "")) || parseDateTimeFromString(colB);
        }
        
        if (parsed) {
          if (combinedText.includes("scada")) {
            sheetScadaUpdated = parsed.date;
            sheetScadaUpdatedTime = parsed.time;
          } else if (!combinedText.includes("nms") && !combinedText.includes("4g") && !combinedText.includes("esight")) {
            // หากไม่ใช่ NMS/4G/eSight ให้ใช้เป็น SCADA อัปเดตถ้ายังไม่มีค่า
            if (!sheetScadaUpdated) {
              sheetScadaUpdated = parsed.date;
              sheetScadaUpdatedTime = parsed.time;
            }
          }
        }
      }
    }

    // โหลดข้อมูลอัปเดตล่าสุดจาก property service
    const lastUpdatedNmsProp = documentProperties.getProperty("last_updated_4g") || documentProperties.getProperty("last_updated_esight") || lastUpdated;
    const lastUpdatedNmsTimeProp = documentProperties.getProperty("last_updated_time_4g") || documentProperties.getProperty("last_updated_time_esight") || lastUpdatedTime;
    const lastUpdatedScadaProp = documentProperties.getProperty("last_updated_scada") || lastUpdatedNmsProp;
    const lastUpdatedScadaTimeProp = documentProperties.getProperty("last_updated_time_scada") || lastUpdatedNmsTimeProp;

    const finalScadaDate = sheetScadaUpdated || lastUpdatedScadaProp;
    const finalScadaTime = sheetScadaUpdatedTime || lastUpdatedScadaTimeProp;
    const finalNmsDate = sheetNmsUpdated || lastUpdatedNmsProp;
    const finalNmsTime = sheetNmsUpdatedTime || lastUpdatedNmsTimeProp;

    // 1. ดึงและวิเคราะห์ข้อมูลจากชีต สรุป
    let plan_installed = 0;
    let nms_total = 0;
    let nms_online = 0;
    let nms_offline = 0;
    let scada_total = 0;
    let scada_online = 0;
    let scada_failed = 0;
    let scada_remove = 0;

    for (let i = 0; i < summaryValues.length; i++) {
      const row = summaryValues[i];
      const item = String(row[1] || "").trim();
      const count = parseFloat(row[2]) || 0;
      
      if (item.indexOf("จำนวนติดตั้ง") !== -1) {
        plan_installed = count;
      } else if (item === "Total") {
        nms_total = count;
      } else if (item === "Online") {
        nms_online = count;
      } else if (item === "Offline") {
        nms_offline = count;
      } else if (item.indexOf("E2E") !== -1) {
        scada_total = count;
      } else if (item === "ONLINE") {
        scada_online = count;
      } else if (item === "FAILED") {
        scada_failed = count;
      } else if (item === "REMOVE") {
        scada_remove = count;
      }
    }
    
    // 2. ดึงและวิเคราะห์ข้อมูลรายเขตจากชีต ข้อมูลรายเขต
    const districtHeaders = districtValues[0];
    const codeIdx = findColIdx(districtHeaders, "CODE");
    const nameIdx = findColIdx(districtHeaders, "การไฟฟ้าเขต");
    const planIdx = findColIdx(districtHeaders, "จำนวนติดตั้ง");
    const nmsTotalIdx = findColIdx(districtHeaders, "จำนวน NMS");
    const nmsOnIdx = findColIdx(districtHeaders, "NMS Online");
    const scadaTotalIdx = findColIdx(districtHeaders, "จำนวน SCADA");
    const scadaOnIdx = findColIdx(districtHeaders, "SCADA Online");
    
    if (codeIdx === -1 || nameIdx === -1) {
      throw new Error("โครงสร้างคอลัมน์ในชีต ข้อมูลรายเขต ไม่ถูกต้อง (ต้องมี CODE และ การไฟฟ้าเขต)");
    }
    
    const DISTRICT_MAP = {
      "Bang Bua Thong (BBD)": "บางบัวทอง (BBD)",
      "Bang Kapi (BKD)": "บางกะปิ (BKD)",
      "Bang Khen (BHD)": "บางเขน (BHD)",
      "Bang Khun Thian (BTD)": "บางขุนเทียน (BTD)",
      "Bang Phi (BPD)": "บางพลี (BPD)",
      "Bang Yai (BYD)": "บางใหญ่ (BYD)",
      "Bangna (BND)": "บางนา (BND)",
      "Default": "อื่นๆ / Default",
      "Khlong Toei (KTD)": "คลองเตย (KTD)",
      "Lat Krabang (LKD)": "ลาดกระบัง (LKD)",
      "Min Buri (MBD)": "มีนบุรี (MBD)",
      "Nonthaburi (NBD)": "นนทบุรี (NBD)",
      "Nuan Chan (NCD)": "นวลจันทร์ (NCD)",
      "Ratburana (RBD)": "ราษฎร์บูรณะ (RBD)",
      "Samsen (SSD)": "สามเสน (SSD)",
      "Samut Prakan": "สมุทรปราการ (SPD)",
      "Scada issue": "อื่นๆ / Scada issue",
      "Thon Buri": "ธนบุรี (TBD)",
      "Wat Liab": "วัดเลียบ (WLD)",
      "Yannawa": "ยานนาวา (YND)"
    };
    
    const regions = [];
    
    for (let i = 1; i < districtValues.length; i++) {
      const row = districtValues[i];
      const code = String(row[codeIdx] || "").trim();
      const rawName = String(row[nameIdx] || "").trim();
      
      // ข้ามแถวที่ไม่ถูกต้อง หรือ แถวสรุปยอดรวม (Total) ด้านล่าง
      if (!code || !rawName || code.toLowerCase() === "code" || rawName.toLowerCase() === "total" || rawName.indexOf("รวม") !== -1) {
        continue;
      }
      
      const mappedName = DISTRICT_MAP[rawName] || DISTRICT_MAP[rawName + " (" + code + ")"] || (rawName + " (" + code + ")");
      
      const plan = planIdx !== -1 ? parseFloat(row[planIdx]) || 0 : 0;
      const nmsTotal = nmsTotalIdx !== -1 ? parseFloat(row[nmsTotalIdx]) || 0 : 0;
      const nmsOnline = nmsOnIdx !== -1 ? parseFloat(row[nmsOnIdx]) || 0 : 0;
      const scadaTotal = scadaTotalIdx !== -1 ? parseFloat(row[scadaTotalIdx]) || 0 : 0;
      const scadaOnline = scadaOnIdx !== -1 ? parseFloat(row[scadaOnIdx]) || 0 : 0;
      
      regions.push({
        name: mappedName,
        i4: plan,           // ติดตั้งตามแผน
        o4: nmsTotal,       // จำนวน NMS
        e2e: nmsOnline,     // NMS Online
        sc: scadaOnline,    // SCADA Online
        ih: scadaTotal,     // จำนวน SCADA
        oh: 0
      });
    }
    
    // 3. จัดข้อมูล Offline Breakdown
    const offline = [
      { name: "NMS Portal Offline (ออฟไลน์ระบบหลัก)", val4: nms_offline, valh: 0 },
      { name: "SCADA Connection Failed (SCADA บกพร่อง)", val4: 0, valh: scada_failed },
      { name: "SCADA Device Removed (ถอดออกจากระบบ)", val4: 0, valh: scada_remove }
    ];
    
    // 4. บันทึกผลลัพธ์ใน Config
    const config = {
      //dashboard_title: "4G Router — Online Dashboard",
      org_name: "MEA | M2M",
      rate_all: nms_total > 0 ? (nms_online / nms_total * 100) : 0,
      rate_442: nms_total > 0 ? (nms_online / nms_total * 100) : 0,  // NMS Online Rate
      rate_hyb: scada_total > 0 ? (scada_online / scada_total * 100) : 0, // SCADA Online Rate
      trend_online_all: trendNms,
      trend_online_442: trendNms,
      trend_online_hybrid: trendGoodSignal,
      trend_scada: trendVpn,
      last_updated: finalScadaDate,
      last_updated_time: finalScadaTime,
      last_updated_eSight: finalNmsDate,
      last_updated_time_eSight: finalNmsTime
    };

    return {
      regions: regions,
      config: config,
      offline: offline
    };
    
  } catch (e) {
    throw new Error(e.toString());
  }
}

/**
 * ฟังก์ชันรองรับการนำเข้าข้อมูลจากระบบ Interface Box (NMS)
 */
function importInterfaceBox(data) {
  return importData(data);
}

/**
 * ฟังก์ชันรองรับข้อมูล eSight
 */
function importEsight(data) {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    let sheet = ss.getSheetByName("eSight");
    if (!sheet) {
      sheet = ss.insertSheet("eSight");
    }
    
    if (!data || data.length === 0) {
      throw new Error("ไม่พบข้อมูลในไฟล์");
    }

    const startRow = 1;
    const lastRow = sheet.getLastRow();
    if (lastRow >= startRow) {
      sheet.getRange(startRow, 1, lastRow - startRow + 1, data[0].length).clearContent();
    }

    sheet.getRange(startRow, 1, data.length, data[0].length).setValues(data);

    const now = new Date();
    const formattedDate = Utilities.formatDate(now, TIMEZONE, "dd/MM/yyyy");
    const formattedTime = Utilities.formatDate(now, TIMEZONE, "HH:mm");

    PropertiesService.getDocumentProperties().setProperties({
      "last_updated_esight": formattedDate,
      "last_updated_time_esight": formattedTime
    });

    return { success: true, count: data.length };
  } catch (e) {
    return { success: false, error: e.toString() };
  }
}

/**
 * ฟังก์ชันรองรับข้อมูล SCADA
 */
function importScada(data) {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    let sheet = ss.getSheetByName("SCADA");
    if (!sheet) {
      sheet = ss.insertSheet("SCADA");
    }
    
    if (!data || data.length === 0) {
      throw new Error("ไม่พบข้อมูลในไฟล์");
    }

    const startRow = 1;
    const lastRow = sheet.getLastRow();
    if (lastRow >= startRow) {
      sheet.getRange(startRow, 1, lastRow - startRow + 1, data[0].length).clearContent();
    }

    sheet.getRange(startRow, 1, data.length, data[0].length).setValues(data);

    const now = new Date();
    const formattedDate = Utilities.formatDate(now, TIMEZONE, "dd/MM/yyyy");
    const formattedTime = Utilities.formatDate(now, TIMEZONE, "HH:mm");

    PropertiesService.getDocumentProperties().setProperties({
      "last_updated_scada": formattedDate,
      "last_updated_time_scada": formattedTime
    });

    return { success: true, count: data.length };
  } catch (e) {
    return { success: false, error: e.toString() };
  }
}

function doPost(e) {
  try {
    const body = JSON.parse(e.postData.contents);
    const action = body.action;
    const data   = body.data;

    let result;
    if (action === 'importInterfaceBox') {
      result = importInterfaceBox(data);
    } else if (action === 'importEsight') {
      result = importEsight(data);
    } else if (action === 'importScada') {
      result = importScada(data);
    } else {
      result = { success: false, error: 'Unknown action: ' + action };
    }

    return ContentService
      .createTextOutput(JSON.stringify(result))
      .setMimeType(ContentService.MimeType.JSON);

  } catch (err) {
    return ContentService
      .createTextOutput(JSON.stringify({ success: false, error: err.toString() }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

/**
 * ฟังก์ชันทำงานอัตโนมัติเมื่อมีการแก้ไขข้อมูลใน Spreadsheet (Simple Trigger)
 * ช่วยบันทึกเวลาเมื่อผู้ใช้งานเข้ามาอัปเดตข้อมูลด้วยการ Edit ในชีตโดยตรง
 */
function onEdit(e) {
  try {
    const range = e.range;
    const sheet = range.getSheet();
    const sheetName = sheet.getName();
    
    const now = new Date();
    const formattedDate = Utilities.formatDate(now, TIMEZONE, "dd/MM/yyyy");
    const formattedTime = Utilities.formatDate(now, TIMEZONE, "HH:mm");
    
    const props = PropertiesService.getDocumentProperties();
    
    if (sheetName === "NMS") {
      props.setProperties({
        "last_updated_4g": formattedDate,
        "last_updated_time_4g": formattedTime
      });
    } else if (sheetName === "SCADA") {
      props.setProperties({
        "last_updated_scada": formattedDate,
        "last_updated_time_scada": formattedTime
      });
    } else if (sheetName === "eSight") {
      props.setProperties({
        "last_updated_esight": formattedDate,
        "last_updated_time_esight": formattedTime
      });
    }
  } catch (err) {
    Logger.log("onEdit error: " + err.toString());
  }
}
