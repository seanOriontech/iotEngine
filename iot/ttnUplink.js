const express = require('express');
const app = express();
const port = 3000;

// Middleware to parse JSON payloads
app.use(express.json());

// Endpoint to receive and log JSON payload
app.post('/api/ttn/iot', (req, res) => {
  const payload = req.body; // Access the JSON payload
  console.log('Received Payload:', payload); // Log the payload to the console

  res.status(200).send('Payload received and logged.');
});

app.post('/api/ttn', (req, res) => {
    const payload = req.body; // Access the JSON payload
    console.log('Received Payload:', payload); // Log the payload to the console
  
    res.status(200).send('Payload received and logged.');
  });

// Start the server
app.listen(port, () => {
  console.log(`Server running on http://localhost:${port}`);
});