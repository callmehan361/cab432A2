const express = require('express');
const multer = require('multer');
const ffmpeg = require('fluent-ffmpeg');
const ffmpegPath = require('ffmpeg-static');
const { v4: uuidv4 } = require('uuid');
const { S3Client, PutObjectCommand, GetObjectCommand } = require('@aws-sdk/client-s3');
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
  
  limits: { fileSize: 100 * 1024 * 1024 } // 100MB limit
});

// Helper: Validate video file using FFmpeg
async function validateVideo(filePath) {
  return new Promise((resolve, reject) => {
    ffmpeg.ffprobe(filePath, (err, metadata) => {
      if (err) {
        console.error('FFmpeg ffprobe error:', err);
        return reject(new Error('Invalid or unsupported video file'));
      }
      const hasVideo = metadata.streams.some(stream => stream.codec_type === 'video');
      if (!hasVideo) {
        return reject(new Error('File contains no video streams'));
      }
      console.log('Video metadata:', metadata);
      resolve(true);
    });
  });
}

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
  console.log('Received file:', req.file);
  if (!req.file) {
    return res.status(400).json({ message: 'No file uploaded' });
  }

  // Validate file size
  const fileStats = await fs.stat(req.file.path);
  console.log(`Input file: ${req.file.path}, Size: ${fileStats.size} bytes, MIME: ${req.file.mimetype}`);
  if (fileStats.size === 0) {
    await fs.unlink(req.file.path).catch(() => {});
    return res.status(400).json({ message: 'Uploaded file is empty' });
  }

  // Validate video file
  try {
    await validateVideo(req.file.path);
  } catch (err) {
    await fs.unlink(req.file.path).catch(() => {});
    console.error('Video validation error:', err);
    return res.status(400).json({ message: err.message });
  }

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

    // Transcode to MP4 (H.264/AAC)
    console.log(`Starting FFmpeg transcoding for job ${jobId}`);
    ffmpeg(req.file.path)
      .videoCodec('libx264')
      .audioCodec('aac')
      .outputOptions(['-preset veryslow', '-crf 28'])
      .output(path.join('/tmp/', `${jobId}.mp4`))
      .on('start', (commandLine) => {
        console.log(`FFmpeg command: ${commandLine}`);
      })
      .on('progress', (progress) => {
        console.log(`Transcoding progress for job ${jobId}: ${progress.percent}%`);
      })
      .on('end', async () => {
        try {
          const outputStats = await fs.stat(path.join('/tmp/', `${jobId}.mp4`));
          console.log(`Transcoded file: ${path.join('/tmp/', `${jobId}.mp4`)}, Size: ${outputStats.size} bytes`);
          if (outputStats.size === 0) {
            throw new Error('Transcoded file is empty');
          }

          console.log(`Uploading transcoded video to S3: ${outputKey}`);
          await s3Client.send(new PutObjectCommand({
            Bucket: process.env.S3_BUCKET,
            Key: outputKey,
            Body: await fs.readFile(path.join('/tmp/', `${jobId}.mp4`))
          }));

          await updateJobStatus(jobId, 'completed', outputKey);
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
router.get('/video/:id', authMiddleware, async (req, res) => {
  try {
    const result = await docClient.send(new GetCommand({
      TableName: process.env.JOBS_TABLE,
      Key: { id: req.params.id }
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
    }), { expiresIn: 3600 });
    res.json({ url });
  } catch (err) {
    console.error(`S3 getSignedUrl error for job ${req.params.id}:`, err);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;