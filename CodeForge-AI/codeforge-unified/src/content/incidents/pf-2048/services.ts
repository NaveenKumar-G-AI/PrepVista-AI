import { ServiceNode } from "@/engines/incidents/types";

export const services: ServiceNode[] = [
  { key: "web-frontend", name: "Web Frontend", kind: "frontend", dependsOn: ["api-gateway"] },
  { key: "api-gateway", name: "API Gateway", kind: "gateway", dependsOn: ["placement-api"] },
  {
    key: "placement-api",
    name: "Placement Application API",
    kind: "service",
    dependsOn: ["placement-db", "redis-cache"],
  },
  { key: "placement-db", name: "placement-db (PostgreSQL)", kind: "database", dependsOn: [] },
  { key: "redis-cache", name: "redis-cache", kind: "cache", dependsOn: [] },
];
