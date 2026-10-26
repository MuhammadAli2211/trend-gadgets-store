import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { connectDatabase } = require("../../server.js");
const { processDueSchedules } = require("../../services/publishService.js");

export default async function processSchedules() {
  const connected = await connectDatabase();
  if (!connected) {
    throw new Error("MongoDB connection failed while processing schedules.");
  }

  await processDueSchedules();
}

export const config = {
  schedule: "*/5 * * * *",
};
