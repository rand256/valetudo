const express = require("express");
const http = require("http");
const compression = require("compression");

const {
	descriptionXML,
	binaryStateResponse,
	metaInfo,
	eventInfo,
} = require("./responses");
const { eventServiceFile, metaInfoFile } = require("./const");

const getSoapAction = function (soapaction) {
	const parts = soapaction.split("#");
	if (parts.length < 2) {
		return soapaction;
	}

	return parts[1].replace('"', "");
};

const webServer = function (options, zone, port, namespace) {
	let vacuum = options.vacuum;
	let configuration = options.configuration;

	let app = express();
	app.use(compression());

	const server = http.createServer(app);

	let alexaConfig = configuration.get("alexa");

	app.get(`/${metaInfoFile}`, function (req, res) {
		res.status(200).header("Content-Type", "text/xml").send(metaInfo());
	});

	app.get(`/${eventServiceFile}`, function (req, res) {
		res.status(200).header("Content-Type", "text/xml").send(eventInfo());
	});

	app.get(`/${alexaConfig.descriptor}`, function (req, res) {
		vacuum.getCurrentStatus(function (err, data) {
			if (err) {
				res.status(500).send(err.toString());
				return;
			} else {
				res
					.status(200)
					.header("Content-Type", "text/xml")
					.send(
						descriptionXML(
							alexaConfig.identifier,
							namespace,
							deviceId,
							data.in_cleaning
						)
					);
			}
		});
	});

	app.post("/upnp/control/basicevent1", (req, res) => {
		const action = getSoapAction(req.headers.soapaction);
		switch (action) {
			case "GetBinaryState":
				vacuum.getCurrentStatus(function (err, data) {
					if (err) {
						res
							.status(200)
							.header("Content-Type", "text/xml")
							.send(binaryStateResponse(action, 0));
						return;
					} else {
						res
							.status(200)
							.header("Content-Type", "text/xml")
							.send(binaryStateResponse(action, data.in_cleaning > 0 ? 1 : 0));
					}
				});
				return;
			case "SetBinaryState":
				vacuum.getCurrentStatus(function (err, data) {
					if (err) {
						res
							.status(200)
							.header("Content-Type", "text/xml")
							.send(binaryStateResponse(action, 0));
						return;
					}

					if (
						data.in_cleaning === 3 &&
						(data.state === 10 || data.state === 2)
					) {
						vacuum.resumeCleaningSegment((err, data) => {
							if (err) {
								res
									.status(200)
									.header("Content-Type", "text/xml")
									.send(binaryStateResponse(action, 1));
								return;
							} else {
								res
									.status(200)
									.header("Content-Type", "text/xml")
									.send(
										binaryStateResponse(action, data.in_cleaning > 0 ? 1 : 0)
									);
								return;
							}
						});
						return;
					} else if (
						data.in_cleaning === 2 &&
						(data.state === 10 || data.state === 2)
					) {
						vacuum.resumeCleaningZone((err, data) => {
							if (err) {
								res
									.status(200)
									.header("Content-Type", "text/xml")
									.send(binaryStateResponse(action, 1));
								return;
							} else {
								res
									.status(200)
									.header("Content-Type", "text/xml")
									.send(
										binaryStateResponse(action, data.in_cleaning > 0 ? 1 : 0)
									);
								return;
							}
						});
						return;
					} else if (data.in_cleaning > 0) {
						vacuum.stopCleaning(function (err, data) {
							if (err) {
								res
									.status(200)
									.header("Content-Type", "text/xml")
									.send(binaryStateResponse(action, 0));
								return;
							} else {
								res
									.status(200)
									.header("Content-Type", "text/xml")
									.send(
										binaryStateResponse(action, data.in_cleaning > 0 ? 1 : 0)
									);
								return;
							}
						});
						return;
					} else {
						if (zone) {
							vacuum.startCleaningZone(zone[1], function (err, data) {
								if (err) {
									res
										.status(200)
										.header("Content-Type", "text/xml")
										.send(binaryStateResponse(action, 1));
									return;
								} else {
									res
										.status(200)
										.header("Content-Type", "text/xml")
										.send(
											binaryStateResponse(action, data.in_cleaning > 0 ? 1 : 0)
										);
									return;
								}
							});
							return;
						} else {
							vacuum.startCleaning((err, data) => {
								if (err) {
									res
										.status(200)
										.header("Content-Type", "text/xml")
										.send(binaryStateResponse(action, 1));
									return;
								} else {
									res
										.status(200)
										.header("Content-Type", "text/xml")
										.send(
											binaryStateResponse(action, data.in_cleaning > 0 ? 1 : 0)
										);
									return;
								}
							});
							return;
						}
					}
				});
				return;
			default:
				return;
		}
	});

	server.listen(port);

	return server;
};

module.exports = webServer;
