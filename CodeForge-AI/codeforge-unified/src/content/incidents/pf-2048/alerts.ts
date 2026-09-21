import { AlertRecord } from "@/engines/incidents/types";

export const alerts: AlertRecord[] = [
  {
    id: "alert-01",
    alertType: "HIGH_ERROR_RATE",
    severity: "SEV-2",
    offsetMinutes: -2,
    serviceKey: "placement-api",
    message: "Error rate for placement-api exceeded 15% over a 5-minute window (currently 17.8%)",
    triggerCondition: "ALWAYS",
  },
  {
    id: "alert-02",
    alertType: "DATABASE_CONNECTION_EXHAUSTION",
    severity: "SEV-2",
    offsetMinutes: 32,
    serviceKey: "placement-db",
    message: "placement-db connection pool utilization exceeded 90% (94/100)",
    triggerCondition: "IF_ESCALATED",
  },
];
