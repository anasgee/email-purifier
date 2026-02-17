// Initialize Lucide icons
lucide.createIcons();

// Elements
const dropZoneA = document.getElementById("drop-zone-a");
const dropZoneB = document.getElementById("drop-zone-b");
const fileInputA = document.getElementById("file-input-a");
const fileInputB = document.getElementById("file-input-b");
const btnSelectA = document.getElementById("btn-select-a");
const btnSelectB = document.getElementById("btn-select-b");
const fileAName = document.getElementById("file-a-name");
const fileBName = document.getElementById("file-b-name");
const startCompareBtn = document.getElementById("start-compare-btn");
const resetBtn = document.getElementById("reset-btn");

const compareView = document.getElementById("compare-view");
const processingView = document.getElementById("processing-view");
const logContent = document.getElementById("log-content");
const downloadWaiting = document.getElementById("download-waiting");
const downloadReady = document.getElementById("download-ready");
const statusText = document.getElementById("status-text");
const statusIconContainer = document.getElementById("status-icon-container");
// Download Buttons
const dlAFull = document.getElementById("dl-a-full");
const dlAZip = document.getElementById("dl-a-zip");
const dlBFull = document.getElementById("dl-b-full");
const dlBZip = document.getElementById("dl-b-zip");
const dlAllFull = document.getElementById("dl-all-full");
const dlAllZip = document.getElementById("dl-all-zip");

// DOM Elements for Stats
const statTotalA = document.getElementById("stat-total-a");
const statTotalB = document.getElementById("stat-total-b");
const statUniqueA = document.getElementById("stat-unique-a");
const statUniqueB = document.getElementById("stat-unique-b");
const statSkipped = document.getElementById("stat-skipped");
const statUniqueTotal = document.getElementById("stat-unique-total");
const statInvalidA = document.getElementById("stat-invalid-a");
const statInvalidB = document.getElementById("stat-invalid-b");
const statInvalidTotal = document.getElementById("stat-invalid-total");

// State
let fileA = null;
let fileB = null;
let fileAData = [];
let fileBData = [];
let uniqueARows = [];
let uniqueBRows = [];
let splitChunks = [];

// Event Listeners
btnSelectA.addEventListener("click", () => fileInputA.click());
btnSelectB.addEventListener("click", () => fileInputB.click());

fileInputA.addEventListener("change", (e) =>
  handleSelect(e.target.files[0], "A"),
);
fileInputB.addEventListener("change", (e) =>
  handleSelect(e.target.files[0], "B"),
);

function setupDropZone(zone, input, side) {
  zone.addEventListener("dragover", (e) => {
    e.preventDefault();
    zone.classList.add("active");
  });
  zone.addEventListener("dragleave", (e) => {
    e.preventDefault();
    zone.classList.remove("active");
  });
  zone.addEventListener("drop", (e) => {
    e.preventDefault();
    zone.classList.remove("active");
    if (e.dataTransfer.files.length)
      handleSelect(e.dataTransfer.files[0], side);
  });
}
setupDropZone(dropZoneA, fileInputA, "A");
setupDropZone(dropZoneB, fileInputB, "B");

async function handleSelect(file, side) {
  if (!file) return;
  if (!file.name.endsWith(".csv")) {
    alert("Please select a valid CSV file.");
    return;
  }

  const nameEl = side === "A" ? fileAName : fileBName;
  const zone = side === "A" ? dropZoneA : dropZoneB;

  // Show Loading State
  nameEl.innerHTML = `Analyzing ${file.name}... <i data-lucide="loader-2" class="spin"></i>`;
  lucide.createIcons();

  try {
    // Immediate Parse
    const data = await parseFile(file);

    // Quick Pre-analysis
    let valid = 0;
    let invalid = 0;
    const seen = new Set();
    let dups = 0;

    data.forEach((row) => {
      const email = getEmail(row);
      if (!email) {
        invalid++;
      } else {
        if (seen.has(email)) {
          dups++;
        } else {
          seen.add(email);
          valid++;
        }
      }
    });

    // Update UI with Detail
    const color = side === "A" ? "var(--accent-primary)" : "#f59e0b"; // Blue for A, Orange/Gold for B

    let html = `<span style="font-weight:bold; color:${color}">${file.name}</span><br>`;
    html += `<span style="font-size:0.85rem; color:#888;">`;
    html += `Total: <b>${data.length.toLocaleString()}</b> | `;
    html += `Valid: <b style="color:${color}">${valid.toLocaleString()}</b><br>`;
    html += `Invalid: ${invalid > 0 ? `<span style='color:var(--accent-error)'>${invalid}</span>` : "0"} | `;
    html += `Dups: ${dups > 0 ? `<span style='color:var(--accent-error)'>${dups}</span>` : "0"}`;
    html += `</span>`;

    nameEl.innerHTML = html;

    // Store Data
    if (side === "A") {
      fileA = file;
      fileAData = data;
      dropZoneA.style.borderColor = "var(--accent-primary)";
      dropZoneA.style.backgroundColor = "rgba(0, 255, 136, 0.05)";
    } else {
      fileB = file;
      fileBData = data;
      dropZoneB.style.borderColor = "#f59e0b";
      dropZoneB.style.backgroundColor = "rgba(245, 158, 11, 0.05)";
    }

    // Enable Run Button if both ready
    if (fileAData.length > 0 && fileBData.length > 0) {
      startCompareBtn.disabled = false;
      startCompareBtn.style.opacity = "1";
      startCompareBtn.style.cursor = "pointer";
    }
  } catch (err) {
    console.error(err);
    nameEl.textContent = `Error reading file: ${err.message}`;
    nameEl.style.color = "var(--accent-error)";
  }
}

