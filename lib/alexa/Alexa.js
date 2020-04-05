const ssdpServer = require("./ssdpServer");
const WebServer = require("./webServer");

/**
 *
 * @param options
 * @param options.address {string}
 * @param options.configuration {Configuration}
 * @param options.ssdpPort {number}
 * @param options.webPort {number}
 * @constructor
 */
const Alexa = function (options) {
	const self = this;
	const address = require('ip').address();

	this.configuration = options.configuration;
	this.deviceId = options.deviceId;
	this.webPort = options.webPort;
	this.vacuum = options.vacuum;

	let alexaConfig = self.configuration.get("alexa");

	var webServer = WebServer(
		{
			deviceId: self.deviceId,
			vacuum: self.vacuum,
			configuration: self.configuration,
		},
		undefined,
		alexaConfig.primaryPort,
		"primary"
	);

	ssdpServer(
		{
			deviceId: self.deviceId,
			address: address,
			descriptor: alexaConfig.descriptor,
		},
		webServer.address().port,
		"primary"
	);

	if (alexaConfig.zonesEnabled) {
		localZones = [];
		for (var idx in self.configuration.get("areas")) {
			var zone = self.configuration.get("areas")[idx];
			var name = zone[0].toLowerCase();
			var coordinates = zone[1];
			var port = zone[2] ? zone[2] : 0;

			var webServer = WebServer(
				{
					deviceId: self.deviceId,
					vacuum: self.vacuum,
					configuration: self.configuration,
				},
				zone,
				port,
				name
			);

			ssdpServer(
				{
					deviceId: self.deviceId,
					address: address,
					descriptor: alexaConfig.descriptor,
				},
				webServer.address().port,
				name
			);

			zone[2] = webServer.address().port;
			localZones.push(zone);
		}
		self.configuration.set("areas", localZones);
	}
};

module.exports = Alexa;
