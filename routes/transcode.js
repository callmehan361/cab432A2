const express = require('express');
const multer = require('multer');
const ffmpeg = require('fluent-ffmpeg');
const ffmpegPath = require('ffmpeg-static');
const { v4: uuidv4 } = require('uuid');
const AWS = require('aws-sdk');
const fs = require('fs').promises;
const path = require('path');
const authMiddleware = require('../middleware/authMiddleware');

ffmpeg.setFfmpegPath(ffmpegPath);
const router = express.Router();

// Configure AWS
const s3 = new AWS.S3({
  region: process.env.AWS_REGION
});
const dynamoDB = new AWS.DynamoDB.DocumentClient({
  region: process.env.AWS_REGION
});

// File upload storage (temporary on EC2)
const storage = multer.diskStorage({
  destination: '/tmp/',
  filename: (req, file, cb) => cb(null, `${Date.now()}-${file.originalname}`)
});
const upload = multer({ storage });

// Helper: Create job in DynamoDB
async function createJob(job) {
  try {
    await dynamoDB.put({
      TableName: process.env.JOBS_TABLE,
      Item: job
    }).promise();
  } catch (err) {
    console.error('DynamoDB createJob error:', err);
    throw err;
  }
}

// Helper: Update job status in DynamoDB
async function updateJobStatus(jobId, status, outputKey = null) {
  try {
    const updateExpression = outputKey
      ? 'SET #status = :status, outputKey = :outputKey'
      : 'SET #status = :status';
    const expressionAttributeValues = outputKey
      ? { ':status': status, ':outputKey': outputKey }
      : { ':status': status };
    await dynamoDB.update({
      TableName: process.env.JOBS_TABLE,
      Key: { id: jobId },
      UpdateExpression: updateExpression,
      ExpressionAttributeNames: { '#status': 'status' },
      ExpressionAttributeValues: expressionAttributeValues
    }).promise();
  } catch (err) {
    console.error('DynamoDB updateJobStatus error:', err);
    throw err;
  }
}

// Upload + Transcode
router.post('/upload', authMiddleware, upload.single('video'), async (req, res) => {
  if (!req.file) return res.status(400).json({ message: 'No file uploaded' });

  const jobId = uuidv4();
  const inputKey = `uploads/${jobId}-${req.file.originalname}`;
  const outputKey = `outputs/${jobId}.mp4`;

  try {
    // Upload input video to S3
    await s3.upload({
      Bucket: process.env.S3_BUCKET,
      Key: inputKey,
      Body: await fs.readFile(req.file.path)
    }).promise();

    // Store job metadata in DynamoDB
    const job = {
      id: jobId,
      user: req.user.username,
      status: 'processing',
      inputKey
    };
    await createJob(job);

    // Transcode (write to /tmp/ and upload to S3)
    ffmpeg(req.file.path)
      .outputOptions(['-preset veryslow', '-crf 28'])
      .output(path.join('/tmp/', `${jobId}.mp4`))
      .on('end', async () => {
        try {
          // Upload transcoded video to S3
          await s3.upload({
            Bucket: process.env.S3_BUCKET,
            Key: outputKey,
            Body: await fs.readFile(path.join('/tmp/', `${jobId}.mp4`))
          }).promise();

          // Update job status
          await updateJobStatus(jobId, 'completed', outputKey);

          // Clean up temporary files
          await fs.unlink(req.file.path).catch(() => {});
          await fs.unlink(path.join('/tmp/', `${jobId}.mp4`)).catch(() => {});
        } catch (err) {
          await updateJobStatus(jobId, 'failed');
          await fs.unlink(req.file.path).catch(() => {});
          await fs.unlink(path.join('/tmp/', `${jobId}.mp4`)).catch(() => {});
          console.error('Transcoding error:', err);
        }
      })
      .on('error', async (err) => {
        await updateJobStatus(jobId, 'failed');
        await fs.unlink(req.file.path).catch(() => {});
        console.error('FFmpeg error:', err);
      })
      .run();

    res.json({ message: 'Transcoding started', jobId });
  } catch (err) {
    await fs.unlink(req.file.path).catch(() => {});
    console.error('Server error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// Job status
router.get('/status/:id', authMiddleware, async (req, res) => {
  try {
    const result = await dynamoDB.get({
      TableName: process.env.JOBS_TABLE,
      Key: { id: req.params.id }
    }).promise();

    if (!result.Item || result.Item.user !== req.user.username) {
      return res.status(404).json({ message: 'Job not found or unauthorized' });
    }
    res.json(result.Item);
  } catch (err) {
    console.error('DynamoDB get error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// Get pre-signed URL for video
router.get('/video/:jobId', authMiddleware, async (req, res) => {
  try {
    const result = await dynamoDB.get({
      TableName: process.env.JOBS_TABLE,
      Key: { id: req.params.jobId }
    }).promise();

    if (!result.Item || result.Item.user !== req.user.username) {
      return res.status(403).json({ message: 'Unauthorized or job not found' });
    }
    if (result.Item.status !== 'completed' || !result.Item.outputKey) {
      return res.status(400).json({ message: 'Video not ready' });
    }

    const url = await s3.getSignedUrlPromise('getObject', {
      Bucket: process.env.S3_BUCKET,
      Key: result.Item.outputKey,
      Expires: 3600 // 1 hour
    });
    res.json({ url });
  } catch (err) {
    console.error('S3 getSignedUrl error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;