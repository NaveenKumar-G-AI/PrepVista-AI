import "dotenv/config";
import { createApp } from "./api/app.js";

const port = Number(process.env.PORT ?? 4000);
const app = createApp();

app.listen(port, () => {
  console.log(`codeforge-growth-tracking server listening on :${port}`);
});
