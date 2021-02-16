const dgram = require("dgram");
const zlib = require("zlib");
const crypto = require("crypto");

const RRMapParser = require("../RRMapParser");

const TimeSyncPacket = require("./TimeSyncPacket");
const Codec = require("./Codec");
const Stamp = require("./Stamp");

/**
 * @param valetudo {Valetudo}
 * @constructor
 */
const Dummycloud = function (valetudo) {
	this.spoofedIP = valetudo.configuration.get("dummycloud").spoofedIP;
	this.bindIP = valetudo.configuration.get("dummycloud").bindIP;
	this.mapUploadHost = valetudo.configuration.get("map_upload_host");
	this.events = valetudo.events;
	this.map = valetudo.map;

	this.cloudKey = valetudo.cloudKey;
	this.deviceId = valetudo.deviceId;

	this.codec = new Codec({token: this.cloudKey});
	this.socket = dgram.createSocket("udp4");
	this.socket.bind(8053, this.bindIP);

	this.lastMapPoll = 0;
	this.lastStatusPoll = 0;
	this.mapRetryCount = 0;
	this.statusLocked = false;

	this.connectedRobot = {
		port: 1,
		ip: "",
		stamp: 0,
		status: {
			state: 8, //With no data available, always assume that the robot is docked
		}
	};

	this.socket.on("listening", () => {
		console.info(new Date(), "Dummycloud is spoofing " + this.spoofedIP + ":8053 on " + this.bindIP +":8053");
	});

	this.socket.on("message", (incomingMsg, rinfo) => {
		const decodedResponse = this.codec.handleResponse(incomingMsg);
		let response;
		let responseJSON;

		if (this.connectedRobot.port === 1) {
			console.info(new Date(), "Robot connected");
			setTimeout(() => {
				this.pollStatus();
			}, 15e2);
			setTimeout(() => {
				this.pollMap();
			}, 3e3);
		}

		this.connectedRobot.port = rinfo.port;
		this.connectedRobot.ip = rinfo.address;
		this.connectedRobot.stamp = decodedResponse.stamp;

		if (decodedResponse.msg === null) {
			if(decodedResponse.stamp === 0) { //Initial TimeSync Packet, but this might be missing
				//Respond with current time
				response = new TimeSyncPacket().header;
				console.info(new Date(), "Timesync packet received");
			} else { //Keep-alive packet
				//Respond with echo
				response = incomingMsg;
			}
		} else if (decodedResponse.msg) {
			if (decodedResponse.msg.method) {
				switch (decodedResponse.msg.method) {
					case "props":
						this.updateState(decodedResponse.msg.params,true);
						break;
					case "event.status":
						if(
							decodedResponse.msg.params &&
							decodedResponse.msg.params[0] &&
							decodedResponse.msg.params[0].state !== undefined
						) {
							this.updateState(decodedResponse.msg.params[0]);
						}
						break;
					case "event.bin_full": //TODO: bring to UI
						this.events.emit("miio.bin_full", decodedResponse.msg);
						break;
					case "event.consume_material_notify":
						this.events.emit("miio.consume_material_notify", decodedResponse.msg);
						break;
					case "event.zoned_clean_succ":
					case "event.zoned_clean_partial_done":
					case "event.zoned_clean_failed":
					case "event.segment_clean_succ":
					case "event.segment_clean_partial_done":
					case "event.segment_clean_failed":
					case "event.clean_complete":
					case "event.clean_complete_fail":
						this.events.emit("miio.cleaning_finished", decodedResponse.msg);
						break;
					case "event.goto_target_succ":
						this.events.emit("miio.target_reached", decodedResponse.msg);
						break;
					case "event.back_to_dock":
						this.events.emit("miio.dock_reached", decodedResponse.msg);
						break;
				}
				if (["event.zoned_clean_partial_done","event.zoned_clean_failed", "event.segment_clean_partial_done","event.segment_clean_failed"].includes(decodedResponse.msg.method)) {
					this.events.emit("miio.parametrized_cleaning_failed", decodedResponse.msg);
				}
				switch (decodedResponse.msg.method) {
					case "_otc.info":
						responseJSON = {
							"id": decodedResponse.msg.id,
							"result": {
								"otc_list": [{
									"ip": this.spoofedIP,
									"port": 8053
								}
								],
								"otc_test": {
									"list": [{
										"ip": this.spoofedIP,
										"port": 8053
									}
									],
									"interval": 1800,
									"firsttest": 1193
								}
							}
						};
						break;
					case "_sync.getctrycode":
						responseJSON = {
							id: decodedResponse.msg.id,
							result: {ctry_code: "DE"} //TODO
						};
						break;
					case "_sync.getAppData":
						responseJSON = {
							id: decodedResponse.msg.id,
							error:{
								code: -6,
								message: "not set app data"
							}
						};
						break;
					case "_sync.gen_presigned_url":
					case "_sync.batch_gen_room_up_url":
						let MAP_UPLOAD_URLS = [],
							indexes = decodedResponse.msg.params && decodedResponse.msg.params.indexes || null;
						if (indexes && indexes.length) {
							MAP_UPLOAD_URLS = indexes.map(i => this.mapUploadHost + "/api/miio/map_slot_" + i); // this could be reduced to much less number of slots, but then there's a risk to get "cached" maps wrongly overwritten and we have plenty of RAM in supported devices anyway
						}
						else
						for (let i = 0; i < 4; i++) {
							MAP_UPLOAD_URLS.push(this.mapUploadHost + "/api/miio/map_slot_" + i + "?" + process.hrtime());
						}
						responseJSON = {
							id: decodedResponse.msg.id,
							"result": MAP_UPLOAD_URLS
						};
						break;
					case "_otc.ncinfo":
					case "_otc.ncstat":
					case "props":
					case "event.status":
					case "event.back_to_dock":
					case "event.bin_full": //TODO: bring to UI
					case "event.consume_material_notify":
					case "event.back_dock_no_signal":
					case "event.back_to_dock_no_power":
					case "event.back_to_dock_nearby":
					case "event.back_to_origin_succ":
					case "event.back_to_origin_fail":
					case "event.power_resume_clean":
					case "event.no_disturb_start":
					case "event.no_disturb_end":
					case "event.error_code":
					case "event.relocate_fail":
					case "event.relocate_failed_back":
					case "event.relocate_failed_fz_spot":
					case "event.goto_target_succ":
					case "event.target_not_reachable":
					case "event.zoned_clean_succ":
					case "event.zoned_clean_partial_done":
					case "event.zoned_clean_failed":
					case "event.segment_clean_succ":
					case "event.segment_clean_partial_done":
					case "event.segment_clean_failed":
					case "event.clean_complete":
					case "event.clean_complete_fail":
					case "event.timed_clean_start_succ":
					case "event.timed_clean_start_fail_low_power":
					case "event.timed_clean_start_fail_sensor_not_ready":
					case "event.timed_clean_start_fail_clean_in_progress":
					case "event.timed_clean_complete_succ":
					case "event.timed_clean_start_fail_relocate_fail":
					case "event.timed_clean_start_fail_start_in_forbidden":
					case "event.start_in_forbidden":
					case "event.segment_map_done":
					case "event.low_power_back": //If the robot is currently cleaning and the battery drops below 20% it drives home to charge
						responseJSON = {
							id: decodedResponse.msg.id,
							result:"ok"
						};
						break;
				}
			//Since miio_client apparently accepts negative message ids, we can use them to distinguish the requests
			//Also, it doesn't care about using the same message id many times
			} else if (decodedResponse.msg.id  < 0) {
				switch(decodedResponse.msg.id) {
					case Dummycloud.SERVER_REQUESTS.MAP:
						if(Array.isArray(decodedResponse.msg.result) && decodedResponse.msg.result.length === 1) {
							if (decodedResponse.msg.result[0] === "retry") {
								if (this.mapRetryCount++ < 5)
								setTimeout(() => {
									this.pollMap(true); // forcefully poll again
								}, 200);
							} else if (decodedResponse.msg.result[0].startsWith("map_slot_")) {
								const gzippedMapData = this.map.snapshots[+decodedResponse.msg.result[0].substr(9)];
								if (gzippedMapData)
								zlib.gunzip(gzippedMapData, (err, data) => {
									this.map.snapshots[+decodedResponse.msg.result[0].substr(9)] = null;
									if (!err) {
										const dataToHash = data.length > 48 ? data.slice(20, data.length - 29) : data; //strip index,sequence + digest
										const hashOfNewMap = crypto.createHash('sha1').update(dataToHash).digest('base64');
										if (hashOfNewMap !== this.map.hash) {
											const parsedHeader = RRMapParser.PARSE(data);
											if (parsedHeader.version && parsedHeader.version.major > 0) {
												this.map.bin = Buffer.from(gzippedMapData);
												this.map.hash = hashOfNewMap;
												// todo: check for map size, emit signal if empty
												this.events.emit("valetudo.map");
											}
										}
									} else console.log(err);
								});
							}
						}
						break;
					case Dummycloud.SERVER_REQUESTS.STATUS:
						this.updateState(decodedResponse.msg.result[0]);
						break;
					case Dummycloud.SERVER_REQUESTS.UPDATE:
						console.log(new Date(), "update request response: ", decodedResponse.msg.result);
						break;
				}
			} else {
				console.info(new Date(), "Unknown cloud message received:", JSON.stringify(decodedResponse.msg));
			}
		}
		if(responseJSON) {
			response = this.codec.encode(
				Buffer.from(JSON.stringify(responseJSON), "utf8"),
				new Stamp({val: decodedResponse.stamp}),
				decodedResponse.deviceId
			);
		}
		if (response) {
			this.sendSocket(response);
		} else if (decodedResponse.msg.id > 0) {
			console.info(new Date(), "No response for message:", JSON.stringify(decodedResponse.msg));
		}
	});
	this.events.on("valetudo.dummycloud.pollmap", () => {
		this.pollMap();
	});
	this.events.on("valetudo.dummycloud.sendUpdateRequest", (params) => {
		this.sendUpdateRequest(params);
	});
	this.events.on("valetudo.dummycloud.lockStatus", (params) => {
		this.statusLocked = true;
		setTimeout(() => this.statusLocked = false, 5e3);
	});
};

