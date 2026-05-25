/*
  PMT Observation Report Q4 AMJ'26 - Google Apps Script Backend

  Deploy:
  1. Paste this file into Apps Script.
  2. Set SPREADSHEET_ID below.
  3. Deploy as Web App.
  4. Copy the Web App /exec URL into script.js.
*/

const SPREADSHEET_ID = "PASTE_YOUR_SPREADSHEET_ID_HERE";
const SHEET_NAME = "Sheet1";
const SUBMISSION_SHEET = "PMT_Submissions";

const NODE_FIELDS = [
  "crq",
  "crqCreateDate",
  "workArea",
  "finalTier",
  "teamLeader",
  "engineerNumber",
  "productName",
  "city",
  "state",
  "tngCircle",
  "region",
  "address"
];

function doGet(e) {
  try {
    const params = e.parameter || {};
    const action = params.action || "";

    if (action === "getEngineers") {
      return json({
        success: true,
        engineers: getEngineers(params.date)
      });
    }

    if (action === "getHosts") {
      return json({
        success: true,
        hosts: getHosts(params.date, params.engineer)
      });
    }

    if (action === "getNode") {
      return json({
        success: true,
        node: getNode(params.date, params.engineer, params.host)
      });
    }

    return json({
      success: false,
      error: "Invalid action. Use getEngineers, getHosts, or getNode."
    });
  } catch (error) {
    return json({
      success: false,
      error: error.message
    });
  }
}

function doPost(e) {
  try {
    const body = JSON.parse((e.postData && e.postData.contents) || "{}");

    if (body.action !== "submitData") {
      return json({
        success: false,
        error: "Invalid action. Use submitData."
      });
    }

    return json(submitData(body));
  } catch (error) {
    return json({
      success: false,
      error: error.message
    });
  }
}

function getEngineers(date) {
  const rows = getSourceRows();
  return unique(
    rows
      .filter(row => sameDate(row.pmtCompleteDate, date) || sameDate(row.activityDate, date))
      .map(row => row.engineerName)
  );
}

function getHosts(date, engineer) {
  const rows = getSourceRows();
  return unique(
    rows
      .filter(row => sameDate(row.pmtCompleteDate, date) || sameDate(row.activityDate, date))
      .filter(row => normalize(row.engineerName) === normalize(engineer))
      .map(row => row.hostName)
  );
}

function getNode(date, engineer, host) {
  const rows = getSourceRows();
  const node = rows.find(row => {
    const dateMatches = sameDate(row.pmtCompleteDate, date) || sameDate(row.activityDate, date);
    const engineerMatches = normalize(row.engineerName) === normalize(engineer);
    const hostMatches = normalize(row.hostName) === normalize(host);
    return dateMatches && engineerMatches && hostMatches;
  });

  return node || null;
}

function submitData(body) {
  const sheet = getOrCreateSheet(SUBMISSION_SHEET);
  ensureSubmissionHeader(sheet);

  const node = body.node || {};
  const form = body.form || {};

  sheet.appendRow([
    new Date(),
    body.reportType || "",
    form.email || "",
    form.pmtCompleteDate || form.activityDate || "",
    form.pmtCompleteTime || "",
    form.engineerName || "",
    form.hostName || "",
    ...NODE_FIELDS.map(field => node[field] || ""),
    JSON.stringify(form),
    JSON.stringify(node)
  ]);

  return {
    success: true,
    message: "Submission saved successfully."
  };
}

function getSourceRows() {
  const sheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(SHEET_NAME);
  if (!sheet) {
    throw new Error('Sheet "' + SHEET_NAME + '" was not found.');
  }

  const values = sheet.getDataRange().getValues();
  if (values.length < 2) return [];

  const headers = values.shift();
  return values
    .map(row => mapRow(headers, row))
    .filter(row => row.hostName);
}

function mapRow(headers, row) {
  const raw = {};
  headers.forEach((header, index) => {
    raw[String(header || "").trim()] = row[index];
  });

  return {
    pmtCompleteDate: pick(raw, ["PMT Complete Date", "Complete Date", "Date", "Activity Date"]),
    activityDate: pick(raw, ["Activity Date", "PMT Complete Date", "Complete Date", "Date"]),
    engineerName: pick(raw, ["Engineer Name", "Engineer", "FE Name", "Field Engineer"]),
    hostName: pick(raw, ["Host Name", "Hostname", "Host", "Node Name", "Node"]),
    crq: pick(raw, ["CRQ", "CRQ No", "CRQ Number"]),
    crqCreateDate: pick(raw, ["CRQ Create Date", "CRQ Date", "CRQ Created Date"]),
    workArea: pick(raw, ["Work Area", "Area"]),
    finalTier: pick(raw, ["Final Tier", "Tier"]),
    teamLeader: pick(raw, ["Team Leader", "TL", "Team Lead"]),
    engineerNumber: pick(raw, ["Engineer Number", "Engineer Mobile", "Mobile Number", "FE Number"]),
    productName: pick(raw, ["Product Name", "Product"]),
    city: pick(raw, ["City"]),
    state: pick(raw, ["State"]),
    tngCircle: pick(raw, ["TNG Circle", "Circle"]),
    region: pick(raw, ["Region"]),
    address: pick(raw, ["Address", "Site Address"]),
    raw: raw
  };
}

function ensureSubmissionHeader(sheet) {
  if (sheet.getLastRow() > 0) return;

  sheet.appendRow([
    "Submitted At",
    "Report Type",
    "Email",
    "Date",
    "Time",
    "Engineer Name",
    "Host Name",
    "CRQ",
    "CRQ Create Date",
    "Work Area",
    "Final Tier",
    "Team Leader",
    "Engineer Number",
    "Product Name",
    "City",
    "State",
    "TNG Circle",
    "Region",
    "Address",
    "Form JSON",
    "Node JSON"
  ]);
}

function getOrCreateSheet(name) {
  const spreadsheet = SpreadsheetApp.openById(SPREADSHEET_ID);
  return spreadsheet.getSheetByName(name) || spreadsheet.insertSheet(name);
}

function pick(row, names) {
  const wanted = names.map(normalize);
  const key = Object.keys(row).find(header => wanted.indexOf(normalize(header)) !== -1);
  return key ? normalizeCell(row[key]) : "";
}

function normalizeCell(value) {
  if (Object.prototype.toString.call(value) === "[object Date]") {
    return Utilities.formatDate(value, Session.getScriptTimeZone(), "yyyy-MM-dd");
  }
  return String(value || "").trim();
}

function sameDate(sheetValue, selectedDate) {
  if (!selectedDate) return true;
  if (!sheetValue) return false;

  const left = normalizeDate(sheetValue);
  const right = normalizeDate(selectedDate);
  return left === right;
}

function normalizeDate(value) {
  if (Object.prototype.toString.call(value) === "[object Date]") {
    return Utilities.formatDate(value, Session.getScriptTimeZone(), "yyyy-MM-dd");
  }

  const text = String(value || "").trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;

  const parsed = new Date(text);
  if (!isNaN(parsed.getTime())) {
    return Utilities.formatDate(parsed, Session.getScriptTimeZone(), "yyyy-MM-dd");
  }

  return text;
}

function unique(values) {
  const seen = {};
  return values
    .map(value => String(value || "").trim())
    .filter(Boolean)
    .filter(value => {
      const key = normalize(value);
      if (seen[key]) return false;
      seen[key] = true;
      return true;
    });
}

function normalize(value) {
  return String(value || "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

function json(data) {
  return ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}
