/*
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const authRoutes = require('./routes/auth');
const transcodeRoutes = require('./routes/transcode');

const app = express();

// Middleware
app.use(cors());
app.use(express.json());

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/transcode', transcodeRoutes);

// Start server
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
*/

const express = require('express');
const auth = require('./routes/auth');
const transcode = require('./routes/transcode');

const app = express();

// Middleware to parse JSON bodies
app.use(express.json());

// Routes
app.use('/api/auth', auth.router);
app.use('/api/transcode', transcode);

app.listen(5000, () => {
  console.log('Server running on port 5000');
});