(function () {
  const EXPORT_COLUMNS = ["First Name", "Last Name", "Email"];
  const DEFAULT_FIRST_NAME = "Dear Applicant";
  const DEFAULT_LAST_NAME = "Applicant";
  const DEFAULT_CHUNK_SIZE = 4999;

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
      "gmail.c",
    ],
    "yahoo.com": [
      "yaho.com",
      "yahooo.com",
      "yhooo.com",
      "yaho.co",
      "yahoo.co",
      "yhoo.com",
      "yahho.com",
      "yahoo.c",
    ],
    "hotmail.com": [
      "hotmal.com",
      "hotmai.com",
      "hotmil.com",
      "hotail.com",
      "homtail.com",
      "hotmaill.com",
      "hotmaik.com",
      "hotmail.c",
    ],
    "outlook.com": [
      "outlok.com",
      "otlook.com",
      "outlook.co",
      "outook.com",
      "outllook.com",
      "outlook.c",
    ],
    "icloud.com": [
      "icoud.com",
      "iclud.com",
      "iclou.com",
      "icloud.co",
      "icloud.c",
    ],
  };

  const EMAIL_CANDIDATE_REGEX =
    /[A-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Z0-9.-]+\.[A-Z]{1,24}/gi;

  function normalizeHeader(header) {
    return String(header || "")
      .toLowerCase()
      .replace(/[^a-z0-9]/g, "");
  }

  function ensureExtension(filename, extension) {
    const cleanExtension = extension.startsWith(".") ? extension : `.${extension}`;
    const fallback = `export${cleanExtension}`;
    const value = String(filename || "").trim() || fallback;
    return value.toLowerCase().endsWith(cleanExtension.toLowerCase())
      ? value
      : `${value}${cleanExtension}`;
  }

  function stripExtension(filename) {
    return String(filename || "").replace(/\.[^/.]+$/i, "");
  }

  function sanitizeFilePart(value, fallback = "") {
    const sanitized = String(value || "")
      .replace(/[<>:"/\\|?*\u0000-\u001f]/g, "")
      .trim();
    return sanitized || fallback;
  }

  function parsePositiveInteger(value, fallback) {
    const parsed = Number.parseInt(String(value || "").replace(/,/g, ""), 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
  }

  function stripEmailNoise(value) {
    return String(value || "")
      .trim()
      .replace(/^mailto:/i, "")
      .replace(/^[<("'[\s]+/g, "")
      .replace(/[>"')\],;:\s.]+$/g, "");
  }

  function extractEmailCandidate(value) {
    if (value === null || value === undefined) return "";

    const text = stripEmailNoise(value);
    if (!text) return "";

    const atCount = (text.match(/@/g) || []).length;
    if (!/\s/.test(text) && atCount === 1 && !/[;,<>()[\]]/.test(text)) {
      return stripEmailNoise(text);
    }

    const matches = text.match(EMAIL_CANDIDATE_REGEX);
    return matches && matches.length ? stripEmailNoise(matches[0]) : "";
  }

  function autoCorrectEmail(email) {
    const candidate = stripEmailNoise(email).toLowerCase();
    if (!candidate || !candidate.includes("@")) return candidate;

    const parts = candidate.split("@");
    if (parts.length !== 2) return candidate;

    const localPart = parts[0];
    let domain = parts[1];

    for (const [correctDomain, typos] of Object.entries(DOMAIN_CORRECTIONS)) {
      if (typos.includes(domain)) {
        domain = correctDomain;
        break;
      }
    }

    return `${localPart}@${domain}`;
  }

  function isValidEmail(value) {
    const email = stripEmailNoise(value).toLowerCase();
    if (!email || /\s/.test(email)) return false;

    const parts = email.split("@");
    if (parts.length !== 2) return false;

    const [localPart, domain] = parts;
    if (!localPart || !domain) return false;
    if (localPart.length > 64 || domain.length > 255) return false;
    if (localPart.startsWith(".") || localPart.endsWith(".")) return false;
    if (localPart.includes("..") || domain.includes("..")) return false;

    const localRegex =
      /^[A-Z0-9!#$%&'*+/=?^_`{|}~-]+(?:\.[A-Z0-9!#$%&'*+/=?^_`{|}~-]+)*$/i;
    if (!localRegex.test(localPart)) return false;

    const labels = domain.split(".");
    if (labels.length < 2) return false;

    const labelRegex = /^[A-Z0-9](?:[A-Z0-9-]{0,61}[A-Z0-9])?$/i;
    if (!labels.every((label) => labelRegex.test(label))) return false;

    const tld = labels[labels.length - 1];
    return /^[A-Z]{2,24}$/i.test(tld);
  }

  function cleanEmail(value) {
    const original = extractEmailCandidate(value);
    if (!original) return null;

    const corrected = autoCorrectEmail(original);
    if (!isValidEmail(corrected)) return null;

    return {
      email: corrected.toLowerCase(),
      original,
      corrected: corrected.toLowerCase() !== stripEmailNoise(original).toLowerCase(),
    };
  }

  function detectColumns(headers) {
    const safeHeaders = Array.isArray(headers) ? headers : [];
    const normalized = safeHeaders.map(normalizeHeader);

    const find = (names, includes = []) => {
      let index = normalized.findIndex((header) => names.includes(header));
      if (index === -1 && includes.length) {
        index = normalized.findIndex((header) =>
          includes.some((needle) => header.includes(needle)),
        );
      }
      return index >= 0 ? safeHeaders[index] : null;
    };

    return {
      emailCol: find(
        ["email", "emailaddress", "eaddress", "mail", "mailaddress"],
        ["email", "emailaddress", "emailid"],
      ),
      firstNameCol: find(["firstname", "first", "fname", "givenname"]),
      lastNameCol: find(["lastname", "last", "lname", "surname", "familyname"]),
      nameCol: find(
        ["name", "fullname", "contactname", "applicantname", "candidate"],
        ["fullname", "contactname", "applicantname"],
      ),
      phoneCol: find(
        ["phone", "mobile", "cell", "telephone", "tel", "phonenumber"],
        ["phone", "mobile", "cell", "telephone"],
      ),
    };
  }

  function sanitizeNameValue(value) {
    if (value === null || value === undefined) return "";

    const text = String(value)
      .replace(EMAIL_CANDIDATE_REGEX, "")
      .replace(/\s+/g, " ")
      .trim();

    if (text.includes("@")) return "";
    if (!text || cleanEmail(text)) return "";
    return text.replace(/^[,;:-]+|[,;:-]+$/g, "").trim();
  }

  function splitFullName(value) {
    const cleanName = sanitizeNameValue(value);
    if (!cleanName) {
      return {
        firstName: DEFAULT_FIRST_NAME,
        lastName: DEFAULT_LAST_NAME,
      };
    }

    const commaParts = cleanName.split(",").map((part) => part.trim());
    if (commaParts.length === 2 && commaParts[0] && commaParts[1]) {
      return {
        firstName: commaParts[1],
        lastName: commaParts[0],
      };
    }

    const parts = cleanName.split(/\s+/);
    return {
      firstName: parts[0] || DEFAULT_FIRST_NAME,
      lastName: parts.length > 1 ? parts.slice(1).join(" ") : DEFAULT_LAST_NAME,
    };
  }

  function getRowValue(row, key) {
    return key && row && Object.prototype.hasOwnProperty.call(row, key)
      ? row[key]
      : "";
  }

  function getEmailSources(row, columns) {
    const sources = [];
    const add = (key) => {
      if (key && !sources.includes(key)) sources.push(key);
    };

    add(columns.emailCol);
    add(columns.nameCol);
    add(columns.firstNameCol);
    add(columns.lastNameCol);

    Object.keys(row || {}).forEach(add);
    return sources;
  }

  function findOriginalEmailText(row, columns) {
    for (const source of getEmailSources(row || {}, columns)) {
      const value = String(getRowValue(row, source) || "").trim();
      if (value.includes("@")) return value;
    }
    return "";
  }

  function extractNameParts(row, columns, forceDefaultName) {
    const firstRaw = sanitizeNameValue(getRowValue(row, columns.firstNameCol));
    const lastRaw = sanitizeNameValue(getRowValue(row, columns.lastNameCol));

    if (!forceDefaultName && (firstRaw || lastRaw)) {
      return {
        firstName: firstRaw || DEFAULT_FIRST_NAME,
        lastName: lastRaw || DEFAULT_LAST_NAME,
      };
    }

    if (forceDefaultName) {
      return {
        firstName: DEFAULT_FIRST_NAME,
        lastName: DEFAULT_LAST_NAME,
      };
    }

    return splitFullName(getRowValue(row, columns.nameCol));
  }

  function buildContact(row, knownColumns) {
    const columns = knownColumns || detectColumns(Object.keys(row || {}));
    let cleanedEmail = null;
    let emailSource = null;

    for (const source of getEmailSources(row, columns)) {
      cleanedEmail = cleanEmail(getRowValue(row, source));
      if (cleanedEmail) {
        emailSource = source;
        break;
      }
    }

    if (!cleanedEmail) {
      return {
        valid: false,
        status: "Missing or Invalid Email",
        originalEmail: findOriginalEmailText(row, columns),
      };
    }

    const explicitFirstName = sanitizeNameValue(getRowValue(row, columns.firstNameCol));
    const explicitLastName = sanitizeNameValue(getRowValue(row, columns.lastNameCol));
    const hasExplicitName = Boolean(explicitFirstName || explicitLastName);
    const nameColumns = [
      columns.nameCol,
      columns.firstNameCol,
      columns.lastNameCol,
    ].filter(Boolean);
    const emailFromNameColumn = nameColumns.includes(emailSource);
    const nameHasEmail =
      columns.nameCol && Boolean(cleanEmail(getRowValue(row, columns.nameCol)));

    const names = extractNameParts(
      row,
      columns,
      (emailFromNameColumn || nameHasEmail) && !hasExplicitName,
    );

    return {
      valid: true,
      corrected: cleanedEmail.corrected,
      normalizedEmail: cleanedEmail.email,
      originalEmail: cleanedEmail.original,
      emailSource,
      row: {
        "First Name": names.firstName || DEFAULT_FIRST_NAME,
        "Last Name": names.lastName || DEFAULT_LAST_NAME,
        Email: cleanedEmail.email,
      },
    };
  }

  function prepareExportRows(rows) {
    return (rows || [])
      .map((row) => {
        const contact = buildContact(row);
        return contact.valid ? contact.row : null;
      })
      .filter(Boolean);
  }

  function dedupeRowsByEmail(rows) {
    const seen = new Set();
    const result = [];

    prepareExportRows(rows).forEach((row) => {
      const key = row.Email.toLowerCase().trim();
      if (!seen.has(key)) {
        seen.add(key);
        result.push(row);
      }
    });

    return result;
  }

  function buildInvalidExportRow(row, knownColumns, status, source) {
    const columns = knownColumns || detectColumns(Object.keys(row || {}));
    const contact = buildContact(row, columns);
    const names = contact.valid
      ? {
          firstName: contact.row["First Name"],
          lastName: contact.row["Last Name"],
        }
      : extractNameParts(row, columns, false);

    return {
      "First Name": names.firstName || DEFAULT_FIRST_NAME,
      "Last Name": names.lastName || DEFAULT_LAST_NAME,
      Email: contact.valid ? contact.row.Email : "",
      "Original Email":
        contact.originalEmail ||
        extractEmailCandidate(getRowValue(row, columns.emailCol)) ||
        findOriginalEmailText(row, columns) ||
        String(getRowValue(row, columns.emailCol) || "").trim(),
      Source: source || "",
      Status: status || (contact.valid ? "Filtered" : "Missing or Invalid Email"),
    };
  }

  function unparseExportRows(rows) {
    const preparedRows = prepareExportRows(rows);
    return Papa.unparse({
      fields: EXPORT_COLUMNS,
      data: preparedRows.map((row) => EXPORT_COLUMNS.map((field) => row[field] || "")),
    });
  }

  function unparseRowsWithFields(rows, fields) {
    const safeRows = rows || [];
    return Papa.unparse({
      fields,
      data: safeRows.map((row) => fields.map((field) => row[field] || "")),
    });
  }

  function chunkRows(rows, chunkSize = DEFAULT_CHUNK_SIZE) {
    const size = parsePositiveInteger(chunkSize, DEFAULT_CHUNK_SIZE);
    const chunks = [];
    for (let index = 0; index < rows.length; index += size) {
      chunks.push(rows.slice(index, index + size));
    }
    return chunks;
  }

  function promptChunkExportOptions(defaultZipFilename, defaultChunkPrefix) {
    let zipFilename = prompt(
      "Enter file name for the ZIP archive:",
      ensureExtension(defaultZipFilename, ".zip"),
    );
    if (!zipFilename) return null;
    zipFilename = ensureExtension(zipFilename, ".zip");

    const defaultPrefix = sanitizeFilePart(defaultChunkPrefix, stripExtension(zipFilename));
    let prefix = prompt(
      "Enter text before the chunk numbering/range:",
      `${defaultPrefix}_`,
    );
    if (prefix === null) return null;
    prefix = sanitizeFilePart(prefix);

    const startInput = prompt(
      "Enter the first number for chunk names (example: 1, 4999, 5000):",
      "1",
    );
    if (startInput === null) return null;
    const startNumber = parsePositiveInteger(startInput, 1);

    const chunkSizeInput = prompt(
      "Enter rows per chunk:",
      String(DEFAULT_CHUNK_SIZE),
    );
    if (chunkSizeInput === null) return null;
    const chunkSize = parsePositiveInteger(chunkSizeInput, DEFAULT_CHUNK_SIZE);

    let suffix = prompt(
      "Enter text after the chunk numbering/range (optional):",
      "",
    );
    if (suffix === null) return null;
    suffix = sanitizeFilePart(suffix);

    return {
      zipFilename,
      prefix,
      suffix,
      startNumber,
      chunkSize,
    };
  }

  function makeChunkFilename(options, chunkIndex, chunkLength) {
    const start = options.startNumber + chunkIndex * options.chunkSize;
    const end = start + chunkLength - 1;
    const label = `${start}-${end}`;
    const prefix = options.prefix || "";
    const suffix = options.suffix || "";
    return sanitizeFilePart(`${prefix}${label}${suffix}`, `chunk_${label}`) + ".csv";
  }

  function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  window.EmailExportUtils = {
    EXPORT_COLUMNS,
    INVALID_EXPORT_COLUMNS: [
      "First Name",
      "Last Name",
      "Email",
      "Original Email",
      "Source",
      "Status",
    ],
    DEFAULT_CHUNK_SIZE,
    autoCorrectEmail,
    buildContact,
    buildInvalidExportRow,
    chunkRows,
    cleanEmail,
    dedupeRowsByEmail,
    detectColumns,
    downloadBlob,
    ensureExtension,
    isValidEmail,
    makeChunkFilename,
    prepareExportRows,
    promptChunkExportOptions,
    unparseExportRows,
    unparseRowsWithFields,
  };
})();
