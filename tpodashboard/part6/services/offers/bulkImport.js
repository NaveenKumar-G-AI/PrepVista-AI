'use strict';

const { detectOfferConflicts, hasBlockingConflicts } = require('./conflictDetection');

/**
 * This module validates and previews already-PARSED rows (plain objects) -
 * it does not parse raw CSV/XLSX bytes itself. Wire your existing
 * spreadsheet-parsing stack (or a library like csv-parse/papaparse/xlsx)
 * to produce rows shaped like `expectedColumns` below, then hand them
 * here. Re-implementing a CSV parser is its own project and the spec's
 * own instruction not to duplicate existing infra applies just as much
 * to "yet another CSV reader" as it does to student/company records.
 */
const expectedColumns = [
  'registerNumber',
  'companyName',
  'roleTitle',
  'ctcTotal',
  'location',
  'offerDate',
  'joiningDate',
  'acceptanceDeadline',
];

/**
 * @param {object[]} rows - parsed rows, one object per spreadsheet row
 * @param {{
 *   resolveStudentByRegisterNumber: (regNo: string) => {id: string}|null,
 *   resolveCompanyByName: (name: string) => {id: string}|null,
 *   hasFinalSelection: (args: {studentId: string, driveId: string}) => boolean,
 *   existingOffersByStudent: (studentId: string) => object[],
 *   driveIdForCompanyRole?: (companyId: string, roleTitle: string) => string|null,
 * }} resolvers
 * @returns {{valid: object[], conflicts: object[], errors: object[], seenRowKeys: Set<string>}}
 */
function validateImportRows(rows, resolvers) {
  const valid = [];
  const conflicts = [];
  const errors = [];
  const seenRowKeys = new Set();

  rows.forEach((row, index) => {
    const rowNumber = index + 1;
    const missing = expectedColumns.filter((c) => row[c] === undefined || row[c] === '' || row[c] === null);
    if (missing.length > 0) {
      errors.push({ rowNumber, type: 'MISSING_FIELDS', fields: missing });
      return;
    }

    const rowKey = `${row.registerNumber}::${row.companyName}::${row.roleTitle}`;
    if (seenRowKeys.has(rowKey)) {
      conflicts.push({
        rowNumber,
        type: 'DUPLICATE_IMPORT_ROW',
        severity: 'BLOCKING',
        message: `Row ${rowNumber} duplicates an earlier row in this same file (${rowKey}).`,
      });
      return;
    }
    seenRowKeys.add(rowKey);

    const student = resolvers.resolveStudentByRegisterNumber(row.registerNumber);
    if (!student) {
      errors.push({ rowNumber, type: 'UNKNOWN_STUDENT', registerNumber: row.registerNumber });
      return;
    }

    const company = resolvers.resolveCompanyByName(row.companyName);
    if (!company) {
      errors.push({ rowNumber, type: 'UNKNOWN_COMPANY', companyName: row.companyName });
      return;
    }

    const ctcTotal = Number(row.ctcTotal);
    if (!Number.isFinite(ctcTotal) || ctcTotal < 0) {
      errors.push({ rowNumber, type: 'INVALID_CTC', value: row.ctcTotal });
      return;
    }

    const candidate = {
      studentId: student.id,
      companyId: company.id,
      driveId: resolvers.driveIdForCompanyRole?.(company.id, row.roleTitle) ?? null,
      roleTitle: row.roleTitle,
      ctcTotalMinor: Math.round(ctcTotal * 100),
      location: row.location,
      offerDate: row.offerDate,
      joiningDate: row.joiningDate,
      acceptanceDeadline: row.acceptanceDeadline,
    };

    const rowConflicts = detectOfferConflicts(candidate, {
      existingOffers: resolvers.existingOffersByStudent(student.id),
      hasFinalSelection: resolvers.hasFinalSelection({
        studentId: student.id,
        driveId: candidate.driveId,
      }),
      allowUnselectedOverride: false,
    });

    // Only BLOCKING issues stop the row from importing (spec: "do not
    // silently import errors"). WARNING-level issues (e.g. deadline
    // falling after the joining date) still need a human to see them, so
    // they travel with the valid row into the Preview step rather than
    // vanishing - they just don't stop the commit on their own.
    if (hasBlockingConflicts(rowConflicts)) {
      conflicts.push(...rowConflicts.map((c) => ({ rowNumber, ...c })));
      return;
    }

    valid.push({ rowNumber, offer: candidate, warnings: rowConflicts });
  });

  return { valid, conflicts, errors, seenRowKeys };
}

module.exports = { expectedColumns, validateImportRows };
