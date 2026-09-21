/** Question-family lookups (used across secs. 33, 137-138). See ./README.md. */
export interface QuestionFamilySummary {
  questionFamilyId: string;
  name: string;
}

export interface QuestionFamilyClient {
  getFamily(questionFamilyId: string): Promise<QuestionFamilySummary | null>;
}

export class StubQuestionFamilyClient implements QuestionFamilyClient {
  async getFamily(_questionFamilyId: string): Promise<QuestionFamilySummary | null> {
    return null;
  }
}
