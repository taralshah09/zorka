import express from "express";

const app = express();
const port = Number(process.env.PORT ?? 4000);

app.get("/", (_req, res) => {
  res.json({ name: "kimbo-api", status: "ok" });
});

app.listen(port, () => {
  console.log(`kimbo-api listening on http://localhost:${port}`);
});
