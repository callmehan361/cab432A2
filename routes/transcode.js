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