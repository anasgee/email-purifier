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
const downloadResultBtn = document.getElementById("download-result-btn");

// DOM Elements for Stats
const statTotalA = document.getElementById("stat-total-a");
const statTotalB = document.getElementById("stat-total-b");
const statUniqueA = document.getElementById("stat-unique-a");
const statUniqueB = document.getElementById("stat-unique-b");
const statSkipped = document.getElementById("stat-skipped");

// State
let fileA = null;
let fileB = null;
let fileAData = [];
let fileBData = [];
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

function handleSelect(file, side) {
  if (!file) return;
  if (!file.name.endsWith(".csv")) {
    alert("Please select a valid CSV file.");
    return;
  }

  if (side === "A") {
    fileA = file;
    fileAName.textContent = file.name;
    fileAName.style.color = "var(--accent-primary)";
  } else {
    fileB = file;
    fileBName.textContent = file.name;
    fileBName.style.color = "var(--accent-primary)";
  }

  if (fileA && fileB) {
    startCompareBtn.disabled = false;
    startCompareBtn.style.opacity = "1";
    startCompareBtn.style.cursor = "pointer";
  }
}

startCompareBtn.addEventListener("click", startComparison);

resetBtn.addEventListener("click", () => {
  window.location.reload();
});

downloadResultBtn.addEventListener("click", downloadSplitZip);

// Logic
async function startComparison() {
  // UI Switch
  compareView.classList.add("hidden");
  processingView.classList.remove("hidden");
  processingView.classList.add("flex-col");

  setStatus("processing");
  addLog(`Starting comparison...`);

  try {
    // Parse File A
    addLog(`Reading File A: ${fileA.name}...`);
    fileAData = await parseFile(fileA);
    addLog(`File A Rows: ${fileAData.length}`);
    statTotalA.textContent = fileAData.length.toLocaleString();

    // Parse File B
    addLog(`Reading File B: ${fileB.name}...`);
    fileBData = await parseFile(fileB);
    addLog(`File B Rows: ${fileBData.length}`);
    statTotalB.textContent = fileBData.length.toLocaleString();

    // Analyze
    performExclusiveCompare();
  } catch (err) {
    addLog(`Error: ${err.message}`, "error");
    setStatus("error");
  }
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
  addLog("Analyzing dataset for overlaps...", "info");

  // sets for fast lookup of existence
  const emailsA_Set = new Set();
  fileAData.forEach((row) => {
    const email = getEmail(row);
    if (email) emailsA_Set.add(email);
  });

  const emailsB_Set = new Set();
  fileBData.forEach((row) => {
    const email = getEmail(row);
    if (email) emailsB_Set.add(email);
  });

  let overlapCount = 0;
  let uniqueACount = 0;
  let uniqueBCount = 0;

  const uniqueRows = new Map(); // deduplicated result map
  const skippedLog = [];

  // 1. Process File A
  fileAData.forEach((row) => {
    const email = getEmail(row);
    if (email) {
      if (emailsB_Set.has(email)) {
        overlapCount++;
        skippedLog.push({ email, reason: "Common in B", source: "File A" });
      } else {
        // Unique to A
        if (!uniqueRows.has(email)) {
          uniqueACount++;
          uniqueRows.set(email, transformRow(row, email));
        }
      }
    }
  });

  // 2. Process File B
  fileBData.forEach((row) => {
    const email = getEmail(row);
    if (email) {
      if (emailsA_Set.has(email)) {
        overlapCount++;
        skippedLog.push({ email, reason: "Common in A", source: "File B" });
      } else {
        // Unique to B
        if (!uniqueRows.has(email)) {
          uniqueBCount++;
          uniqueRows.set(email, transformRow(row, email));
        }
      }
    }
  });

  const finalData = Array.from(uniqueRows.values());

  // Update Stats UI
  statSkipped.textContent = overlapCount.toLocaleString();
  statUniqueA.textContent = uniqueACount.toLocaleString();
  statUniqueB.textContent = uniqueBCount.toLocaleString();

  // Logic: Show Logs
  if (skippedLog.length > 0) {
    addLog(`Skipped ${overlapCount} overlapping records.`, "warning");
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
  }

  if (finalData.length === 0) {
    addLog("Analysis Complete. No unique records found.", "warning");
  } else {
    addLog(`Analysis Complete.`, "success");
    addLog(`Unique to File A: ${uniqueACount}`, "success");
    addLog(`Unique to File B: ${uniqueBCount}`, "success");
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
  const CHUNK_SIZE = 4999;
  splitChunks = [];
  for (let i = 0; i < rows.length; i += CHUNK_SIZE) {
    splitChunks.push(rows.slice(i, i + CHUNK_SIZE));
  }

  addLog(`Formatted and Split into ${splitChunks.length} chunks.`);

  downloadWaiting.classList.add("hidden");
  downloadReady.classList.remove("hidden");
  setStatus("complete");
  triggerConfetti();
}

function downloadSplitZip() {
  if (splitChunks.length === 0) return;

  const zip = new JSZip();

  splitChunks.forEach((chunk, index) => {
    const csv = Papa.unparse(chunk);
    const start = index * 4999 + 1;
    const end = start + chunk.length - 1;
    zip.file(`unique_contacts_batch_${index + 1}.csv`, csv);
  });

  zip.generateAsync({ type: "blob" }).then(function (content) {
    const url = URL.createObjectURL(content);
    const a = document.createElement("a");
    a.href = url;
    a.download = "exclusive_contacts_comparison.zip";
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
