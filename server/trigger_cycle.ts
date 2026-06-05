import { runAlertCycle } from "./src/engine/alertEngine";
(async () => {
  console.log("[trigger] running alert cycle...");
  await runAlertCycle();
  console.log("[trigger] cycle complete");
  process.exit(0);
})().catch((e) => { console.error("[trigger] failed:", e); process.exit(1); });
