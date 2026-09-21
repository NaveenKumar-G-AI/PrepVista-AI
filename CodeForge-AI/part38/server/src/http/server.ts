import "dotenv/config";
import { migrate } from "../db/migrate";
import { buildApp } from "./app";

migrate();
const app = buildApp();
const port = Number(process.env.PORT ?? 4038);

app.listen(port, () => {
  // eslint-disable-next-line no-console
  console.log(`[server] listening on :${port}`);
  // eslint-disable-next-line no-console
  console.log(`[server] remember to also run "npm run worker" — report generation happens there, not here`);
});
