/**
 * appendIntelCharts — takes the server-generated report PDF (a Blob) and appends
 * the on-screen Interview Intelligence dashboard to the END of it, so the student
 * keeps the full professional PDF *and* gets the charts below it.
 *
 * The dashboard renders client-side (ECharts on <canvas> + scoped-CSS HTML), so we
 * snapshot the live `.iid` element with html2canvas and stitch the tall image across
 * A4 pages with pdf-lib. If the dashboard isn't on the page (e.g. an empty session
 * where IntelDashboard returns null) or anything fails, the original server PDF is
 * returned untouched — the download never breaks because of the charts.
 */

const A4_W = 595.28;
const A4_H = 841.89;
const MARGIN = 36;

export async function appendIntelCharts(serverPdf: Blob): Promise<Blob> {
  const root = document.querySelector<HTMLElement>('.iid');
  // No charts rendered (empty/abandoned session) → hand back the server PDF as-is.
  if (!root || root.offsetHeight < 40) return serverPdf;

  const [{ PDFDocument, StandardFonts, rgb }, html2canvasMod] = await Promise.all([
    import('pdf-lib'),
    import('html2canvas'),
  ]);
  const html2canvas = html2canvasMod.default;

  // Faithful snapshot of the whole dashboard (preserves the 2-column layout & dark theme).
  const shot = await html2canvas(root, {
    backgroundColor: '#0B1120',
    scale: 2,
    useCORS: true,
    logging: false,
    windowWidth: root.scrollWidth,
    windowHeight: root.scrollHeight,
  });
  if (!shot.width || !shot.height) return serverPdf;

  const pdf = await PDFDocument.load(await serverPdf.arrayBuffer());
  const titleFont = await pdf.embedFont(StandardFonts.HelveticaBold);
  const bodyFont = await pdf.embedFont(StandardFonts.Helvetica);

  // ── Section divider page ──────────────────────────────────────────────────
  const cover = pdf.addPage([A4_W, A4_H]);
  cover.drawRectangle({ x: 0, y: 0, width: A4_W, height: A4_H, color: rgb(0.043, 0.067, 0.125) });
  cover.drawRectangle({ x: 0, y: A4_H - 5, width: A4_W, height: 5, color: rgb(0.545, 0.361, 0.965) });
  cover.drawText('Interview Intelligence', {
    x: MARGIN, y: A4_H / 2 + 10, size: 26, font: titleFont, color: rgb(0.94, 0.96, 1),
  });
  cover.drawText('Premium analytics derived from this session’s per-question evaluator data.', {
    x: MARGIN, y: A4_H / 2 - 14, size: 11, font: bodyFont, color: rgb(0.54, 0.61, 0.75),
  });

  // ── Slice the tall snapshot across full-width A4 pages ─────────────────────
  const contentW = A4_W - MARGIN * 2;
  const scale = contentW / shot.width;          // px → pt at full content width
  const pageSrcH = Math.floor((A4_H - MARGIN * 2) / scale); // source px that fit one page

  for (let sy = 0; sy < shot.height; sy += pageSrcH) {
    const sliceH = Math.min(pageSrcH, shot.height - sy);
    const slice = document.createElement('canvas');
    slice.width = shot.width;
    slice.height = sliceH;
    const ctx = slice.getContext('2d');
    if (!ctx) break;
    ctx.drawImage(shot, 0, sy, shot.width, sliceH, 0, 0, shot.width, sliceH);

    const png = await pdf.embedPng(slice.toDataURL('image/png'));
    const page = pdf.addPage([A4_W, A4_H]);
    page.drawRectangle({ x: 0, y: 0, width: A4_W, height: A4_H, color: rgb(0.043, 0.067, 0.125) });
    const drawH = sliceH * scale;
    page.drawImage(png, { x: MARGIN, y: A4_H - MARGIN - drawH, width: contentW, height: drawH });
  }

  const bytes = await pdf.save();
  return new Blob([bytes as BlobPart], { type: 'application/pdf' });
}
