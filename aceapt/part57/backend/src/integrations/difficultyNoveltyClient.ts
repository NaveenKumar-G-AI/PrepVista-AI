/**
 * Feature 55 (difficulty) and Feature 49 (novelty/familiarity) integration
 * seam. See ./README.md. Feature 57 stores whatever difficulty/novelty tag
 * a caller supplies with each usage (secs. 44, 48, 137-138) - this client
 * is only needed when Feature 57 has to *look up* a tag itself, e.g. to
 * pick a fair baseline comparison (sec. 43) or a transfer-training item.
 */
export interface DifficultyNoveltyClient {
  getDifficulty(questionId: string): Promise<'EASY' | 'MEDIUM' | 'HARD' | null>;
  getNovelty(studentId: string, questionId: string): Promise<'FAMILIAR' | 'NOVEL' | null>;
}

export class StubDifficultyNoveltyClient implements DifficultyNoveltyClient {
  async getDifficulty(_questionId: string) {
    return null;
  }
  async getNovelty(_studentId: string, _questionId: string) {
    return null;
  }
}
