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
const statOverlap = document.getElementById("stat-overlap");
const statUniqueResult = document.getElementById("stat-unique-result");

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
  const uniqueMap = new Map(); // Use Map to deduplicate final result by email

  // 1. Process File A
  // Keep row IF email is NOT in B
  fileAData.forEach((row) => {
    const email = getEmail(row);
    if (email) {
      if (emailsB_Set.has(email)) {
        overlapCount++; // It's common, so we toss it
      } else {
        // Unique to A
        if (!uniqueMap.has(email)) {
          uniqueMap.set(email, row);
        }
      }
    }
  });

  // 2. Process File B
  // Keep row IF email is NOT in A
  fileBData.forEach((row) => {
    const email = getEmail(row);
    if (email) {
      if (emailsA_Set.has(email)) {
        overlapCount++; // It's common, so we toss it
      } else {
        // Unique to B
        // Check if we already have it (internal duplicates in B)
        if (!uniqueMap.has(email)) {
          uniqueMap.set(email, row);
        }
      }
    }
  });

  const uniqueRows = Array.from(uniqueMap.values());

  statOverlap.textContent = overlapCount.toLocaleString();
  statUniqueResult.textContent = uniqueRows.length.toLocaleString();

  if (uniqueRows.length === 0 && overlapCount === 0) {
    addLog("No valid data found in comparison.", "error");
    return;
  }

  if (uniqueRows.length === 0) {
    addLog(
      "Analysis Complete. Files are identical (all records overlap).",
      "warning",
    );
    addLog(`Removed ${overlapCount} common records.`, "warning");
    // Still allow download? No, empty.
  } else {
    addLog(`Analysis Complete.`);
    addLog(`Removed ${overlapCount} common overlapping records.`, "warning");
    addLog(
      `Identified ${uniqueRows.length} exclusive unique emails.`,
      "success",
    );
    prepareChunks(uniqueRows);
  }
}

function prepareChunks(rows) {
  const CHUNK_SIZE = 4999;
  splitChunks = [];
  for (let i = 0; i < rows.length; i += CHUNK_SIZE) {
    splitChunks.push(rows.slice(i, i + CHUNK_SIZE));
  }

  addLog(`Split into ${splitChunks.length} chunks.`);

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
