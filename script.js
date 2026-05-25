const CONFIG = {
  // Paste your deployed Google Apps Script Web App URL here.
  APPS_SCRIPT_URL: "https://script.google.com/macros/s/AKfycbxtC662dXjvbDLRXU5iKl0ZqsckvmabWawRxT7GHwOCih1pYTYBXmRzT7JdLZBTFPxM/exec"
};

const NODE_FIELDS = [
  ["crq", "CRQ"],
  ["crqCreateDate", "CRQ Create Date"],
  ["workArea", "Work Area"],
  ["finalTier", "Final Tier"],
  ["teamLeader", "Team Leader"],
  ["engineerNumber", "Engineer Number"],
  ["productName", "Product Name"],
  ["city", "City"],
  ["state", "State"],
  ["tngCircle", "TNG Circle"],
  ["region", "Region"],
  ["address", "Address"]
];

const OBSERVATION_REMARKS = [
  "Device found healthy after PMT activity",
  "Device cleaning completed",
  "Fan cleaning completed",
  "Air filter cleaning completed",
  "Cable dressing required",
  "Deep cleaning required at site",
  "Rust observed on rack or device",
  "Filler tray missing",
  "SFP cap missing",
  "Earthing issue observed",
  "Temperature found high",
  "AC not working",
  "Back space not available",
  "Photos not allowed by site team",
  "Signature not available"
];

let currentNode = {};

document.addEventListener("DOMContentLoaded", () => {
  renderNodeInfoShell();
  seedNumberDropdowns();
  seedRemarks();
  setupDropdownFlow();
  setupForms();
  setupConveyance();
});

function appsScriptReady() {
  return CONFIG.APPS_SCRIPT_URL && !CONFIG.APPS_SCRIPT_URL.includes("PASTE_YOUR");
}

async function apiGet(action, params = {}) {
  if (!appsScriptReady()) {
    throw new Error("Paste your Apps Script /exec URL in script.js first.");
  }

  const data = await jsonpRequest(action, params);
  if (data.error) throw new Error(data.error || "Google Sheet request failed.");
  return data;
}

async function apiPost(payload) {
  if (!appsScriptReady()) {
    throw new Error("Paste your Apps Script /exec URL in script.js first.");
  }

  await fetch(CONFIG.APPS_SCRIPT_URL, {
    method: "POST",
    mode: "no-cors",
    headers: { "Content-Type": "text/plain" },
    body: JSON.stringify({ action: "submitData", ...payload })
  });

  // Apps Script does not expose CORS headers, so no-cors responses are opaque.
  // The request is still sent; keep a local copy as a backup.
  return { success: true };
}

function jsonpRequest(action, params = {}) {
  return new Promise((resolve, reject) => {
    const callbackName = "pmtJsonp_" + Date.now() + "_" + Math.random().toString(36).slice(2);
    const script = document.createElement("script");
    const url = new URL(CONFIG.APPS_SCRIPT_URL);
    const timer = window.setTimeout(() => {
      cleanup();
      reject(new Error("Google Sheet request timed out."));
    }, 20000);

    url.searchParams.set("action", action);
    url.searchParams.set("callback", callbackName);
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null) url.searchParams.set(key, value);
    });

    window[callbackName] = data => {
      cleanup();
      resolve(data || {});
    };

    script.onerror = () => {
      cleanup();
      reject(new Error("Unable to load Apps Script API. Check deployment access and URL."));
    };

    script.src = url.toString();
    document.body.appendChild(script);

    function cleanup() {
      window.clearTimeout(timer);
      delete window[callbackName];
      script.remove();
    }
  });
}

function setupDropdownFlow() {
  const dateInput = document.getElementById("completeDate");
  const engineerSelect = document.getElementById("engineerSelect");
  const hostSelect = document.getElementById("hostSelect");
  const refetchBtn = document.getElementById("refetchBtn");

  if (!dateInput || !engineerSelect || !hostSelect) return;

  dateInput.addEventListener("change", () => loadEngineers(dateInput.value));
  engineerSelect.addEventListener("change", () => loadHosts(dateInput.value, engineerSelect.value));
  hostSelect.addEventListener("change", () => {
    if (hostSelect.value) fetchAndRenderNode();
  });
  refetchBtn?.addEventListener("click", fetchAndRenderNode);

  setStatus("Select PMT date to load engineers.", "info");
}

