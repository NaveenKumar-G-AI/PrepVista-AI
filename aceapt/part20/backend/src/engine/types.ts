export type Difficulty = "Easy" | "Medium" | "Hard" | "Very Hard";

export interface EngineQuestion {
  id: string;
  sequenceIndex: number;
  concept: string;
  difficulty: Difficulty;
  correctIndex: number;
}

export interface EngineResponse {
  questionId: string;
  status: "unvisited" | "viewed" | "answered";
  selectedIndex: number | null;
  markedForReview: boolean;
  timeSpentMs: number;
  visits: number;
}

export interface EngineEvent {
  type: string;
  questionId: string | null;
  fromIndex: number | null;
  toIndex: number | null;
  occurredAt: string;
}

export interface Marking {
  correct: number;
  wrong: number;
  skip: number;
}
