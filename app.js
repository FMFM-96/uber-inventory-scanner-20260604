import { BrowserCodeReader, BrowserMultiFormatReader } from "https://cdn.jsdelivr.net/npm/@zxing/browser@0.1.5/+esm";

const STORAGE_KEY = "uberCatalogBuilder.v2";
const SCAN_COOLDOWN_MS = 2200;
const PHOTO_MAX_EDGE = 1600;
const PHOTO_QUALITY = 0.72;
const PARSER_MODEL = "gpt-5.4-mini";

const categoryMap = {
  Beer: ["Domestic Beer", "Imported Beer", "Craft Beer", "Lager", "Light Beer", "King Cans"],
  Wine: ["Red Wine", "White Wine", "Rose", "Sparkling Wine"],
  Beverages: ["Water", "Sparkling Water", "Soda", "Juice", "Energy Drinks", "Sports Drinks", "Coffee & Tea"],
  "Milk & Dairy": ["Milk", "Creamers", "Yogurt", "Cheese", "Butter & Eggs"],
  Snacks: ["Chips", "Crackers", "Popcorn", "Pretzels", "Nuts & Seeds", "Snack Cakes"],
  "Candy & Chocolate": ["Chocolate", "Gummies", "Mints & Gum", "Hard Candy"],
  Pantry: ["Instant Noodles", "Cereal", "Spreads", "Condiments", "Canned Goods"],
  Frozen: ["Ice Cream", "Frozen Meals", "Frozen Snacks"],
  Household: ["Paper Goods", "Garbage Bags", "Kitchen Supplies", "Batteries"],
  Cleaning: ["All-Purpose Cleaners", "Dish Soap", "Air Fresheners", "Bathroom Cleaners"],
  Laundry: ["Detergent", "Fabric Softener", "Dryer Sheets", "Stain Removers"],
  "Health & Wellness": ["Pain Relief", "Cold & Flu", "Vitamins", "First Aid"],
  "Personal Care": ["Oral Care", "Deodorant", "Hair Care", "Skin Care"],
  Pet: ["Cat Food", "Dog Food", "Treats", "Litter"]
};

const reviewHeaders = [
  "Entry Type",
  "Photo File",
  "Shelf Position",
  "Detected Item Name",
  "Corrected Item Name",
  "Detected Size/Package",
  "Corrected Size/Package",
  "Item Price",
  "UPC",
  "Category",
  "Status",
  "Image Link",
  "Notes"
];

const els = {
  settingsBtn: document.getElementById("settingsBtn"),
  exportBtn: document.getElementById("exportBtn"),
  categoryInput: document.getElementById("categoryInput"),
  shelfInput: document.getElementById("shelfInput"),
  priceInput: document.getElementById("priceInput"),
  categoryList: document.getElementById("categoryList"),
  modeButtons: Array.from(document.querySelectorAll("[data-mode]")),
  modePanels: Array.from(document.querySelectorAll(".mode-panel")),
  takePhotoInput: document.getElementById("takePhotoInput"),
  galleryPhotoInput: document.getElementById("galleryPhotoInput"),
  takePhotoBtn: document.getElementById("takePhotoBtn"),
  uploadPhotosBtn: document.getElementById("uploadPhotosBtn"),
  clearPhotosBtn: document.getElementById("clearPhotosBtn"),
  photoGrid: document.getElementById("photoGrid"),
  batchNotesInput: document.getElementById("batchNotesInput"),
  submitBatchBtn: document.getElementById("submitBatchBtn"),
  clearManualBtn: document.getElementById("clearManualBtn"),
  manualNameInput: document.getElementById("manualNameInput"),
  manualSizeInput: document.getElementById("manualSizeInput"),
  manualUpcInput: document.getElementById("manualUpcInput"),
  manualImageInput: document.getElementById("manualImageInput"),
  manualNotesInput: document.getElementById("manualNotesInput"),
  manualAddBtn: document.getElementById("manualAddBtn"),
  video: document.getElementById("preview"),
  cameraMessage: document.getElementById("cameraMessage"),
  scannerStatus: document.getElementById("scannerStatus"),
  startScanBtn: document.getElementById("startScanBtn"),
  stopScanBtn: document.getElementById("stopScanBtn"),
  voiceBtn: document.getElementById("voiceBtn"),
  upcNameInput: document.getElementById("upcNameInput"),
  sheetStatus: document.getElementById("sheetStatus"),
  workflowStatus: document.getElementById("workflowStatus"),
  feedBody: document.getElementById("feedBody"),
  itemCount: document.getElementById("itemCount"),
  clearFeedBtn: document.getElementById("clearFeedBtn"),
  settingsDialog: document.getElementById("settingsDialog"),
  webhookUrlInput: document.getElementById("webhookUrlInput"),
  secretInput: document.getElementById("secretInput"),
  storeNameInput: document.getElementById("storeNameInput"),
  saveSettingsBtn: document.getElementById("saveSettingsBtn"),
  testSheetBtn: document.getElementById("testSheetBtn")
};