Dummycloud.prototype.sendSocket = function(message) {
	if (this.connectedRobot.port !== 1) {
		this.socket.send(message, 0, message.length, this.connectedRobot.port, this.connectedRobot.ip);
	}
};

Dummycloud.prototype.updateState = function(status,noEmit) {
	let oldState = this.connectedRobot.status.state,
		oldStatus = JSON.stringify(this.connectedRobot.status);
	if (!this.statusLocked) {
		Object.assign(this.connectedRobot.status, status, {msg_seq: undefined, lock_status: undefined});
		if (oldStatus !== JSON.stringify(this.connectedRobot.status)) {
			this.events.emit("miio.status", this.connectedRobot.status);
		}
	}
	if (status.state && status.state !== oldState) {
		if ([17,18].includes(oldState) && status.state === 5) {
			// sometimes when device attempts to clean an unreachable zone or room, it may encounter a bug which resets the zoned cleaning into a full cleaning
			// i find it unacceptable and believe it should better be canceled at all
			this.events.emit("miio.unreachable_cleaning_bug");
			return;
		}
		if ([4,5,6,7,11,15,16,17,18].includes(status.state)) {
			this.pollMap();
		}
		if ([5,11,17,18].includes(status.state)) {
			this.pollStatus();
		}
		if (!noEmit) {
			this.events.emit("miio.status_changed", this.connectedRobot.status, oldState);
		}
	}
};

