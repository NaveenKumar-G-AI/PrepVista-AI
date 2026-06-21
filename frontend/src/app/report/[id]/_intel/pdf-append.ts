/**
 * appendIntelCharts — appends the 12 Interview Intelligence charts to the END of
 * the server report PDF as a premium, one-chart-per-page section: each page shows
 * a single chart, framed and consistently sized, with its full AI coaching
 * explanation (what it shows / your talent / the drawback / what needs attention)
 * laid out as styled text below it.
 *
 * Charts are exported straight from each ECharts instance via getDataURL()
 * (deterministic, high-DPI) rather than snapshotting the whole oversized grid with
 * html2canvas — the two HTML-only panels (heatmap, gauge) use a small per-element
 * html2canvas fallback. The explanation text is read from the rendered ExplainPanel
 * already in the DOM, so it always matches the on-screen wording. Everything is
 * defensive: a failed chart is skipped, and if nothing captures, the original
 * server PDF is returned untouched so the download never breaks.
 */

const A4_W = 595.28;
const A4_H = 841.89;
const M = 44; // page margin
const CONTENT_W = A4_W - M * 2;

// pdf-lib standard fonts are WinAnsi-only; strip/replace anything they can't encode
// (em dashes, arrows, curly quotes, ×, ₹, …) so drawText never throws.
function sane(s: string): string {
  return (s || '')
    .replace(/[–—]/g, '-')
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[→⇒]/g, '->')
    .replace(/[•·]/g, '-')
    .replace(/…/g, '...')
    .replace(/×/g, 'x')
    .replace(/≥/g, '>=')
    .replace(/≤/g, '<=')
    .replace(/₹/g, 'Rs ')
    .replace(/[^\x20-\x7E]/g, '')
    .trim();
}

interface PdfFont { widthOfTextAtSize(t: string, s: number): number; }

function wrap(text: string, font: PdfFont, size: number, maxW: number): string[] {
  const words = sane(text).split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = '';
  for (const w of words) {
    const t = line ? line + ' ' + w : w;
    if (font.widthOfTextAtSize(t, size) <= maxW) line = t;
    else { if (line) lines.push(line); line = w; }
  }
  if (line) lines.push(line);
  return lines;
}

interface Shot {
  num: string;
  title: string;
  sub: string;
  dataUrl: string;
  exp: { lbl: string; body: string }[];
}