const state = {
  activeMode: "shelf",
  rows: [],
  photos: [],
  settings: {
    webhookUrl: "",
    secret: "",
    storeName: ""
  },
  scanning: false,
  voiceActive: false,
  scanControls: null,
  codeReader: null,
  recognition: null,
  recentScans: new Map(),
  clearConfirmUntil: 0
};

function init() {
  loadState();
  const importedSettings = importSettingsFromUrl();
  renderCategories();
  bindEvents();
  hydrateDraft();
  setMode(state.activeMode || "shelf");
  renderPhotos();
  renderRows();
  if (importedSettings) persistState();
  refreshSheetStatus();
  refreshIcons();
}

function bindEvents() {
  els.settingsBtn.addEventListener("click", openSettings);
  els.exportBtn.addEventListener("click", exportReviewCsv);
  els.modeButtons.forEach((button) => button.addEventListener("click", () => setMode(button.dataset.mode)));

  els.categoryInput.addEventListener("input", persistState);
  els.shelfInput.addEventListener("input", persistState);
  els.priceInput.addEventListener("input", persistState);
  els.batchNotesInput.addEventListener("input", persistState);

  els.takePhotoBtn.addEventListener("click", () => els.takePhotoInput.click());
  els.uploadPhotosBtn.addEventListener("click", () => els.galleryPhotoInput.click());
  els.takePhotoInput.addEventListener("change", addSelectedPhotos);
  els.galleryPhotoInput.addEventListener("change", addSelectedPhotos);
  els.clearPhotosBtn.addEventListener("click", clearPhotos);
  els.submitBatchBtn.addEventListener("click", queueShelfBatch);

  [
    els.manualNameInput,
    els.manualSizeInput,
    els.manualUpcInput,
    els.manualImageInput,
    els.manualNotesInput,
    els.upcNameInput
  ].forEach((input) => input.addEventListener("input", persistState));

  els.clearManualBtn.addEventListener("click", clearManualFields);
  els.manualAddBtn.addEventListener("click", addManualRow);
  els.startScanBtn.addEventListener("click", startScanner);
  els.stopScanBtn.addEventListener("click", stopScanner);
  els.voiceBtn.addEventListener("click", toggleVoice);
  els.clearFeedBtn.addEventListener("click", clearFeed);
  els.saveSettingsBtn.addEventListener("click", saveSettingsFromDialog);
  els.testSheetBtn.addEventListener("click", sendTestRow);
}

function loadState() {
  const saved = getSaved();
  state.activeMode = saved.activeMode || "shelf";
  state.rows = Array.isArray(saved.rows) ? saved.rows : [];
  state.settings = {
    webhookUrl: saved.settings?.webhookUrl || "",
    secret: saved.settings?.secret || "",
    storeName: saved.settings?.storeName || ""
  };
}

function hydrateDraft() {
  const draft = getSaved().draft || {};
  els.categoryInput.value = draft.category || "";
  els.shelfInput.value = draft.shelf || "";
  els.priceInput.value = draft.price || "";
  els.batchNotesInput.value = draft.batchNotes || "";
  els.manualNameInput.value = draft.manualName || "";
  els.manualSizeInput.value = draft.manualSize || "";
  els.manualUpcInput.value = draft.manualUpc || "";
  els.manualImageInput.value = draft.manualImage || "";
  els.manualNotesInput.value = draft.manualNotes || "";
  els.upcNameInput.value = draft.upcName || "";
}

function getSaved() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
  } catch {
    return {};
  }
}

function persistState() {
  const draft = {
    category: cleanLabel(els.categoryInput.value),
    shelf: cleanLabel(els.shelfInput.value),
    price: els.priceInput.value.trim(),
    batchNotes: cleanLabel(els.batchNotesInput.value),
    manualName: cleanLabel(els.manualNameInput.value),
    manualSize: cleanLabel(els.manualSizeInput.value),
    manualUpc: cleanLabel(els.manualUpcInput.value),
    manualImage: els.manualImageInput.value.trim(),
    manualNotes: cleanLabel(els.manualNotesInput.value),
    upcName: cleanLabel(els.upcNameInput.value)
  };

  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({
      activeMode: state.activeMode,
      rows: state.rows.slice(0, 500),
      settings: state.settings,
      draft
    })
  );
}

