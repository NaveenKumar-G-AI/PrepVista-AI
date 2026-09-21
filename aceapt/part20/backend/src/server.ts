import "dotenv/config";
import { createApp } from "./app.js";

const port = Number(process.env.PORT) || 4020;
const app = createApp();

app.listen(port, () => {
  // eslint-disable-next-line no-console
  console.log(`[server] ACEAPT Feature 20 simulation engine listening on http://localhost:${port}`);
});
