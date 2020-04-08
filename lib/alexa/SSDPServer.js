const Server = require("node-ssdp").Server;

const ssdpServer = function (options, port, name) {
	const self = this;

	this.name = name;
	this.deviceId = options.deviceId;
	this.address = options.address;
	this.webPort = port;
	this.descriptor = options.descriptor;

	server = new Server({
		udn: `uuid:Socket-1_0-${self.name.replace(/ /g, "-")}-${self.deviceId}`,
		location: `http://${self.address}:${self.webPort}/${self.descriptor}`,
		ssdpPort: 0,
		sourcePort: 0,
	});

	server.addUSN("upnp:rootdevice");
	server.addUSN("urn:belkin:device:**");
	server.addUSN("urn:Belkin:device:**");
	server.addUSN("ssdpsearch:all");
	server.addUSN("ssdp:all");
	server.addUSN("upnp:rootdevice");

	server.start();
	return server;
};

module.exports = ssdpServer;
