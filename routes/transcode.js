// At the top of your file, add the necessary AWS and fs modules
require('dotenv').config(); // To load environment variables from a .env file
const { S3Client, PutObjectCommand } = require("@aws-sdk/client-s3");
const fs = require('fs'); // Use the standard fs module for creating read streams
const fsPromises = require('fs').promises; // Keep using promises for other fs operations
const path = require('path');
const express = require('express');
const multer = require('multer');
const ffmpeg = require('fluent-ffmpeg');
const ffmpegPath = require('ffmpeg-static');
const { v4: uuidv4 } = require('uuid');
const authMiddleware = require('../middleware/authMiddleware');

// ⚙️ AWS S3 Configuration
const BUCKET_NAME = process.env.AWS_S3_BUCKET_NAME;
const s3Client = new S3Client({
    region: process.env.AWS_REGION,
    credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    },
});

ffmpeg.setFfmpegPath(ffmpegPath);
const router = express.Router();
const jobsFile = path.join(__dirname, '../models/jobs.json');

// Ensure directories exist
const uploadsDir = path.join(__dirname, '../Uploads');
const outputsDir = path.join(__dirname, '../outputs');
const ensureDirectories = async () => {
    try {
        await fsPromises.mkdir(uploadsDir, { recursive: true });
        await fsPromises.mkdir(outputsDir, { recursive: true });
    } catch (err) {
        console.error('Error creating directories:', err);
        throw err;
    }
};

// Ensure jobs.json exists
const ensureJobsFile = async () => {
    try {
        await fsPromises.access(jobsFile);
    } catch {
        await fsPromises.writeFile(jobsFile, JSON.stringify([], null, 2));
    }
};

// File upload storage (remains the same)
const storage = multer.diskStorage({
    destination: async (req, file, cb) => {
        await ensureDirectories();
        cb(null, uploadsDir);
    },
    filename: (req, file, cb) => {
        cb(null, `${Date.now()}-${file.originalname}`);
    }
});
const upload = multer({
    storage,
    limits: { fileSize: 100 * 1024 * 1024 } // 100MB limit
});

// Helper: Upload file to S3
async function uploadToS3(filePath, key) {
    console.log(`Uploading ${filePath} to S3 bucket ${BUCKET_NAME} with key ${key}`);
    const fileStream = fs.createReadStream(filePath);
    const command = new PutObjectCommand({
        Bucket: BUCKET_NAME,
        Key: key,
        Body: fileStream,
    });
    try {
        await s3Client.send(command);
        console.log(`Successfully uploaded to S3: ${key}`);
    } catch (err) {
        console.error("S3 Upload Error:", err);
        throw err; // Re-throw the error to be caught by the caller
    }
}

// Helper: Validate video file using FFmpeg (remains the same)
async function validateVideo(filePath) {
    return new Promise((resolve, reject) => {
        ffmpeg.ffprobe(filePath, (err, metadata) => {
            if (err) return reject(new Error('Invalid or unsupported video file'));
            const hasVideo = metadata.streams.some(stream => stream.codec_type === 'video');
            if (!hasVideo) return reject(new Error('File contains no video streams'));
            resolve(true);
        });
    });
}

// ✅ UPDATED Upload + Transcode + S3 Upload Route
router.post('/upload', authMiddleware, upload.single('video'), async (req, res) => {
    if (!req.file) {
        return res.status(400).json({ message: 'No file uploaded' });
    }

    try {
        const fileStats = await fsPromises.stat(req.file.path);
        if (fileStats.size === 0) {
            await fsPromises.unlink(req.file.path);
            return res.status(400).json({ message: 'Uploaded file is empty' });
        }
        await validateVideo(req.file.path);
    } catch (err) {
        await fsPromises.unlink(req.file.path).catch(console.error);
        return res.status(400).json({ message: err.message });
    }

    const jobId = uuidv4();
    const outputFilename = `${jobId}.mp4`;
    const outputFile = path.join(outputsDir, outputFilename);

    // Store initial job metadata
    await ensureJobsFile();
    const jobs = JSON.parse(await fsPromises.readFile(jobsFile, 'utf-8'));
    jobs.push({ id: jobId, user: req.user.username, status: 'processing', input: req.file.path });
    await fsPromises.writeFile(jobsFile, JSON.stringify(jobs, null, 2));

    res.status(202).json({ message: 'Transcoding started', jobId });

    // Transcode to MP4 (H.264/AAC)
    ffmpeg(req.file.path)
        .videoCodec('libx24')
        .audioCodec('aac')
        .outputOptions(['-preset fast', '-crf 23'])
        .output(outputFile)
        .on('end', async () => {
            try {
                const outputStats = await fsPromises.stat(outputFile);
                if (outputStats.size === 0) throw new Error('Transcoded file is empty');

                // *** S3 Upload Step ***
                const s3Key = `transcoded-videos/${outputFilename}`;
                await uploadToS3(outputFile, s3Key);

                const jobs = JSON.parse(await fsPromises.readFile(jobsFile, 'utf-8'));
                const job = jobs.find(j => j.id === jobId);
                job.status = 'completed';
                job.output = outputFile;
                job.s3_url = `https://${BUCKET_NAME}.s3.${process.env.AWS_REGION}.amazonaws.com/${s3Key}`; // Store S3 URL
                await fsPromises.writeFile(jobsFile, JSON.stringify(jobs, null, 2));

                console.log(`Job ${jobId} completed successfully. S3 URL: ${job.s3_url}`);

            } catch (err) {
                console.error(`Error during S3 upload or job update for job ${jobId}:`, err);
                const jobs = JSON.parse(await fsPromises.readFile(jobsFile, 'utf-8'));
                const job = jobs.find(j => j.id === jobId);
                job.status = 'failed';
                job.error = err.message;
                await fsPromises.writeFile(jobsFile, JSON.stringify(jobs, null, 2));
            } finally {
                // *** Cleanup Step ***
                await fsPromises.unlink(req.file.path).catch(e => console.error(`Failed to delete input file: ${req.file.path}`, e));
                await fsPromises.unlink(outputFile).catch(e => console.error(`Failed to delete output file: ${outputFile}`, e));
            }
        })
        .on('error', async (err) => {
            console.error(`FFmpeg error for job ${jobId}:`, err);
            const jobs = JSON.parse(await fsPromises.readFile(jobsFile, 'utf-8'));
            const job = jobs.find(j => j.id === jobId);
            job.status = 'failed';
            job.error = err.message;
            await fsPromises.writeFile(jobsFile, JSON.stringify(jobs, null, 2));
            // Cleanup only the input file on ffmpeg error
            await fsPromises.unlink(req.file.path).catch(e => console.error(`Failed to delete input file: ${req.file.path}`, e));
        })
        .run();
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