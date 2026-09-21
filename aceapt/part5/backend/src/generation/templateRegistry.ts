import { QuestionTemplate, BASIC_TEMPLATES } from "./templates";
import { APPLICATION_TEMPLATES } from "./templatesApplication";
import { DISCOUNT_TEMPLATES, PROFIT_LOSS_TEMPLATES } from "./templatesDiscountProfit";
import { DI_TEMPLATES, MULTISTEP_TEMPLATES, POPULATION_TEMPLATES } from "./templatesPopulationMultistep";

export const ALL_TEMPLATES: QuestionTemplate[] = [
  ...BASIC_TEMPLATES,
  ...APPLICATION_TEMPLATES,
  ...DISCOUNT_TEMPLATES,
  ...PROFIT_LOSS_TEMPLATES,
  ...POPULATION_TEMPLATES,
  ...DI_TEMPLATES,
  ...MULTISTEP_TEMPLATES,
];

export function templatesForSkill(skillId: string) {
  return ALL_TEMPLATES.filter((t) => t.skillId === skillId);
}

export function templateById(id: string) {
  return ALL_TEMPLATES.find((t) => t.id === id) ?? null;
}
