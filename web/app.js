"use strict";

/* -------------------------------------------------------------------- */
/* Tabs                                                                  */
/* -------------------------------------------------------------------- */
document.querySelectorAll(".tab-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".tab-btn").forEach((b) => b.classList.remove("active"));
    document.querySelectorAll(".tab-panel").forEach((p) => p.classList.remove("active"));
    btn.classList.add("active");
    document.getElementById(`tab-${btn.dataset.tab}`).classList.add("active");
    if (btn.dataset.tab === "generator") renderGenCanvas();
  });
});

function uid(prefix) {
  return `${prefix}_${Math.random().toString(36).slice(2, 9)}`;
}

function defaultBox(n) {
  return {
    id: uid("box"),
    label: `Pole ${n}`,
    x: 0.1,
    y: 0.4,
    width: 0.8,
    height: 0.2,
    fontFamily: "Arial, sans-serif",
    fontSize: 56,
    minFontSize: 20,
    color: "#ffffff",
    align: "center",
    valign: "middle",
    bold: true,
    italic: false,
    lineHeight: 1.25,
    autoFit: true,
  };
}

/* -------------------------------------------------------------------- */
/* EDITOR (tab 1)                                                        */
/* -------------------------------------------------------------------- */
const editor = {
  image: null,
  imageDataUrl: null,
  boxes: [],
  selectedId: null,
  drag: null, // { mode: 'move'|'resize', boxId, startX, startY, orig }
  counter: 0,
};

const editorCanvas = document.getElementById("editorCanvas");
const editorCtx = editorCanvas.getContext("2d");
const editorEmptyHint = document.getElementById("editorEmptyHint");

document.getElementById("imageInput").addEventListener("change", (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    const img = new Image();
    img.onload = () => {
      editor.image = img;
      editor.imageDataUrl = reader.result;
      editorCanvas.width = img.naturalWidth;
      editorCanvas.height = img.naturalHeight;
      editorEmptyHint.style.display = "none";
      document.getElementById("addBoxBtn").disabled = false;
      document.getElementById("saveTemplateBtn").disabled = false;
      renderEditorCanvas();
    };
    img.src = reader.result;
  };
  reader.readAsDataURL(file);
});

document.getElementById("addBoxBtn").addEventListener("click", () => {
  editor.counter += 1;
  const box = defaultBox(editor.counter);
  editor.boxes.push(box);
  selectBox(box.id);
  renderBoxList();
  renderEditorCanvas();
});

document.getElementById("deleteBoxBtn").addEventListener("click", () => {
  if (!editor.selectedId) return;
  editor.boxes = editor.boxes.filter((b) => b.id !== editor.selectedId);
  selectBox(null);
  renderBoxList();
  renderEditorCanvas();
});

function getSelectedBox() {
  return editor.boxes.find((b) => b.id === editor.selectedId) || null;
}

function selectBox(id) {
  editor.selectedId = id;
  const box = getSelectedBox();
  document.getElementById("deleteBoxBtn").disabled = !box;
  const propsPanel = document.getElementById("boxProps");
  if (!box) {
    propsPanel.classList.add("hidden");
  } else {
    propsPanel.classList.remove("hidden");
    document.getElementById("propLabel").value = box.label;
    document.getElementById("propFont").value = box.fontFamily;
    document.getElementById("propSize").value = box.fontSize;
    document.getElementById("propMinSize").value = box.minFontSize;
    document.getElementById("propColor").value = box.color;
    document.getElementById("propBold").checked = box.bold;
    document.getElementById("propItalic").checked = box.italic;
    document.getElementById("propAutoFit").checked = box.autoFit;
    document.getElementById("propAlign").value = box.align;
    document.getElementById("propValign").value = box.valign;
    document.getElementById("propLineHeight").value = box.lineHeight;
  }
  renderBoxList();
}

function renderBoxList() {
  const list = document.getElementById("boxList");
  list.innerHTML = "";
  editor.boxes.forEach((box) => {
    const row = document.createElement("div");
    row.className = "box-list-item" + (box.id === editor.selectedId ? " selected" : "");
    const label = document.createElement("span");
    label.textContent = box.label;
    row.appendChild(label);
    const remove = document.createElement("span");
    remove.className = "remove";
    remove.textContent = "×";
    remove.title = "Usuń pole";
    remove.addEventListener("click", (ev) => {
      ev.stopPropagation();
      editor.boxes = editor.boxes.filter((b) => b.id !== box.id);
      if (editor.selectedId === box.id) selectBox(null);
      renderBoxList();
      renderEditorCanvas();
    });
    row.appendChild(remove);
    row.addEventListener("click", () => {
      selectBox(box.id);
      renderEditorCanvas();
    });
    list.appendChild(row);
  });
}

