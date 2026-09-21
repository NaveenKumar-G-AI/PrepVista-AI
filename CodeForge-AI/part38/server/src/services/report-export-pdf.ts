import PDFDocument from "pdfkit";
import type { TechnicalMasteryReportDto } from "../domain/dto";

const MARGIN = 54;
const PAGE_SIZE: [number, number] = [612, 792]; // US Letter, points

/**
 * Renders the validated DTO to a PDF buffer. Deterministic (same DTO in,
 * same bytes out — no random layout jitter), with explicit page-break and
 * header/footer handling per brief §53 rather than relying on a browser to
 * paginate a screenshot.
 */
export function renderReportPdf(dto: TechnicalMasteryReportDto): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: PAGE_SIZE, margin: MARGIN, bufferPages: true });
    const chunks: Buffer[] = [];
    doc.on("data", (c: Buffer) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    doc.info.Title = `Technical Mastery Report — ${dto.identity.studentName}`;
    doc.info.Subject = "CodeForge Technical Mastery Report";

    drawHeader(doc, dto);
    drawSummary(doc, dto);
    drawSkills(doc, dto);
    drawRoles(doc, dto);
    drawGaps(doc, dto);
    drawGrowth(doc, dto);
    drawStrengthsWeaknesses(doc, dto);
    drawFooters(doc, dto);

    doc.end();
  });
}

function ensureSpace(doc: PDFKit.PDFDocument, needed: number): void {
  const bottom = doc.page.height - MARGIN;
  if (doc.y + needed > bottom) doc.addPage({ size: PAGE_SIZE, margin: MARGIN });
}

function sectionTitle(doc: PDFKit.PDFDocument, text: string): void {
  ensureSpace(doc, 40);
  doc.moveDown(0.75);
  doc.fontSize(14).fillColor("#14181F").font("Helvetica-Bold").text(text);
  doc.moveTo(MARGIN, doc.y + 2).lineTo(doc.page.width - MARGIN, doc.y + 2).strokeColor("#C08A3E").lineWidth(1).stroke();
  doc.moveDown(0.5);
  doc.font("Helvetica").fillColor("#14181F");
}

function drawHeader(doc: PDFKit.PDFDocument, dto: TechnicalMasteryReportDto): void {
  doc.fontSize(20).font("Helvetica-Bold").fillColor("#14181F").text("Technical Mastery Report");
  doc.moveDown(0.2);
  doc.fontSize(12).font("Helvetica").fillColor("#4A4F58").text(`${dto.identity.studentName} · ${dto.organization.orgName}`);
  doc.moveDown(0.4);
  doc
    .fontSize(9)
    .fillColor("#7A7F88")
    .text(
      `Report ID: ${dto.metadata.reportId}   Generated: ${new Date(dto.metadata.generatedAt).toLocaleString()}   ` +
        `Schema v${dto.metadata.schemaVersion}   Source data v${dto.metadata.sourceDataVersion}   Status: ${dto.freshness}`,
    );
  doc.moveDown(0.5);
}

function drawSummary(doc: PDFKit.PDFDocument, dto: TechnicalMasteryReportDto): void {
  sectionTitle(doc, "Executive Summary");
  doc.fontSize(10.5).text(dto.narrative.executiveSummary, { width: doc.page.width - MARGIN * 2 });
  doc.moveDown(0.3);
  doc
    .fontSize(9.5)
    .fillColor("#4A4F58")
    .text(
      `Overall mastery: ${dto.mastery.overallLevel ?? "Not yet available"}   ` +
        `Target role: ${dto.summary.targetRole ?? "Not set"}   ` +
        `Readiness: ${dto.summary.roleReadiness ?? "Not yet available"}`,
    );
  doc.fillColor("#14181F");
}

function drawSkills(doc: PDFKit.PDFDocument, dto: TechnicalMasteryReportDto): void {
  sectionTitle(doc, "Skill Mastery Map");
  for (const s of dto.skills) {
    ensureSpace(doc, 18);
    doc.fontSize(10).font("Helvetica-Bold").text(`${s.skillName}  —  ${s.masteryLevel}`, { continued: false });
    doc
      .font("Helvetica")
      .fontSize(9)
      .fillColor("#4A4F58")
      .text(`Trend ${s.trend} · Evidence ${s.evidenceStrength} (${s.evidenceCount}) · ${s.gapStatus}`);
    doc.fillColor("#14181F");
    doc.moveDown(0.2);
  }
}

