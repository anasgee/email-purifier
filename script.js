// Initialize Lucide icons
lucide.createIcons();

// Elements
const dropZone = document.getElementById("drop-zone");
const fileInput = document.getElementById("file-input");
const selectFileBtn = document.getElementById("select-file-btn");
const appContainer = document.getElementById("app-container");
const uploadView = document.getElementById("upload-view");
const processingView = document.getElementById("processing-view");
const statusText = document.getElementById("status-text");
const statusIconContainer = document.getElementById("status-icon-container");
const resetBtn = document.getElementById("reset-btn");
const logContent = document.getElementById("log-content");
const downloadWaiting = document.getElementById("download-waiting");
const downloadReady = document.getElementById("download-ready");

// Download Buttons
const downloadLink = document.getElementById("download-link");
const downloadMergedBtn = document.getElementById("download-merged-btn");
const downloadZipBtn = document.getElementById("download-zip-btn");
const downloadActions = document.getElementById("download-actions"); // Container

// Stats Elements
const statTotalEl = document.getElementById("stat-total");
const statValidEl = document.getElementById("stat-valid");
const statFilteredEl = document.getElementById("stat-filtered");
const statDuplicatesEl = document.getElementById("stat-duplicates");

// State
let inputFiles = [];
let processedFilesData = []; // Array of { name: "filename", data: [rows] }
let globalSeenEmails = new Set();
let stats = {
  total: 0,
  valid: 0,
  duplicates: 0,
  invalid: 0,
};

// Event Listeners
selectFileBtn.addEventListener("click", () => fileInput.click());

fileInput.addEventListener("change", (e) => {
  if (e.target.files.length > 0) {
    handleFileSelect(Array.from(e.target.files));
  }
});

dropZone.addEventListener("dragover", (e) => {
  e.preventDefault();
  dropZone.classList.add("active");
});

dropZone.addEventListener("dragleave", (e) => {
  e.preventDefault();
  dropZone.classList.remove("active");
});

dropZone.addEventListener("drop", (e) => {
  e.preventDefault();
  dropZone.classList.remove("active");

  if (e.dataTransfer.files.length > 0) {
    const files = Array.from(e.dataTransfer.files).filter(
      (f) => f.type.includes("csv") || f.name.endsWith(".csv"),
    );
    if (files.length > 0) {
      handleFileSelect(files);
    } else {
      alert("Please upload valid CSV files.");
    }
  }
});

resetBtn.addEventListener("click", resetSystem);

downloadMergedBtn.addEventListener("click", (e) => {
  e.preventDefault();
  downloadMergedCSV();
});

downloadZipBtn.addEventListener("click", (e) => {
  e.preventDefault();
  downloadZIP();
});

// Main Logic
async function handleFileSelect(files) {
  inputFiles = files;
  startProcessing(files);
}

async function startProcessing(files) {
  // Switch View
  uploadView.classList.add("hidden");
  processingView.classList.remove("hidden");
  processingView.classList.add("flex-col");

  // Reset State
  processedFilesData = [];
  globalSeenEmails.clear();
  stats = { total: 0, valid: 0, duplicates: 0, invalid: 0 };

  logContent.innerHTML = "";
  updateStatsUI();
  setStatus("processing");

  addLog(`Received ${files.length} file(s) for processing.`);

  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    addLog(`Processing file ${i + 1}/${files.length}: ${file.name}...`);
    try {
      await processSingleFile(file);
    } catch (err) {
      addLog(`Error processing ${file.name}: ${err.message}`, "error");
    }
  }

  finishProcessing();
}

function processSingleFile(file) {
  return new Promise((resolve, reject) => {
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      worker: false, // Keep sync for simplicity and scope access
      complete: (results) => {
        // Artificial small delay for UI responsiveness
        setTimeout(() => {
          try {
            analyzeFileContent(file.name, results.data, results.meta.fields);
            resolve();
          } catch (e) {
            reject(e);
          }
        }, 100);
      },
      error: (err) => reject(err),
    });
  });
}