function importSettingsFromUrl() {
  const params = new URLSearchParams(window.location.search);
  const webhookUrl = params.get("webhook") || params.get("webhookUrl");
  const workflow = params.get("workflow");
  const secret = params.get("secret");
  const storeName = params.get("store") || params.get("storeName");
  let imported = false;

  if (webhookUrl && workflow === "review-v2") {
    state.settings.webhookUrl = webhookUrl.trim();
    imported = true;
  }
  if (secret !== null) {
    state.settings.secret = secret.trim();
    imported = true;
  }
  if (storeName !== null) {
    state.settings.storeName = storeName.trim();
    imported = true;
  }

  if (imported) {
    const cleanUrl = `${window.location.origin}${window.location.pathname}${window.location.hash}`;
    window.history.replaceState({}, document.title, cleanUrl);
  }

  return imported;
}

function renderCategories() {
  els.categoryList.innerHTML = "";
  Object.keys(categoryMap).sort((a, b) => a.localeCompare(b)).forEach((category) => {
    const option = document.createElement("option");
    option.value = category;
    els.categoryList.appendChild(option);
  });
}

function setMode(mode) {
  state.activeMode = mode || "shelf";
  els.modeButtons.forEach((button) => button.classList.toggle("active", button.dataset.mode === state.activeMode));
  els.modePanels.forEach((panel) => panel.classList.toggle("active", panel.id === `${state.activeMode}Panel`));
  if (state.activeMode !== "upc") stopScanner();
  persistState();
  refreshIcons();
}

async function addSelectedPhotos(event) {
  const files = Array.from(event.target.files || []);
  if (!files.length) return;
  const source = event.target.dataset.source || "gallery";

  setStatus(els.workflowStatus, "Preparing photos", "warn");
  for (const file of files) {
    try {
      const photo = await compressPhoto(file, source);
      state.photos.push(photo);
    } catch (error) {
      setStatus(els.workflowStatus, shortError(error), "error");
    }
  }

  event.target.value = "";
  renderPhotos();
  setStatus(els.workflowStatus, `${state.photos.length} photo${state.photos.length === 1 ? "" : "s"} ready`, "ready");
}

async function compressPhoto(file, source = "gallery") {
  const dataUrl = await readAsDataUrl(file);
  const image = await loadImage(dataUrl);
  const scale = Math.min(1, PHOTO_MAX_EDGE / Math.max(image.naturalWidth, image.naturalHeight));
  const width = Math.max(1, Math.round(image.naturalWidth * scale));
  const height = Math.max(1, Math.round(image.naturalHeight * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  context.drawImage(image, 0, 0, width, height);
  const compressed = canvas.toDataURL("image/jpeg", PHOTO_QUALITY);

  return {
    id: makeId(),
    name: safeFileName(file.name || `shelf-${Date.now()}.jpg`),
    mimeType: "image/jpeg",
    dataUrl: compressed,
    originalSize: file.size,
    compressedSize: Math.round((compressed.length * 3) / 4),
    source,
    sourceLabel: source === "camera" ? "Camera" : "Gallery",
    width,
    height
  };
}

function readAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(reader.error || new Error("Could not read photo"));
    reader.readAsDataURL(file);
  });
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Could not load photo"));
    image.src = src;
  });
}

function renderPhotos() {
  els.photoGrid.innerHTML = "";

  if (!state.photos.length) {
    const empty = document.createElement("div");
    empty.className = "photo-empty";
    empty.textContent = "No photos selected";
    els.photoGrid.appendChild(empty);
    return;
  }

  state.photos.forEach((photo) => {
    const card = document.createElement("article");
    card.className = "photo-card";
    card.innerHTML = `
      <img src="${photo.dataUrl}" alt="" />
      <div>
        <strong>${escapeHtml(photo.name)}</strong>
        <span>${escapeHtml(photo.sourceLabel || "Photo")} · ${photo.width}x${photo.height}</span>
      </div>
      <button type="button" class="icon-button compact" aria-label="Remove photo" title="Remove photo">
        <i data-lucide="x"></i>
      </button>
    `;
    card.querySelector("button").addEventListener("click", () => removePhoto(photo.id));
    els.photoGrid.appendChild(card);
  });
  refreshIcons();
}

function removePhoto(id) {
  state.photos = state.photos.filter((photo) => photo.id !== id);
  renderPhotos();
  setStatus(els.workflowStatus, `${state.photos.length} photo${state.photos.length === 1 ? "" : "s"} ready`, "ready");
}

function clearPhotos() {
  state.photos = [];
  renderPhotos();
  setStatus(els.workflowStatus, "Photos cleared", "neutral");
}