function drawRoles(doc: PDFKit.PDFDocument, dto: TechnicalMasteryReportDto): void {
  if (dto.roles.length === 0) return;
  sectionTitle(doc, "Target Role Readiness");
  for (const r of dto.roles) {
    ensureSpace(doc, 40);
    doc.fontSize(10.5).font("Helvetica-Bold").text(`${r.roleName} — ${r.readiness}`);
    doc.font("Helvetica").fontSize(9).fillColor("#4A4F58");
    if (r.readyAreas.length) doc.text(`Ready: ${r.readyAreas.join(", ")}`);
    if (r.developingAreas.length) doc.text(`Developing: ${r.developingAreas.join(", ")}`);
    if (r.blockingGaps.length) doc.text(`Blocking: ${r.blockingGaps.join(", ")}`);
    doc.fillColor("#14181F");
    doc.moveDown(0.3);
  }
}

function drawGaps(doc: PDFKit.PDFDocument, dto: TechnicalMasteryReportDto): void {
  if (dto.gaps.length === 0) return;
  sectionTitle(doc, "Skill Gaps");
  for (const g of dto.gaps) {
    ensureSpace(doc, 44);
    doc.fontSize(10).font("Helvetica-Bold").text(`${g.skillName} (${g.roleName}): ${g.currentState} → ${g.expectedState}`);
    doc.font("Helvetica").fontSize(9).fillColor("#4A4F58").text(g.roleImpact);
    doc.text(`Recommended: ${g.recommendedAction}`, { width: doc.page.width - MARGIN * 2 });
    doc.fillColor("#14181F");
    doc.moveDown(0.3);
  }
}

function drawGrowth(doc: PDFKit.PDFDocument, dto: TechnicalMasteryReportDto): void {
  sectionTitle(doc, "Technical Growth");
  if (dto.growth.insufficientData || dto.growth.timeline.length === 0) {
    doc.fontSize(10).fillColor("#4A4F58").text("Not enough historical data yet to show a growth timeline.");
    doc.fillColor("#14181F");
    return;
  }
  for (const e of dto.growth.timeline) {
    ensureSpace(doc, 16);
    doc
      .fontSize(9.5)
      .text(`${new Date(e.occurredAt).toLocaleDateString()} — ${e.skillName}: ${e.fromLevel} → ${e.toLevel}${e.note ? ` (${e.note})` : ""}`);
  }
}

function drawStrengthsWeaknesses(doc: PDFKit.PDFDocument, dto: TechnicalMasteryReportDto): void {
  sectionTitle(doc, "Strengths");
  if (dto.strengths.length === 0) {
    doc.fontSize(10).fillColor("#4A4F58").text("No skill currently meets the evidence threshold to be listed as a strength.");
    doc.fillColor("#14181F");
  }
  for (const s of dto.strengths) {
    ensureSpace(doc, 16);
    doc.fontSize(10).text(`• ${s.title} — ${s.evidenceRefs.join(", ")}`);
  }

  sectionTitle(doc, "Weaknesses & Next Steps");
  if (dto.weaknesses.length === 0) {
    doc.fontSize(10).fillColor("#4A4F58").text("No notable gaps are currently on record.");
    doc.fillColor("#14181F");
  }
  for (const w of dto.weaknesses) {
    ensureSpace(doc, 28);
    doc.fontSize(10).font("Helvetica-Bold").text(w.title);
    doc.font("Helvetica").fontSize(9).fillColor("#4A4F58").text(`${w.impact}. ${w.recommendedAction}`);
    doc.fillColor("#14181F");
    doc.moveDown(0.2);
  }
}

function drawFooters(doc: PDFKit.PDFDocument, dto: TechnicalMasteryReportDto): void {
  const range = doc.bufferedPageRange();
  for (let i = range.start; i < range.start + range.count; i++) {
    doc.switchToPage(i);
    doc
      .fontSize(8)
      .fillColor("#9B9FA8")
      .text(`CodeForge · Technical Mastery Report · ${dto.metadata.reportId}`, MARGIN, doc.page.height - 36, {
        width: doc.page.width - MARGIN * 2,
        align: "left",
      });
    doc.text(`Page ${i - range.start + 1} of ${range.count}`, MARGIN, doc.page.height - 36, {
      width: doc.page.width - MARGIN * 2,
      align: "right",
    });
  }
}
