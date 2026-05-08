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
const downloadInvalidBtn = document.getElementById("download-invalid-btn");
const downloadActions = document.getElementById("download-actions"); // Container

// Stats Elements
const statTotalEl = document.getElementById("stat-total");
const statValidEl = document.getElementById("stat-valid");
const statFilteredEl = document.getElementById("stat-filtered");
const statDuplicatesEl = document.getElementById("stat-duplicates");
const statUniqueEl = document.getElementById("stat-unique");

// State
let inputFiles = [];
let fileA = null;
let fileB = null;
let processedFilesData = []; // Array of { name: "filename", data: [rows] }
let globalSeenEmails = new Set();
let currentMode = "standard"; // 'standard' | 'splitter'
let splitChunks = []; // Store chunks for splitter mode
let splitExportRows = []; // Store validated rows before export-time chunk options
let singleDownloadFileData = null;
let stats = {
  total: 0,
  valid: 0,
  unique: 0,
  duplicates: 0,
  invalid: 0,
  corrected: 0,
  intersection: 0,
};

// ... (Rest of code remains same until analyzeFileContent)

// Inside analyzeFileContent:
// Valid & New
// globalSeenEmails.add(normalizedEmail);
// stats.valid++;
// stats.unique = globalSeenEmails.size; // Update unique count

// ...

function updateStatsUI() {
  statTotalEl.textContent = stats.total.toLocaleString();
  statValidEl.textContent = stats.valid.toLocaleString();
  statDuplicatesEl.textContent = stats.duplicates.toLocaleString();
  statFilteredEl.textContent = stats.invalid.toLocaleString();
  statUniqueEl.textContent = stats.unique.toLocaleString();
  document.getElementById("stat-corrected").textContent =
    stats.corrected.toLocaleString();
}

// Mode Elements
const tabStandard = document.getElementById("tab-standard");
const tabSplitter = document.getElementById("tab-splitter");
const modeBadge = document.getElementById("mode-badge");

const downloadSplitZipBtn = document.getElementById("download-split-zip-btn");

// Event Listeners
selectFileBtn.addEventListener("click", () => fileInput.click());

// Mode Switchers
tabStandard.addEventListener("click", () => setMode("standard"));
tabSplitter.addEventListener("click", () => setMode("splitter"));

function setMode(mode) {
  currentMode = mode;
  resetSystem(); // Reset when switching
  currentMode = mode; // Reset likely clears it, so enforce again

  // UI Tabs & Views
  tabStandard.classList.remove("active");
  tabSplitter.classList.remove("active");

  uploadView.classList.add("hidden");

  if (mode === "splitter") {
    tabSplitter.classList.add("active");
    modeBadge.textContent = "BULK SPLITTER (4999)";
    uploadView.classList.remove("hidden");
  } else {
    // Standard default
    currentMode = "standard";
    tabStandard.classList.add("active");
    modeBadge.textContent = "STANDARD MODE";
    uploadView.classList.remove("hidden");
  }
}

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

downloadLink.addEventListener("click", (e) => {
  e.preventDefault();
  if (!singleDownloadFileData) return;
  
  let filename = prompt("Enter file name for the CSV:", `cleaned_${singleDownloadFileData.name}`);
  if (!filename) return;
  filename = EmailExportUtils.ensureExtension(filename, ".csv");

  const rows = EmailExportUtils.prepareExportRows(singleDownloadFileData.rows);
  if (rows.length === 0) {
    alert("No validated email rows to download.");
    return;
  }

  const csv = EmailExportUtils.unparseExportRows(rows);
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  EmailExportUtils.downloadBlob(blob, filename);
});

downloadMergedBtn.addEventListener("click", (e) => {
  e.preventDefault();
  downloadMergedCSV();
});

downloadZipBtn.addEventListener("click", (e) => {
  e.preventDefault();
  downloadZIP();
});

downloadSplitZipBtn.addEventListener("click", (e) => {
  e.preventDefault();
  downloadSplitZip();
});

