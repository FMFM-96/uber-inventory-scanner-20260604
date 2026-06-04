import { BrowserCodeReader, BrowserMultiFormatReader } from "https://cdn.jsdelivr.net/npm/@zxing/browser@0.1.5/+esm";

const STORAGE_KEY = "uberInventoryScanner.v1";
const SCAN_COOLDOWN_MS = 2200;

const categoryMap = {
  Beverages: ["Water", "Sparkling Water", "Soda", "Juice", "Energy Drinks", "Sports Drinks", "Coffee & Tea"],
  "Milk & Dairy": ["Milk", "Creamers", "Yogurt", "Cheese", "Butter & Eggs"],
  Beer: ["Domestic Beer", "Imported Beer", "Craft Beer", "Lager", "IPA", "Light Beer", "Non-Alcoholic Beer"],
  Wine: ["Red Wine", "White Wine", "Rose", "Sparkling Wine", "Coolers"],
  "Ready-to-Drink": ["Hard Seltzer", "Cider", "Premixed Cocktails"],
  Snacks: ["Chips", "Crackers", "Popcorn", "Pretzels", "Nuts & Seeds", "Snack Cakes"],
  "Candy & Chocolate": ["Chocolate", "Gummies", "Mints & Gum", "Hard Candy", "Novelty Candy"],
  Pantry: ["Instant Noodles", "Cereal", "Spreads", "Condiments", "Sauces", "Canned Goods", "Baking"],
  Frozen: ["Ice Cream", "Frozen Meals", "Frozen Snacks", "Frozen Desserts"],
  "Ice Cream": ["Pints", "Bars & Sandwiches", "Cones", "Multipacks"],
  "Bread & Bakery": ["Cookies", "Donuts", "Pastries", "Bread", "Brownies"],
  Household: ["Paper Goods", "Garbage Bags", "Kitchen Supplies", "Batteries", "Light Bulbs"],
  Cleaning: ["All-Purpose Cleaners", "Dish Soap", "Air Fresheners", "Pest Control", "Bathroom Cleaners"],
  Laundry: ["Detergent", "Fabric Softener", "Dryer Sheets", "Stain Removers"],
  "Health & Wellness": ["Pain Relief", "Cold & Flu", "Vitamins", "First Aid", "Digestive Health"],
  "Personal Care": ["Oral Care", "Deodorant", "Hair Care", "Skin Care"],
  "Baby & Kids": ["Diapers", "Wipes", "Baby Food"],
  Pet: ["Cat Food", "Dog Food", "Treats", "Litter"]
};

const headers = [
  "Item Name",
  "Item Price",
  "UPC",
  "Image Link",
  "Category"
];

const els = {
  video: document.getElementById("preview"),
  cameraMessage: document.getElementById("cameraMessage"),
  startScanBtn: document.getElementById("startScanBtn"),
  stopScanBtn: document.getElementById("stopScanBtn"),
  voiceBtn: document.getElementById("voiceBtn"),
  autosaveBtn: document.getElementById("autosaveBtn"),
  scannerStatus: document.getElementById("scannerStatus"),
  sheetStatus: document.getElementById("sheetStatus"),
  categoryInput: document.getElementById("categoryInput"),
  subcategoryInput: document.getElementById("subcategoryInput"),
  priceInput: document.getElementById("priceInput"),
  itemNameInput: document.getElementById("itemNameInput"),
  photoLinkInput: document.getElementById("photoLinkInput"),
  notesInput: document.getElementById("notesInput"),
  categoryList: document.getElementById("categoryList"),
  categoryChips: document.getElementById("categoryChips"),
  subcategoryChips: document.getElementById("subcategoryChips"),
  voiceLog: document.getElementById("voiceLog"),
  manualAddBtn: document.getElementById("manualAddBtn"),
  clearCurrentBtn: document.getElementById("clearCurrentBtn"),
  clearFeedBtn: document.getElementById("clearFeedBtn"),
  settingsBtn: document.getElementById("settingsBtn"),
  exportBtn: document.getElementById("exportBtn"),
  feedBody: document.getElementById("feedBody"),
  itemCount: document.getElementById("itemCount"),
  settingsDialog: document.getElementById("settingsDialog"),
  webhookUrlInput: document.getElementById("webhookUrlInput"),
  secretInput: document.getElementById("secretInput"),
  storeNameInput: document.getElementById("storeNameInput"),
  saveSettingsBtn: document.getElementById("saveSettingsBtn"),
  testSheetBtn: document.getElementById("testSheetBtn")
};

