const express = require('express');
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const https = require('https');


const app = express();
const port = 3000;
const cors = require('cors');

const key = fs.readFileSync('/key.pem');
const cert = fs.readFileSync('/cert.pem');

// Replace this with your RTSP stream URL
const rtspUrl = 'rtsp://adminWired:wiredOnline12345@wiredonline.zapto.org:554/cam/realmonitor?channel=1&subtype=0';

app.use(cors());
// Define a route to serve the HTTP stream
// Define the file path to save the video stream
const videoFilePath = path.join(__dirname, 'stream.mp4');

// Function to start the FFmpeg process and save the stream to a file
function saveStreamToFile() {
  if (fs.existsSync(videoFilePath)) {
    fs.unlinkSync(videoFilePath);
  }

  const ffmpeg = spawn('ffmpeg', [
    '-i', rtspUrl,
    '-f', 'mp4',
    '-movflags', 'frag_keyframe+empty_moov',
    '-vf', 'scale=640:360',
    '-an',
    '-fflags', 'nobuffer',
    videoFilePath
  ]);

  ffmpeg.stderr.on('data', (data) => {
    console.error(`FFmpeg stderr: ${data}`);
  });

  ffmpeg.on('close', (code) => {
    console.log(`FFmpeg process closed with code ${code}`);
  });
}

saveStreamToFile();

// Serve the saved video file
app.get('/stream', (req, res) => {
  res.setHeader('Content-Type', 'video/mp4');
  const stream = fs.createReadStream(videoFilePath);
  stream.pipe(res);
  stream.on('error', (error) => {
    console.error('Error streaming file:', error);
    res.status(500).send('Error streaming file');
  });
});

const httpsServer = https.createServer({ key, cert }, app);

// Start the HTTPS server
httpsServer.listen(port, '0.0.0.0', () => {
  console.log(`RTSP to HTTPS server running at https://<Your_Static_IP>:${port}/stream`);
});