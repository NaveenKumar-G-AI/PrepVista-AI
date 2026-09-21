import { Router } from "express";
import { requireStudentAccess } from "../middleware/auth";
import { computePositioningProfile } from "../services/positioningEngine";
import { generateStoryAngles } from "../services/storyEngine";
import { composeIntroduction, IntroMode, IntroSeconds } from "../services/introductionEngine";
import { analyzeConsistency } from "../services/consistencyEngine";
import { positioningCache } from "../cache/positioningCache";
import { dataSource, resultStore } from "../data/inMemoryRepository";
import { narrativePort } from "../ai/narrativePort";

export const positioningRouter = Router({ mergeParams: true });

positioningRouter.use("/:studentId/positioning", requireStudentAccess);

// GET /:studentId/positioning?roleId=&opportunityId=&force=
positioningRouter.get("/:studentId/positioning", async (req, res, next) => {
  try {
    const { studentId } = req.params;
    const { roleId, opportunityId, force } = req.query as Record<string, string | undefined>;

    if (!roleId) {
      res.status(400).json({ error: "roleId query parameter is required." });
      return;
    }

    if (!force) {
      const cached = positioningCache.get(studentId, roleId, opportunityId);
      if (cached) {
        res.json(cached);
        return;
      }
    }

    const previous = await resultStore.getLatest(studentId, roleId, opportunityId);
    const profile = await computePositioningProfile({
      studentId,
      roleId,
      opportunityId,
      dataSource,
      narrativePort,
      previousVersion: previous?.version,
    });

    await resultStore.save(profile);
    positioningCache.set(studentId, roleId, opportunityId, profile);
    res.json(profile);
  } catch (err) {
    next(err);
  }
});

// POST /:studentId/positioning/recompute — invalidates the cache; the next
// GET recomputes. Wire this to the event triggers in spec section 54.
positioningRouter.post("/:studentId/positioning/recompute", (req, res) => {
  positioningCache.invalidateStudent(req.params.studentId);
  res.status(202).json({ status: "invalidated" });
});

positioningRouter.get("/:studentId/positioning/story-bank", async (req, res, next) => {
  try {
    const stories = await dataSource.getStories(req.params.studentId);
    res.json({ stories });
  } catch (err) {
    next(err);
  }
});

positioningRouter.get("/:studentId/positioning/story-angles/:projectId", async (req, res, next) => {
  try {
    const projects = await dataSource.getProjects(req.params.studentId);
    const project = projects.find((p) => p.id === req.params.projectId);
    if (!project) {
      res.status(404).json({ error: "Project not found." });
      return;
    }
    res.json({ angles: generateStoryAngles(project) });
  } catch (err) {
    next(err);
  }
});

// GET /:studentId/positioning/introduction?roleId=&opportunityId=&mode=&seconds=
positioningRouter.get("/:studentId/positioning/introduction", async (req, res, next) => {
  try {
    const { studentId } = req.params;
    const { roleId, opportunityId, mode = "hr", seconds = "30" } = req.query as Record<string, string>;

    if (!roleId) {
      res.status(400).json({ error: "roleId query parameter is required." });
      return;
    }

    const profile =
      positioningCache.get(studentId, roleId, opportunityId) ??
      (await computePositioningProfile({ studentId, roleId, opportunityId, dataSource, narrativePort }));

    const role = await dataSource.getRoleById(roleId);
    if (!role) {
      res.status(404).json({ error: "Role not found." });
      return;
    }

    const text = composeIntroduction(profile, role, mode as IntroMode, Number(seconds) as IntroSeconds);
    res.json({ text, mode, seconds: Number(seconds) });
  } catch (err) {
    next(err);
  }
});

positioningRouter.get("/:studentId/positioning/consistency", async (req, res, next) => {
  try {
    const snapshot = await dataSource.getProfileMaterialsSnapshot(req.params.studentId);
    res.json(analyzeConsistency(snapshot));
  } catch (err) {
    next(err);
  }
});