const state = {
  rows: [],
  settings: {
    webhookUrl: "",
    secret: "",
    storeName: ""
  },
  autosave: true,
  scanning: false,
  voiceActive: false,
  scanControls: null,
  codeReader: null,
  recognition: null,
  customCategories: {},
  recentScans: new Map(),
  clearConfirmUntil: 0
};

function init() {
  loadState();
  const importedSettings = importSettingsFromUrl();
  renderCategories();
  renderRows();
  bindEvents();
  hydrateFields();
  if (importedSettings) persistState();
  refreshSheetStatus();
  refreshAutosave();
  refreshIcons();
}

function bindEvents() {
  els.startScanBtn.addEventListener("click", startScanner);
  els.stopScanBtn.addEventListener("click", stopScanner);
  els.voiceBtn.addEventListener("click", toggleVoice);
  els.autosaveBtn.addEventListener("click", toggleAutosave);
  els.manualAddBtn.addEventListener("click", addManualItem);
  els.clearCurrentBtn.addEventListener("click", clearCurrentFields);
  els.clearFeedBtn.addEventListener("click", clearFeed);
  els.settingsBtn.addEventListener("click", openSettings);
  els.exportBtn.addEventListener("click", exportCsv);
  els.saveSettingsBtn.addEventListener("click", saveSettingsFromDialog);
  els.testSheetBtn.addEventListener("click", sendTestRow);
  els.categoryInput.addEventListener("input", () => {
    renderSubcategoryChips(els.categoryInput.value);
    persistState();
  });

  [
    els.subcategoryInput,
    els.priceInput,
    els.itemNameInput,
    els.photoLinkInput,
    els.notesInput
  ].forEach((input) => input.addEventListener("input", persistState));
}

function hydrateFields() {
  const draft = getSaved().draft || {};
  els.categoryInput.value = draft.category || "";
  els.subcategoryInput.value = draft.subcategory || "";
  els.priceInput.value = draft.price || "";
  els.itemNameInput.value = draft.itemName || "";
  els.photoLinkInput.value = draft.photoLink || "";
  els.notesInput.value = draft.notes || "";
  renderSubcategoryChips(els.categoryInput.value);
}

function loadState() {
  const saved = getSaved();
  state.rows = Array.isArray(saved.rows) ? saved.rows : [];
  state.settings = {
    webhookUrl: saved.settings?.webhookUrl || "",
    secret: saved.settings?.secret || "",
    storeName: saved.settings?.storeName || ""
  };
  state.customCategories = saved.customCategories && typeof saved.customCategories === "object"
    ? saved.customCategories
    : {};
  state.autosave = saved.autosave !== false;
}

function importSettingsFromUrl() {
  const params = new URLSearchParams(window.location.search);
  const webhookUrl = params.get("webhook") || params.get("webhookUrl");
  const secret = params.get("secret");
  const storeName = params.get("store") || params.get("storeName");
  let imported = false;

  if (webhookUrl) {
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

function getSaved() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
  } catch {
    return {};
  }
}

function persistState() {
  const draft = {
    category: els.categoryInput.value.trim(),
    subcategory: els.subcategoryInput.value.trim(),
    price: els.priceInput.value.trim(),
    itemName: els.itemNameInput.value.trim(),
    photoLink: els.photoLinkInput.value.trim(),
    notes: els.notesInput.value.trim()
  };
  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({
      rows: state.rows.slice(0, 500),
      settings: state.settings,
      customCategories: state.customCategories,
      autosave: state.autosave,
      draft
    })
  );
}

