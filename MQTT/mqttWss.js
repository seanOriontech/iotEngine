const aedes = require('aedes')();
const ws = require('ws');
const https = require('https');
const fs = require('fs');
const path = require('path');

const wsPort = 8080;

const SSL_KEY_PATH = path.join(__dirname, 'certs', 'domain.key'); // replace with actual path
const SSL_CERT_PATH = path.join(__dirname, 'certs', 'oriontech_dedicated_co_za.crt'); // replace with actual path
const CA_CERT_PATH = path.join(__dirname, 'certs', 'DigiCertCA.crt'); // replace with actual path

const sslOptions = {
    key: fs.readFileSync(SSL_KEY_PATH),       // Private key
    cert: fs.readFileSync(SSL_CERT_PATH),     // Server certificate
    ca: fs.readFileSync(CA_CERT_PATH),        // CA chain (optional, but recommended)
    requestCert: false,                        // Request client certificate (if necessary)
    rejectUnauthorized: false,                // Set to `true` for client-side certificate validation
};

// Disable authentication
aedes.authenticate = function (client, username, password, callback) {
    callback(null, true); // Automatically authenticate all clients
};

const httpsServer = https.createServer(sslOptions);

const wsServer = new ws.Server({ server: httpsServer });

wsServer.on('connection', function (wsClient) {
    const stream = ws.createWebSocketStream(wsClient);
    aedes.handle(stream);
});

httpsServer.listen(wsPort, function () {
    console.log(`WebSocket Secure (WSS) server started and listening on port ${wsPort}`);
});

aedes.on('client', function (client) {
    console.log(`Client Connected: ${client.id}`);
});

aedes.on('clientDisconnect', function (client) {
    console.log(`Client Disconnected: ${client.id}`);
});

const retainedMessages = {}; // Store retained messages in memory (use a database for persistence)

// Handle publish events
aedes.on('publish', function (packet, client) {
    if (packet.retain) {
        // Store the retained message
        retainedMessages[packet.topic] = packet;
        console.log(`Retained message stored for topic: ${packet.topic}`);
    }

    if (client) {
        console.log(`Message from client ${client.id}: ${packet.payload.toString()}`);
    }
});

// Handle subscribe events
aedes.on('subscribe', function (subscriptions, client) {
    console.log(`Client ${client.id} subscribed to topics: ${subscriptions.map(s => s.topic).join(', ')}`);

    subscriptions.forEach((subscription) => {
        const retained = retainedMessages[subscription.topic];
        if (retained) {
            // Send the retained message to the subscriber
            client.publish(retained, (err) => {
                if (err) {
                    console.error(`Failed to send retained message for topic ${subscription.topic}: ${err}`);
                }
            });
        }
    });
});

// Handle unsubscribe events
aedes.on('unsubscribe', function (subscriptions, client) {
    console.log(`Client ${client.id} unsubscribed from topics: ${subscriptions.join(', ')}`);
});
