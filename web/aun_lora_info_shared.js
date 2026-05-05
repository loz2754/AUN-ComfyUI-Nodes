import { api } from "../../scripts/api.js";

const STYLE_KEY = "__AUNLoraInfoDialogStyle";
const MODAL_KEY = "__AUNLoraInfoDialogRefs";
let requestToken = 0;

function ensureStyles() {
  if (window[STYLE_KEY]) {
    return;
  }
  const style = document.createElement("style");
  style.textContent = `
    .AUN-lora-info-overlay {
      position: fixed;
      inset: 0;
      display: none;
      align-items: center;
      justify-content: center;
      padding: 20px;
      background: rgba(8, 10, 14, 0.72);
      backdrop-filter: blur(3px);
      z-index: 100000;
    }
    .AUN-lora-info-dialog {
      width: min(920px, calc(100vw - 32px));
      max-height: calc(100vh - 40px);
      overflow: auto;
      border-radius: 18px;
      border: 1px solid rgba(210, 224, 242, 0.12);
      background:
        radial-gradient(circle at top right, rgba(88, 144, 214, 0.18), transparent 34%),
        linear-gradient(180deg, rgba(29, 34, 43, 0.98), rgba(14, 18, 24, 0.99));
      box-shadow: 0 24px 60px rgba(0, 0, 0, 0.46);
      color: #eef2f7;
      font: 12px/1.5 system-ui, sans-serif;
    }
    .AUN-lora-info-header {
      position: sticky;
      top: 0;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 16px;
      padding: 18px 20px 12px;
      background: linear-gradient(180deg, rgba(21, 26, 34, 0.99), rgba(21, 26, 34, 0.76));
      backdrop-filter: blur(8px);
      border-bottom: 1px solid rgba(255, 255, 255, 0.08);
    }
    .AUN-lora-info-heading {
      min-width: 0;
      display: flex;
      flex-direction: column;
      gap: 4px;
    }
    .AUN-lora-info-title {
      margin: 0;
      font-size: 20px;
      font-weight: 700;
      letter-spacing: 0.01em;
      line-height: 1.15;
    }
    .AUN-lora-info-subtitle {
      color: #9cb0c7;
      font-size: 12px;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .AUN-lora-info-close {
      width: 28px;
      height: 28px;
      border: 0;
      border-radius: 999px;
      background: rgba(255, 255, 255, 0.12);
      color: #fff;
      cursor: pointer;
      font-size: 16px;
      line-height: 1;
    }
    .AUN-lora-info-body {
      padding: 18px 20px 20px;
    }
    .AUN-lora-info-badges {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      margin-bottom: 12px;
    }
    .AUN-lora-info-status {
      display: none;
      margin-bottom: 14px;
      padding: 9px 12px;
      border: 1px solid rgba(255, 255, 255, 0.08);
      border-radius: 11px;
      background: rgba(255, 255, 255, 0.04);
      color: #bfd0e2;
    }
    .AUN-lora-info-actions {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      margin-bottom: 14px;
    }
    .AUN-lora-info-action {
      min-height: 28px;
      padding: 0 10px;
      border: 1px solid rgba(255, 255, 255, 0.1);
      border-radius: 999px;
      background: rgba(255, 255, 255, 0.05);
      color: #eef2f7;
      cursor: pointer;
      font: 12px/1 system-ui, sans-serif;
      transition: background 120ms ease, border-color 120ms ease, transform 120ms ease;
    }
    .AUN-lora-info-action:hover {
      background: rgba(255, 255, 255, 0.1);
      border-color: rgba(171, 208, 246, 0.22);
      transform: translateY(-1px);
    }
    .AUN-lora-info-action:disabled {
      opacity: 0.45;
      cursor: default;
      transform: none;
    }
    .AUN-lora-info-badge {
      padding: 4px 9px;
      border-radius: 999px;
      background: rgba(125, 181, 255, 0.14);
      border: 1px solid rgba(125, 181, 255, 0.24);
      color: #b7d6ff;
      font-size: 11px;
      font-weight: 600;
      letter-spacing: 0.02em;
    }
    .AUN-lora-info-grid {
      display: grid;
      grid-template-columns: minmax(0, 1.08fr) minmax(250px, 0.92fr);
      gap: 18px;
      align-items: start;
    }
    .AUN-lora-info-trained {
      margin-bottom: 16px;
      border: 1px solid rgba(255, 255, 255, 0.08);
      border-radius: 12px;
      background: rgba(255, 255, 255, 0.03);
      overflow: hidden;
    }
    .AUN-lora-info-trained-body {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      padding: 12px;
    }
    .AUN-lora-info-token {
      padding: 4px 9px;
      border-radius: 999px;
      border: 1px solid rgba(156, 221, 176, 0.16);
      background: rgba(116, 195, 143, 0.12);
      color: #d8f3df;
      font-size: 11px;
      line-height: 1.2;
    }
    .AUN-lora-info-token-button {
      cursor: pointer;
      transition: background 120ms ease, border-color 120ms ease, transform 120ms ease;
    }
    .AUN-lora-info-token-button:hover {
      background: rgba(116, 195, 143, 0.18);
      border-color: rgba(176, 236, 195, 0.28);
      transform: translateY(-1px);
    }
    .AUN-lora-info-token-button.is-selected {
      background: rgba(116, 195, 143, 0.28);
      border-color: rgba(196, 245, 210, 0.34);
      color: #f3fff7;
      box-shadow: inset 0 1px 0 rgba(255,255,255,0.08), 0 0 0 1px rgba(196, 245, 210, 0.08);
    }
    .AUN-lora-info-token-button:focus-visible {
      outline: 1px solid rgba(196, 245, 210, 0.9);
      outline-offset: 1px;
    }
    .AUN-lora-info-section {
      border: 1px solid rgba(255, 255, 255, 0.08);
      border-radius: 14px;
      background: rgba(255, 255, 255, 0.03);
      overflow: hidden;
    }
    .AUN-lora-info-section-title {
      margin: 0;
      padding: 11px 13px;
      font-size: 12px;
      font-weight: 700;
      color: #f5f7fb;
      border-bottom: 1px solid rgba(255, 255, 255, 0.06);
      background: rgba(255, 255, 255, 0.045);
    }
    .AUN-lora-info-table {
      width: 100%;
      border-collapse: collapse;
    }
    .AUN-lora-info-table th,
    .AUN-lora-info-table td {
      padding: 9px 13px;
      vertical-align: top;
      text-align: left;
      border-bottom: 1px solid rgba(255, 255, 255, 0.06);
    }
    .AUN-lora-info-table th {
      width: 126px;
      color: #a5b1c1;
      font-weight: 600;
      letter-spacing: 0.01em;
    }
    .AUN-lora-info-table td {
      color: #eef2f7;
      word-break: break-word;
    }
    .AUN-lora-info-table tr:last-child th,
    .AUN-lora-info-table tr:last-child td {
      border-bottom: none;
    }
    .AUN-lora-info-code {
      display: inline-block;
      padding: 2px 7px;
      border-radius: 8px;
      background: rgba(255, 255, 255, 0.05);
      color: #d5dfeb;
      font: 11px/1.4 Consolas, "Courier New", monospace;
    }
    .AUN-lora-info-table a {
      color: #8bc0ff;
      text-decoration: none;
    }
    .AUN-lora-info-table a:hover {
      text-decoration: underline;
    }
    .AUN-lora-info-previews {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
      gap: 10px;
      padding: 12px;
    }
    .AUN-lora-info-preview-card {
      border-radius: 10px;
      overflow: hidden;
      border: 1px solid rgba(255, 255, 255, 0.08);
      background: rgba(8, 10, 14, 0.24);
    }
    .AUN-lora-info-preview-card img {
      display: block;
      width: 100%;
      height: auto;
      aspect-ratio: 1 / 1;
      max-height: 280px;
      object-fit: cover;
      background: rgba(255, 255, 255, 0.03);
    }
    .AUN-lora-info-preview-card figcaption {
      padding: 7px 9px;
      font-size: 11px;
      color: #c7d0db;
    }
    .AUN-lora-info-notes {
      margin-top: 16px;
      border: 1px solid rgba(255, 255, 255, 0.08);
      border-radius: 14px;
      background: rgba(255, 255, 255, 0.03);
      overflow: hidden;
    }
    .AUN-lora-info-notes-body {
      padding: 13px;
      white-space: pre-wrap;
      color: #dbe3ed;
      max-height: 240px;
      overflow: auto;
    }
    @media (max-width: 820px) {
      .AUN-lora-info-header {
        align-items: flex-start;
      }
      .AUN-lora-info-grid {
        grid-template-columns: 1fr;
      }
    }
  `;
  document.head.appendChild(style);
  window[STYLE_KEY] = style;
}