function renderCategories() {
  els.categoryList.innerHTML = "";
  els.categoryChips.innerHTML = "";

  getCategoryNames().forEach((category) => {
    const option = document.createElement("option");
    option.value = category;
    els.categoryList.appendChild(option);

    const chip = document.createElement("button");
    chip.type = "button";
    chip.textContent = category;
    chip.addEventListener("click", () => {
      els.categoryInput.value = category;
      renderSubcategoryChips(category);
      markActiveCategory(category);
      persistState();
    });
    els.categoryChips.appendChild(chip);
  });
}

function renderSubcategoryChips(category) {
  const trimmed = cleanLabel(category);
  const key = getCategoryNames().find((name) => name.toLowerCase() === trimmed.toLowerCase());
  const subcategories = key ? getSubcategories(key) : [];
  els.subcategoryChips.innerHTML = "";
  markActiveCategory(trimmed);

  subcategories.forEach((subcategory) => {
    const chip = document.createElement("button");
    chip.type = "button";
    chip.textContent = subcategory;
    chip.addEventListener("click", () => {
      els.subcategoryInput.value = subcategory;
      persistState();
    });
    els.subcategoryChips.appendChild(chip);
  });
}

function getCategoryNames() {
  const baseNames = Object.keys(categoryMap);
  const customNames = Object.keys(state.customCategories).filter(
    (category) => !baseNames.some((baseCategory) => baseCategory.toLowerCase() === category.toLowerCase())
  );
  return [...baseNames, ...customNames].sort((a, b) => a.localeCompare(b));
}

function getSubcategories(category) {
  const baseKey = Object.keys(categoryMap).find((name) => name.toLowerCase() === category.toLowerCase());
  if (baseKey) return categoryMap[baseKey];

  const customKey = Object.keys(state.customCategories).find((name) => name.toLowerCase() === category.toLowerCase());
  return customKey ? state.customCategories[customKey] : [];
}

function setCategory(value, options = {}) {
  const category = titleCase(value);
  if (!category) return;

  const existing = getCategoryNames().find((name) => name.toLowerCase() === category.toLowerCase());
  if (!existing && !state.customCategories[category]) {
    state.customCategories[category] = [];
    renderCategories();
  }

  els.categoryInput.value = existing || category;
  if (options.clearSubcategory) els.subcategoryInput.value = "";
  renderSubcategoryChips(els.categoryInput.value);
  persistState();
}

function setSubcategory(value) {
  const subcategory = titleCase(value);
  if (!subcategory) return;

  els.subcategoryInput.value = subcategory;
  const category = cleanLabel(els.categoryInput.value);
  if (category && !getSubcategories(category).some((name) => name.toLowerCase() === subcategory.toLowerCase())) {
    const isBaseCategory = Object.keys(categoryMap).some((name) => name.toLowerCase() === category.toLowerCase());
    if (!isBaseCategory) {
      state.customCategories[category] = Array.from(new Set([...(state.customCategories[category] || []), subcategory]));
    }
  }
  persistState();
}

function markActiveCategory(category) {
  Array.from(els.categoryChips.children).forEach((chip) => {
    chip.classList.toggle("active", chip.textContent.toLowerCase() === category.toLowerCase());
  });
}

