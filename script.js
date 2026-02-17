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

// State
let inputFiles = [];
let processedFilesData = []; // Array of { name: "filename", data: [rows] }
let globalSeenEmails = new Set();
let currentMode = "standard"; // 'standard' | 'splitter'
let splitChunks = []; // Store chunks for splitter mode
let stats = {
  total: 0,
  valid: 0,
  duplicates: 0,
  invalid: 0,
  corrected: 0,
};

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

  // UI Tabs
  if (mode === "standard") {
    tabStandard.classList.add("active");
    tabSplitter.classList.remove("active");
    modeBadge.textContent = "STANDARD MODE";
  } else {
    tabSplitter.classList.add("active");
    tabStandard.classList.remove("active");
    modeBadge.textContent = "BULK SPLITTER (4999)";
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
  globalSeenEmails.clear();
  stats = { total: 0, valid: 0, duplicates: 0, invalid: 0, corrected: 0 };

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

// Domain Correction Map
const DOMAIN_CORRECTIONS = {
  "gmail.com": [
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
    "ymail.com",
  ],
  "yahoo.com": [
    "yaho.com",
    "yahooo.com",
    "yhooo.com",
    "yaho.co",
    "yahoo.co",
    "yhoo.com",
    "yahho.com",
  ],
  "hotmail.com": [
    "hotmal.com",
    "hotmai.com",
    "hotmil.com",
    "hotail.com",
    "homtail.com",
    "hotmaill.com",
    "hotmaik.com",
  ],
  "outlook.com": [
    "outlok.com",
    "otlook.com",
    "outlook.co",
    "outook.com",
    "outllook.com",
  ],
  "icloud.com": ["icoud.com", "iclud.com", "iclou.com", "icloud.co"],
};

function autoCorrectEmail(email) {
  if (!email || !email.includes("@")) return email;
  const parts = email.split("@");
  if (parts.length !== 2) return email;
  const localPart = parts[0];
  let domain = parts[1].toLowerCase();

  // Correction
  for (const [correctDomain, typos] of Object.entries(DOMAIN_CORRECTIONS)) {
    if (typos.includes(domain)) {
      domain = correctDomain;
      break;
    }
  }
  return `${localPart}@${domain}`;
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
  const fileInvalidRows = [];

  data.forEach((row) => {
    const emailRaw = row[emailCol];
    let email = emailRaw ? emailRaw.toString().trim() : "";

    // Safety check for other columns
    const name = nameCol && row[nameCol] ? row[nameCol].toString().trim() : "";
    const phone =
      phoneCol && row[phoneCol] ? row[phoneCol].toString().trim() : "";

    // Common helper to push invalid
    const markInvalid = (status) => {
      fileInvalidRows.push({
        Name: name,
        OriginalEmail: emailRaw,
        Phone: phone,
        Status: status,
      });
      stats.invalid++;
    };

    if (!email) {
      markInvalid("Missing Email");
      return;
    }

    // 1. Auto-correct Typos
    const originalEmail = email;
    email = autoCorrectEmail(email);
    if (email !== originalEmail) {
      stats.corrected++;
    }

    // 2. Validate Format
    if (!isValidEmail(email)) {
      markInvalid("Invalid Format");
      return;
    }

    // 2. Check Duplicates (Global)
    const normalizedEmail = email.toLowerCase();
    if (globalSeenEmails.has(normalizedEmail)) {
      stats.duplicates++;
      // Optional: Do we want to save duplicates to invalid list? Usually yes.
      // But 'duplicates' is a separate stat.
      // Let's add them to invalid list with status 'Duplicate' so user can see them?
      // User asked for "email that not shows correct". Duplicates are usually 'correct format' but 'redundant'.
      // I'll skip duplicates for now unless user asks, to keep "Invalid" focused on errors.
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

  if (currentMode === "splitter") {
    // --- SPLITTER MODE ---
    addLog("Splitter Mode: Aggregating and chunking data...", "info");
    prepareSplitBatches();
    downloadSplitZipBtn.classList.remove("hidden");
    downloadSplitZipBtn.style.display = "flex";

    // Update text
    const readyTitle = document.querySelector("#download-ready h3");
    const readyText = document.querySelector("#download-ready p");
    readyTitle.textContent = "Batches Ready";
    readyText.textContent = `Data split into ${splitChunks.length} files (Max 4999 records each).`;
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

  const allRows = Array.from(uniqueMap.values());

  // 2. Split into chunks of 4999
  const CHUNK_SIZE = 4999;
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
  if (splitChunks.length === 0) return;

  const zip = new JSZip();

  // Add each chunk
  splitChunks.forEach((chunk, index) => {
    const csv = Papa.unparse(chunk);
    // Naming: batch_1_4999.csv, batch_2_...
    const start = index * 4999 + 1;
    const end = start + chunk.length - 1;
    zip.file(`batch_${index + 1}_(${start}-${end}).csv`, csv);
  });

  zip.generateAsync({ type: "blob" }).then(function (content) {
    const url = URL.createObjectURL(content);
    const a = document.createElement("a");
    a.href = url;
    a.download = "split_batches_archive.zip";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);

    // Clean up
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  });
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
  if (processedFilesData.length === 0) return;

  const blobParts = [];

  // Standard headers based on our analysis logic
  const headers = ["Name", "Email", "Phone"];

  // Add Header (We assume standard simple headers, so direct join is safe)
  blobParts.push(headers.join(",") + "\n");

  // Options for unparsing chunks without headers
  const unparseConfig = {
    header: false,
    skipEmptyLines: true,
  };

  processedFilesData.forEach((f, index) => {
    if (!f.rows || f.rows.length === 0) return;

    // Unparse this file's rows
    const chunkCsv = Papa.unparse(f.rows, unparseConfig);

    if (chunkCsv && chunkCsv.length > 0) {
      blobParts.push(chunkCsv);
      // Add newline if it's not the very last chunk (or to be safe always add,
      // but need to avoid extra empty lines. CSV allows trailing newline).
      blobParts.push("\n");
    }
  });

  const blob = new Blob(blobParts, { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);

  // Create temp link to click
  const a = document.createElement("a");
  a.href = url;
  a.download = `merged_purified_data.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);

  // Clean up
  setTimeout(() => URL.revokeObjectURL(url), 1000);
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

function downloadInvalidCSV() {
  if (processedFilesData.length === 0) return;

  const blobParts = [];
  const headers = ["Name", "OriginalEmail", "Phone", "Status"];
  blobParts.push(headers.join(",") + "\n");

  const unparseConfig = { header: false, skipEmptyLines: true };

  processedFilesData.forEach((f) => {
    if (!f.invalidRows || f.invalidRows.length === 0) return;
    const chunkCsv = Papa.unparse(f.invalidRows, unparseConfig);
    if (chunkCsv && chunkCsv.length > 0) {
      blobParts.push(chunkCsv);
      blobParts.push("\n");
    }
  });

  const blob = new Blob(blobParts, { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);

  const a = document.createElement("a");
  a.href = url;
  a.download = `invalid_rejected_data.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);

  setTimeout(() => URL.revokeObjectURL(url), 1000);
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
  // 1. Basic Syntax Check (RFC 5322 compliant-ish)
  // Ensures: no spaces, @ symbol present, dot in domain, TLD length >= 2
  const emailRegex =
    /^(([^<>()[\]\\.,;:\s@"]+(\.[^<>()[\]\\.,;:\s@"]+)*)|(".+"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/;

  if (!emailRegex.test(email)) return false;

  const parts = email.split("@");
  if (parts.length !== 2) return false;

  const domain = parts[1].toLowerCase();
  const localPart = parts[0];

  // 2. Local Part Validation
  if (localPart.length > 64) return false; // RFC standard
  if (domain.length > 255) return false; // RFC standard
  if (localPart.startsWith(".") || localPart.endsWith(".")) return false;
  if (localPart.includes("..")) return false; // No consecutive dots

  // 3. Domain Validation
  if (domain.startsWith(".") || domain.endsWith(".")) return false;
  if (domain.includes("..")) return false;

  // 4. Typos check removed (handled by autoCorrectEmail)

  // 5. Catch-all for very short TLDs (e.g. .c, .m) - already covered by regex {2,}
  // 6. Specific 'gmail' pattern check (optional but requested "missspelled")
  // If it contains "gmail" but isn't "gmail.com" and isn't a valid subdomain like "mail.gmail.com"
  if (
    domain.includes("gmail") &&
    domain !== "gmail.com" &&
    !domain.endsWith(".gmail.com")
  ) {
    // Check Levenshtein distance or simple heuristics?
    // For now, if it looks like gmail but assumes it's a typo of the main domain
    // Example: mygmail.com is valid? Yes.
    // gmail.net? Valid (technically).
    // so we rely on the specific list above for safety.
  }

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