export async function appendIntelCharts(serverPdf: Blob): Promise<Blob> {
  const root = document.querySelector<HTMLElement>('.iid');
  if (!root) return serverPdf;

  let echarts: typeof import('echarts');
  let pdflib: typeof import('pdf-lib');
  let html2canvas: (typeof import('html2canvas'))['default'];
  try {
    const [e, p, h] = await Promise.all([import('echarts'), import('pdf-lib'), import('html2canvas')]);
    echarts = e; pdflib = p; html2canvas = h.default;
  } catch {
    return serverPdf;
  }

  // ── Capture every chart card: image + its explanation text ─────────────────
  const cards = Array.from(root.querySelectorAll<HTMLElement>('.iid-card'));
  const shots: Shot[] = [];

  for (const card of cards) {
    const num = (card.querySelector('.iid-badge')?.textContent || '').trim();
    const title = (card.querySelector('.iid-title')?.textContent || '').trim();
    const sub = (card.querySelector('.iid-sub')?.textContent || '').trim();

    // Explanation blocks straight from the rendered ExplainPanel.
    const exp: { lbl: string; body: string }[] = [];
    card.querySelectorAll<HTMLElement>('.iid-explain .iid-exp-body p').forEach(p => {
      const lbl = (p.querySelector('.iid-exp-lbl')?.textContent || '').trim();
      const full = (p.textContent || '').trim();
      const body = full.slice(lbl.length).trim();
      if (body) exp.push({ lbl, body });
    });
    // Fall back to the short "insight" note when no full panel is present.
    if (!exp.length) {
      const note = (card.querySelector('.iid-note')?.textContent || '').trim();
      if (note) exp.push({ lbl: 'Insight', body: note });
    }

    let inst: ReturnType<typeof echarts.getInstanceByDom> | undefined;
    card.querySelectorAll<HTMLElement>('div').forEach(div => { if (!inst) inst = echarts.getInstanceByDom(div); });

    let dataUrl: string | null = null;
    try {
      if (inst) {
        inst.resize();
        dataUrl = inst.getDataURL({ type: 'png', pixelRatio: 2, backgroundColor: '#0F1626' });
      } else {
        const el =
          card.querySelector<HTMLElement>('.iid-heat-wrap') ||
          card.querySelector<HTMLElement>('.iid-gauge') ||
          card;
        const c = await html2canvas(el, { backgroundColor: '#0F1626', scale: 2, useCORS: true, logging: false });
        if (c.width && c.height) dataUrl = c.toDataURL('image/png');
      }
    } catch { /* skip */ }

    if (dataUrl) shots.push({ num, title, sub, dataUrl, exp });
  }

  if (!shots.length) return serverPdf;

  // ── Build premium one-per-page section ─────────────────────────────────────
  const { PDFDocument, StandardFonts, rgb } = pdflib;
  const pdf = await PDFDocument.load(await serverPdf.arrayBuffer());
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const reg = await pdf.embedFont(StandardFonts.Helvetica);

  const C = {
    bg: rgb(0.043, 0.067, 0.125),     // #0B1120
    panel: rgb(0.059, 0.086, 0.149),  // #0F1626
    border: rgb(0.16, 0.20, 0.30),
    accent: rgb(0.545, 0.361, 0.965), // #8B5CF6
    white: rgb(0.94, 0.96, 1),
    muted: rgb(0.54, 0.61, 0.75),
    body: rgb(0.74, 0.79, 0.88),
    divider: rgb(0.18, 0.22, 0.32),
  };
  const LBL_COLORS = [rgb(0.51, 0.55, 0.98), rgb(0.20, 0.83, 0.60), rgb(0.98, 0.44, 0.52), rgb(0.99, 0.83, 0.30)];

  // Cover / divider page
  const cover = pdf.addPage([A4_W, A4_H]);
  cover.drawRectangle({ x: 0, y: 0, width: A4_W, height: A4_H, color: C.bg });
  cover.drawRectangle({ x: 0, y: A4_H - 6, width: A4_W, height: 6, color: C.accent });
  cover.drawText('Interview Intelligence', { x: M, y: A4_H / 2 + 14, size: 28, font: bold, color: C.white });
  for (const [i, ln] of wrap('Premium per-question analytics from this session, each chart paired with its own AI coaching breakdown.', reg, 12, CONTENT_W).entries()) {
    cover.drawText(ln, { x: M, y: A4_H / 2 - 12 - i * 16, size: 12, font: reg, color: C.muted });
  }

  let pageNo = 0;
  for (const s of shots) {
    let png;
    try {
      const bytes = await fetch(s.dataUrl).then(r => r.arrayBuffer());
      png = await pdf.embedPng(bytes);
    } catch { continue; }

    pageNo++;
    const page = pdf.addPage([A4_W, A4_H]);
    page.drawRectangle({ x: 0, y: 0, width: A4_W, height: A4_H, color: C.bg });
    page.drawRectangle({ x: 0, y: A4_H - 4, width: A4_W, height: 4, color: C.accent });
    let y = A4_H - M;

    // Header: number badge + title + subtitle
    if (s.num) {
      page.drawRectangle({ x: M, y: y - 17, width: 30, height: 18, color: C.accent, opacity: 0.18, borderColor: C.accent, borderWidth: 0.8 });
      page.drawText(s.num, { x: M + 8, y: y - 13, size: 10, font: bold, color: C.white });
    }
    const tx = M + 40;
    let ty = y - 12;
    for (const ln of wrap(s.title, bold, 15, CONTENT_W - 40).slice(0, 2)) {
      page.drawText(ln, { x: tx, y: ty, size: 15, font: bold, color: C.white });
      ty -= 18;
    }
    let sy = ty - 1;
    for (const ln of wrap(s.sub, reg, 9.5, CONTENT_W - 40).slice(0, 2)) {
      page.drawText(ln, { x: tx, y: sy, size: 9.5, font: reg, color: C.muted });
      sy -= 12;
    }
    y = sy - 14;

    // Chart panel (consistent size, framed)
    const maxImgH = 300;
    let drawW = CONTENT_W, drawH = (drawW * png.height) / png.width;
    if (drawH > maxImgH) { drawH = maxImgH; drawW = (drawH * png.width) / png.height; }
    const pad = 10;
    const panelH = drawH + pad * 2;
    page.drawRectangle({ x: M, y: y - panelH, width: CONTENT_W, height: panelH, color: C.panel, borderColor: C.border, borderWidth: 0.8 });
    page.drawImage(png, { x: M + (CONTENT_W - drawW) / 2, y: y - pad - drawH, width: drawW, height: drawH });
    y -= panelH + 18;

    // Divider
    page.drawLine({ start: { x: M, y }, end: { x: A4_W - M, y }, thickness: 0.8, color: C.divider });
    y -= 18;

    // Explanation blocks
    s.exp.forEach((b, i) => {
      page.drawText(sane(b.lbl).toUpperCase(), { x: M, y: y - 8, size: 8.5, font: bold, color: LBL_COLORS[i % LBL_COLORS.length] });
      y -= 14;
      for (const ln of wrap(b.body, reg, 10, CONTENT_W)) {
        page.drawText(ln, { x: M, y: y - 9, size: 10, font: reg, color: C.body });
        y -= 13.5;
      }
      y -= 8;
    });

    // Footer
    const foot = 'PrepVista AI  -  Interview Intelligence  -  Page ' + pageNo;
    page.drawText(foot, { x: (A4_W - reg.widthOfTextAtSize(foot, 8)) / 2, y: 22, size: 8, font: reg, color: C.muted });
  }

  const out = await pdf.save();
  return new Blob([out as BlobPart], { type: 'application/pdf' });
}