startCompareBtn.addEventListener("click", startComparison);

resetBtn.addEventListener("click", () => {
  window.location.reload();
});

dlAFull.addEventListener("click", () =>
  downloadFullCSV(uniqueARows, "unique_file_A"),
);
dlAZip.addEventListener("click", () =>
  downloadChunkedZip(uniqueARows, "unique_file_A_chunks"),
);
dlBFull.addEventListener("click", () =>
  downloadFullCSV(uniqueBRows, "unique_file_B"),
);
dlBZip.addEventListener("click", () =>
  downloadChunkedZip(uniqueBRows, "unique_file_B_chunks"),
);
dlAllFull.addEventListener("click", () =>
  downloadFullCSV([...uniqueARows, ...uniqueBRows], "unique_combined"),
);
dlAllZip.addEventListener("click", () =>
  downloadChunkedZip(
    [...uniqueARows, ...uniqueBRows],
    "unique_combined_chunks",
  ),
);

// Logic
async function startComparison() {
  // Check if data is loaded
  if (!fileAData.length || !fileBData.length) {
    alert("Please upload valid files first.");
    return;
  }

  // UI Switch
  compareView.classList.add("hidden");
  processingView.classList.remove("hidden");
  processingView.classList.add("flex-col");

  setStatus("processing");
  addLog(`Starting comparison...`);

  // We already parsed in handleSelect, so just populate Stats and Run
  statTotalA.textContent = fileAData.length.toLocaleString();
  statTotalB.textContent = fileBData.length.toLocaleString();

  setTimeout(() => {
    try {
      performExclusiveCompare();
    } catch (err) {
      addLog(`Error: ${err.message}`, "error");
      setStatus("error");
    }
  }, 500); // Small delay to allow UI to switch
}

function parseFile(file) {
  return new Promise((resolve, reject) => {
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => resolve(results.data),
      error: (err) => reject(err),
    });
  });
}

function getEmail(row) {
  if (!row) return null;
  // Simple heuristic to find email column if not standard
  const keys = Object.keys(row);
  const emailKey = keys.find(
    (k) =>
      k.toLowerCase().includes("email") || k.toLowerCase().includes("e-mail"),
  );
  if (emailKey && row[emailKey])
    return row[emailKey].toString().toLowerCase().trim();
  return null;
}