Dummycloud.prototype.pollMap = function(retry) {
	retry = !!retry || false;
	if (this.pollMapTimeout) {
		clearTimeout(this.pollMapTimeout);
	}
	if (!retry) {
		this.mapRetryCount = 0;
	}
	let timeout = this.connectedRobot.status.state === 7 ? 250 : [4,5,6,11,15,16,17,18].includes(this.connectedRobot.status.state) ? 1000 : 60000;
	const now = Date.now(), delay = Math.min(timeout-50,950);
	if (now - delay > this.lastMapPoll || retry) {
		this.lastMapPoll = now;
		var response = this.codec.encode(
			Buffer.from(JSON.stringify({'method': 'get_map_v1', 'id': Dummycloud.SERVER_REQUESTS.MAP}), "utf8"),
			new Stamp({val: this.connectedRobot.stamp}),
			this.deviceId
		);
		this.sendSocket(response);
	} else {
		timeout = delay - (now - this.lastMapPoll);
	}
	this.pollMapTimeout = setTimeout(() => {
		this.pollMap();
	}, timeout);
};

Dummycloud.prototype.pollStatus = function() {
	if (this.pollStatusTimeout) {
		clearTimeout(this.pollStatusTimeout);
	}
	let timeout = [5,11,17,18].includes(this.connectedRobot.status.state) ? 5000 : 60000;
	const now = Date.now();
	if (now - 4900 > this.lastStatusPoll) {
		this.lastStatusPoll = now;
		var response = this.codec.encode(
			Buffer.from(JSON.stringify({'method': 'get_status', 'id': Dummycloud.SERVER_REQUESTS.STATUS}), "utf8"),
			new Stamp({val: this.connectedRobot.stamp}),
			this.deviceId
		);
		this.sendSocket(response);
	} else {
		timeout = 4900 - (now - this.lastStatusPoll);
	}
	this.pollStatusTimeout = setTimeout(() => {
		this.pollStatus();
	}, timeout);
};

Dummycloud.prototype.sendUpdateRequest = function(params) {
	var response = this.codec.encode(
		Buffer.from(JSON.stringify({'method': 'miIO.ota', 'id': Dummycloud.SERVER_REQUESTS.UPDATE, 'params': {"mode": "normal", "install": "1", "app_url": params.url, "file_md5": params.md5, "proc": "dnld install"}}), "utf8"),
		new Stamp({val: this.connectedRobot.stamp}),
		this.deviceId
	);
	this.sendSocket(response);
};

Dummycloud.SERVER_REQUESTS = {
	"MAP": -1,
	"STATUS": -2,
	"UPDATE": -3
};

module.exports = Dummycloud;