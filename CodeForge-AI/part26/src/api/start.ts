import { buildServer } from './server.js';

const port = Number(process.env.PORT ?? 3000);

buildServer()
  .then((app) => app.listen({ port, host: '127.0.0.1' }))
  .then(() => console.log(`skill-signal-engine API listening on :${port}`))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
