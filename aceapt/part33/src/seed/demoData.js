'use strict';

const store = require('../db/memoryStore');
const opportunityService = require('../services/opportunityService');

const DEMO_STUDENT_ID = 'student_demo_1';
const DEMO_TARGET_ID = 'target_software_developer';

/**
 * Seeds one demo student + one demo opportunity, matching the spec's own
 * "STARTUPTHON DEMO" story (section 89): a final-year Software Developer
 * target, strong in Python/APIs, developing in SQL, weak evidence in System
 * Design, against a Backend Developer internship with a tight deadline.
 *
 * The numbers below are inputs, not outputs - fit, gaps, and the
 * recommendation are all computed by the real engines from this data, not
 * hardcoded to match the narrative (see spec section 94: "No hardcoded demo
 * results").
 *
 * FastAPI is deliberately REQUIRED (not just preferred) so the gap analysis
 * has a real example of both an OPPORTUNITY GAP (FastAPI - specific to this
 * posting, outside the generic Software Developer core list) and a TARGET
 * GAP (System Design - part of general target prep) - spec section 22.
 */
async function seedDemoData({ aiProvider } = {}) {
  store.upsertTarget({ id: DEMO_TARGET_ID, name: 'Software Developer' });
  store.upsertStudent({
    id: DEMO_STUDENT_ID,
    name: 'Demo Student',
    targetId: DEMO_TARGET_ID,
    graduationStatus: 'final_year',
    experienceYears: 0,
    locationPref: 'Remote',
    availableHoursPerWeek: 6,
  });

  const profile = {
    cap_python: { proficiencyLevel: 'strong', evidenceLevel: 'strong' },
    cap_rest_apis: { proficiencyLevel: 'strong', evidenceLevel: 'moderate' },
    cap_sql: { proficiencyLevel: 'developing', evidenceLevel: 'weak' },
    cap_data_structures: { proficiencyLevel: 'developing', evidenceLevel: 'weak' },
    cap_system_design: { proficiencyLevel: 'limited', evidenceLevel: 'none' },
    cap_git: { proficiencyLevel: 'strong', evidenceLevel: 'moderate' },
  };
  Object.entries(profile).forEach(([capId, data]) => store.setStudentCapability(DEMO_STUDENT_ID, capId, data));

  const deadline = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString();
  const { opportunity } = await opportunityService.ingestOpportunity({
    title: 'Backend Developer Internship',
    organization: 'NimbusTech Labs',
    location: 'Remote',
    workMode: 'remote',
    opportunityType: 'internship',
    description: 'Support the backend team building internal APIs and services.',
    requirements: 'Python, SQL, System Design basics, FastAPI',
    preferredRequirements: 'Power BI',
    eligibility: 'Final year students or recent graduates in Computer Science or related fields. No prior professional experience required.',
    deadline,
    applicationMethod: 'Online application form',
    source: 'manual_entry',
    targetId: DEMO_TARGET_ID,
  }, { aiProvider });

  return { studentId: DEMO_STUDENT_ID, opportunity };
}

module.exports = { seedDemoData, DEMO_STUDENT_ID, DEMO_TARGET_ID };