async function loadEngineers(date) {
  const engineerSelect = document.getElementById("engineerSelect");
  const hostSelect = document.getElementById("hostSelect");
  resetSelect(engineerSelect, "Loading engineers...");
  resetSelect(hostSelect, "Select engineer first");
  renderNode({});

  if (!date) {
    resetSelect(engineerSelect, "Select date first");
    return;
  }

  try {
    setLoading(true);
    const data = await apiGet("getEngineers", { date });
    fillSelect(engineerSelect, data.engineers || [], "Select engineer");
    setStatus("Engineer list loaded.", "ok");
  } catch (error) {
    resetSelect(engineerSelect, "No engineers found");
    setStatus(error.message, "error");
  } finally {
    setLoading(false);
  }
}

async function loadHosts(date, engineer) {
  const hostSelect = document.getElementById("hostSelect");
  resetSelect(hostSelect, "Loading hosts...");
  renderNode({});

  if (!date || !engineer) {
    resetSelect(hostSelect, "Select engineer first");
    return;
  }

  try {
    setLoading(true);
    const data = await apiGet("getHosts", { date, engineer });
    fillSelect(hostSelect, data.hosts || [], "Select host");
    setStatus("Host list loaded. Select host and click ReFetch Data.", "ok");
  } catch (error) {
    resetSelect(hostSelect, "No hosts found");
    setStatus(error.message, "error");
  } finally {
    setLoading(false);
  }
}

async function fetchAndRenderNode() {
  const date = document.getElementById("completeDate")?.value || "";
  const engineer = document.getElementById("engineerSelect")?.value || "";
  const host = document.getElementById("hostSelect")?.value || "";

  if (!date || !engineer || !host) {
    setStatus("Select date, engineer, and host before refetching.", "error");
    return;
  }

  try {
    setLoading(true);
    const data = await apiGet("getNode", { date, engineer, host });
    if (!data.node) throw new Error("Data not found for selected date, engineer, and host.");
    renderNode(data.node);
    sessionStorage.setItem("currentNode", JSON.stringify(data.node));
    document.getElementById("checklistCard")?.classList.remove("hidden");
    setStatus("Node information loaded successfully.", "ok");
  } catch (error) {
    renderNode({});
    setStatus(error.message, "error");
  } finally {
    setLoading(false);
  }
}

function renderNodeInfoShell() {
  const nodeInfo = document.getElementById("nodeInfo");
  if (!nodeInfo) return;

  nodeInfo.innerHTML = NODE_FIELDS.map(([key, label]) => `
    <div class="node-item">
      <label for="node-${key}">${label}</label>
      <input id="node-${key}" type="text" data-node-field="${key}" readonly>
    </div>
  `).join("");
  renderNode({});
}

function renderNode(node) {
  currentNode = node || {};
  document.querySelectorAll("[data-node-field]").forEach(input => {
    input.value = currentNode[input.dataset.nodeField] || "";
  });
}

function resetSelect(select, label) {
  if (!select) return;
  select.innerHTML = "";
  select.add(new Option(label, ""));
}

function fillSelect(select, values, placeholder) {
  resetSelect(select, placeholder);
  [...new Set(values.filter(Boolean))].sort().forEach(value => {
    select.add(new Option(value, value));
  });
}

function seedNumberDropdowns() {
  fillRangeSelect("temperatureSelect", 18, 45, "Select temperature");
  fillRangeSelect("acCountSelect", 0, 10, "Select AC count");
  fillRangeSelect("acFaultSelect", 0, 10, "Select count");
}

function fillRangeSelect(id, start, end, placeholder) {
  const select = document.getElementById(id);
  if (!select) return;
  resetSelect(select, placeholder);
  for (let value = start; value <= end; value += 1) {
    select.add(new Option(String(value), String(value)));
  }
}

function seedRemarks() {
  const remarksList = document.getElementById("remarksList");
  if (!remarksList) return;

  remarksList.innerHTML = OBSERVATION_REMARKS.map((remark, index) => `
    <label class="check-option">
      <input type="checkbox" name="finalObservationRemarks" value="${escapeHtml(remark)}">
      <span>${index + 1}. ${escapeHtml(remark)}</span>
    </label>
  `).join("");
}

function setupForms() {
  document.querySelectorAll("form").forEach(form => {
    form.addEventListener("submit", event => {
      event.preventDefault();
      submitCurrentForm(form);
    });

    form.addEventListener("reset", () => {
      setTimeout(() => {
        clearValidation(form);
        renderNode({});
        document.getElementById("checklistCard")?.classList.add("hidden");
        calculateConveyance();
        setStatus("Form cleared.", "info");
      });
    });
  });
}

