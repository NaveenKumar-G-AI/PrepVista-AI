/**
 * appendIntelCharts — appends the 12 Interview Intelligence charts to the END of
 * the server-generated report PDF, so the student keeps the full professional PDF
 * *and* the charts below it.
 *
 * Why per-chart export (not one big html2canvas): the dashboard is a tall 12-chart
 * grid. Snapshotting the whole `.iid` element at scale 2 produces a canvas that
 * exceeds the browser's maximum canvas size, so html2canvas silently returns an
 * empty bitmap and no charts ever reach the PDF. Instead we pull a clean PNG from
 * each chart's own ECharts instance via getDataURL() — deterministic, crisp, and
 * immune to canvas-size and page-CSS quirks. The two HTML-only panels (heatmap,
 * gauge) are small, so a per-element html2canvas of just those is reliable.
 *
 * Every step is defensive: any single chart that fails is skipped, and if nothing
 * can be captured the original server PDF is returned untouched — the download
 * never breaks because of the charts.
 */

const A4_W = 595.28;
const A4_H = 841.89;
const MARGIN = 40;
const MAX_IMG_H = 320; // ~2 charts per A4 page

export async function appendIntelCharts(serverPdf: Blob): Promise<Blob> {
  const root = document.querySelector<HTMLElement>('.iid');
  if (!root) return serverPdf;

  let echarts: typeof import('echarts');
  let pdflib: typeof import('pdf-lib');
  let html2canvas: (typeof import('html2canvas'))['default'];
  try {
    const [e, p, h] = await Promise.all([import('echarts'), import('pdf-lib'), import('html2canvas')]);
    echarts = e;
    pdflib = p;
    html2canvas = h.default;
  } catch {
    return serverPdf;
  }

  // ── Capture each chart card as a PNG data URL ──────────────────────────────
  const cards = Array.from(root.querySelectorAll<HTMLElement>('.iid-card'));
  const shots: { title: string; dataUrl: string }[] = [];

  for (const card of cards) {
    const title = (card.querySelector('.iid-title')?.textContent || '').trim();

    // Prefer the chart's own ECharts instance (reliable, high-DPI).
    let inst: ReturnType<typeof echarts.getInstanceByDom> | undefined;
    card.querySelectorAll<HTMLElement>('div').forEach(div => {
      if (!inst) inst = echarts.getInstanceByDom(div);
    });

    let dataUrl: string | null = null;
    try {
      if (inst) {
        inst.resize();
        dataUrl = inst.getDataURL({ type: 'png', pixelRatio: 2, backgroundColor: '#0F1626' });
      } else {
        // HTML-only panel (heatmap table / gauge) — snapshot just this small element.
        const el =
          card.querySelector<HTMLElement>('.iid-heat-wrap') ||
          card.querySelector<HTMLElement>('.iid-gauge') ||
          card;
        const c = await html2canvas(el, { backgroundColor: '#0F1626', scale: 2, useCORS: true, logging: false });
        if (c.width && c.height) dataUrl = c.toDataURL('image/png');
      }
    } catch {
      /* skip this chart — never break the download */
    }
    if (dataUrl) shots.push({ title, dataUrl });
  }

  if (!shots.length) return serverPdf;

  // ── Build the appended pages ───────────────────────────────────────────────
  const { PDFDocument, StandardFonts, rgb } = pdflib;
  const pdf = await PDFDocument.load(await serverPdf.arrayBuffer());
  const titleFont = await pdf.embedFont(StandardFonts.HelveticaBold);
  const bodyFont = await pdf.embedFont(StandardFonts.Helvetica);
  const DARK = rgb(0.043, 0.067, 0.125);
  const contentW = A4_W - MARGIN * 2;

  // Section divider page
  const cover = pdf.addPage([A4_W, A4_H]);
  cover.drawRectangle({ x: 0, y: 0, width: A4_W, height: A4_H, color: DARK });
  cover.drawRectangle({ x: 0, y: A4_H - 5, width: A4_W, height: 5, color: rgb(0.545, 0.361, 0.965) });
  cover.drawText('Interview Intelligence', { x: MARGIN, y: A4_H / 2 + 10, size: 26, font: titleFont, color: rgb(0.94, 0.96, 1) });
  cover.drawText('Premium analytics derived from this session’s per-question evaluator data.', {
    x: MARGIN, y: A4_H / 2 - 14, size: 11, font: bodyFont, color: rgb(0.54, 0.61, 0.75),
  });

  let page = pdf.addPage([A4_W, A4_H]);
  page.drawRectangle({ x: 0, y: 0, width: A4_W, height: A4_H, color: DARK });
  let y = A4_H - MARGIN;
  const newPage = () => {
    page = pdf.addPage([A4_W, A4_H]);
    page.drawRectangle({ x: 0, y: 0, width: A4_W, height: A4_H, color: DARK });
    y = A4_H - MARGIN;
  };

  for (const s of shots) {
    let png;
    try {
      const bytes = await fetch(s.dataUrl).then(r => r.arrayBuffer());
      png = await pdf.embedPng(bytes);
    } catch {
      continue;
    }
    let drawW = contentW;
    let drawH = (drawW * png.height) / png.width;
    if (drawH > MAX_IMG_H) {
      drawH = MAX_IMG_H;
      drawW = (drawH * png.width) / png.height;
    }
    const blockH = 18 + drawH + 16; // title + image + gap
    if (y - blockH < MARGIN) newPage();

    if (s.title) {
      page.drawText(s.title.slice(0, 86), { x: MARGIN, y: y - 12, size: 11, font: titleFont, color: rgb(0.86, 0.9, 1) });
    }
    y -= 18;
    page.drawImage(png, { x: MARGIN + (contentW - drawW) / 2, y: y - drawH, width: drawW, height: drawH });
    y -= drawH + 16;
  }

  const bytes = await pdf.save();
  return new Blob([bytes as BlobPart], { type: 'application/pdf' });
}
