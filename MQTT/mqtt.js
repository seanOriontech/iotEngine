const aedes = require('aedes')();
const net = require('net');
const ws = require('ws'); // WebSocket package
const http = require('http'); // Needed to create an HTTP server
const port = 1883; // MQTT over TCP port


// Create the MQTT broker over TCP
const server = net.createServer(aedes.handle);

// Start the TCP MQTT server
server.listen(port, function () {
    console.log(`MQTT broker started and listening on port ${port}`);
});






// Handle client connection (TCP or WebSocket)
aedes.on('client', function (client) {
    console.log(`Client Connected: ${client.id}`);
});

// Handle client disconnection
aedes.on('clientDisconnect', function (client) {
    console.log(`Client Disconnected: ${client.id}`);
});

// Handle message publish
aedes.on('publish', function (packet, client) {
    if (client) {
        console.log(`Message from client ${client.id}: ${packet.payload.toString()}`);
    }
});

// Handle client subscription to topics
aedes.on('subscribe', function (subscriptions, client) {
    console.log(`Client ${client.id} subscribed to topics: ${subscriptions.map(s => s.topic).join(', ')}`);
});

// Handle client unsubscription from topics
aedes.on('unsubscribe', function (subscriptions, client) {
    console.log(`Client ${client.id} unsubscribed from topics: ${subscriptions.join(', ')}`);
});