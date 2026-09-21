import { config } from "./config";
import { createServer } from "./api/server";

const app = createServer();

app.listen(config.port, () => {
  // eslint-disable-next-line no-console
  console.log(`ACEAPT Feature 5 engine listening on :${config.port} (${config.nodeEnv})`);
});
