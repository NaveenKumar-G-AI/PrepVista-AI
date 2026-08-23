import { actionEngine } from "./engine/actionEngine.js";
import { registerActionCatalog } from "./actions/index.js";
import type { ActorContext } from "./types/action.types.js";
import { seed } from "./db/seed.js";

registerActionCatalog();

const tpoHead: ActorContext = {
  userId: "user-tpo-1",
  institutionId: seed.INSTITUTION,
  role: "TPO_HEAD",
  sessionId: "session-demo-1",
};

function line() {
  console.log("─".repeat(64));
}

async function main() {
  line();
  console.log('TPO: "Show me all eligible students who haven\'t applied to ABC."');
  const listAction = await actionEngine.proposeAction("list_unapplied_students", { driveId: seed.DRIVE_ABC }, tpoHead);
  // READ actions have confirmationRequired = false; execute immediately.
  const listExecuted = await actionEngine.executeAction(listAction.id, tpoHead);
  console.log("AI:", listExecuted.result?.summary);

  line();
  console.log('TPO: "Prepare a reminder."');
  const sendProposed = await actionEngine.proposeAction(
    "send_application_reminder",
    { driveId: seed.DRIVE_ABC, message: `${seed.DRIVE_ABC} applications close today at 6 PM.`, channel: "in_app" },
    tpoHead
  );
  console.log("AI shows preview:");
  console.log(JSON.stringify(sendProposed.preview, null, 2));
  console.log(`confirmationRequired: ${sendProposed.confirmationRequired}, status: ${sendProposed.status}`);

  console.log('TPO confirms: [Send]');
  const sendConfirmed = await actionEngine.confirmAction(sendProposed.id, tpoHead);
  const sendExecuted = await actionEngine.executeAction(sendConfirmed.id, tpoHead);
  console.log("AI:", sendExecuted.result?.summary, "| status:", sendExecuted.status);

  line();
  console.log('TPO: "Assign technical interview preparation to the students with readiness below 55."');
  const trainProposed = await actionEngine.proposeAction(
    "assign_training_to_cohort",
    { trainingName: "Technical Interview Bootcamp", readinessBelow: 55 },
    tpoHead
  );
  console.log("AI shows preview:", trainProposed.preview?.headline);
  console.log('TPO confirms: [Assign]');
  const trainConfirmed = await actionEngine.confirmAction(trainProposed.id, tpoHead);
  const trainExecuted = await actionEngine.executeAction(trainConfirmed.id, tpoHead);
  console.log("AI:", trainExecuted.result?.summary, "| status:", trainExecuted.status);

  line();
  console.log('TPO: "Publish these interview results."');
  try {
    const publishProposed = await actionEngine.proposeAction(
      "publish_interview_results",
      { driveId: seed.DRIVE_PENDING, confirmationReason: "Demonstrating precondition refusal" },
      tpoHead
    );
    console.log("Unexpected: should not reach here", publishProposed.id);
  } catch (err) {
    console.log("AI refuses to execute:", (err as Error).message);
  }

  line();
  console.log("Now publishing the fully-reviewed drive instead:");
  const publishOk = await actionEngine.proposeAction(
    "publish_interview_results",
    { driveId: seed.DRIVE_XYZ, confirmationReason: "All 37 results reviewed and finalized by placement committee." },
    tpoHead
  );
  console.log("AI shows preview:", publishOk.preview?.headline, "| irreversible:", publishOk.preview?.irreversible);
  const publishConfirmed = await actionEngine.confirmAction(publishOk.id, tpoHead);
  const publishExecuted = await actionEngine.executeAction(publishConfirmed.id, tpoHead);
  console.log("AI:", publishExecuted.result?.summary, "| status:", publishExecuted.status);
  line();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
