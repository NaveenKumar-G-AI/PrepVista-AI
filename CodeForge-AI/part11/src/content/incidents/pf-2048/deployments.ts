import { DeploymentRecord } from "@/lib/engine/types";

export const deployments: DeploymentRecord[] = [
  {
    id: "dep-v2132",
    serviceKey: "placement-api",
    version: "v2.13.2",
    offsetMinutes: -2880, // 2 days before ownership
    changeSummary: "Fix retry backoff for application-status webhook delivery",
    status: "SUCCESS",
    commitRef: "a91f3c2",
  },
  {
    id: "dep-v2140",
    serviceKey: "placement-api",
    version: "v2.14.0",
    offsetMinutes: -21,
    changeSummary:
      "Add employer verification-status filter to application submission flow (join against employers table)",
    status: "SUCCESS",
    commitRef: "c4d08e7",
  },
];
