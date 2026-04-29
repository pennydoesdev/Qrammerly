import "dotenv/config";
import express from "express";
import cors from "cors";
import { ADAPTERS } from "./adapters.js";
import { aggregate } from "./aggregate.js";

const app = express();
app.use(cors());
app.use(express.json({ limit: "256kb" }));

app.get("/v1/health", (_req, res) => {
  res.json({
    ok: true,
    enabled: ADAPTERS.filter((a) => a.enabled()).map((a) => a.name),
  });
});

app.post("/v1/check", async (req, res) => {
  const text = (req.body?.text ?? "").toString();
  if (!text.trim()) return res.json({ models_used: [], suggestions: [] });

  const active = ADAPTERS.filter((a) => a.enabled());
  const results = await Promise.allSettled(active.map((a) => a.run(text)));

  const perModel = [];
  for (let i = 0; i < active.length; i++) {
    const r = results[i];
    if (r.status === "fulfilled") {
      perModel.push({ name: active[i].name, suggestions: r.value.suggestions });
    } else {
      console.warn(`[${active[i].name}] failed:`, r.reason?.message || r.reason);
    }
  }

  res.json({
    models_used: perModel.map((p) => p.name),
    suggestions: aggregate(text, perModel),
  });
});

const port = Number(process.env.PORT || 8787);
app.listen(port, () => {
  const enabled = ADAPTERS.filter((a) => a.enabled()).map((a) => a.name);
  console.log(`Qrammerly server on :${port} (${enabled.length} models: ${enabled.join(", ") || "none"})`);
});