function analyzeFileContent(fileName, data, fields) {
  if (!data || data.length === 0) {
    addLog(`Skipping ${fileName}: Empty file.`, "error");
    return;
  }

  stats.total += data.length;
  updateStatsUI();

  const headers = fields || Object.keys(data[0]);
  const { emailCol, phoneCol, nameCol } = detectColumns(headers);

  if (!emailCol) {
    addLog(`Skipping ${fileName}: No Email column found.`, "error");
    // We count all as invalid/filtered if we can't process
    stats.invalid += data.length;
    updateStatsUI();
    return;
  }

  const fileValidRows = [];

  data.forEach((row) => {
    const emailRaw = row[emailCol];
    const email = emailRaw ? emailRaw.toString().trim() : "";

    // Safety check for other columns
    const name = nameCol && row[nameCol] ? row[nameCol].toString().trim() : "";
    const phone =
      phoneCol && row[phoneCol] ? row[phoneCol].toString().trim() : "";

    if (!email) {
      stats.invalid++;
      return;
    }

    // 1. Check Typos and format
    if (!isValidEmail(email)) {
      stats.invalid++;
      return;
    }

    // 2. Check Duplicates (Global)
    const normalizedEmail = email.toLowerCase();
    if (globalSeenEmails.has(normalizedEmail)) {
      stats.duplicates++;
    } else {
      // Valid & New
      globalSeenEmails.add(normalizedEmail);
      stats.valid++;

      // Clean phone
      const cleanPhone = phone ? phone.replace(/[^0-9+]/g, "") : "";

      fileValidRows.push({
        Name: name,
        Email: email, // Keep original casing or normalized? Usually original is preferred for display, but normalized for uniqueness.
        Phone: cleanPhone,
      });
    }
  });

  processedFilesData.push({
    name: fileName,
    rows: fileValidRows,
  });

  updateStatsUI();
  addLog(
    `Finished ${fileName}: ${fileValidRows.length} valid, ${data.length - fileValidRows.length} filtered.`,
  );
}

function finishProcessing() {
  if (stats.valid === 0) {
    addLog("Analysis complete. No valid records found.", "error");
    setStatus("error");
    return;
  }

  setStatus("complete");
  triggerConfetti();

  // Setup Download UI
  downloadWaiting.classList.add("hidden");
  downloadReady.classList.remove("hidden");

  // Determine button visibility
  if (processedFilesData.length === 1) {
    // Single file mode
    downloadMergedBtn.classList.add("hidden");
    downloadZipBtn.classList.add("hidden");
    downloadLink.classList.remove("hidden");
    downloadLink.style.display = "flex"; // Ensure flex layout

    // Prepare single download
    prepareSingleDownload(processedFilesData[0]);
  } else {
    // Multiple files mode
    downloadLink.classList.add("hidden");
    downloadMergedBtn.classList.remove("hidden");
    downloadZipBtn.classList.remove("hidden");
    downloadMergedBtn.style.display = "flex";
    downloadZipBtn.style.display = "flex";
  }

  addLog("All files processed successfully.", "success");
}

// --- Download Helpers ---

function prepareSingleDownload(fileData) {
  const csv = Papa.unparse(fileData.rows);
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);

  downloadLink.href = url;
  downloadLink.download = `cleaned_${fileData.name}`;
}

