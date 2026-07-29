// Shared text-box rendering logic used by both the editor preview and the generator.
// Kept framework-free so scripts/generate.py can mirror the same behaviour in Python.

function fontString(box, size) {
  const style = box.italic ? "italic" : "normal";
  const weight = box.bold ? "bold" : "normal";
  return `${style} ${weight} ${size}px ${box.fontFamily || "sans-serif"}`;
}

function wrapText(ctx, text, maxWidth) {
  const paragraphs = String(text ?? "").split("\n");
  const lines = [];
  for (const paragraph of paragraphs) {
    const words = paragraph.split(/\s+/).filter(Boolean);
    if (words.length === 0) {
      lines.push("");
      continue;
    }
    let current = words[0];
    for (let i = 1; i < words.length; i++) {
      const candidate = `${current} ${words[i]}`;
      if (ctx.measureText(candidate).width <= maxWidth) {
        current = candidate;
      } else {
        lines.push(current);
        current = words[i];
      }
    }
    lines.push(current);
  }
  return lines;
}

// Finds the largest font size (within [minFontSize, box.fontSize]) whose wrapped
// text fits inside the box, when autoFit is enabled. Otherwise just wraps at box.fontSize.
function fitText(ctx, box, text, pxWidth, pxHeight) {
  const maxSize = box.fontSize || 32;
  const minSize = box.autoFit ? Math.min(box.minFontSize || 12, maxSize) : maxSize;
  let size = maxSize;
  let lines = [];
  while (size >= minSize) {
    ctx.font = fontString(box, size);
    lines = wrapText(ctx, text, pxWidth);
    const lineHeight = size * (box.lineHeight || 1.2);
    const totalHeight = lines.length * lineHeight;
    if (totalHeight <= pxHeight || size === minSize) break;
    if (!box.autoFit) break;
    size -= 1;
  }
  return { size, lines };
}

// canvas: 2D context already sized to the full template image.
// box: text box definition with fractional x/y/width/height (0..1).
// text: raw string (may contain manual line breaks).
function drawTextBox(ctx, box, text, canvasWidth, canvasHeight) {
  const px = box.x * canvasWidth;
  const py = box.y * canvasHeight;
  const pw = box.width * canvasWidth;
  const ph = box.height * canvasHeight;

  const { size, lines } = fitText(ctx, box, text, pw, ph);
  const lineHeight = size * (box.lineHeight || 1.2);
  const totalHeight = lines.length * lineHeight;

  ctx.save();
  ctx.font = fontString(box, size);
  ctx.fillStyle = box.color || "#000000";
  ctx.textBaseline = "alphabetic";

  let startY;
  if (box.valign === "top") startY = py;
  else if (box.valign === "bottom") startY = py + ph - totalHeight;
  else startY = py + (ph - totalHeight) / 2;

  lines.forEach((line, i) => {
    const lineTop = startY + i * lineHeight;
    const ascent = size * 0.8; // approximation good enough for common fonts
    const baseline = lineTop + ascent;

    let x;
    let align;
    if (box.align === "left") {
      x = px;
      align = "left";
    } else if (box.align === "right") {
      x = px + pw;
      align = "right";
    } else {
      x = px + pw / 2;
      align = "center";
    }
    ctx.textAlign = align;
    ctx.fillText(line, x, baseline);
  });

  ctx.restore();
}

function roundedRectPath(ctx, x, y, w, h, radius) {
  const r = Math.max(0, Math.min(radius, w / 2, h / 2));
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

// image: an already-loaded HTMLImageElement (or equivalent drawImage source).
// box: image box definition with fractional x/y/width/height (0..1), fit ("cover"|"contain"),
// and cornerRadius (fraction of the box's shorter side, 0..0.5).
function drawImageBox(ctx, box, image, canvasWidth, canvasHeight) {
  const px = box.x * canvasWidth;
  const py = box.y * canvasHeight;
  const pw = box.width * canvasWidth;
  const ph = box.height * canvasHeight;

  ctx.save();
  const radius = (box.cornerRadius || 0) * Math.min(pw, ph);
  if (radius > 0) {
    roundedRectPath(ctx, px, py, pw, ph, radius);
    ctx.clip();
  } else {
    ctx.beginPath();
    ctx.rect(px, py, pw, ph);
    ctx.clip();
  }

  if (image) {
    const iw = image.naturalWidth || image.width;
    const ih = image.naturalHeight || image.height;
    const boxRatio = pw / ph;
    const imgRatio = iw / ih;
    let dw = pw, dh = ph, dx = px, dy = py;

    if (box.fit === "contain") {
      if (imgRatio > boxRatio) {
        dw = pw;
        dh = pw / imgRatio;
      } else {
        dh = ph;
        dw = ph * imgRatio;
      }
      dx = px + (pw - dw) / 2;
      dy = py + (ph - dh) / 2;
    } else {
      // cover (default): fill the box, cropping overflow.
      if (imgRatio > boxRatio) {
        dh = ph;
        dw = ph * imgRatio;
      } else {
        dw = pw;
        dh = pw / imgRatio;
      }
      dx = px + (pw - dw) / 2;
      dy = py + (ph - dh) / 2;
    }
    ctx.drawImage(image, dx, dy, dw, dh);
  } else {
    ctx.fillStyle = "#c9cdd6";
    ctx.fillRect(px, py, pw, ph);
    ctx.fillStyle = "#6b7280";
    ctx.font = `${Math.max(14, ph * 0.08)}px sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(box.label || "Zdjęcie", px + pw / 2, py + ph / 2);
  }
  ctx.restore();
}

// config: { enabled, x, y, dotSize, gap, activeColor, inactiveColor, inactiveBorderColor }
// x/y/dotSize/gap are fractions of canvasWidth. total/current are 1-based slide count/index.
function drawProgressDots(ctx, config, total, currentIndex, canvasWidth, canvasHeight) {
  if (!config || !config.enabled || !total) return;
  const dotSize = (config.dotSize || 0.022) * canvasWidth;
  const gap = (config.gap || 0.012) * canvasWidth;
  const startX = (config.x ?? 0.08) * canvasWidth;
  const centerY = (config.y ?? 0.9) * canvasHeight;

  ctx.save();
  for (let i = 0; i < total; i++) {
    const cx = startX + i * (dotSize + gap) + dotSize / 2;
    const active = i <= currentIndex;
    ctx.beginPath();
    ctx.arc(cx, centerY, dotSize / 2, 0, Math.PI * 2);
    if (active) {
      ctx.fillStyle = config.activeColor || "#D2B069";
      ctx.fill();
    } else {
      ctx.fillStyle = config.inactiveColor || "#ffffff";
      ctx.fill();
      ctx.lineWidth = Math.max(1, dotSize * 0.06);
      ctx.strokeStyle = config.inactiveBorderColor || "#D2B069";
      ctx.stroke();
    }
  }
  ctx.restore();
}
