import Database from "better-sqlite3";
import type { Application, Interview, Joining, Offer, Student } from "../types.js";

/**
 * These interfaces are the integration seam. Part 10's services depend
 * ONLY on these — never on SQL, never on the concrete stub tables in
 * migrations/001_source_of_truth_stubs.sql.
 *
 * To integrate with the real PrepVista Parts 1-9: implement each
 * interface against your real students / applications / offers /
 * joining tables (or call your existing services), then swap the
 * construction in src/api/server.ts and src/seed.ts. No service or
 * report logic needs to change.
 */

export interface StudentFilter {
  institutionId: string;
  season?: string;
  department?: string;
  program?: string;
}

export interface StudentRepository {
  findAll(filter: StudentFilter): Student[];
  findById(id: string, institutionId: string): Student | null;
}

export interface ApplicationRepository {
  findAll(filter: StudentFilter): Application[];
  findByStudentId(studentId: string): Application[];
}

export interface InterviewRepository {
  findAll(filter: StudentFilter): Interview[];
  findByApplicationId(applicationId: string): Interview[];
}

export interface OfferRepository {
  findAll(filter: StudentFilter): Offer[];
  findByStudentId(studentId: string): Offer[];
  findById(id: string, institutionId: string): Offer | null;
}

export interface JoiningRepository {
  findAll(filter: StudentFilter): Joining[];
  findByOfferId(offerId: string): Joining | null;
}

// ---------------------------------------------------------------------
// SQLite implementations (demo / dev / test only)
// ---------------------------------------------------------------------

function toStudent(row: any): Student {
  return {
    id: row.id,
    institutionId: row.institution_id,
    season: row.season,
    name: row.name,
    department: row.department,
    program: row.program,
    seekingPlacement: !!row.seeking_placement,
    eligible: !!row.eligible,
    readinessScore: row.readiness_score,
    riskLevel: row.risk_level,
  };
}

function toApplication(row: any): Application {
  return {
    id: row.id,
    institutionId: row.institution_id,
    season: row.season,
    studentId: row.student_id,
    driveId: row.drive_id,
    company: row.company,
    role: row.role,
    status: row.status,
    appliedAt: row.applied_at,
  };
}

function toOffer(row: any): Offer {
  return {
    id: row.id,
    institutionId: row.institution_id,
    season: row.season,
    applicationId: row.application_id,
    studentId: row.student_id,
    company: row.company,
    role: row.role,
    ctcFixed: row.ctc_fixed,
    ctcVariable: row.ctc_variable,
    status: row.status,
    verified: !!row.verified,
    createdAt: row.created_at,
  };
}

function toJoining(row: any): Joining {
  return {
    id: row.id,
    institutionId: row.institution_id,
    offerId: row.offer_id,
    studentId: row.student_id,
    status: row.status,
    verified: !!row.verified,
    joinedAt: row.joined_at,
  };
}

function toInterview(row: any): Interview {
  return {
    id: row.id,
    institutionId: row.institution_id,
    applicationId: row.application_id,
    scheduledAt: row.scheduled_at,
    attended: row.attended === null ? null : !!row.attended,
    result: row.result,
    completedAt: row.completed_at,
  };
}

export class SqliteStudentRepository implements StudentRepository {
  constructor(private db: Database.Database) {}

  findAll(filter: StudentFilter): Student[] {
    let sql = "SELECT * FROM students WHERE institution_id = ?";
    const params: any[] = [filter.institutionId];
    if (filter.season) {
      sql += " AND season = ?";
      params.push(filter.season);
    }
    if (filter.department) {
      sql += " AND department = ?";
      params.push(filter.department);
    }
    if (filter.program) {
      sql += " AND program = ?";
      params.push(filter.program);
    }
    return this.db.prepare(sql).all(...params).map(toStudent);
  }

  findById(id: string, institutionId: string): Student | null {
    const row = this.db
      .prepare("SELECT * FROM students WHERE id = ? AND institution_id = ?")
      .get(id, institutionId);
    return row ? toStudent(row) : null;
  }
}

export class SqliteApplicationRepository implements ApplicationRepository {
  constructor(private db: Database.Database) {}

  findAll(filter: StudentFilter): Application[] {
    let sql = "SELECT * FROM applications WHERE institution_id = ?";
    const params: any[] = [filter.institutionId];
    if (filter.season) {
      sql += " AND season = ?";
      params.push(filter.season);
    }
    return this.db.prepare(sql).all(...params).map(toApplication);
  }

  findByStudentId(studentId: string): Application[] {
    return this.db
      .prepare("SELECT * FROM applications WHERE student_id = ?")
      .all(studentId)
      .map(toApplication);
  }
}

export class SqliteInterviewRepository implements InterviewRepository {
  constructor(private db: Database.Database) {}

  findAll(filter: StudentFilter): Interview[] {
    let sql = `SELECT i.* FROM interviews i
                JOIN applications a ON a.id = i.application_id
                WHERE i.institution_id = ?`;
    const params: any[] = [filter.institutionId];
    if (filter.season) {
      sql += " AND a.season = ?";
      params.push(filter.season);
    }
    return this.db.prepare(sql).all(...params).map(toInterview);
  }

  findByApplicationId(applicationId: string): Interview[] {
    return this.db
      .prepare("SELECT * FROM interviews WHERE application_id = ?")
      .all(applicationId)
      .map(toInterview);
  }
}

export class SqliteOfferRepository implements OfferRepository {
  constructor(private db: Database.Database) {}

  findAll(filter: StudentFilter): Offer[] {
    let sql = "SELECT * FROM offers WHERE institution_id = ?";
    const params: any[] = [filter.institutionId];
    if (filter.season) {
      sql += " AND season = ?";
      params.push(filter.season);
    }
    return this.db.prepare(sql).all(...params).map(toOffer);
  }

  findByStudentId(studentId: string): Offer[] {
    return this.db
      .prepare("SELECT * FROM offers WHERE student_id = ?")
      .all(studentId)
      .map(toOffer);
  }

  findById(id: string, institutionId: string): Offer | null {
    const row = this.db
      .prepare("SELECT * FROM offers WHERE id = ? AND institution_id = ?")
      .get(id, institutionId);
    return row ? toOffer(row) : null;
  }
}

export class SqliteJoiningRepository implements JoiningRepository {
  constructor(private db: Database.Database) {}

  findAll(filter: StudentFilter): Joining[] {
    let sql = `SELECT j.* FROM joining j
                JOIN offers o ON o.id = j.offer_id
                WHERE j.institution_id = ?`;
    const params: any[] = [filter.institutionId];
    if (filter.season) {
      sql += " AND o.season = ?";
      params.push(filter.season);
    }
    return this.db.prepare(sql).all(...params).map(toJoining);
  }

  findByOfferId(offerId: string): Joining | null {
    const row = this.db
      .prepare("SELECT * FROM joining WHERE offer_id = ?")
      .get(offerId);
    return row ? toJoining(row) : null;
  }
}