async function queueShelfBatch() {
  if (!state.photos.length) {
    setStatus(els.workflowStatus, "Add photos first", "warn");
    return;
  }

  const category = cleanLabel(els.categoryInput.value);
  if (!category) {
    setStatus(els.workflowStatus, "Category needed", "warn");
    els.categoryInput.focus();
    return;
  }

  const shelfPosition = cleanLabel(els.shelfInput.value);
  const batchId = makeBatchId(category, shelfPosition);
  const row = makeReviewRow({
    entryType: "Shelf Photo",
    batchId,
    itemName: `${[category, shelfPosition].filter(Boolean).join(" · ")} · ${state.photos.length} shelf photo${state.photos.length === 1 ? "" : "s"}`,
    category,
    shelfPosition,
    status: "Needs AI Parse",
    confidence: "Queued",
    notes: cleanLabel(els.batchNotesInput.value)
  });

  prependRow(row);
  setStatus(els.workflowStatus, "Sending photo batch", "warn");
  await postWorkflow({
    action: "captureBatch",
    batch: {
      id: batchId,
      category,
      shelfPosition,
      itemPrice: normalizePrice(els.priceInput.value),
      notes: cleanLabel(els.batchNotesInput.value),
      parserModel: PARSER_MODEL,
      parserMode: "low-detail-first",
      photos: state.photos.map(({ id, name, mimeType, dataUrl, width, height, compressedSize, source }) => ({
        id,
        name,
        mimeType,
        dataUrl,
        width,
        height,
        compressedSize,
        source
      }))
    }
  });

  row.status = "Queued";
  updateRow(row);
  clearPhotos();
  els.batchNotesInput.value = "";
  persistState();
}

function addManualRow() {
  const name = cleanLabel(els.manualNameInput.value);
  const size = cleanLabel(els.manualSizeInput.value);
  const notes = cleanLabel(els.manualNotesInput.value);

  if (!name && !notes) {
    setStatus(els.workflowStatus, "Name or note needed", "warn");
    els.manualNameInput.focus();
    return;
  }

  const row = makeReviewRow({
    entryType: "Manual",
    itemName: name,
    size,
    price: normalizePrice(els.priceInput.value),
    upc: normalizeBarcode(els.manualUpcInput.value).upc,
    imageLink: els.manualImageInput.value.trim(),
    category: cleanLabel(els.categoryInput.value),
    shelfPosition: cleanLabel(els.shelfInput.value),
    status: name ? "Needs Review" : "Needs Details",
    confidence: "Manual entry",
    notes
  });

  prependRow(row);
  postReviewEntry(row);
  clearManualFields();
}

function clearManualFields() {
  els.manualNameInput.value = "";
  els.manualSizeInput.value = "";
  els.manualUpcInput.value = "";
  els.manualImageInput.value = "";
  els.manualNotesInput.value = "";
  persistState();
}

async function startScanner() {
  if (state.scanning) return;

  if (!window.isSecureContext) {
    setStatus(els.scannerStatus, "HTTPS needed", "warn");
    els.cameraMessage.textContent = "Use HTTPS on iPhone";
  }

  try {
    state.codeReader = state.codeReader || new BrowserMultiFormatReader();
    state.scanning = true;
    setStatus(els.scannerStatus, "Starting", "warn");
    els.cameraMessage.textContent = "Starting camera";

    const constraints = {
      audio: false,
      video: {
        facingMode: { ideal: "environment" },
        width: { ideal: 1280 },
        height: { ideal: 720 }
      }
    };

    if (typeof state.codeReader.decodeFromConstraints === "function") {
      state.scanControls = await state.codeReader.decodeFromConstraints(constraints, els.video, handleDecodeResult);
    } else {
      const devices = await BrowserCodeReader.listVideoInputDevices();
      const rearCamera = devices.find((device) => /back|rear|environment/i.test(device.label));
      state.scanControls = await state.codeReader.decodeFromVideoDevice(rearCamera?.deviceId, els.video, handleDecodeResult);
    }

    setStatus(els.scannerStatus, "Scanning", "ready");
    els.cameraMessage.textContent = "Scanning";
  } catch (error) {
    state.scanning = false;
    setStatus(els.scannerStatus, "Camera error", "error");
    els.cameraMessage.textContent = shortError(error);
  }
}

function stopScanner() {
  if (state.scanControls && typeof state.scanControls.stop === "function") {
    state.scanControls.stop();
  }
  state.scanControls = null;
  state.scanning = false;
  if (els.scannerStatus) setStatus(els.scannerStatus, "Camera idle", "neutral");
  if (els.cameraMessage) els.cameraMessage.textContent = "Camera idle";
}