function ensureModal() {
  ensureStyles();
  if (window[MODAL_KEY]) {
    return window[MODAL_KEY];
  }

  const overlay = document.createElement("div");
  overlay.className = "AUN-lora-info-overlay";

  const dialog = document.createElement("div");
  dialog.className = "AUN-lora-info-dialog";

  const header = document.createElement("div");
  header.className = "AUN-lora-info-header";

  const heading = document.createElement("div");
  heading.className = "AUN-lora-info-heading";

  const title = document.createElement("h2");
  title.className = "AUN-lora-info-title";
  title.textContent = "LoRA Info";

  const subtitle = document.createElement("div");
  subtitle.className = "AUN-lora-info-subtitle";
  subtitle.textContent = "";

  const closeButton = document.createElement("button");
  closeButton.className = "AUN-lora-info-close";
  closeButton.type = "button";
  closeButton.textContent = "x";

  const body = document.createElement("div");
  body.className = "AUN-lora-info-body";

  const badges = document.createElement("div");
  badges.className = "AUN-lora-info-badges";

  const actions = document.createElement("div");
  actions.className = "AUN-lora-info-actions";

  const copyWordsButton = document.createElement("button");
  copyWordsButton.type = "button";
  copyWordsButton.className = "AUN-lora-info-action";
  copyWordsButton.textContent = "Copy trained words";

  const copyFileButton = document.createElement("button");
  copyFileButton.type = "button";
  copyFileButton.className = "AUN-lora-info-action";
  copyFileButton.textContent = "Copy file name";

  const openCivitaiButton = document.createElement("button");
  openCivitaiButton.type = "button";
  openCivitaiButton.className = "AUN-lora-info-action";
  openCivitaiButton.textContent = "Open Civitai";

  const insertSelectedButton = document.createElement("button");
  insertSelectedButton.type = "button";
  insertSelectedButton.className = "AUN-lora-info-action";
  insertSelectedButton.textContent = "Insert selected words";

  actions.append(
    copyWordsButton,
    copyFileButton,
    openCivitaiButton,
    insertSelectedButton,
  );

  const trainedSection = document.createElement("section");
  trainedSection.className = "AUN-lora-info-trained";
  const trainedTitle = document.createElement("h3");
  trainedTitle.className = "AUN-lora-info-section-title";
  trainedTitle.textContent = "Trained Words";
  const trainedWords = document.createElement("div");
  trainedWords.className = "AUN-lora-info-trained-body";
  trainedSection.append(trainedTitle, trainedWords);

  const grid = document.createElement("div");
  grid.className = "AUN-lora-info-grid";

  const fieldsSection = document.createElement("section");
  fieldsSection.className = "AUN-lora-info-section";
  const fieldsTitle = document.createElement("h3");
  fieldsTitle.className = "AUN-lora-info-section-title";
  fieldsTitle.textContent = "Details";
  const table = document.createElement("table");
  table.className = "AUN-lora-info-table";
  fieldsSection.append(fieldsTitle, table);

  const previewsSection = document.createElement("section");
  previewsSection.className = "AUN-lora-info-section";
  const previewsTitle = document.createElement("h3");
  previewsTitle.className = "AUN-lora-info-section-title";
  previewsTitle.textContent = "Previews";
  const previews = document.createElement("div");
  previews.className = "AUN-lora-info-previews";
  previewsSection.append(previewsTitle, previews);

  const notesSection = document.createElement("section");
  notesSection.className = "AUN-lora-info-notes";
  const notesTitle = document.createElement("h3");
  notesTitle.className = "AUN-lora-info-section-title";
  notesTitle.textContent = "Notes";
  const notes = document.createElement("div");
  notes.className = "AUN-lora-info-notes-body";
  notesSection.append(notesTitle, notes);

  const status = document.createElement("div");
  status.className = "AUN-lora-info-status";

  grid.append(fieldsSection, previewsSection);
  body.append(badges, status, actions, trainedSection, grid, notesSection);
  heading.append(title, subtitle);
  header.append(heading, closeButton);
  dialog.append(header, body);
  overlay.appendChild(dialog);
  document.body.appendChild(overlay);

  const hide = () => {
    overlay.style.display = "none";
  };

  overlay.addEventListener("click", (event) => {
    if (event.target === overlay) {
      hide();
    }
  });
  closeButton.addEventListener("click", hide);
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && overlay.style.display === "flex") {
      hide();
    }
  });

  const refs = {
    overlay,
    subtitle,
    title,
    badges,
    actions,
    copyWordsButton,
    copyFileButton,
    openCivitaiButton,
    insertSelectedButton,
    trainedSection,
    trainedWords,
    table,
    previewsSection,
    previews,
    notesSection,
    notes,
    status,
    hide,
    currentPayload: null,
    currentContext: null,
    selectedWords: new Set(),
  };

  copyWordsButton.addEventListener("click", async () => {
    const words = Array.isArray(refs.currentPayload?.trained_words)
      ? refs.currentPayload.trained_words.filter(Boolean)
      : [];
    if (!words.length) {
      setStatus(refs, "No trained words available to copy.");
      return;
    }
    const copied = await copyText(words.join(", "));
    setStatus(
      refs,
      copied ? "Trained words copied." : "Failed to copy trained words.",
    );
  });
  copyFileButton.addEventListener("click", async () => {
    const fileName = String(
      refs.currentPayload?.file || refs.currentPayload?.requested_name || "",
    ).trim();
    if (!fileName) {
      setStatus(refs, "No file name available to copy.");
      return;
    }
    const copied = await copyText(fileName);
    setStatus(refs, copied ? "File name copied." : "Failed to copy file name.");
  });
  openCivitaiButton.addEventListener("click", () => {
    const href = String(refs.currentPayload?.civitai_url || "").trim();
    if (!href) {
      setStatus(refs, "No Civitai page found for this LoRA.");
      return;
    }
    window.open(href, "_blank", "noopener,noreferrer");
  });
  insertSelectedButton.addEventListener("click", async () => {
    const words = Array.from(refs.selectedWords);
    if (!words.length) {
      setStatus(refs, "Select one or more trained words to insert.");
      return;
    }
    if (typeof refs.currentContext?.insertWord !== "function") {
      setStatus(refs, "This LoRA view cannot write back to a trigger field.");
      return;
    }
    const message = await insertSelectedWords(refs, words);
    setStatus(refs, message);
  });

  window[MODAL_KEY] = refs;
  return refs;
}

