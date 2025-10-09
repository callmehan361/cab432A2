const express = require('express');
const multer = require('multer');
const ffmpeg = require('fluent-ffmpeg');
const ffmpegPath = require('ffmpeg-static');
const { v4: uuidv4 } = require('uuid');
const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, PutCommand, UpdateCommand, GetCommand } = require('@aws-sdk/lib-dynamodb');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
const fs = require('fs').promises;
const path = require('path');
const authMiddleware = require('../middleware/authMiddleware');

ffmpeg.setFfmpegPath(ffmpegPath);
const router = express.Router();

// Configure AWS
const s3Client = new S3Client({ region: process.env.AWS_REGION });
const dynamoDBClient = new DynamoDBClient({ region: process.env.AWS_REGION });
const docClient = DynamoDBDocumentClient.from(dynamoDBClient);

// File upload storage (temporary on EC2)
const storage = multer.diskStorage({
  destination: '/tmp/',
  filename: (req, file, cb) => cb(null, `${Date.now()}-${file.originalname}`)
});
const upload = multer({
  storage,
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['video/mp4', 'video/mpeg', 'video/quicktime'];
    if (!allowedTypes.includes(file.mimetype)) {
      return cb(new Error('Only MP4, MPEG, or QuickTime videos allowed'));
    }
    cb(null, true);
  },
  limits: { fileSize: 100 * 1024 * 1024 } // 100MB limit
});

// Helper: Create job in DynamoDB
async function createJob(job) {
  try {
    console.log(`Creating job ${job.id} for user ${job.user} in table ${process.env.JOBS_TABLE}`);
    await docClient.send(new PutCommand({
      TableName: process.env.JOBS_TABLE,
      Item: job
    }));
  } catch (err) {
    console.error('DynamoDB createJob error:', err);
    throw err;
  }
}

// Helper: Update job status in DynamoDB
async function updateJobStatus(jobId, status, outputKey = null) {
  try {
    console.log(`Updating job ${jobId} to status ${status}`);
    const params = {
      TableName: process.env.JOBS_TABLE,
      Key: { id: jobId },
      UpdateExpression: outputKey
        ? 'SET #status = :status, outputKey = :outputKey'
        : 'SET #status = :status',
      ExpressionAttributeNames: { '#status': 'status' },
      ExpressionAttributeValues: outputKey
        ? { ':status': status, ':outputKey': outputKey }
        : { ':status': status }
    };
    await docClient.send(new UpdateCommand(params));
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
    console.log(`Uploading video to S3: ${inputKey} in bucket ${process.env.S3_BUCKET}`);
    // Upload input video to S3
    await s3Client.send(new PutObjectCommand({
      Bucket: process.env.S3_BUCKET,
      Key: inputKey,
      Body: await fs.readFile(req.file.path)
    }));

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
          console.log(`Uploading transcoded video to S3: ${outputKey}`);
          // Upload transcoded video to S3
          await s3Client.send(new PutObjectCommand({
            Bucket: process.env.S3_BUCKET,
            Key: outputKey,
            Body: await fs.readFile(path.join('/tmp/', `${jobId}.mp4`))
          }));

          // Update job status
          await updateJobStatus(jobId, 'completed', outputKey);

          // Clean up temporary files
          await fs.unlink(req.file.path).catch(() => {});
          await fs.unlink(path.join('/tmp/', `${jobId}.mp4`)).catch(() => {});
          console.log(`Job ${jobId} completed successfully`);
        } catch (err) {
          await updateJobStatus(jobId, 'failed');
          await fs.unlink(req.file.path).catch(() => {});
          await fs.unlink(path.join('/tmp/', `${jobId}.mp4`)).catch(() => {});
          console.error(`Transcoding error for job ${jobId}:`, err);
        }
      })
      .on('error', async (err) => {
        await updateJobStatus(jobId, 'failed');
        await fs.unlink(req.file.path).catch(() => {});
        console.error(`FFmpeg error for job ${jobId}:`, err);
      })
      .run();

    res.json({ message: 'Transcoding started', jobId });
  } catch (err) {
    await fs.unlink(req.file.path).catch(() => {});
    console.error(`Server error for job ${jobId}:`, err);
    res.status(500).json({ message: 'Server error' });
  }
});

// Job status
router.get('/status/:id', authMiddleware, async (req, res) => {
  try {
    const result = await docClient.send(new GetCommand({
      TableName: process.env.JOBS_TABLE,
      Key: { id: req.params.id }
    }));

    if (!result.Item || result.Item.user !== req.user.username) {
      return res.status(404).json({ message: 'Job not found or unauthorized' });
    }
    res.json(result.Item);
  } catch (err) {
    console.error(`DynamoDB get error for job ${req.params.id}:`, err);
    res.status(500).json({ message: 'Server error' });
  }
});

// Get pre-signed URL for video
router.get('/video/:jobId', authMiddleware, async (req, res) => {
  try {
    const result = await docClient.send(new GetCommand({
      TableName: process.env.JOBS_TABLE,
      Key: { id: req.params.jobId }
    }));

    if (!result.Item || result.Item.user !== req.user.username) {
      return res.status(403).json({ message: 'Unauthorized or job not found' });
    }
    if (result.Item.status !== 'completed' || !result.Item.outputKey) {
      return res.status(400).json({ message: 'Video not ready' });
    }

    console.log(`Generating pre-signed URL for ${result.Item.outputKey}`);
    const url = await getSignedUrl(s3Client, new GetObjectCommand({
      Bucket: process.env.S3_BUCKET,
      Key: result.Item.outputKey
    }), { expiresIn: 3600 }); // 1 hour
    res.json({ url });
  } catch (err) {
    console.error(`S3 getSignedUrl error for job ${req.params.jobId}:`, err);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;