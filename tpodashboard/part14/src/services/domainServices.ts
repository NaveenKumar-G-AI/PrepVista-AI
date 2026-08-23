import { interviewRepo, offerRepo } from "../db/seed.js";

/** Stands in for Part 5's interview result publication workflow. */
class InterviewService {
  async publishResults(institutionId: string, driveId: string): Promise<{ published: number }> {
    return interviewRepo.publish(institutionId, driveId);
  }
}

/** Stands in for Part 6's offer/joining workflow. */
class OfferService {
  async acceptOffer(institutionId: string, offerId: string) {
    return offerRepo.accept(institutionId, offerId);
  }
}

interface TaskRecord {
  id: string;
  institutionId: string;
  title: string;
  ownerId: string;
  dueDate?: string;
  priority: "low" | "medium" | "high";
  status: "open" | "done";
}

/** Shared TPO task system (spec section 20). */
class TaskService {
  private tasks: TaskRecord[] = [];
  private seq = 1;

  async create(institutionId: string, ownerId: string, title: string, dueDate?: string, priority: TaskRecord["priority"] = "medium") {
    const task: TaskRecord = {
      id: `task-${this.seq++}`,
      institutionId,
      title,
      ownerId,
      dueDate,
      priority,
      status: "open",
    };
    this.tasks.push(task);
    return task;
  }

  list(institutionId: string) {
    return this.tasks.filter((t) => t.institutionId === institutionId);
  }
}

export const interviewService = new InterviewService();
export const offerService = new OfferService();
export const taskService = new TaskService();
