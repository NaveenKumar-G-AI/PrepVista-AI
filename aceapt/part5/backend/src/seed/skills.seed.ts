import { Skill } from "../domain/types";
import { SkillRepository } from "../repositories/catalogRepository";

export const SKILLS: Skill[] = [
  { id: "SK_PCT_BASIC", domain: "Quantitative Aptitude", topic: "Percentages", subtopic: "Basic Percentage Calculation", name: "Basic Percentage Calculation", prerequisites: [] },
  { id: "SK_PCT_APPLICATION", domain: "Quantitative Aptitude", topic: "Percentages", subtopic: "Percentage Application", name: "Percentage Application", prerequisites: ["SK_PCT_BASIC"] },
  { id: "SK_PCT_DISCOUNT", domain: "Quantitative Aptitude", topic: "Percentages", subtopic: "Discount Problems", name: "Discount Problems", prerequisites: ["SK_PCT_APPLICATION"] },
  { id: "SK_PCT_PROFIT_LOSS", domain: "Quantitative Aptitude", topic: "Percentages", subtopic: "Profit & Loss", name: "Profit & Loss", prerequisites: ["SK_PCT_APPLICATION"] },
  { id: "SK_PCT_POPULATION", domain: "Quantitative Aptitude", topic: "Percentages", subtopic: "Population Growth", name: "Population Growth (Successive % Change)", prerequisites: ["SK_PCT_APPLICATION"] },
  { id: "SK_DATA_INTERPRETATION", domain: "Quantitative Aptitude", topic: "Percentages", subtopic: "Data Interpretation", name: "Data Interpretation (Percentage-based)", prerequisites: ["SK_PCT_APPLICATION"] },
  { id: "SK_MULTISTEP", domain: "Quantitative Aptitude", topic: "Percentages", subtopic: "Multi-step Problems", name: "Multi-step Percentage Problems", prerequisites: ["SK_PCT_DISCOUNT", "SK_PCT_PROFIT_LOSS"] },
];

export function seedSkills() {
  for (const skill of SKILLS) SkillRepository.upsert(skill);
}