const propBindings = [
  ["propLabel", "label", "value"],
  ["propFont", "fontFamily", "value"],
  ["propSize", "fontSize", "number"],
  ["propMinSize", "minFontSize", "number"],
  ["propColor", "color", "value"],
  ["propBold", "bold", "checked"],
  ["propItalic", "italic", "checked"],
  ["propAutoFit", "autoFit", "checked"],
  ["propAlign", "align", "value"],
  ["propValign", "valign", "value"],
  ["propLineHeight", "lineHeight", "number"],
];
propBindings.forEach(([elId, prop, kind]) => {
  document.getElementById(elId).addEventListener("input", (e) => {
    const box = getSelectedBox();
    if (!box) return;
    box[prop] = kind === "number" ? Number(e.target.value) : kind === "checked" ? e.target.checked : e.target.value;
    if (prop === "label") renderBoxList();
    renderEditorCanvas();
  });
});

function getCanvasPos(canvas, evt) {
  const rect = canvas.getBoundingClientRect();
  const point = evt.touches ? evt.touches[0] : evt;
  return {
    x: ((point.clientX - rect.left) * canvas.width) / rect.width,
    y: ((point.clientY - rect.top) * canvas.height) / rect.height,
  };
}

function hitTest(pos) {
  const w = editorCanvas.width;
  const h = editorCanvas.height;
  const handleSize = Math.max(16, w * 0.018);
  for (let i = editor.boxes.length - 1; i >= 0; i--) {
    const b = editor.boxes[i];
    const px = b.x * w, py = b.y * h, pw = b.width * w, ph = b.height * h;
    const nearHandle =
      Math.abs(pos.x - (px + pw)) < handleSize && Math.abs(pos.y - (py + ph)) < handleSize;
    if (b.id === editor.selectedId && nearHandle) {
      return { box: b, mode: "resize" };
    }
    if (pos.x >= px && pos.x <= px + pw && pos.y >= py && pos.y <= py + ph) {
      return { box: b, mode: "move" };
    }
  }
  return null;
}

editorCanvas.addEventListener("mousedown", (evt) => {
  if (!editor.image) return;
  const pos = getCanvasPos(editorCanvas, evt);
  const hit = hitTest(pos);
  if (!hit) {
    selectBox(null);
    renderEditorCanvas();
    return;
  }
  selectBox(hit.box.id);
  editor.drag = {
    mode: hit.mode,
    boxId: hit.box.id,
    startX: pos.x,
    startY: pos.y,
    orig: { ...hit.box },
  };
  renderEditorCanvas();
});

window.addEventListener("mousemove", (evt) => {
  if (!editor.drag) return;
  const pos = getCanvasPos(editorCanvas, evt);
  const w = editorCanvas.width, h = editorCanvas.height;
  const dx = (pos.x - editor.drag.startX) / w;
  const dy = (pos.y - editor.drag.startY) / h;
  const box = getSelectedBox();
  if (!box) return;
  const orig = editor.drag.orig;
  if (editor.drag.mode === "move") {
    box.x = clamp(orig.x + dx, 0, 1 - box.width);
    box.y = clamp(orig.y + dy, 0, 1 - box.height);
  } else {
    box.width = clamp(orig.width + dx, 0.03, 1 - box.x);
    box.height = clamp(orig.height + dy, 0.03, 1 - box.y);
  }
  renderEditorCanvas();
});

window.addEventListener("mouseup", () => {
  editor.drag = null;
});

function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