async function copyText(value) {
  const text = String(value || "");
  if (!text) {
    return false;
  }
  try {
    if (navigator?.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // Fall through to the legacy path.
  }

  const textArea = document.createElement("textarea");
  textArea.value = text;
  textArea.setAttribute("readonly", "readonly");
  textArea.style.position = "fixed";
  textArea.style.opacity = "0";
  textArea.style.pointerEvents = "none";
  document.body.appendChild(textArea);
  textArea.select();
  textArea.setSelectionRange(0, text.length);
  try {
    return document.execCommand("copy");
  } catch {
    return false;
  } finally {
    textArea.remove();
  }
}

function setStatus(refs, message) {
  refs.status.textContent = message || "";
  refs.status.style.display = message ? "block" : "none";
}

function renderFields(refs, fields) {
  refs.table.replaceChildren();
  const filteredFields = Array.isArray(fields)
    ? fields.filter((field) => {
        const label = String(field?.label || "");
        return label !== "Trained Words" && label !== "Civitai";
      })
    : [];
  if (!filteredFields.length) {
    const row = document.createElement("tr");
    const cell = document.createElement("td");
    cell.colSpan = 2;
    cell.textContent = "No metadata found.";
    row.appendChild(cell);
    refs.table.appendChild(row);
    return;
  }

  for (const field of filteredFields) {
    const row = document.createElement("tr");
    const labelCell = document.createElement("th");
    const label = String(field?.label || "");
    labelCell.textContent = label;

    const valueCell = document.createElement("td");
    if (field?.href) {
      const link = document.createElement("a");
      link.href = String(field.href);
      link.target = "_blank";
      link.rel = "noreferrer noopener";
      link.textContent = String(field.value || field.href);
      valueCell.appendChild(link);
    } else {
      const value = String(field?.value || "");
      if (label === "File" || label === "Hash (sha256)") {
        const code = document.createElement("span");
        code.className = "AUN-lora-info-code";
        code.textContent = value;
        valueCell.appendChild(code);
      } else {
        valueCell.textContent = value;
      }
    }

    row.append(labelCell, valueCell);
    refs.table.appendChild(row);
  }
}

function renderBadges(refs, badges) {
  refs.badges.replaceChildren();
  const items = Array.isArray(badges) ? badges.filter(Boolean) : [];
  refs.badges.style.display = items.length ? "flex" : "none";
  for (const badge of items) {
    const pill = document.createElement("span");
    pill.className = "AUN-lora-info-badge";
    pill.textContent = String(badge);
    refs.badges.appendChild(pill);
  }
}

function renderActions(refs, payload) {
  refs.currentPayload = payload || null;
  const words = Array.isArray(payload?.trained_words)
    ? payload.trained_words.filter(Boolean)
    : [];
  const fileName = String(
    payload?.file || payload?.requested_name || "",
  ).trim();
  const civitaiUrl = String(payload?.civitai_url || "").trim();
  const canInsert = typeof refs.currentContext?.insertWord === "function";
  refs.actions.style.display =
    words.length || fileName || civitaiUrl || canInsert ? "flex" : "none";
  refs.copyWordsButton.disabled = !words.length;
  refs.copyFileButton.disabled = !fileName;
  refs.openCivitaiButton.disabled = !civitaiUrl;
  refs.insertSelectedButton.style.display = canInsert ? "inline-flex" : "none";
  refs.insertSelectedButton.disabled = !canInsert || !refs.selectedWords.size;
}

function renderTrainedWords(refs, words) {
  refs.trainedWords.replaceChildren();
  const items = Array.isArray(words) ? words.filter(Boolean) : [];
  const canInsert = typeof refs.currentContext?.insertWord === "function";
  const nextSelection = new Set(
    Array.from(refs.selectedWords).filter((word) => items.includes(word)),
  );
  refs.selectedWords = nextSelection;
  refs.trainedSection.style.display = items.length ? "block" : "none";
  for (const item of items) {
    const token = document.createElement(canInsert ? "button" : "span");
    token.className = "AUN-lora-info-token";
    if (canInsert) {
      token.type = "button";
      token.classList.add("AUN-lora-info-token-button");
      token.title = `Insert ${String(item)} into trigger words`;
      token.classList.toggle(
        "is-selected",
        refs.selectedWords.has(String(item)),
      );
      token.addEventListener("click", () => {
        const word = String(item);
        if (refs.selectedWords.has(word)) {
          refs.selectedWords.delete(word);
        } else {
          refs.selectedWords.add(word);
        }
        token.classList.toggle("is-selected", refs.selectedWords.has(word));
        renderActions(refs, refs.currentPayload);
        setStatus(
          refs,
          refs.selectedWords.size
            ? `${refs.selectedWords.size} trained word${refs.selectedWords.size === 1 ? "" : "s"} selected.`
            : String(refs.currentPayload?.lookup_hint || ""),
        );
      });
    }
    token.textContent = String(item);
    refs.trainedWords.appendChild(token);
  }
  renderActions(refs, refs.currentPayload);
}

async function insertSelectedWords(refs, words) {
  const uniqueWords = words.map((word) => String(word).trim()).filter(Boolean);
  if (!uniqueWords.length) {
    return "Select one or more trained words to insert.";
  }

  if (typeof refs.currentContext?.insertWords === "function") {
    return await refs.currentContext.insertWords(uniqueWords);
  }

  if (typeof refs.currentContext?.insertWord !== "function") {
    return "This LoRA view cannot write back to a trigger field.";
  }

  let insertedCount = 0;
  let alreadyPresentCount = 0;
  for (const word of uniqueWords) {
    const result = await refs.currentContext.insertWord(word);
    const text = String(result || "");
    if (/already in the trigger words/i.test(text)) {
      alreadyPresentCount += 1;
    } else {
      insertedCount += 1;
    }
  }

  refs.selectedWords.clear();
  renderTrainedWords(refs, refs.currentPayload?.trained_words || []);

  if (insertedCount && alreadyPresentCount) {
    return `Inserted ${insertedCount} word${insertedCount === 1 ? "" : "s"}; ${alreadyPresentCount} already present.`;
  }
  if (insertedCount) {
    return `Inserted ${insertedCount} trained word${insertedCount === 1 ? "" : "s"}.`;
  }
  return "All selected words are already in the trigger words.";
}

function renderPreviews(refs, previews) {
  refs.previews.replaceChildren();
  const items = Array.isArray(previews)
    ? previews.filter((item) => item?.src)
    : [];
  refs.previewsSection.style.display = items.length ? "block" : "none";
  for (const preview of items) {
    const figure = document.createElement("figure");
    figure.className = "AUN-lora-info-preview-card";

    const img = document.createElement("img");
    img.loading = "lazy";
    img.src = String(preview.src);
    img.alt = String(preview.label || "LoRA preview");

    figure.appendChild(img);
    if (preview.label) {
      const caption = document.createElement("figcaption");
      caption.textContent = String(preview.label);
      figure.appendChild(caption);
    }
    refs.previews.appendChild(figure);
  }
}

function renderNotes(refs, notes) {
  const text = typeof notes === "string" ? notes.trim() : "";
  refs.notesSection.style.display = text ? "block" : "none";
  refs.notes.textContent = text;
}

function showLoading(refs, loraName) {
  refs.overlay.style.display = "flex";
  refs.currentPayload = null;
  refs.selectedWords = new Set();
  refs.title.textContent = loraName
    ? `Loading ${loraName}...`
    : "Loading LoRA info...";
  renderBadges(refs, []);
  renderActions(refs, null);
  renderTrainedWords(refs, []);
  renderFields(refs, []);
  renderPreviews(refs, []);
  renderNotes(refs, "");
  setStatus(refs, "Fetching metadata...");
}

function renderPayload(refs, payload) {
  refs.overlay.style.display = "flex";
  const title = String(
    payload?.title || payload?.requested_name || "LoRA Info",
  );
  const subtitle = String(
    payload?.file || payload?.requested_name || "",
  ).trim();
  refs.title.textContent = title;
  refs.subtitle.textContent = subtitle && subtitle !== title ? subtitle : "";
  refs.subtitle.style.display = refs.subtitle.textContent ? "block" : "none";
  renderBadges(refs, payload?.badges || []);
  renderActions(refs, payload);
  renderTrainedWords(refs, payload?.trained_words || []);
  renderFields(refs, payload?.fields || []);
  renderPreviews(refs, payload?.previews || []);
  renderNotes(refs, payload?.notes || "");
  setStatus(refs, String(payload?.lookup_hint || ""));
}

export async function openLoraInfoDialog(loraName, context = null) {
  const value = String(loraName || "").trim();
  if (!value || value === "None") {
    return;
  }

  const refs = ensureModal();
  refs.currentContext = context && typeof context === "object" ? context : null;
  const token = ++requestToken;
  showLoading(refs, value);

  try {
    const response = await api.fetchApi("/aun/lora-info", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ lora: value }),
    });

    let payload = {};
    try {
      payload = await response.json();
    } catch {
      payload = {};
    }

    if (token !== requestToken) {
      return;
    }

    if (!response.ok) {
      const message =
        payload?.error || `Request failed with status ${response.status}.`;
      refs.title.textContent = value;
      refs.subtitle.textContent = "";
      refs.subtitle.style.display = "none";
      renderBadges(refs, []);
      renderActions(refs, null);
      renderTrainedWords(refs, []);
      renderFields(refs, []);
      renderPreviews(refs, []);
      renderNotes(refs, "");
      setStatus(refs, message);
      return;
    }

    renderPayload(refs, payload);
  } catch (error) {
    if (token !== requestToken) {
      return;
    }
    refs.title.textContent = value;
    refs.subtitle.textContent = "";
    refs.subtitle.style.display = "none";
    renderBadges(refs, []);
    renderActions(refs, null);
    renderTrainedWords(refs, []);
    renderFields(refs, []);
    renderPreviews(refs, []);
    renderNotes(refs, "");
    setStatus(refs, error?.message || "Failed to fetch LoRA info.");
  }
}
