const path = require("node:path");

function loadEnvFile() {
  const envPath = path.join(process.cwd(), ".env");
  try {
    const text = require("node:fs").readFileSync(envPath, "utf8");
    for (const line of text.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;
      const [key, ...parts] = trimmed.split("=");
      if (!process.env[key]) process.env[key] = parts.join("=").trim();
    }
  } catch {
    // A local .env is optional. Defaults keep the project runnable.
  }
}

loadEnvFile();

const config = {
  port: Number(process.env.PORT || 3000),
  appOrigin: process.env.APP_ORIGIN || "http://localhost:3000",
  jwtSecret: process.env.JWT_SECRET || "dev-secret-change-me",
  dataFile: path.resolve(process.env.DATA_FILE || "./data/db.json"),
  llmApiKey: process.env.LLM_API_KEY || "",
  llmModel: process.env.LLM_MODEL || "gpt-4.1-mini"
};

module.exports = { config };