function renderEditorCanvas() {
  if (!editor.image) return;
  const w = editorCanvas.width, h = editorCanvas.height;
  editorCtx.clearRect(0, 0, w, h);
  editorCtx.drawImage(editor.image, 0, 0, w, h);

  editor.boxes.forEach((box) => {
    drawTextBox(editorCtx, box, box.label || "Przykładowy tekst", w, h);

    const px = box.x * w, py = box.y * h, pw = box.width * w, ph = box.height * h;
    const selected = box.id === editor.selectedId;
    editorCtx.save();
    editorCtx.strokeStyle = selected ? "#6d5efc" : "rgba(255,255,255,0.85)";
    editorCtx.lineWidth = selected ? 3 : 1.5;
    editorCtx.setLineDash(selected ? [] : [8, 6]);
    editorCtx.strokeRect(px, py, pw, ph);
    editorCtx.restore();

    if (selected) {
      const handleSize = Math.max(16, w * 0.018);
      editorCtx.fillStyle = "#6d5efc";
      editorCtx.fillRect(px + pw - handleSize / 2, py + ph - handleSize / 2, handleSize, handleSize);
    }
  });
}

/* Save / load template ------------------------------------------------ */
document.getElementById("saveTemplateBtn").addEventListener("click", () => {
  if (!editor.image) return;
  const name = document.getElementById("templateName").value.trim() || "szablon";
  const template = {
    name,
    imageDataUrl: editor.imageDataUrl,
    width: editor.image.naturalWidth,
    height: editor.image.naturalHeight,
    textBoxes: editor.boxes,
  };
  const blob = new Blob([JSON.stringify(template, null, 2)], { type: "application/json" });
  downloadBlob(blob, `${slugify(name)}.json`);
});

document.getElementById("loadTemplateInput").addEventListener("change", (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    const template = JSON.parse(reader.result);
    loadTemplateIntoEditor(template);
  };
  reader.readAsText(file);
});

function loadTemplateIntoEditor(template) {
  document.getElementById("templateName").value = template.name || "";
  editor.boxes = template.textBoxes || [];
  editor.selectedId = null;
  const img = new Image();
  img.onload = () => {
    editor.image = img;
    editor.imageDataUrl = template.imageDataUrl;
    editorCanvas.width = template.width || img.naturalWidth;
    editorCanvas.height = template.height || img.naturalHeight;
    editorEmptyHint.style.display = "none";
    document.getElementById("addBoxBtn").disabled = false;
    document.getElementById("saveTemplateBtn").disabled = false;
    renderBoxList();
    renderEditorCanvas();
  };
  img.src = template.imageDataUrl;
}

function slugify(s) {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "") || "szablon";
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/* -------------------------------------------------------------------- */
/* GENERATOR (tab 2)                                                     */
/* -------------------------------------------------------------------- */
const gen = {
  template: null,
  image: null,
  slides: [],
  index: 0,
};

const genCanvas = document.getElementById("genCanvas");
const genCtx = genCanvas.getContext("2d");
const genEmptyHint = document.getElementById("genEmptyHint");

document.getElementById("genTemplateInput").addEventListener("change", (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    const template = JSON.parse(reader.result);
    loadTemplateIntoGenerator(template);
  };
  reader.readAsText(file);
});

function loadTemplateIntoGenerator(template) {
  const img = new Image();
  img.onload = () => {
    gen.template = template;
    gen.image = img;
    genCanvas.width = template.width || img.naturalWidth;
    genCanvas.height = template.height || img.naturalHeight;
    gen.slides = [emptySlide(template)];
    gen.index = 0;
    genEmptyHint.style.display = "none";
    document.getElementById("genTemplateStatus").textContent = `Szablon: ${template.name || "bez nazwy"} (${(template.textBoxes || []).length} pól)`;
    renderSlideForm();
    renderGenCanvas();
  };
  img.src = template.imageDataUrl;
}

function emptySlide(template) {
  const values = {};
  (template.textBoxes || []).forEach((b) => (values[b.id] = ""));
  return { values };
}

function currentSlide() {
  return gen.slides[gen.index];
}

function renderSlideForm() {
  const form = document.getElementById("slideForm");
  form.innerHTML = "";
  if (!gen.template) return;
  gen.template.textBoxes.forEach((box) => {
    const field = document.createElement("div");
    field.className = "field";
    const label = document.createElement("label");
    label.textContent = box.label;
    const textarea = document.createElement("textarea");
    textarea.value = currentSlide().values[box.id] || "";
    textarea.addEventListener("input", () => {
      currentSlide().values[box.id] = textarea.value;
      renderGenCanvas();
    });
    field.appendChild(label);
    field.appendChild(textarea);
    form.appendChild(field);
  });
  updateSlideIndicator();
}

function updateSlideIndicator() {
  document.getElementById("slideIndicator").textContent = `Slajd ${gen.index + 1} / ${gen.slides.length}`;
}

