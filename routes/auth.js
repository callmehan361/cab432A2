import express from "express";
import cors from "cors";
import bodyParser from "body-parser";
import dotenv from "dotenv";

import authRoutes from "./routes/auth.js";
import transcodeRoutes from "./routes/transcode.js";

dotenv.config();

const app = express();

app.use(cors());
app.use(bodyParser.json());
app.use("/auth", authRoutes);
app.use("/video", transcodeRoutes);

const PORT = process.env.PORT || 8080;

app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