function performExclusiveCompare() {
  addLog("Analysis Started...", "info");

  // --- Pre-Process File A ---
  const emailsA_Map = new Map(); // Email -> Row
  let invalidA = 0;
  let duplicatesA = 0;

  fileAData.forEach((row) => {
    const email = getEmail(row);
    if (!email) {
      invalidA++;
    } else {
      if (emailsA_Map.has(email)) {
        duplicatesA++;
      } else {
        emailsA_Map.set(email, row);
      }
    }
  });

  addLog(`[File A Stats] Total Rows: ${fileAData.length}`, "info");
  if (invalidA > 0)
    addLog(`[File A] Removed ${invalidA} invalid/empty email rows.`, "warning");
  if (duplicatesA > 0)
    addLog(
      `[File A] Removed ${duplicatesA} internal duplicate rows.`,
      "warning",
    );
  addLog(
    `[File A] Valid Unique Emails to Compare: ${emailsA_Map.size}`,
    "success",
  );

  // --- Pre-Process File B ---
  const emailsB_Map = new Map(); // Email -> Row
  let invalidB = 0;
  let duplicatesB = 0;

  fileBData.forEach((row) => {
    const email = getEmail(row);
    if (!email) {
      invalidB++;
    } else {
      if (emailsB_Map.has(email)) {
        duplicatesB++;
      } else {
        emailsB_Map.set(email, row);
      }
    }
  });

  addLog(`[File B Stats] Total Rows: ${fileBData.length}`, "info");
  if (invalidB > 0)
    addLog(`[File B] Removed ${invalidB} invalid/empty email rows.`, "warning");
  if (duplicatesB > 0)
    addLog(
      `[File B] Removed ${duplicatesB} internal duplicate rows.`,
      "warning",
    );
  addLog(
    `[File B] Valid Unique Emails to Compare: ${emailsB_Map.size}`,
    "success",
  );

  // --- Comparison Logic ---
  addLog("Comparing valid unique sets...", "info");

  let overlapCount = 0;
  let uniqueACount = 0;
  let uniqueBCount = 0;

  const uniqueAMap = new Map();
  const uniqueBMap = new Map();
  const skippedLog = [];

  // 1. Check A against B
  emailsA_Map.forEach((row, email) => {
    if (emailsB_Map.has(email)) {
      overlapCount++;
      skippedLog.push({ email, reason: "Common in B", source: "File A" });
    } else {
      uniqueACount++;
      uniqueAMap.set(email, transformRow(row, email));
    }
  });

  // 2. Check B against A
  emailsB_Map.forEach((row, email) => {
    if (emailsA_Map.has(email)) {
      // Already counted overlap in A loop.
    } else {
      uniqueBCount++;
      uniqueBMap.set(email, transformRow(row, email));
    }
  });

  // Store results separately for download
  uniqueARows = Array.from(uniqueAMap.values());
  uniqueBRows = Array.from(uniqueBMap.values());
  const finalData = [...uniqueARows, ...uniqueBRows];

  // Update Stats UI
  statSkipped.textContent = overlapCount.toLocaleString(); // Matches "Emails in both"
  statUniqueA.textContent = uniqueACount.toLocaleString();
  statUniqueB.textContent = uniqueBCount.toLocaleString();
  statUniqueTotal.textContent = finalData.length.toLocaleString();

  const totalInvalid = invalidA + duplicatesA + invalidB + duplicatesB;
  statInvalidA.textContent = (invalidA + duplicatesA).toLocaleString();
  statInvalidB.textContent = (invalidB + duplicatesB).toLocaleString();
  statInvalidTotal.textContent = totalInvalid.toLocaleString();

  // Logic: Show Logs
  if (skippedLog.length > 0) {
    addLog(`Found ${overlapCount} common emails (present in both).`, "warning");
    addLog(`--- SKIP DETAILS START ---`, "info");

    const MAX_LOG = 100;
    skippedLog.slice(0, MAX_LOG).forEach((item) => {
      addLog(`[SKIP] ${item.email} (Found in both files)`, "warning");
    });

    if (skippedLog.length > MAX_LOG) {
      addLog(
        `... and ${skippedLog.length - MAX_LOG} more skipped records.`,
        "info",
      );
    }
    addLog(`--- SKIP DETAILS END ---`, "info");
  } else {
    addLog(`No common overlap found between the validation sets.`, "success");
  }

  // Final Summary
  if (finalData.length === 0) {
    addLog("Analysis Complete. No unique records found.", "warning");
    setStatus("complete");
    downloadWaiting.classList.add("hidden");
    addLog("Result is empty. Nothing to download.", "info");
  } else {
    addLog(`Comparison Complete.`, "success");
    addLog(`Unique records from A: ${uniqueACount}`, "success");
    addLog(`Unique records from B: ${uniqueBCount}`, "success");
    prepareChunks(finalData);
  }
}