function handleDecodeResult(result) {
  if (!result) return;
  const text = typeof result.getText === "function" ? result.getText() : String(result.text || "");
  const format = typeof result.getBarcodeFormat === "function" ? String(result.getBarcodeFormat()) : "";
  handleScan(text, format);
}

async function handleScan(rawText, format) {
  const code = normalizeBarcode(rawText);
  if (!code.upc) return;

  const now = Date.now();
  const lastSeen = state.recentScans.get(code.upc) || 0;
  if (now - lastSeen < SCAN_COOLDOWN_MS) return;
  state.recentScans.set(code.upc, now);

  beep();
  setStatus(els.scannerStatus, `Scanned ${code.upc}`, "ready");

  const row = makeReviewRow({
    entryType: "UPC Scan",
    itemName: cleanLabel(els.upcNameInput.value),
    category: cleanLabel(els.categoryInput.value),
    shelfPosition: cleanLabel(els.shelfInput.value),
    price: normalizePrice(els.priceInput.value),
    upc: code.upc,
    status: "Needs Review",
    confidence: format || code.kind || "UPC captured",
    notes: "UPC fallback"
  });

  prependRow(row);

  try {
    const lookup = await lookupProduct(code.upc, code.raw);
    if (lookup) {
      if (!row.itemName && lookup.productName) row.itemName = lookup.productName;
      if (!row.size && lookup.size) row.size = lookup.size;
      if (!row.imageLink && lookup.photoLink) row.imageLink = lookup.photoLink;
      row.notes = joinNotes(row.notes, lookup.brand || lookup.source || "");
      updateRow(row);
    }
  } catch (error) {
    row.notes = joinNotes(row.notes, shortError(error));
    updateRow(row);
  }

  postReviewEntry(row);
  els.upcNameInput.value = "";
  persistState();
}

async function lookupProduct(upc, raw) {
  const candidates = Array.from(new Set([upc, raw].filter(Boolean)));

  for (const code of candidates) {
    const url = `https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(
      code
    )}.json?fields=code,product_name,brands,quantity,image_front_url`;
    const response = await fetch(url);
    if (!response.ok) continue;

    const data = await response.json();
    if (data.status === 1 && data.product) {
      return {
        productName: cleanLabel(data.product.product_name || ""),
        brand: cleanLabel(data.product.brands || ""),
        size: cleanLabel(data.product.quantity || ""),
        photoLink: data.product.image_front_url || "",
        source: `Open Food Facts ${code}`
      };
    }
  }

  return null;
}

function makeReviewRow(overrides = {}) {
  const createdAt = new Date();
  return {
    id: makeId(),
    batchId: "",
    createdAt: createdAt.toISOString(),
    createdTime: createdAt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    entryType: "Manual",
    photoFile: "",
    shelfPosition: "",
    itemName: "",
    correctedItemName: "",
    size: "",
    correctedSize: "",
    price: "",
    upc: "",
    category: cleanLabel(els.categoryInput.value),
    status: "Needs Review",
    imageLink: "",
    photoFileUrl: "",
    confidence: "",
    parserModel: PARSER_MODEL,
    notes: "",
    storeName: state.settings.storeName,
    ...overrides
  };
}

function prependRow(row) {
  state.rows.unshift(row);
  state.rows = state.rows.slice(0, 500);
  renderRows();
  persistState();
}

function updateRow(row) {
  const index = state.rows.findIndex((candidate) => candidate.id === row.id);
  if (index >= 0) state.rows[index] = row;
  renderRows();
  persistState();
}

