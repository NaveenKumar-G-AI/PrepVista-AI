import { createServer } from './api/server.js';
import { repo } from './store/repository.js';

repo.load();
const app = createServer();
const PORT = process.env.PORT ? Number(process.env.PORT) : 4000;
app.listen(PORT, () => {
  console.log(`ACEAPT Feature 3 reference server listening on http://localhost:${PORT}`);
});