function transformRow(row, email) {
  let firstName = "Applicant";
  let lastName = "Applicant";

  // Try to find Name column
  const keys = Object.keys(row);

  // Check for explicit First/Last
  const keyFirst = keys.find(
    (k) => k.toLowerCase().replace(/[^a-z]/g, "") === "firstname",
  );
  const keyLast = keys.find(
    (k) => k.toLowerCase().replace(/[^a-z]/g, "") === "lastname",
  );

  if (keyFirst && row[keyFirst]) firstName = row[keyFirst];
  if (keyLast && row[keyLast]) lastName = row[keyLast];

  // If still defaults, check "Name" or "Full Name"
  if (firstName === "Applicant" && lastName === "Applicant") {
    const keyName = keys.find((k) =>
      ["name", "fullname", "full name"].includes(k.toLowerCase().trim()),
    );
    if (keyName && row[keyName]) {
      const parts = row[keyName].trim().split(/\s+/);
      if (parts.length > 0) {
        firstName = parts[0];
        if (parts.length > 1) {
          lastName = parts.slice(1).join(" ");
        }
      }
    }
  }

  return {
    "First Name": firstName,
    "Last Name": lastName,
    Email: email,
  };
}

function prepareChunks(rows) {
  addLog(`Total unique records: ${rows.length}`);
  addLog(`Unique A: ${uniqueARows.length} | Unique B: ${uniqueBRows.length}`);

  downloadWaiting.classList.add("hidden");
  downloadReady.classList.remove("hidden");
  setStatus("complete");
  triggerConfetti();
}

// Download: Full CSV (single file)
function downloadFullCSV(rows, filename) {
  if (!rows || rows.length === 0) {
    alert("No data to download.");
    return;
  }
  const csv = Papa.unparse(rows);
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${filename}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// Download: Chunked ZIP (4999 per file)
function formatK(num) {
  if (num >= 1000) return num / 1000 + "K";
  return num.toString();
}

function downloadChunkedZip(rows, filename) {
  if (!rows || rows.length === 0) {
    alert("No data to download.");
    return;
  }

  const CHUNK_SIZE = 4999;
  const zip = new JSZip();

  for (let i = 0; i < rows.length; i += CHUNK_SIZE) {
    const chunk = rows.slice(i, i + CHUNK_SIZE);
    const batchIndex = Math.floor(i / CHUNK_SIZE);
    const startLabel = batchIndex === 0 ? "1" : formatK(batchIndex * 5000);
    const endLabel = formatK((batchIndex + 1) * 5000);
    const chunkName = `SDP-${startLabel}-${endLabel} Data Import.csv`;
    const csv = Papa.unparse(chunk);
    zip.file(chunkName, csv);
  }

  zip.generateAsync({ type: "blob" }).then(function (content) {
    const url = URL.createObjectURL(content);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${filename}.zip`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  });
}

// UI Helpers
function setStatus(status) {
  let iconHtml = "";
  let text = "";

  if (status === "processing") {
    iconHtml =
      '<i data-lucide="loader-2" class="text-accent" style="animation: spin 1s infinite"></i>';
    text = "Analyzing Differences...";
  } else if (status === "complete") {
    iconHtml = '<i data-lucide="check-circle" class="text-success"></i>';
    text = "Comparison Complete";
  } else if (status === "error") {
    iconHtml = '<i data-lucide="ban" class="text-error"></i>';
    text = "Process Interrupted";
  }

  statusIconContainer.innerHTML = iconHtml;
  statusText.textContent = text;
  lucide.createIcons();
}

function addLog(msg, type = "info") {
  const div = document.createElement("div");
  div.className = "log-item";
  const time = new Date().toLocaleTimeString();
  let colorClass = "";
  if (type === "error") colorClass = 'style="color: var(--accent-error)"';
  if (type === "success") colorClass = 'style="color: var(--accent-success)"';
  if (type === "warning") colorClass = 'style="color: #f59e0b"';

  div.innerHTML = `<span style="color: #555; margin-right: 8px;">[${time}]</span><span ${colorClass}>${msg}</span>`;
  logContent.appendChild(div);
  logContent.scrollTop = logContent.scrollHeight;
}

function triggerConfetti() {
  const duration = 3000;
  const animationEnd = Date.now() + duration;
  const defaults = { startVelocity: 30, spread: 360, ticks: 60, zIndex: 0 };
  const randomInRange = (min, max) => Math.random() * (max - min) + min;

  const interval = setInterval(function () {
    const timeLeft = animationEnd - Date.now();
    if (timeLeft <= 0) return clearInterval(interval);
    const particleCount = 50 * (timeLeft / duration);
    confetti({
      ...defaults,
      particleCount,
      origin: { x: randomInRange(0.1, 0.3), y: Math.random() - 0.2 },
    });
    confetti({
      ...defaults,
      particleCount,
      origin: { x: randomInRange(0.7, 0.9), y: Math.random() - 0.2 },
    });
  }, 250);
}