function renderRows() {
  els.feedBody.innerHTML = "";
  els.itemCount.textContent = `${state.rows.length} ${state.rows.length === 1 ? "row" : "rows"}`;

  if (!state.rows.length) {
    const empty = document.createElement("tr");
    empty.className = "empty-row";
    empty.innerHTML = `<td colspan="5">No rows yet</td>`;
    els.feedBody.appendChild(empty);
    return;
  }

  state.rows.forEach((row) => {
    const statusClass = row.status === "Queued" || row.status === "Ready" ? "ok" : row.status === "Failed" ? "error" : "review";
    const itemText = row.itemName || row.correctedItemName || row.batchId || "Details needed";
    const meta = [row.size || row.correctedSize, row.upc].filter(Boolean).join(" · ");
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${escapeHtml(row.createdTime || formatTime(row.createdAt))}</td>
      <td>${escapeHtml(row.entryType)}</td>
      <td class="item-cell">
        <span class="item-name">${escapeHtml(itemText)}</span>
        <span class="item-meta">${escapeHtml(meta)}</span>
      </td>
      <td>${escapeHtml(row.category || "")}</td>
      <td><span class="row-status ${statusClass}">${escapeHtml(row.status)}</span></td>
    `;
    els.feedBody.appendChild(tr);
  });
}

async function postReviewEntry(row) {
  await postWorkflow({
    action: "reviewEntry",
    entry: toReviewPayload(row),
    item: toCatalogPayload(row)
  });
}

async function postWorkflow(payload) {
  if (!state.settings.webhookUrl) {
    setStatus(els.sheetStatus, "Sheet not connected", "neutral");
    return;
  }

  const body = {
    secret: state.settings.secret,
    storeName: state.settings.storeName,
    parserModel: PARSER_MODEL,
    ...payload
  };

  try {
    await fetch(state.settings.webhookUrl, {
      method: "POST",
      mode: "no-cors",
      body: JSON.stringify(body)
    });
    setStatus(els.sheetStatus, "Sent to sheet", "sent");
    setStatus(els.workflowStatus, "Queued", "ready");
  } catch (error) {
    setStatus(els.sheetStatus, "Sheet error", "error");
    setStatus(els.workflowStatus, shortError(error), "error");
  }
}

function toReviewPayload(row) {
  return {
    id: row.id,
    batchId: row.batchId,
    createdAt: row.createdAt,
    entryType: row.entryType,
    photoFile: row.photoFile,
    shelfPosition: row.shelfPosition,
    detectedItemName: row.itemName,
    correctedItemName: row.correctedItemName,
    detectedSizePackage: row.size,
    correctedSizePackage: row.correctedSize,
    itemPrice: row.price,
    upc: row.upc,
    category: row.category,
    status: row.status,
    imageLink: row.imageLink,
    photoFileUrl: row.photoFileUrl,
    confidence: row.confidence,
    parserModel: row.parserModel || PARSER_MODEL,
    notes: row.notes,
    storeName: state.settings.storeName
  };
}

function toCatalogPayload(row) {
  return {
    itemName: row.correctedItemName || row.itemName || "",
    itemPrice: row.price || "",
    upc: row.upc || "",
    upcCode: row.upc || "",
    imageLink: row.imageLink || "",
    photoLink: row.imageLink || "",
    category: row.category || ""
  };
}

function exportReviewCsv() {
  const csvRows = [
    reviewHeaders,
    ...state.rows.slice().reverse().map((row) => [
      row.entryType,
      row.photoFile || row.photoFileUrl,
      row.shelfPosition,
      row.itemName,
      row.correctedItemName,
      row.size,
      row.correctedSize,
      row.price,
      row.upc,
      row.category,
      row.status,
      row.imageLink,
      row.notes
    ])
  ];

  const csv = csvRows.map((row) => row.map(csvCell).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `uber-review-queue-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

function openSettings() {
  els.webhookUrlInput.value = state.settings.webhookUrl;
  els.secretInput.value = state.settings.secret;
  els.storeNameInput.value = state.settings.storeName;
  els.settingsDialog.showModal();
}

function saveSettingsFromDialog(event) {
  event.preventDefault();
  state.settings.webhookUrl = els.webhookUrlInput.value.trim();
  state.settings.secret = els.secretInput.value.trim();
  state.settings.storeName = els.storeNameInput.value.trim();
  persistState();
  refreshSheetStatus();
  els.settingsDialog.close();
}

async function sendTestRow() {
  saveSettingsFromDialog(new Event("submit"));
  const row = makeReviewRow({
    entryType: "Manual",
    itemName: "Connection Test",
    price: "0.00",
    upc: "000000000000",
    category: cleanLabel(els.categoryInput.value) || "Test",
    status: "Needs Review",
    confidence: "Connection test",
    notes: "Catalog builder connection test"
  });
  prependRow(row);
  await postReviewEntry(row);
}

function refreshSheetStatus() {
  if (state.settings.webhookUrl) {
    setStatus(els.sheetStatus, "Sheet connected", "ready");
  } else {
    setStatus(els.sheetStatus, "Sheet not connected", "neutral");
  }
}

function clearFeed() {
  if (!state.rows.length) return;

  if (Date.now() < state.clearConfirmUntil) {
    state.rows = [];
    state.clearConfirmUntil = 0;
    setClearFeedLabel("Clear local feed");
    renderRows();
    persistState();
    return;
  }

  state.clearConfirmUntil = Date.now() + 4000;
  setClearFeedLabel("Confirm");
  window.setTimeout(() => {
    if (Date.now() >= state.clearConfirmUntil) {
      state.clearConfirmUntil = 0;
      setClearFeedLabel("Clear local feed");
    }
  }, 4100);
}

function setClearFeedLabel(label) {
  const text = els.clearFeedBtn.querySelector("span");
  if (text) text.textContent = label;
}

function toggleVoice() {
  if (state.voiceActive) stopVoice();
  else startVoice();
}

function startVoice() {
  const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!Recognition) {
    setStatus(els.workflowStatus, "Voice unavailable", "warn");
    return;
  }

  state.recognition = state.recognition || new Recognition();
  state.recognition.lang = "en-US";
  state.recognition.continuous = true;
  state.recognition.interimResults = false;

  state.recognition.onresult = (event) => {
    for (let index = event.resultIndex; index < event.results.length; index += 1) {
      const transcript = event.results[index][0]?.transcript || "";
      if (event.results[index].isFinal) applyVoiceCommand(transcript);
    }
  };

  state.recognition.onerror = (event) => {
    setStatus(els.workflowStatus, event.error ? `Voice: ${event.error}` : "Voice error", "error");
  };

  state.recognition.onend = () => {
    if (state.voiceActive) {
      window.setTimeout(() => {
        try {
          state.recognition.start();
        } catch {
          state.voiceActive = false;
          refreshVoiceButton();
        }
      }, 400);
    }
  };

  try {
    state.voiceActive = true;
    state.recognition.start();
    refreshVoiceButton();
    setStatus(els.workflowStatus, "Listening", "ready");
  } catch (error) {
    state.voiceActive = false;
    refreshVoiceButton();
    setStatus(els.workflowStatus, shortError(error), "error");
  }
}

function stopVoice() {
  state.voiceActive = false;
  if (state.recognition) state.recognition.stop();
  refreshVoiceButton();
  setStatus(els.workflowStatus, "Ready", "ready");
}

function refreshVoiceButton() {
  els.voiceBtn.classList.toggle("active", state.voiceActive);
  els.voiceBtn.setAttribute("aria-pressed", String(state.voiceActive));
}

function applyVoiceCommand(transcript) {
  const raw = transcript.trim();
  const text = raw.toLowerCase().replace(/[.,;:]/g, " ").replace(/\s+/g, " ").trim();
  if (!text) return;

  const newCategory = captureCommand(text, [
    "new category",
    "new aisle",
    "start category",
    "start aisle",
    "switch category",
    "change category",
    "set category"
  ]);
  const shelf = captureCommand(text, ["shelf", "section", "set shelf", "set section"]);
  const priceText = captureCommand(text, ["price", "set price", "cost"]);
  const name = captureCommand(text, ["item name", "name"]);
  const size = captureCommand(text, ["size", "package"]);
  const note = captureCommand(text, ["note", "notes"]);

  if (newCategory) els.categoryInput.value = titleCase(newCategory);
  if (shelf) els.shelfInput.value = titleCase(shelf);
  if (priceText) els.priceInput.value = parseSpokenPrice(priceText) || normalizePrice(priceText);
  if (name) els.manualNameInput.value = titleCase(name);
  if (size) els.manualSizeInput.value = cleanLabel(size);
  if (note) {
    if (state.activeMode === "shelf") els.batchNotesInput.value = raw;
    else els.manualNotesInput.value = raw;
  }

  if (text.includes("clear price")) els.priceInput.value = "";
  if (text.includes("clear item") || text.includes("clear name")) els.manualNameInput.value = "";
  if (text === "save" || text.endsWith(" save")) addManualRow();

  persistState();
  setStatus(els.workflowStatus, newCategory ? `Category: ${els.categoryInput.value}` : "Voice updated", "ready");
}

function captureCommand(text, phrases, blockers = []) {
  const allBlockers = ["price", "cost", "item name", "name", "note", "notes", "save", "size", "package", ...blockers];
  for (const phrase of phrases) {
    const escaped = phrase.replace(/\s+/g, "\\s+");
    const regex = new RegExp(`\\b${escaped}\\b(?:\\s+is|\\s+to|\\s+as)?\\s+(.+)$`, "g");
    const match = regex.exec(text);
    if (!match) continue;
    let value = match[1].trim();
    for (const blocker of allBlockers) {
      if (blocker === phrase) continue;
      const blockerRegex = new RegExp(`\\b${blocker.replace(/\s+/g, "\\s+")}\\b`);
      const blockerMatch = value.search(blockerRegex);
      if (blockerMatch > 0) value = value.slice(0, blockerMatch).trim();
    }
    return cleanLabel(value);
  }
  return "";
}

function parseSpokenPrice(value) {
  const direct = normalizePrice(value);
  if (direct) return direct;

  const tokens = value
    .toLowerCase()
    .replace(/\b(dollars?|bucks?|and|cents?)\b/g, " ")
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean);

  const digitIndex = tokens.findIndex((token) => /^\d+$/.test(token));
  if (digitIndex >= 0) {
    const dollars = tokens[digitIndex];
    const cents = tokens.slice(digitIndex + 1).join(" ");
    const centValue = wordsToNumber(cents);
    if (centValue !== null) return `${Number(dollars).toFixed(0)}.${String(centValue).padStart(2, "0")}`;
  }

  const firstTokenValue = wordsToNumber(tokens[0] || "");
  const centsValue = wordsToNumber(tokens.slice(1).join(" "));
  if (firstTokenValue !== null && centsValue !== null) {
    return `${firstTokenValue}.${String(centsValue).padStart(2, "0")}`;
  }

  return "";
}

function wordsToNumber(words) {
  if (!words) return null;
  const values = {
    zero: 0,
    one: 1,
    two: 2,
    three: 3,
    four: 4,
    five: 5,
    six: 6,
    seven: 7,
    eight: 8,
    nine: 9,
    ten: 10,
    eleven: 11,
    twelve: 12,
    thirteen: 13,
    fourteen: 14,
    fifteen: 15,
    sixteen: 16,
    seventeen: 17,
    eighteen: 18,
    nineteen: 19,
    twenty: 20,
    thirty: 30,
    forty: 40,
    fifty: 50,
    sixty: 60,
    seventy: 70,
    eighty: 80,
    ninety: 90
  };

  if (/^\d+$/.test(words)) return Number(words);
  return words.split(/\s+/).reduce((sum, word) => {
    if (!(word in values) || sum === null) return null;
    return sum + values[word];
  }, 0);
}

function normalizeBarcode(rawText) {
  const raw = String(rawText || "").replace(/\D/g, "");
  if (!raw) return { raw: "", upc: "" };
  if (raw.length === 13 && raw.startsWith("0")) return { raw, upc: raw.slice(1), kind: "UPC-A as EAN-13" };
  return { raw, upc: raw, kind: raw.length === 12 ? "UPC-A" : "Barcode" };
}

function normalizePrice(value) {
  const text = String(value || "").trim();
  if (!text) return "";
  const match = text.replace(/,/g, "").match(/\$?\s*(\d+)(?:\.(\d{1,2}))?/);
  if (!match) return "";
  const dollars = Number(match[1]);
  const cents = match[2] ? match[2].padEnd(2, "0") : "00";
  return `${dollars}.${cents}`;
}

function cleanLabel(value) {
  return String(value || "").trim().replace(/\s+/g, " ");
}

function titleCase(value) {
  return cleanLabel(value)
    .split(" ")
    .map((word) => {
      if (/^(UPC|CBD|IPA|RTD|ABV|ML|L)$/i.test(word)) return word.toUpperCase();
      return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
    })
    .join(" ");
}

function safeFileName(value) {
  const clean = String(value || "photo.jpg").replace(/[^\w.\-]+/g, "-").replace(/-+/g, "-");
  return clean || "photo.jpg";
}

function makeBatchId(category, shelfPosition) {
  const timestamp = new Date().toISOString().replace(/[-:T.Z]/g, "").slice(0, 14);
  const categoryPart = batchSlug(category) || "category";
  const shelfPart = batchSlug(shelfPosition) || "shelf";
  const uniquePart = makeId().replace(/[^\w]+/g, "").slice(0, 8);
  return `batch-${categoryPart}-${shelfPart}-${timestamp}-${uniquePart}`;
}

function batchSlug(value) {
  return cleanLabel(value)
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 28);
}

function makeId() {
  return crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function setStatus(element, text, kind) {
  element.textContent = text;
  element.className = `status-pill ${kind || "neutral"}`;
}

function formatTime(iso) {
  if (!iso) return "";
  return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function shortError(error) {
  return String(error?.message || error || "Unknown error").slice(0, 120);
}

function joinNotes(existing, next) {
  return [existing, next].filter(Boolean).join(" | ");
}

function csvCell(value) {
  const text = String(value ?? "");
  if (/[",\n]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function beep() {
  try {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    const context = new AudioContext();
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.frequency.value = 880;
    oscillator.type = "sine";
    gain.gain.setValueAtTime(0.001, context.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.12, context.currentTime + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.001, context.currentTime + 0.12);
    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.start();
    oscillator.stop(context.currentTime + 0.13);
  } catch {
    // Silent fallback when the browser blocks audio feedback.
  }
}

function refreshIcons() {
  window.setTimeout(() => {
    if (window.lucide) window.lucide.createIcons();
  }, 0);
}

init();
