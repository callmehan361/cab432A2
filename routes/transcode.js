import express from "express";
import AWS from "aws-sdk";
import multer from "multer";
import ffmpeg from "fluent-ffmpeg";
import ffmpegPath from "ffmpeg-static";
import fs from "fs";
import { v4 as uuidv4 } from "uuid";

const router = express.Router();
ffmpeg.setFfmpegPath(ffmpegPath);

const s3 = new AWS.S3({ region: process.env.AWS_REGION });
const dynamoDB = new AWS.DynamoDB.DocumentClient({ region: process.env.AWS_REGION });

const upload = multer({ dest: "uploads/" });

// UPLOAD + TRANSCODE
router.post("/upload", upload.single("video"), async (req, res) => {
  try {
    const videoId = uuidv4();
    const filePath = req.file.path;
    const fileName = req.file.originalname;
    const s3OriginalKey = `original/${videoId}_${fileName}`;
    const s3TranscodedKey = `transcoded/${videoId}_transcoded.mp4`;

    // 1️⃣ Upload original to S3
    const fileData = fs.readFileSync(filePath);
    await s3.upload({
      Bucket: process.env.S3_BUCKET,
      Key: s3OriginalKey,
      Body: fileData
    }).promise();

    // 2️⃣ Transcode with ffmpeg
    const outputPath = `uploads/${videoId}_transcoded.mp4`;
    ffmpeg(filePath)
      .output(outputPath)
      .videoCodec("libx264")
      .on("end", async () => {
        const transcodedData = fs.readFileSync(outputPath);

        // 3️⃣ Upload transcoded to S3
        await s3.upload({
          Bucket: process.env.S3_BUCKET,
          Key: s3TranscodedKey,
          Body: transcodedData
        }).promise();

        // 4️⃣ Store metadata in DynamoDB
        await dynamoDB.put({
          TableName: process.env.DYNAMO_TABLE,
          Item: {
            videoId,
            originalName: fileName,
            transcodedKey: s3TranscodedKey,
            uploadedAt: new Date().toISOString()
          }
        }).promise();

        // 5️⃣ Clean up local files
        fs.unlinkSync(filePath);
        fs.unlinkSync(outputPath);

        res.json({
          message: "✅ Transcoding complete and uploaded to S3",
          videoId
        });
      })
      .on("error", (err) => {
        console.error("FFmpeg error:", err);
        res.status(500).json({ error: "Transcoding failed" });
      })
      .run();
  } catch (err) {
    console.error("Upload error:", err);
    res.status(500).json({ error: err.message });
  }
});

// GET METADATA
router.get("/metadata/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const result = await dynamoDB.get({
      TableName: process.env.DYNAMO_TABLE,
      Key: { videoId: id }
    }).promise();

    if (!result.Item) return res.status(404).json({ message: "Not found" });
    res.json(result.Item);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET PRE-SIGNED URL (for download)
router.get("/download/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const result = await dynamoDB.get({
      TableName: process.env.DYNAMO_TABLE,
      Key: { videoId: id }
    }).promise();

    if (!result.Item) return res.status(404).json({ message: "Metadata not found" });

    const signedUrl = s3.getSignedUrl("getObject", {
      Bucket: process.env.S3_BUCKET,
      Key: result.Item.transcodedKey,
      Expires: 3600
    });

    res.json({ downloadUrl: signedUrl });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
