const ALLOWED_CRONS = new Set([
  "8,23,38,53 3-13 * * *",
  "5 14 * * *",
]);

export default {
  async scheduled(controller, env) {
    if (!ALLOWED_CRONS.has(controller.cron)) {
      console.log("Ignored unconfigured cron expression:", controller.cron);
      return;
    }

    if (!env.CRON_SECRET) {
      throw new Error("Missing Cloudflare Worker secret: CRON_SECRET");
    }

    if (!env.API_URL) {
      throw new Error("Missing Worker variable: API_URL");
    }

    const scheduledAt = new Date(controller.scheduledTime).toISOString();
    console.log("Starting Cart2Door schedule check:", scheduledAt);

    const response = await fetch(env.API_URL, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${env.CRON_SECRET}`,
        Accept: "application/json",
      },
      signal: AbortSignal.timeout(270_000),
    });

    const responseText = await response.text();

    // The backend lock protects against overlapping invocations.
    // A 409 means another worker already owns the processing lock.
    if (response.status === 409) {
      console.log("Schedule worker is already running; this invocation was skipped.");
      return;
    }

    if (!response.ok) {
      console.error("Schedule API returned an error:", response.status, responseText.slice(0, 1000));
      throw new Error(`Cart2Door schedule API failed with HTTP ${response.status}`);
    }

    console.log("Cart2Door schedule check completed:", response.status, responseText.slice(0, 1000));
  },
};
