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