async function submitCurrentForm(form) {
  clearValidation(form);
  if (!validateForm(form)) {
    setStatus("Please complete the required fields highlighted below.", "error");
    return;
  }

  const submitButton = form.querySelector("button[type='submit']");
  const page = document.body.dataset.page || "form";
  const payload = {
    reportType: page,
    submittedAt: new Date().toISOString(),
    node: currentNode,
    form: serializeForm(form)
  };

  try {
    toggleButton(submitButton, true, "Submitting...");
    await apiPost(payload);
    saveLocalSubmission(payload);
    showToast("Submitted successfully.");
    setStatus("Submitted successfully.", "ok");
    form.reset();
  } catch (error) {
    saveLocalSubmission({ ...payload, offlineError: error.message });
    setStatus(error.message, "error");
    showToast("Saved locally. Submit failed: " + error.message);
  } finally {
    toggleButton(submitButton, false);
  }
}

function validateForm(form) {
  let valid = true;
  form.querySelectorAll("[required]").forEach(field => {
    const wrapper = field.closest(".field");
    const error = wrapper?.querySelector(".field-error");
    if (!field.value) {
      valid = false;
      wrapper?.classList.add("invalid");
      if (error) error.textContent = "This field is required.";
    }
  });
  return valid;
}

function clearValidation(form) {
  form.querySelectorAll(".field.invalid").forEach(field => field.classList.remove("invalid"));
  form.querySelectorAll(".field-error").forEach(error => error.textContent = "");
}

function serializeForm(form) {
  const data = {};
  new FormData(form).forEach((value, key) => {
    if (value instanceof File) {
      value = value.name || "";
    }

    if (data[key] === undefined) data[key] = value;
    else if (Array.isArray(data[key])) data[key].push(value);
    else data[key] = [data[key], value];
  });
  return data;
}

function saveLocalSubmission(payload) {
  const key = "pmtSavedSubmissions";
  const saved = JSON.parse(localStorage.getItem(key) || "[]");
  saved.push(payload);
  localStorage.setItem(key, JSON.stringify(saved));
}

function setupConveyance() {
  if (document.body.dataset.page !== "conveyance") return;

  ["areaType", "kmRoundTrip", "hotelExpense", "otherExpense"].forEach(id => {
    document.getElementById(id)?.addEventListener("input", calculateConveyance);
    document.getElementById(id)?.addEventListener("change", calculateConveyance);
  });

  document.getElementById("addExpenseBtn")?.addEventListener("click", () => {
    calculateConveyance();
    showToast("Expense added to calculation.");
  });

  calculateConveyance();
}

function calculateConveyance() {
  if (document.body.dataset.page !== "conveyance") return;

  const area = document.getElementById("areaType")?.value || "Non-Hill";
  const km = Number(document.getElementById("kmRoundTrip")?.value || 0);
  const hotel = Number(document.getElementById("hotelExpense")?.value || 0);
  const other = Number(document.getElementById("otherExpense")?.value || 0);
  const rate = area === "Hill" ? 4 : 3;
  const kmCharge = km * rate;
  const da = km >= 140 ? 250 : 0;
  const total = kmCharge + da + hotel + other;
  const breakdown = { area, rate, km, kmCharge, da, hotel, other, total };

  setText("kmCharge", formatCurrency(kmCharge));
  setText("daCharge", formatCurrency(da));
  setText("hotelCharge", formatCurrency(hotel));
  setText("otherCharge", formatCurrency(other));
  setText("rateText", `₹${rate}/km`);
  setText("totalAmount", formatCurrency(total));

  const hidden = document.getElementById("calculationJson");
  if (hidden) hidden.value = JSON.stringify(breakdown);
}

function setText(id, value) {
  const element = document.getElementById(id);
  if (element) element.textContent = value;
}

function formatCurrency(value) {
  return "₹" + Number(value || 0).toLocaleString("en-IN", {
    maximumFractionDigits: 2
  });
}

function setStatus(message, type = "info") {
  const status = document.querySelector("[data-status]");
  if (!status) return;
  status.className = "status-bar" + (type === "info" ? "" : " " + type);
  status.textContent = message;
}

function setLoading(isLoading) {
  document.querySelectorAll("[data-loader]").forEach(loader => {
    loader.hidden = !isLoading;
  });
}

function toggleButton(button, disabled, text) {
  if (!button) return;
  if (!button.dataset.originalText) button.dataset.originalText = button.textContent;
  button.disabled = disabled;
  button.textContent = disabled ? text : button.dataset.originalText;
}

function showToast(message) {
  const toast = document.getElementById("toast");
  if (!toast) return;
  toast.textContent = message;
  toast.classList.add("show");
  window.clearTimeout(showToast.timer);
  showToast.timer = window.setTimeout(() => toast.classList.remove("show"), 3800);
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
