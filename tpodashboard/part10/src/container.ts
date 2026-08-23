import type Database from "better-sqlite3";
import {
  SqliteStudentRepository,
  SqliteApplicationRepository,
  SqliteInterviewRepository,
  SqliteOfferRepository,
  SqliteJoiningRepository,
} from "./repositories/sourceRepositories.js";
import { EvidenceRepository } from "./repositories/evidenceRepository.js";
import { MetricDefinitionRepository } from "./repositories/metricDefinitionRepository.js";
import { ReportDefinitionRepository } from "./repositories/reportDefinitionRepository.js";
import { ReportSnapshotRepository } from "./repositories/reportSnapshotRepository.js";
import { ManagementTargetRepository } from "./repositories/managementTargetRepository.js";
import { MetricService } from "./services/metricService.js";
import { EvidenceService } from "./services/evidenceService.js";
import { ReportingService } from "./services/reportingService.js";
import { DataQualityService } from "./services/dataQualityService.js";
import { ReportGenerationService } from "./services/reportGenerationService.js";

/**
 * Builds the full Part 10 service graph from a Database handle.
 *
 * TO INTEGRATE WITH REAL PARTS 1-9: replace the five Sqlite*Repository
 * constructions below with implementations of the same interfaces
 * (StudentRepository, ApplicationRepository, InterviewRepository,
 * OfferRepository, JoiningRepository) backed by your real tables/services.
 * Every service below depends only on those interfaces, so nothing else
 * in this function needs to change.
 */
export function buildContainer(db: Database.Database) {
  const students = new SqliteStudentRepository(db);
  const applications = new SqliteApplicationRepository(db);
  const interviews = new SqliteInterviewRepository(db);
  const offers = new SqliteOfferRepository(db);
  const joining = new SqliteJoiningRepository(db);

  const evidenceRepo = new EvidenceRepository(db);
  const metricDefinitions = new MetricDefinitionRepository(db);
  const reportDefinitions = new ReportDefinitionRepository(db);
  const snapshots = new ReportSnapshotRepository(db);
  const targets = new ManagementTargetRepository(db);

  const metricService = new MetricService(metricDefinitions, students, applications, offers, joining);
  const evidenceService = new EvidenceService(evidenceRepo);
  const reportingService = new ReportingService(students, applications, interviews, offers, joining, metricService);
  const dataQualityService = new DataQualityService(students, applications, interviews, offers, joining, evidenceRepo);
  const reportGenerationService = new ReportGenerationService(
    students, applications, offers, metricService, reportingService, dataQualityService,
    evidenceService, reportDefinitions, snapshots, targets
  );

  return {
    repos: { students, applications, interviews, offers, joining, evidenceRepo, metricDefinitions, reportDefinitions, snapshots, targets },
    services: { metricService, evidenceService, reportingService, dataQualityService, reportGenerationService },
  };
}

export type Container = ReturnType<typeof buildContainer>;
