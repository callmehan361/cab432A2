/*
const express = require('express');
const multer = require('multer');
const ffmpeg = require('fluent-ffmpeg');
const ffmpegPath = require('ffmpeg-static');
const { v4: uuidv4 } = require('uuid');
const fs = require('fs').promises;
const path = require('path');
const authMiddleware = require('../middleware/authMiddleware');

ffmpeg.setFfmpegPath(ffmpegPath);
const router = express.Router();
const jobsFile = path.join(__dirname, '../models/jobs.json');

// Ensure directories exist
const uploadsDir = path.join(__dirname, '../Uploads');
const outputsDir = path.join(__dirname, '../outputs');
const ensureDirectories = async () => {
  try {
    await fs.mkdir(uploadsDir, { recursive: true });
    await fs.mkdir(outputsDir, { recursive: true });
    console.log('Directories ensured: Uploads, outputs');
  } catch (err) {
    console.error('Error creating directories:', err);
    throw err;
  }
};

// Ensure jobs.json exists
const ensureJobsFile = async () => {
  try {
    await fs.access(jobsFile);
  } catch {
    await fs.writeFile(jobsFile, JSON.stringify([], null, 2));
    console.log('Created jobs.json');
  }
};

// File upload storage
const storage = multer.diskStorage({
  destination: async (req, file, cb) => {
    try {
      await ensureDirectories();
      console.log('Multer destination: Uploads');
      cb(null, uploadsDir);
    } catch (err) {
      console.error('Multer destination error:', err);
      cb(err);
    }
  },
  filename: (req, file, cb) => {
    const filename = `${Date.now()}-${file.originalname}`;
    console.log(`Multer saving file as: ${filename}`);
    cb(null, filename);
  }
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
      console.log('Video metadata:', JSON.stringify(metadata, null, 2));
      resolve(true);
    });
  });
}

// Upload + Transcode
router.post('/upload', authMiddleware, upload.single('video'), async (req, res) => {
  console.log('Upload request headers:', JSON.stringify(req.headers, null, 2));
  console.log('Upload request body:', req.body);
  console.log('Upload request file:', req.file);
  if (!req.file) {
    console.log('No file received in upload request');
    return res.status(400).json({ message: 'No file uploaded' });
  }

  // Validate file size
  const fileStats = await fs.stat(req.file.path);
  console.log(`Input file: ${req.file.path}, Size: ${fileStats.size} bytes, MIME: ${req.file.mimetype}, Original name: ${req.file.originalname}`);
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
  const outputFile = path.join(outputsDir, `${jobId}.mp4`);

  // Store job metadata
  await ensureJobsFile();
  const jobs = JSON.parse(await fs.readFile(jobsFile, 'utf-8'));
  jobs.push({ id: jobId, user: req.user.username, status: 'processing', input: req.file.path });
  await fs.writeFile(jobsFile, JSON.stringify(jobs, null, 2));

  // Transcode to MP4 (H.264/AAC)
  console.log(`Starting FFmpeg transcoding for job ${jobId}`);
  ffmpeg(req.file.path)
    .videoCodec('libx264')
    .audioCodec('aac')
    .outputOptions(['-preset veryslow', '-crf 28'])
    .output(outputFile)
    .on('start', (commandLine) => {
      console.log(`FFmpeg command: ${commandLine}`);
    })
    .on('progress', (progress) => {
      console.log(`Transcoding progress for job ${jobId}: ${progress.percent}%`);
    })
    .on('end', async () => {
      try {
        const outputStats = await fs.stat(outputFile);
        console.log(`Transcoded file: ${outputFile}, Size: ${outputStats.size} bytes`);
        if (outputStats.size === 0) {
          throw new Error('Transcoded file is empty');
        }

        const jobs = JSON.parse(await fs.readFile(jobsFile, 'utf-8'));
        const job = jobs.find(j => j.id === jobId);
        job.status = 'completed';
        job.output = outputFile;
        await fs.writeFile(jobsFile, JSON.stringify(jobs, null, 2));
        await fs.unlink(req.file.path).catch(() => {});
        console.log(`Job ${jobId} completed successfully`);
      } catch (err) {
        const jobs = JSON.parse(await fs.readFile(jobsFile, 'utf-8'));
        const job = jobs.find(j => j.id === jobId);
        job.status = 'failed';
        await fs.writeFile(jobsFile, JSON.stringify(jobs, null, 2));
        await fs.unlink(req.file.path).catch(() => {});
        console.error(`Transcoding error for job ${jobId}:`, err);
      }
    })
    .on('error', async (err) => {
      const jobs = JSON.parse(await fs.readFile(jobsFile, 'utf-8'));
      const job = jobs.find(j => j.id === jobId);
      job.status = 'failed';
      await fs.writeFile(jobsFile, JSON.stringify(jobs, null, 2));
      await fs.unlink(req.file.path).catch(() => {});
      console.error(`FFmpeg error for job ${jobId}:`, err);
    })
    .run();

  res.json({ message: 'Transcoding started', jobId });
});

// Job status
router.get('/status/:id', authMiddleware, async (req, res) => {
  try {
    const jobs = JSON.parse(await fs.readFile(jobsFile, 'utf-8'));
    const job = jobs.find(j => j.id === req.params.id);
    if (!job || job.user !== req.user.username) {
      return res.status(404).json({ message: 'Job not found or unauthorized' });
    }
    res.json(job);
  } catch (err) {
    console.error(`Error reading jobs file for job ${req.params.id}:`, err);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;

*/


