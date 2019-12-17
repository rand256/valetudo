// this is a copy of socks5-https-client with added setTimeout to kill broken connections in a timed manner
/**
 * @overview
 * @author Matthew Caruana Galizia <m@m.cg>
 * @license MIT
 * @copyright Copyright (c) 2013, Matthew Caruana Galizia
 */
'use strict';
const tls = require('tls');
const https = require('https');
const inherits = require('util').inherits;
const socksClient = require('socks5-client');
function createConnection(options) {
	var socksSocket, onProxied;
	socksSocket = socksClient.createConnection(options);
	onProxied = socksSocket.onProxied;
	socksSocket.onProxied = function() {
		options.socket = socksSocket.socket;
		if (options.hostname) {
			options.servername = options.hostname;
		} else if (options.host) {
			options.servername = options.host.split(':')[0];
		}
		socksSocket.socket = tls.connect(options, function() {
			socksSocket.authorized = socksSocket.socket.authorized;
			onProxied.call(socksSocket);
		});
		socksSocket.socket.setTimeout(15e3, _ => this.end());
		socksSocket.socket.on('error', function(err) {
			socksSocket.emit('error', err);
		});
	};
	return socksSocket;
}
function Agent(options) {
	https.Agent.call(this, options);
	this.socksHost = options.socksHost || 'localhost';
	this.socksPort = options.socksPort || 1080;
	this.createConnection = createConnection;
}
inherits(Agent, https.Agent);
module.exports = Agent;