function downloadMergedCSV() {
  // Combine all rows
  let allRows = [];
  processedFilesData.forEach((f) => {
    allRows = allRows.concat(f.rows);
  });

  const csv = Papa.unparse(allRows);
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);

  // Create temp link to click
  const a = document.createElement("a");
  a.href = url;
  a.download = `merged_cleaned_data.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

function downloadZIP() {
  const zip = new JSZip();

  processedFilesData.forEach((f) => {
    if (f.rows.length > 0) {
      const csv = Papa.unparse(f.rows);
      zip.file(`cleaned_${f.name}`, csv);
    }
  });

  zip.generateAsync({ type: "blob" }).then(function (content) {
    const url = URL.createObjectURL(content);
    const a = document.createElement("a");
    a.href = url;
    a.download = "cleaned_data_archive.zip";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  });
}

// --- Utilities ---

function detectColumns(headers) {
  const lowerHeaders = headers.map((h) => h.toLowerCase());

  let emailCol =
    headers[
      lowerHeaders.findIndex(
        (h) =>
          h.includes("email") || h.includes("e-mail") || h.includes("mail"),
      )
    ];
  let phoneCol =
    headers[
      lowerHeaders.findIndex(
        (h) =>
          h.includes("phone") ||
          h.includes("mobile") ||
          h.includes("cell") ||
          h.includes("tel"),
      )
    ];
  let nameCol =
    headers[
      lowerHeaders.findIndex(
        (h) => h.includes("name") || h.includes("first") || h.includes("full"),
      )
    ];

  return { emailCol, phoneCol, nameCol };
}

function isValidEmail(email) {
  // Basic Regex
  const basicValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  if (!basicValid) return false;

  // Gmail Typo Check
  const domain = email.split("@")[1].toLowerCase();

  if (domain === "gmail.com") return true;

  // List of common typos to invalidate
  const gmailTypos = [
    "gamil.com",
    "gmali.com",
    "gmaill.com",
    "gmai.com",
    "gmil.com",
    "gmal.com",
    "gamail.com",
    "gmail.co",
    "gmail.cm",
    "gmail.om",
    "gma.com",
    "gm.com",
    "gml.com",
  ];

  if (gmailTypos.includes(domain)) return false;

  // Also check if it looks suspiciously like gmail but isn't
  // e.g. starts with g, ends with l.com or something, but this might produce false positives for 'global.com'
  // So we stick to the explicit list for safety, as requested: "whose @gmail.com is missspelled"

  return true;
}

// UI Helpers
function addLog(msg, type = "info") {
  const div = document.createElement("div");
  div.className = "log-item";

  const time = new Date().toLocaleTimeString();
  let colorClass = "";
  if (type === "error") colorClass = 'style="color: var(--accent-error)"';
  if (type === "success") colorClass = 'style="color: var(--accent-success)"';

  div.innerHTML = `<span style="color: #555; margin-right: 8px;">[${time}]</span><span ${colorClass}>${msg}</span>`;

  logContent.appendChild(div);
  logContent.scrollTop = logContent.scrollHeight;
}

function updateStatsUI() {
  statTotalEl.textContent = stats.total.toLocaleString();
  statValidEl.textContent = stats.valid.toLocaleString();
  statDuplicatesEl.textContent = stats.duplicates.toLocaleString();
  statFilteredEl.textContent = stats.invalid.toLocaleString();
}

function setStatus(status) {
  let iconHtml = "";
  let text = "";

  if (status === "processing") {
    iconHtml =
      '<i data-lucide="upload-cloud" class="text-accent" style="animation: bounce 1s infinite"></i>';
    text = "Analyzing Data Stream...";
  } else if (status === "complete") {
    iconHtml = '<i data-lucide="check-circle" class="text-success"></i>';
    text = "Purification Complete";
  } else if (status === "error") {
    iconHtml = '<i data-lucide="ban" class="text-error"></i>';
    text = "Process Interrupted";
  }

  statusIconContainer.innerHTML = iconHtml;
  statusText.textContent = text;
  lucide.createIcons();
}

function resetSystem() {
  inputFiles = [];
  processedFilesData = [];
  fileInput.value = "";

  // UI Reset
  uploadView.classList.remove("hidden");
  processingView.classList.add("hidden");
  processingView.classList.remove("flex-col");

  downloadReady.classList.add("hidden");
  downloadWaiting.classList.remove("hidden");

  // Hide all download buttons
  downloadLink.classList.add("hidden");
  downloadMergedBtn.classList.add("hidden");
  downloadZipBtn.classList.add("hidden");

  logContent.innerHTML = "";
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
