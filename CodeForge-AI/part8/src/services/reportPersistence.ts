import { InterviewReportData } from '../reports/reportBuilder';

export interface StoredInterviewReport {
  interviewId: string;
  reportData: InterviewReportData;
  version: number;
  generatedAt: string;
}

/** Maps 1:1 onto the interview_reports table in
 *  db/migrations/0001_interview_domain_schema.sql. Implement against your
 *  real persistence layer — this is a port, not a database. */
export interface ReportRepository {
  save(report: StoredInterviewReport): Promise<void>;
  findLatest(interviewId: string): Promise<StoredInterviewReport | null>;
}
