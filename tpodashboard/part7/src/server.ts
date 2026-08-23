import "dotenv/config";
import { createApp } from "./api/app";

const port = process.env.PORT ? Number(process.env.PORT) : 3000;
createApp().listen(port, () => {
  console.log(`PrepVista Part 7 API listening on :${port}`);
});
