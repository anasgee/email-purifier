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
const downloadLink = document.getElementById("download-link");

// Stats Elements
const statTotalEl = document.getElementById("stat-total");
const statValidEl = document.getElementById("stat-valid");
const statFilteredEl = document.getElementById("stat-filtered");

// State
let currentFile = null;
let logs = [];

// Event Listeners
selectFileBtn.addEventListener("click", () => fileInput.click());

fileInput.addEventListener("change", (e) => {
  if (e.target.files.length > 0) {
    handleFileSelect(e.target.files[0]);
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
    const file = e.dataTransfer.files[0];
    if (file.type.includes("csv") || file.name.endsWith(".csv")) {
      handleFileSelect(file);
    } else {
      alert("Please upload a valid CSV file.");
    }
  }
});

resetBtn.addEventListener("click", resetSystem);

// Main Logic
function handleFileSelect(file) {
  currentFile = file;
  startProcessing(file);
}

function startProcessing(file) {
  // Switch View
  uploadView.classList.add("hidden");
  processingView.classList.remove("hidden");
  processingView.classList.add("flex-col"); // explicit display type

  // Reset contents
  logs = [];
  logContent.innerHTML = "";
  updateStats(0, 0, 0);
  setStatus("processing");

  addLog(`Started processing file: ${file.name}`);

  Papa.parse(file, {
    header: true,
    skipEmptyLines: true,
    worker: false,
    complete: (results) => {
      // Artificial delay for UI effect
      setTimeout(() => {
        try {
          processData(results.data, results.meta.fields);
        } catch (e) {
          addLog(`Error during processing: ${e.message}`, "error");
          setStatus("error");
        }
      }, 800);
    },
    error: (err) => {
      addLog(`Error parsing CSV: ${err.message}`, "error");
      setStatus("error");
    },
  });
}

function processData(data, fields) {
  addLog(`Parsed ${data.length} rows successfully.`);

  if (!data || data.length === 0) {
    addLog("Error: File appears to be empty.", "error");
    setStatus("error");
    return;
  }

  const headers = fields || Object.keys(data[0]);
  addLog(`Detected headers: ${headers.join(", ")}`);

  // 1. Detect Columns
  const { emailCol, phoneCol, nameCol } = detectColumns(headers, data);

  if (!emailCol) {
    addLog(
      "CRITICAL: Could not automatically detect an Email column.",
      "error",
    );
    setStatus("error");
    return;
  }

  addLog(
    `Mapped Columns -> Email: "${emailCol}", Name: "${nameCol || "N/A"}", Phone: "${phoneCol || "N/A"}"`,
  );

  // 2. Filter & Validate
  const validRows = [];
  let filteredCount = 0;

  data.forEach((row) => {
    const email = row[emailCol] ? row[emailCol].toString().trim() : "";
    const name = nameCol
      ? row[nameCol]
        ? row[nameCol].toString().trim()
        : ""
      : "";
    const phone = phoneCol
      ? row[phoneCol]
        ? row[phoneCol].toString().trim()
        : ""
      : "";

    if (email && isValidEmail(email)) {
      // Clean phone
      const cleanPhone = phone ? phone.replace(/[^0-9+]/g, "") : "";

      validRows.push({
        Name: name,
        Email: email,
        Phone: cleanPhone,
      });
    } else {
      filteredCount++;
    }
  });

  // Update Stats
  updateStats(data.length, validRows.length, filteredCount);
  addLog(`Filtering complete. Retained ${validRows.length} valid records.`);

  if (validRows.length === 0) {
    addLog("Warning: No valid records found.", "error");
    setStatus("error");
    return;
  }

  // 3. Generate Download
  generateCSV(validRows);
  setStatus("complete");
  triggerConfetti();
}

function generateCSV(data) {
  const csv = Papa.unparse(data);
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);

  downloadLink.href = url;
  downloadLink.download = `cleaned_${currentFile.name}`;

  // Switch to Download Ready UI
  downloadWaiting.classList.add("hidden");
  downloadReady.classList.remove("hidden");

  addLog("Downloadable file generated successfully.", "success");
}

function detectColumns(headers, data) {
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
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
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

function updateStats(total, valid, filtered) {
  statTotalEl.textContent = total.toLocaleString();
  statValidEl.textContent = valid.toLocaleString();
  statFilteredEl.textContent = filtered.toLocaleString();
}

function setStatus(status) {
  // Icons
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
  currentFile = null;
  fileInput.value = "";

  // UI Reset
  uploadView.classList.remove("hidden");
  processingView.classList.add("hidden");
  processingView.classList.remove("flex-col");

  downloadReady.classList.add("hidden");
  downloadWaiting.classList.remove("hidden");

  logContent.innerHTML = "";
}

function triggerConfetti() {
  const duration = 3000;
  const animationEnd = Date.now() + duration;
  const defaults = { startVelocity: 30, spread: 360, ticks: 60, zIndex: 0 };

  const randomInRange = (min, max) => Math.random() * (max - min) + min;

  const interval = setInterval(function () {
    const timeLeft = animationEnd - Date.now();

    if (timeLeft <= 0) {
      return clearInterval(interval);
    }

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