downloadInvalidBtn.addEventListener("click", (e) => {
  e.preventDefault();
  downloadInvalidCSV();
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
  document.querySelector(".feature-nav").classList.add("hidden"); // Hide tabs during processing

  // Reset State
  processedFilesData = [];
  splitChunks = [];
  splitExportRows = [];
  singleDownloadFileData = null;
  globalSeenEmails.clear();
  stats = {
    total: 0,
    valid: 0,
    unique: 0,
    duplicates: 0,
    invalid: 0,
    corrected: 0,
  };

  logContent.innerHTML = "";
  updateStatsUI();
  setStatus("processing");

  addLog(
    `Received ${files.length} file(s) for processing in ${currentMode.toUpperCase()} mode.`,
  );

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
  const columns = EmailExportUtils.detectColumns(headers);

  const fileValidRows = [];
  const fileInvalidRows = [];

  data.forEach((row) => {
    const contact = EmailExportUtils.buildContact(row, columns);

    if (!contact.valid) {
      fileInvalidRows.push(
        EmailExportUtils.buildInvalidExportRow(
          row,
          columns,
          contact.status,
          fileName,
        ),
      );
      stats.invalid++;
      return;
    }

    if (contact.corrected) {
      stats.corrected++;
    }

    // Check Duplicates (Global)
    const normalizedEmail = contact.normalizedEmail;
    if (globalSeenEmails.has(normalizedEmail)) {
      stats.duplicates++;
    } else {
      // Valid & New
      globalSeenEmails.add(normalizedEmail);
      stats.valid++;
      stats.unique = globalSeenEmails.size; // Update unique count

      fileValidRows.push(contact.row);
    }
  });

  processedFilesData.push({
    name: fileName,
    rows: fileValidRows,
    invalidRows: fileInvalidRows,
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

  // Reset buttons
  downloadLink.classList.add("hidden");
  downloadMergedBtn.classList.add("hidden");
  downloadZipBtn.classList.add("hidden");
  downloadSplitZipBtn.classList.add("hidden");

  if (currentMode === "splitter" || currentMode === "compare") {
    // --- SPLITTER & COMPARE MODE ---

    if (currentMode === "compare" && processedFilesData.length >= 2) {
      // Perform Comparison Logic to log stats
      addLog("Calculating comparison statistics...", "info");

      const fileAEmails = new Set();
      processedFilesData[0].rows.forEach((r) =>
        fileAEmails.add(r.Email.toLowerCase().trim()),
      );

      const fileBEmails = new Set();
      processedFilesData[1].rows.forEach((r) =>
        fileBEmails.add(r.Email.toLowerCase().trim()),
      );

      let intersectionCount = 0;
      fileAEmails.forEach((email) => {
        if (fileBEmails.has(email)) intersectionCount++;
      });

      // Log Specifics
      addLog(`Comparison Results:`, "success");
      addLog(
        `File A Unique: ${fileAEmails.size - intersectionCount} rows (excl. overlap)`,
      );
      addLog(
        `File B Unique: ${fileBEmails.size - intersectionCount} rows (excl. overlap)`,
      );
      addLog(`Overlap (Common in both): ${intersectionCount} rows`, "warning");
      addLog(`Total Unique (Union): ${stats.unique} rows`);
    }

    addLog(
      currentMode === "compare"
        ? "Preparing clean union set..."
        : "Splitter Mode: Aggregating and chunking data...",
      "info",
    );
    prepareSplitBatches();
    downloadSplitZipBtn.classList.remove("hidden");
    downloadSplitZipBtn.style.display = "flex";

    // Update text
    const readyTitle = document.querySelector("#download-ready h3");
    const readyText = document.querySelector("#download-ready p");
    readyTitle.textContent =
      currentMode === "compare" ? "Comparison Result Ready" : "Batches Ready";
    readyText.textContent = `Default split preview: ${splitChunks.length} files. You can change rows per chunk and numbering when exporting.`;
  } else {
    // --- STANDARD MODE ---
    // Determine button visibility
    if (processedFilesData.length === 1) {
      // Single file mode
      downloadLink.classList.remove("hidden");
      downloadLink.style.display = "flex"; // Ensure flex layout
      prepareSingleDownload(processedFilesData[0]);
    } else {
      // Multiple files mode
      downloadMergedBtn.classList.remove("hidden");
      downloadZipBtn.classList.remove("hidden");
      downloadMergedBtn.style.display = "flex";
      downloadZipBtn.style.display = "flex";
    }
  }

  // Toggle Invalid Button
  if (stats.invalid > 0) {
    downloadInvalidBtn.classList.remove("hidden");
    downloadInvalidBtn.style.display = "flex";
  } else {
    downloadInvalidBtn.classList.add("hidden");
  }

  addLog("All files processed successfully.", "success");
}

function prepareSplitBatches() {
  // 1. Aggregate and Re-Deduplicate
  // Although we deduplicate during ingestion, this extra pass ensures
  // absolute uniqueness for the bulk export, especially against any edge cases.
  const uniqueMap = new Map();

  processedFilesData.forEach((fileData) => {
    fileData.rows.forEach((row) => {
      if (row.Email) {
        const normalizedKey = row.Email.toLowerCase().trim();

        // Only add if not already present in our export set
        if (!uniqueMap.has(normalizedKey)) {
          uniqueMap.set(normalizedKey, row);
        }
      }
    });
  });

  const allRows = EmailExportUtils.prepareExportRows(Array.from(uniqueMap.values()));
  splitExportRows = allRows;

  // 2. Split into chunks of 4999
  const CHUNK_SIZE = EmailExportUtils.DEFAULT_CHUNK_SIZE;
  splitChunks = [];
  for (let i = 0; i < allRows.length; i += CHUNK_SIZE) {
    splitChunks.push(allRows.slice(i, i + CHUNK_SIZE));
  }

  addLog(`Aggregation Complete: ${allRows.length} unique records prepared.`);
  addLog(
    `Generated ${splitChunks.length} split batches (Max ${CHUNK_SIZE} per file).`,
  );
}

function downloadSplitZip() {
  const rows = EmailExportUtils.prepareExportRows(splitExportRows);
  if (rows.length === 0) {
    alert("No validated email rows to download.");
    return;
  }

  const options = EmailExportUtils.promptChunkExportOptions(
    "split_batches_archive.zip",
    "batch",
  );
  if (!options) return;

  const zip = new JSZip();
  const chunks = EmailExportUtils.chunkRows(rows, options.chunkSize);

  chunks.forEach((chunk, index) => {
    const csv = EmailExportUtils.unparseExportRows(chunk);
    zip.file(EmailExportUtils.makeChunkFilename(options, index, chunk.length), csv);
  });

  zip.generateAsync({ type: "blob" }).then(function (content) {
    EmailExportUtils.downloadBlob(content, options.zipFilename);
  });
}

// --- Download Helpers ---

function prepareSingleDownload(fileData) {
  singleDownloadFileData = fileData;
  downloadLink.href = "#"; // Just to feel active but handled via JS
}

function downloadMergedCSV() {
  if (processedFilesData.length === 0) return;

  let filename = prompt("Enter file name for the merged CSV:", "merged_purified_data.csv");
  if (!filename) return; // user cancelled
  filename = EmailExportUtils.ensureExtension(filename, ".csv");

  const rows = EmailExportUtils.prepareExportRows(
    processedFilesData.flatMap((fileData) => fileData.rows || []),
  );
  if (rows.length === 0) {
    alert("No validated email rows to download.");
    return;
  }

  const csv = EmailExportUtils.unparseExportRows(rows);
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  EmailExportUtils.downloadBlob(blob, filename);
}

function downloadZIP() {
  let filename = prompt("Enter file name for the ZIP archive:", "cleaned_data_archive.zip");
  if (!filename) return; // user cancelled
  filename = EmailExportUtils.ensureExtension(filename, ".zip");

  const zip = new JSZip();

  processedFilesData.forEach((f) => {
    const rows = EmailExportUtils.prepareExportRows(f.rows);
    if (rows.length > 0) {
      const csv = EmailExportUtils.unparseExportRows(rows);
      zip.file(`cleaned_${f.name}`, csv);
    }
  });

  zip.generateAsync({ type: "blob" }).then(function (content) {
    EmailExportUtils.downloadBlob(content, filename);
  });
}

function downloadInvalidCSV() {
  if (processedFilesData.length === 0) return;

  let filename = prompt("Enter file name for the invalid records CSV:", "invalid_rejected_data.csv");
  if (!filename) return; // user cancelled
  filename = EmailExportUtils.ensureExtension(filename, ".csv");

  const rows = processedFilesData.flatMap((f) => f.invalidRows || []);
  const csv = EmailExportUtils.unparseRowsWithFields(
    rows,
    EmailExportUtils.INVALID_EXPORT_COLUMNS,
  );
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  EmailExportUtils.downloadBlob(blob, filename);
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
  if (statUniqueEl) statUniqueEl.textContent = stats.unique.toLocaleString();
  document.getElementById("stat-corrected").textContent =
    stats.corrected.toLocaleString();
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
  splitChunks = [];
  splitExportRows = [];
  singleDownloadFileData = null;

  // UI Reset
  uploadView.classList.remove("hidden");
  processingView.classList.add("hidden");
  processingView.classList.remove("flex-col");
  document.querySelector(".feature-nav").classList.remove("hidden"); // Show items again

  downloadReady.classList.add("hidden");
  downloadWaiting.classList.remove("hidden");

  // Reset Text
  const readyTitle = document.querySelector("#download-ready h3");
  const readyText = document.querySelector("#download-ready p");
  readyTitle.textContent = "Ready for Export";
  readyText.textContent =
    "Data has been successfully transformed and optimized.";

  // Hide all download buttons
  downloadLink.classList.add("hidden");
  downloadMergedBtn.classList.add("hidden");
  downloadZipBtn.classList.add("hidden");
  downloadSplitZipBtn.classList.add("hidden");

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