async function startScanner() {
  if (state.scanning) return;

  if (!window.isSecureContext) {
    setStatus(els.scannerStatus, "Camera needs HTTPS", "warn");
    els.cameraMessage.textContent = "Use HTTPS on iPhone";
  }

  try {
    state.codeReader = state.codeReader || new BrowserMultiFormatReader();
    state.scanning = true;
    setStatus(els.scannerStatus, "Starting camera", "warn");
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
      state.scanControls = await state.codeReader.decodeFromConstraints(
        constraints,
        els.video,
        handleDecodeResult
      );
    } else {
      const devices = await BrowserCodeReader.listVideoInputDevices();
      const rearCamera = devices.find((device) => /back|rear|environment/i.test(device.label));
      state.scanControls = await state.codeReader.decodeFromVideoDevice(
        rearCamera?.deviceId,
        els.video,
        handleDecodeResult
      );
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
  setStatus(els.scannerStatus, "Stopped", "neutral");
  els.cameraMessage.textContent = "Camera idle";
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

  const item = makeItem({
    upc: code.upc,
    barcodeRaw: code.raw,
    barcodeFormat: format || code.kind || ""
  });

  item.status = "Looking up";
  prependRow(item);
  clearPerItemFields();

  try {
    const lookup = await lookupProduct(code.upc, code.raw);
    applyLookup(item, lookup);
  } catch (error) {
    item.lookupSource = "Lookup failed";
    item.notes = joinNotes(item.notes, shortError(error));
  }

  finalizeItem(item);
  updateRow(item);
  persistState();

  if (state.autosave) {
    await postItem(item);
  }
}

function makeItem(overrides = {}) {
  const scannedAt = new Date();
  return {
    id: crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`,
    scannedAt: scannedAt.toISOString(),
    scannedTime: scannedAt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    upc: "",
    barcodeRaw: "",
    barcodeFormat: "",
    itemName: cleanLabel(els.itemNameInput.value),
    brand: "",
    size: "",
    category: cleanLabel(els.categoryInput.value),
    subcategory: cleanLabel(els.subcategoryInput.value),
    price: normalizePrice(els.priceInput.value),
    photoLink: els.photoLinkInput.value.trim(),
    lookupSource: "",
    confidence: "",
    needsReview: "",
    notes: cleanLabel(els.notesInput.value),
    status: "Ready",
    storeName: state.settings.storeName,
    ...overrides
  };
}

function clearPerItemFields() {
  els.priceInput.value = "";
  els.itemNameInput.value = "";
  els.photoLinkInput.value = "";
  els.notesInput.value = "";
  persistState();
}

function clearCurrentFields() {
  els.priceInput.value = "";
  els.itemNameInput.value = "";
  els.photoLinkInput.value = "";
  els.notesInput.value = "";
  persistState();
}

function addManualItem() {
  const item = makeItem();
  finalizeItem(item);
  prependRow(item);
  clearPerItemFields();
  if (state.autosave) {
    postItem(item);
  }
}

function finalizeItem(item) {
  const reviewReasons = [];
  if (!item.itemName) reviewReasons.push("Missing name");
  if (!item.price) reviewReasons.push("Missing price");
  if (!item.upc && !item.photoLink) reviewReasons.push("Missing UPC/photo");

  item.needsReview = reviewReasons.join("; ");
  item.status = reviewReasons.length ? "Review" : "Ready";
  item.confidence = item.confidence || (item.upc ? "UPC captured" : "Manual entry");
  return item;
}

async function lookupProduct(upc, raw) {
  const candidates = Array.from(new Set([upc, raw].filter(Boolean)));

  for (const code of candidates) {
    const url = `https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(
      code
    )}.json?fields=code,product_name,brands,quantity,image_front_url,categories,categories_tags`;
    const response = await fetch(url);
    if (!response.ok) continue;

    const data = await response.json();
    if (data.status === 1 && data.product) {
      const product = data.product;
      return {
        productName: cleanLabel(product.product_name || ""),
        brand: cleanLabel(product.brands || ""),
        size: cleanLabel(product.quantity || ""),
        photoLink: product.image_front_url || "",
        categories: cleanLabel(product.categories || ""),
        sourceCode: code
      };
    }
  }

  return null;
}

function applyLookup(item, lookup) {
  if (!lookup) {
    item.lookupSource = "Open Food Facts";
    item.confidence = "UPC captured";
    return;
  }

  if (!item.itemName && lookup.productName) item.itemName = lookup.productName;
  if (!item.brand && lookup.brand) item.brand = lookup.brand;
  if (!item.size && lookup.size) item.size = lookup.size;
  if (!item.photoLink && lookup.photoLink) item.photoLink = lookup.photoLink;
  item.lookupSource = `Open Food Facts ${lookup.sourceCode || ""}`.trim();
  item.confidence = lookup.productName ? "Product match" : "Partial match";

  if (!item.category && lookup.categories) {
    const firstCategory = lookup.categories.split(",").map(cleanLabel).find(Boolean);
    if (firstCategory) item.category = firstCategory;
  }
}

async function postItem(item) {
  if (!state.settings.webhookUrl) {
    setStatus(els.sheetStatus, "Sheet not connected", "neutral");
    return;
  }

  const payload = {
    secret: state.settings.secret,
    storeName: state.settings.storeName,
    item: toSheetPayload(item)
  };

  try {
    await fetch(state.settings.webhookUrl, {
      method: "POST",
      mode: "no-cors",
      body: JSON.stringify(payload)
    });
    setStatus(els.sheetStatus, "Sent to sheet", "sent");
  } catch (error) {
    setStatus(els.sheetStatus, "Sheet error", "error");
    item.status = "Sheet error";
    item.notes = joinNotes(item.notes, shortError(error));
    updateRow(item);
  }
}

function toSheetPayload(item) {
  return {
    itemName: item.itemName,
    itemPrice: item.price,
    upc: item.upc,
    upcCode: item.upc,
    imageLink: item.photoLink,
    photoLink: item.photoLink,
    category: item.category
  };
}

function prependRow(item) {
  state.rows.unshift(item);
  state.rows = state.rows.slice(0, 500);
  renderRows();
  persistState();
}

function updateRow(item) {
  const index = state.rows.findIndex((row) => row.id === item.id);
  if (index >= 0) {
    state.rows[index] = item;
  }
  renderRows();
}

function renderRows() {
  els.feedBody.innerHTML = "";
  els.itemCount.textContent = `${state.rows.length} ${state.rows.length === 1 ? "item" : "items"}`;

  if (!state.rows.length) {
    const empty = document.createElement("tr");
    empty.className = "empty-row";
    empty.innerHTML = `<td colspan="6">No scans yet</td>`;
    els.feedBody.appendChild(empty);
    return;
  }

  state.rows.forEach((item) => {
    const tr = document.createElement("tr");
    const statusClass =
      item.status === "Ready" ? "ok" : item.status === "Review" || item.status === "Looking up" ? "review" : "error";
    tr.innerHTML = `
      <td>${escapeHtml(item.scannedTime || formatTime(item.scannedAt))}</td>
      <td>${escapeHtml(item.upc || "")}</td>
      <td class="item-cell">
        <span class="item-name">${escapeHtml(item.itemName || "Name needed")}</span>
        <span class="item-meta">${escapeHtml([item.brand, item.size].filter(Boolean).join(" · "))}</span>
      </td>
      <td>${escapeHtml([item.category, item.subcategory].filter(Boolean).join(" > "))}</td>
      <td>${escapeHtml(item.price || "")}</td>
      <td><span class="row-status ${statusClass}">${escapeHtml(item.status)}</span></td>
    `;
    els.feedBody.appendChild(tr);
  });
}

function toggleAutosave() {
  state.autosave = !state.autosave;
  refreshAutosave();
  persistState();
}

function refreshAutosave() {
  els.autosaveBtn.classList.toggle("active", state.autosave);
  els.autosaveBtn.setAttribute("aria-pressed", String(state.autosave));
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

function refreshSheetStatus() {
  if (state.settings.webhookUrl) {
    setStatus(els.sheetStatus, "Sheet connected", "ready");
  } else {
    setStatus(els.sheetStatus, "Sheet not connected", "neutral");
  }
}

async function sendTestRow() {
  saveSettingsFromDialog(new Event("submit"));
  const testItem = finalizeItem({
    ...makeItem(),
    itemName: "Connection Test",
    price: "0.00",
    upc: "000000000000",
    notes: "Scanner connection test"
  });
  await postItem(testItem);
}

function clearFeed() {
  if (!state.rows.length) return;

  if (Date.now() < state.clearConfirmUntil) {
    state.rows = [];
    state.clearConfirmUntil = 0;
    setClearFeedLabel("Clear feed");
    renderRows();
    persistState();
    return;
  }

  state.clearConfirmUntil = Date.now() + 4000;
  setClearFeedLabel("Confirm");
  window.setTimeout(() => {
    if (Date.now() >= state.clearConfirmUntil) {
      state.clearConfirmUntil = 0;
      setClearFeedLabel("Clear feed");
    }
  }, 4100);
}

function setClearFeedLabel(label) {
  const text = els.clearFeedBtn.querySelector("span");
  if (text) text.textContent = label;
}

function exportCsv() {
  const csvRows = [headers, ...state.rows.slice().reverse().map((item) => [
    item.itemName,
    item.price,
    item.upc,
    item.photoLink,
    item.category
  ])];

  const csv = csvRows.map((row) => row.map(csvCell).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `uber-inventory-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

function toggleVoice() {
  if (state.voiceActive) {
    stopVoice();
  } else {
    startVoice();
  }
}

function startVoice() {
  const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!Recognition) {
    els.voiceLog.textContent = "Speech recognition is unavailable in this browser";
    return;
  }

  state.recognition = state.recognition || new Recognition();
  state.recognition.lang = "en-US";
  state.recognition.continuous = true;
  state.recognition.interimResults = true;

  state.recognition.onresult = (event) => {
    let interim = "";
    for (let index = event.resultIndex; index < event.results.length; index += 1) {
      const transcript = event.results[index][0]?.transcript || "";
      if (event.results[index].isFinal) {
        applyVoiceCommand(transcript);
      } else {
        interim += transcript;
      }
    }
    if (interim) els.voiceLog.textContent = interim.trim();
  };

  state.recognition.onerror = (event) => {
    els.voiceLog.textContent = event.error ? `Voice: ${event.error}` : "Voice error";
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
    els.voiceLog.textContent = "Listening";
  } catch (error) {
    state.voiceActive = false;
    refreshVoiceButton();
    els.voiceLog.textContent = shortError(error);
  }
}

function stopVoice() {
  state.voiceActive = false;
  if (state.recognition) {
    state.recognition.stop();
  }
  refreshVoiceButton();
  els.voiceLog.textContent = "Voice idle";
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
  const newSubcategory = captureCommand(text, ["new subcategory", "new sub category", "set subcategory", "set sub category"]);
  const subcategory = captureCommand(text, ["subcategory", "sub category"]);
  const category = captureCommand(text, ["category"], ["subcategory", "sub category"]);
  const priceText = captureCommand(text, ["price", "set price", "cost"]);
  const name = captureCommand(text, ["item name", "name"]);
  const note = captureCommand(text, ["note", "notes"]);

  if (newCategory) setCategory(newCategory, { clearSubcategory: true });
  else if (category) setCategory(category);

  if (newSubcategory) setSubcategory(newSubcategory);
  else if (subcategory) setSubcategory(subcategory);

  if (priceText) els.priceInput.value = parseSpokenPrice(priceText) || normalizePrice(priceText);
  if (name) els.itemNameInput.value = titleCase(name);
  if (note) els.notesInput.value = raw;

  if (text.includes("clear price")) els.priceInput.value = "";
  if (text.includes("clear item") || text.includes("clear name")) els.itemNameInput.value = "";
  if (text.includes("clear subcategory") || text.includes("clear sub category")) els.subcategoryInput.value = "";
  if (text === "save" || text.endsWith(" save")) addManualItem();

  persistState();
  els.voiceLog.textContent = newCategory ? `New category: ${els.categoryInput.value}` : raw;
}

function captureCommand(text, phrases, blockers = []) {
  const allBlockers = ["price", "cost", "item name", "name", "note", "notes", "save", ...blockers];
  for (const phrase of phrases) {
    const escaped = phrase.replace(/\s+/g, "\\s+");
    const regex = new RegExp(`\\b${escaped}\\b(?:\\s+is|\\s+to|\\s+as)?\\s+(.+)$`, "g");
    let match = regex.exec(text);
    while (match && phrase === "category" && /\bsub\s*$/.test(text.slice(0, match.index))) {
      match = regex.exec(text);
    }
    if (!match) continue;
    let value = match[1].trim();
    for (const blocker of allBlockers) {
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

  if (raw.length === 13 && raw.startsWith("0")) {
    return { raw, upc: raw.slice(1), kind: "UPC-A as EAN-13" };
  }

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
      if (/^(UPC|CBD|IPA|RTD|ABV)$/i.test(word)) return word.toUpperCase();
      return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
    })
    .join(" ");
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
  if (/[",\n]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
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
