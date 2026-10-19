import express from "express";
import { env } from "@/config/env";
import userRouter from "@/routes/user.routes";

const app = express();

app.use(express.json());

app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

app.use("/api/users", userRouter);

app.listen(env.PORT, () => {
  console.log(`Server running on port ${env.PORT}`);
});
