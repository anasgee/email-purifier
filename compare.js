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

  const emailsA = new Map(); // Normalized Email -> Row
  const emailsB = new Set(); // Set of Normalized Emails in B

  // Load A
  fileAData.forEach((row) => {
    const email = getEmail(row);
    if (email) emailsA.set(email, row);
  });

  // Load B
  fileBData.forEach((row) => {
    const email = getEmail(row);
    if (email) emailsB.add(email);
  });

  // Calculate Set Difference: (A - B) U (B - A) ?
  // USER REQUEST: "return only those emails which are not present in those both file A and file B"
  // Clarification: "only be available in either in list a or either in list b" -> XOR (Symmetric Difference)
  // "it should not return those emails which are duplicate [overlap]"

  // Logic:
  // 1. Keep items in A if NOT in B
  // 2. Keep items in B if NOT in A
  // 3. Combine unique A and unique B

  const uniqueRows = [];
  let overlapCount = 0;

  // 1. A - B
  for (const [email, row] of emailsA) {
    if (!emailsB.has(email)) {
      uniqueRows.push(row);
    } else {
      overlapCount++;
    }
  }

  // 2. B - A
  // We need map for B to get rows back? Or just re-iterate fileBData?
  // Using fileBData is safer to get original row structure
  // We need to re-scan file B, check if email is in A (emailsA map).
  // Note: If B has internal duplicates, we handle them?
  // User said "if emails are duplicate... ignore". So we assume unique output per email.

  // To assume efficient check:
  const emailsInUniqueSet = new Set(uniqueRows.map((r) => getEmail(r))); // Init with A-uniques

  fileBData.forEach((row) => {
    const email = getEmail(row);
    if (email) {
      if (!emailsA.has(email)) {
        // It is in B but NOT in A.
        // Check if we already added it (internal B duplicate)
        if (!emailsInUniqueSet.has(email)) {
          uniqueRows.push(row);
          emailsInUniqueSet.add(email);
        }
      }
      // If emailsA has it, it's overlap (already counted in A loop)
    }
  });

  statOverlap.textContent = overlapCount.toLocaleString();
  statUniqueResult.textContent = uniqueRows.length.toLocaleString();

  if (uniqueRows.length === 0) {
    addLog("No unique records found. Files are identical?", "error");
    setStatus("error");
    return;
  }

  addLog(`Analysis Complete.`);
  addLog(`Removed ${overlapCount} overlapping records.`, "warning");
  addLog(`Identified ${uniqueRows.length} exclusive records.`, "success");

  prepareChunks(uniqueRows);
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