const express = require('express');
const multer = require('multer');
const ffmpeg = require('fluent-ffmpeg');
const ffmpegPath = require('ffmpeg-static');
const { v4: uuidv4 } = require('uuid');
const fs = require('fs').promises;
const path = require('path');
const authMiddleware = require('../middleware/authMiddleware');
const {
  S3Client,
  PutObjectCommand,
  GetObjectCommand
} = require('@aws-sdk/client-s3');

ffmpeg.setFfmpegPath(ffmpegPath);
const router = express.Router();
const jobsFile = path.join(__dirname, '../models/jobs.json');

// AWS S3 config
const bucketName = 'n1234567-test'; // change to your actual bucket name
const s3Client = new S3Client({ region: 'ap-southeast-2' });

// Local dirs for temp storage
const uploadsDir = path.join(__dirname, '../Uploads');
const outputsDir = path.join(__dirname, '../outputs');

// Ensure directories exist
async function ensureDirectories() {
  await fs.mkdir(uploadsDir, { recursive: true });
  await fs.mkdir(outputsDir, { recursive: true });
}

// Ensure jobs file exists
async function ensureJobsFile() {
  try {
    await fs.access(jobsFile);
  } catch {
    await fs.writeFile(jobsFile, JSON.stringify([], null, 2));
    console.log('Created jobs.json');
  }
}

// Multer for temporary local file storage before upload to S3
const storage = multer.diskStorage({
  destination: async (req, file, cb) => {
    try {
      await ensureDirectories();
      cb(null, uploadsDir);
    } catch (err) {
      cb(err);
    }
  },
  filename: (req, file, cb) => {
    cb(null, `${Date.now()}-${file.originalname}`);
  }
});
const upload = multer({ storage, limits: { fileSize: 100 * 1024 * 1024 } }); // 100MB

// Helper: Validate video using ffprobe
async function validateVideo(filePath) {
  return new Promise((resolve, reject) => {
    ffmpeg.ffprobe(filePath, (err, metadata) => {
      if (err) return reject(new Error('Invalid or unsupported video file'));
      const hasVideo = metadata.streams.some(s => s.codec_type === 'video');
      if (!hasVideo) return reject(new Error('No video stream found'));
      resolve(true);
    });
  });
}

// Upload file to S3
async function uploadToS3(filePath, key) {
  const fileBuffer = await fs.readFile(filePath);
  const putCommand = new PutObjectCommand({
    Bucket: bucketName,
    Key: key,
    Body: fileBuffer
  });
  await s3Client.send(putCommand);
  console.log(`✅ Uploaded ${key} to S3`);
}