document.getElementById("prevSlideBtn").addEventListener("click", () => {
  if (!gen.template) return;
  gen.index = clamp(gen.index - 1, 0, gen.slides.length - 1);
  renderSlideForm();
  renderGenCanvas();
});
document.getElementById("nextSlideBtn").addEventListener("click", () => {
  if (!gen.template) return;
  gen.index = clamp(gen.index + 1, 0, gen.slides.length - 1);
  renderSlideForm();
  renderGenCanvas();
});
document.getElementById("addSlideBtn").addEventListener("click", () => {
  if (!gen.template) return;
  gen.slides.push(emptySlide(gen.template));
  gen.index = gen.slides.length - 1;
  renderSlideForm();
  renderGenCanvas();
});
document.getElementById("deleteSlideBtn").addEventListener("click", () => {
  if (!gen.template) return;
  if (gen.slides.length === 1) {
    gen.slides[0] = emptySlide(gen.template);
  } else {
    gen.slides.splice(gen.index, 1);
    gen.index = clamp(gen.index, 0, gen.slides.length - 1);
  }
  renderSlideForm();
  renderGenCanvas();
});

function renderGenCanvas() {
  if (!gen.template || !gen.image) return;
  const w = genCanvas.width, h = genCanvas.height;
  genCtx.clearRect(0, 0, w, h);
  genCtx.drawImage(gen.image, 0, 0, w, h);
  const values = currentSlide().values;
  gen.template.textBoxes.forEach((box) => {
    drawTextBox(genCtx, box, values[box.id] || "", w, h);
  });
}

/* Bulk paste ------------------------------------------------------------ */
document.getElementById("applyBulkBtn").addEventListener("click", () => {
  if (!gen.template) return;
  const raw = document.getElementById("bulkText").value;
  const parsed = parseBulkText(raw, gen.template.textBoxes);
  if (parsed.length === 0) return;
  gen.slides = parsed;
  gen.index = 0;
  renderSlideForm();
  renderGenCanvas();
});

function parseBulkText(raw, textBoxes) {
  const labelToId = new Map(textBoxes.map((b) => [b.label.trim().toLowerCase(), b.id]));
  const blocks = raw.split(/^\s*-{3,}\s*$/m);
  const slides = [];
  for (const block of blocks) {
    const lines = block.split("\n");
    const values = {};
    textBoxes.forEach((b) => (values[b.id] = ""));
    let currentId = null;
    let hasContent = false;
    for (const rawLine of lines) {
      const line = rawLine.replace(/\r$/, "");
      const match = line.match(/^([^:]{1,60}):\s?(.*)$/);
      const maybeId = match ? labelToId.get(match[1].trim().toLowerCase()) : null;
      if (match && maybeId) {
        currentId = maybeId;
        values[currentId] = match[2];
        hasContent = true;
      } else if (currentId) {
        values[currentId] += (values[currentId] ? "\n" : "") + line;
        if (line.trim()) hasContent = true;
      }
    }
    if (hasContent) {
      Object.keys(values).forEach((k) => (values[k] = values[k].trim()));
      slides.push({ values });
    }
  }
  return slides;
}

/* Export ------------------------------------------------------------- */
function canvasToBlob(canvas) {
  return new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
}

document.getElementById("downloadCurrentBtn").addEventListener("click", async () => {
  if (!gen.template) return;
  renderGenCanvas();
  const blob = await canvasToBlob(genCanvas);
  const name = gen.template.name ? slugify(gen.template.name) : "karuzela";
  downloadBlob(blob, `${name}-slajd-${gen.index + 1}.png`);
});

document.getElementById("downloadAllBtn").addEventListener("click", async () => {
  if (!gen.template) return;
  const originalIndex = gen.index;
  const files = [];
  for (let i = 0; i < gen.slides.length; i++) {
    gen.index = i;
    renderGenCanvas();
    const blob = await canvasToBlob(genCanvas);
    const buf = new Uint8Array(await blob.arrayBuffer());
    const num = String(i + 1).padStart(2, "0");
    files.push({ name: `slajd-${num}.png`, data: buf });
  }
  gen.index = originalIndex;
  renderSlideForm();
  renderGenCanvas();
  const zipBlob = await createZip(files);
  const name = gen.template.name ? slugify(gen.template.name) : "karuzela";
  downloadBlob(zipBlob, `${name}.zip`);
});
