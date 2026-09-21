import "dotenv/config";
import { buildApp } from "./app.js";

const port = Number(process.env.PORT ?? 4000);
const app = buildApp(process.env);

app.listen(port, () => {
  console.log(`[readiness-radar] listening on http://localhost:${port}`);
});