// Download file from S3
async function downloadFromS3(key, downloadPath) {
  const getCommand = new GetObjectCommand({
    Bucket: bucketName,
    Key: key
  });
  const response = await s3Client.send(getCommand);
  const body = await response.Body.transformToByteArray();
  await fs.writeFile(downloadPath, Buffer.from(body));
  console.log(`✅ Downloaded ${key} from S3 to ${downloadPath}`);
}

// ---------------- UPLOAD + TRANSCODE ----------------
router.post('/upload', authMiddleware, upload.single('video'), async (req, res) => {
  if (!req.file) return res.status(400).json({ message: 'No file uploaded' });

  try {
    await ensureJobsFile();
    await validateVideo(req.file.path);

    const jobId = uuidv4();
    const inputKey = `inputs/${jobId}-${req.file.originalname}`;
    const outputKey = `outputs/${jobId}.mp4`;
    const outputFile = path.join(outputsDir, `${jobId}.mp4`);

    // Step 1: Upload raw video to S3
    await uploadToS3(req.file.path, inputKey);

    // Step 2: Track job as processing
    const jobs = JSON.parse(await fs.readFile(jobsFile, 'utf-8'));
    jobs.push({ id: jobId, user: req.user.username, status: 'processing', inputKey, outputKey });
    await fs.writeFile(jobsFile, JSON.stringify(jobs, null, 2));

    // Step 3: Download from S3 (simulate input fetch for FFmpeg)
    const localInputPath = path.join(uploadsDir, `${jobId}-input.mp4`);
    await downloadFromS3(inputKey, localInputPath);

    // Step 4: Start transcoding
    console.log(`🎬 Starting FFmpeg job ${jobId}`);
    ffmpeg(localInputPath)
      .videoCodec('libx264')
      .audioCodec('aac')
      .outputOptions(['-preset veryslow', '-crf 28'])
      .output(outputFile)
      .on('start', cmd => console.log(`FFmpeg command: ${cmd}`))
      .on('progress', p => console.log(`Progress ${jobId}: ${p.percent?.toFixed(2)}%`))
      .on('end', async () => {
        try {
          console.log(`✅ Transcoding complete for job ${jobId}`);

          // Step 5: Upload output to S3
          await uploadToS3(outputFile, outputKey);

          // Update job record
          const jobs = JSON.parse(await fs.readFile(jobsFile, 'utf-8'));
          const job = jobs.find(j => j.id === jobId);
          job.status = 'completed';
          await fs.writeFile(jobsFile, JSON.stringify(jobs, null, 2));

          // Cleanup local files
          await fs.unlink(req.file.path).catch(() => {});
          await fs.unlink(localInputPath).catch(() => {});
          await fs.unlink(outputFile).catch(() => {});
          console.log(`🧹 Cleaned up local files for job ${jobId}`);
        } catch (err) {
          console.error(`Upload to S3 failed for job ${jobId}:`, err);
        }
      })
      .on('error', async (err) => {
        console.error(`❌ FFmpeg error for job ${jobId}:`, err);
        const jobs = JSON.parse(await fs.readFile(jobsFile, 'utf-8'));
        const job = jobs.find(j => j.id === jobId);
        job.status = 'failed';
        await fs.writeFile(jobsFile, JSON.stringify(jobs, null, 2));
      })
      .run();

    res.json({ message: 'Upload successful, transcoding started', jobId });
  } catch (err) {
    console.error('Upload/transcode error:', err);
    res.status(500).json({ message: err.message || 'Server error' });
  }
});

// ---------------- JOB STATUS ----------------
router.get('/status/:id', authMiddleware, async (req, res) => {
  try {
    const jobs = JSON.parse(await fs.readFile(jobsFile, 'utf-8'));
    const job = jobs.find(j => j.id === req.params.id);
    if (!job || job.user !== req.user.username) {
      return res.status(404).json({ message: 'Job not found or unauthorized' });
    }
    res.json(job);
  } catch (err) {
    console.error(`Error fetching job ${req.params.id}:`, err);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
