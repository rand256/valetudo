const dgram = require("dgram");
const prettyCron = require("prettycron");

const HandshakePacket = require("./HandshakePacket");
const Codec = require("./Codec");
const Stamp = require("./Stamp");
const Tools = require("../Tools");


/**
 * @param valetudo {Valetudo}
 * @constructor
 */
const Vacuum = function(valetudo) {
	const self = this;

	// roborock.vacuum.s5 or rockrobo.vacuum.v1
	this.model = valetudo.model;
	this.tokenProvider = valetudo.tokenProvider;
	this.events = valetudo.events;
	this.configuration = valetudo.configuration;
	this.ip = valetudo.address;

	this.token = this.tokenProvider();
	if(this.token.length !== 16) {
		throw new Error("Invalid token");
	}

	this.socket = dgram.createSocket("udp4");
	this.codec = new Codec({token: this.token});
	this.stamp = new Stamp({});
	this.deviceId = 0;
	this.lastId = this.initialId = 1000;
	this.lastIdProbed = false;
	this.pendingRequests = {};

	this.socket.bind();
	this.socket.on("listening", function(){});

	this.handshakeInProgress = false;
	this.handshakeTimeout = null;

	this.autoRCTimer = 0;
	this.autoRCDelayed = false;
	this.autoRCQueue = [];
	this.autoRCSeq = 0;

	this.idleTimeoutTimer = 0;
	this.resetQueues(0xff);

	this.powerOutage = false;

	this.features = {};
	this.featuresInitialized = false;
	setTimeout(() => this.detectFeatures(),1e3);

	this.socket.on("message", function(msg, rinfo){
		const decodedResponse = self.codec.handleResponse(msg);
		self.stamp = new Stamp({val: decodedResponse.stamp});
		if (self.handshakeInProgress && decodedResponse.stamp) {
			clearTimeout(self.handshakeTimeout);
			self.handshakeInProgress = false;
		}
		self.deviceId = decodedResponse.deviceId;

		if(decodedResponse.msg) {
			if(self.pendingRequests[decodedResponse.msg.id]) {
				if (!self.lastIdProbed) {
					self.lastIdProbed = true;
					console.log(new Date(), "Probed last id = " + self.lastId + ' using ' + self.pendingRequests[decodedResponse.msg.id].method + " (" + self.pendingRequests[decodedResponse.msg.id].retries + " retries)");
				}
				if (decodedResponse.msg.error) {
					if (decodedResponse.msg.error.code === -10001) {
						return; // this should be the code for 'process busy', so just let it timeout by itself not to flood the device
					}
					self.pendingRequests[decodedResponse.msg.id].callback(decodedResponse.msg.error.message + (decodedResponse.msg.error.code ? ' (' + decodedResponse.msg.error.code + ')' : '') || "unspecified error");
				} else {
					self.pendingRequests[decodedResponse.msg.id].callback(null, decodedResponse.msg.result || decodedResponse.msg);
				}
				delete(self.pendingRequests[decodedResponse.msg.id]);
			}
		} else if (decodedResponse.token && decodedResponse.token.toString("hex") !== "ffffffffffffffffffffffffffffffff") {
			console.info(new Date(), "Got token from handshake:", decodedResponse.token.toString("hex"));
			self.token = decodedResponse.token;
			self.codec.setToken(self.token);
		}
	});

	this.events.on("miio.status_changed", (status, oldState) => {
		// special case for disabling autoDockReturn on power outages
		if (oldState === 8 && [3,15].includes(status.state)) {
			self.powerOutage = true;
			return;
		}
		if (self.powerOutage) {
			if (oldState === 15 && status.state === 3 || oldState === 3 && status.state === 2) {
				return;
			} else {
				self.powerOutage = false;
			}
		}
		// clear queues
		if (!([2,6,10,12,17,18].includes(status.state) || status.state === 8 && status.in_cleaning)) {
			self.resetQueues(0x0f);
		}
		if (![3,16].includes(status.state)) {
			self.resetQueues(0xf0);
		}
		// move device back to dock if requered
		const idleTimeout = self.configuration.get("system").autoDockReturn;
		if (self.idleTimeoutTimer && (idleTimeout === 1 || status.state !== 2 || status.error_code !== 0)) {
			clearTimeout(self.idleTimeoutTimer);
			self.idleTimeoutTimer = null;
		}
		if (!idleTimeout || status.error_code !== 0) {
			return;
		}
		if (idleTimeout >= 5 && [2,3].includes(status.state) && !self.idleTimeoutTimer) {
			self.idleTimeoutTimer = setTimeout(() => self.driveHome(function(){}),idleTimeout*60e3);
		} else if (idleTimeout === 1 && status.state === 2) {
			self.driveHome(function(){});
		}
	});

	this.events.on("miio.unreachable_cleaning_bug", () => {
		self.stopCleaning((err,data) => {
			if (err) {
				this.events.emit("miio.unreachable_cleaning_bug");
			} else {
				if (!self.configuration.get("system").afterCleanDest || self.postCleaningOverride === 1) {
					setTimeout(() => self.driveHome(function(){}),1e3);
				} else {
					setTimeout(() => this.events.emit("miio.cleaning_finished"),1e3);
				}
				console.log(new Date(),"Prevented navigation failure from resetting selective cleaning into a full cleaning. What a disgrace, roborock!");
			}
		});
	});

	this.events.on("miio.cleaning_finished", () => {
		// global post-cleaning settings
		var dest = self.configuration.get("system").afterCleanDest,
			isSpot = Array.isArray(dest);
		// local post-cleaning overrides
		switch (self.postCleaningOverride) {
			case 0:
				dest = 1;
				isSpot = false;
				break;
			case 1:
				dest = null;
				isSpot = false;
				break;
			default:
				if (Array.isArray(self.postCleaningOverride)) {
					dest = self.postCleaningOverride;
					isSpot = true;
				}
		}
		if (self.features.v3) {
			if (self.zonedCleaningQueue.length) {
				if (self.queueFanpowerOverride === 105) setTimeout(() => self.setFanSpeed(105,() => {}),1e3);
				self.startCleaningZone(null,function(){});
				return;
			} else if (self.segmentedCleaningQueue.length) {
				if (self.queueFanpowerOverride === 105) setTimeout(() => self.setFanSpeed(105,() => {}),1e3);
				self.startCleaningSegment(null,function(){});
				return;
			}
		} else {
			if (self.zonedCleaningQueue.length) {
				self.pauseCleaning((err,data) => {
					setTimeout(() => self.startCleaningZone(null,() => {}),19e2);
				});
				return;
			} else if (self.segmentedCleaningQueue.length) {
				self.pauseCleaning((err,data) => {
					setTimeout(() => self.startCleaningSegment(null,() => {}),19e2);
				});
				return;
			}
		}
		self.resetQueues(0x0f);
		if (dest === 1 || isSpot) {
			self[self.features.v3 ? 'stopCleaning' : 'pauseCleaning']((err,data) => {
				if (!err && isSpot) {
					setTimeout(() => self.goTo(dest[0],dest[1],() => {}),3e3);
				}
			});
		}
	});

	this.events.on("miio.target_reached", () => {
		if (self.gotoQueue.length) {
			setTimeout(() => self.goTo(null,null,() => {}),1e3);
			return;
		}
		if (self.gotoSpotCleaning) {
			self.gotoSpotCleaning = false;
			setTimeout(() => self.spotClean(() => {}),1e3);
		}
	});

	this.events.on("miio.dock_reached", () => {
		var mapName = self.configuration.get("system").autoMapRestore;
		if (mapName) {
			setTimeout(() => valetudo.mapManager.loadMap(mapName, function (err, data) {
				if (err) {
					console.log(new Date(),"Failed to auto-restore map on dock:",err);
				}
			}),1e3);
		}
	});
};

Vacuum.prototype.handshake = function() {
	if (this.handshakeInProgress) {
		return;
	}
	const self = this;
	this.handshakeInProgress = true;
	this.handshakeTimeout = setTimeout(() => { self.handshakeInProgress = false; },100);
	const packet = new HandshakePacket();
	this.socket.send(packet.header, 0, packet.header.length, Vacuum.PORT, this.ip);
};

Vacuum.prototype.sendMessage = function(method, args, options, callback) {
	options.retries = options.retries || 0;
	options.retriesHS = options.retriesHS || 0;
	if (++options.retriesHS >= 100) {
		this.lastIdProbed = false;
		console.error(new Date(), "Failed to get handshake for message:", method, args, options);
		callback("Unable to reach vacuum, handshake failed");
		return;
	}

	if(!this.stamp.isValid()) {
		this.handshake();
		setTimeout(function tryAgainAfterHandshake(){
			this.sendMessage(method, args, options, callback);
		}.bind(this), 150);
		return;
	}

	if (++options.retries >= 25) {
		this.lastIdProbed = false;
		console.error(new Date(), "Failed to get response for message:", method, args, options);
		callback("Unable to reach vacuum, no response for message");
		return;
	}

	let id, timeout, resultHandler;

	if (options.retries % 5 === 0 && options.retries >= 5) {
		// we may want to refresh the token from fs just to be sure
		let newToken = this.tokenProvider();
		if (!(this.token.equals(newToken))) {
			console.info(new Date(), "Got an expired token. Changing to new.");
			this.token = newToken;
			this.codec.setToken(this.token);
		}
		// also reset a stamp just in case
		this.stamp = new Stamp({});
	}

	// this probably will never happen but still
	if (this.lastId > 1000000) {
		this.lastId = this.initialId;
	}

	if (!this.lastIdProbed && options.retries > 1) {
		this.lastId += 1000;
	} else {
		this.lastId++;
	}

	id = this.lastId;

	const request = {
		id: id,
		method: method,
		params: args
	};

	timeout = setTimeout(function() {
		delete this.pendingRequests[id];
		this.sendMessage(method, args, options, callback);
	}.bind(this), options.timeout ? options.timeout : 1000);

	resultHandler = function(err,msg) {
		clearTimeout(timeout);
		callback(err, msg);
	};

	this.pendingRequests[id] = {
		callback: resultHandler,
		method: method,
		retries: options.retries + options.retriesHS
	}

	const msg = this.codec.encode(Buffer.from(JSON.stringify(request), "utf8"), this.stamp, this.deviceId);
	this.socket.send(msg, 0, msg.length, Vacuum.PORT, this.ip);
};

Vacuum.prototype.resetQueues = function(mask) {
	if (mask & 0x01) {
		this.zonedCleaningQueue = [];
		this.segmentedCleaningQueue = [];
		this.queueFanpowerOverride = null;
		this.queueWaterGradeOverride = null;
	}
	if (mask & 0x02) {
		this.postCleaningOverride = null;
	}
	if (mask & 0x10) {
		this.gotoQueue = [];
		this.gotoSpotCleaning = false;
	}
};

/**
 * Starts cleaning
 * Returns an error if there is one as the first parameter of the callback
 * On success, 2nd param of callback looks like this: 'ok'
 * @param callback
 */
Vacuum.prototype.startCleaning = function(callback) {
	this.sendMessage("app_start", [], {}, Vacuum.GET_ARRAY_HANDLER(callback));
};

/**
 * Stops cleaning
 * Returns an error if there is one as the first parameter of the callback
 * On success, 2nd param of callback looks like this: 'ok'
 * @param callback
 */
Vacuum.prototype.stopCleaning = function(callback) {
	this.sendMessage("app_stop", [], {}, Vacuum.GET_ARRAY_HANDLER(callback));
};

/**
 * Pause cleaning
 * Returns an error if there is one as the first parameter of the callback
 * On success, 2nd param of callback looks like this: 'ok'
 * @param callback
 */
Vacuum.prototype.pauseCleaning = function(callback) {
	this.sendMessage("app_pause", [], {}, Vacuum.GET_ARRAY_HANDLER(callback));
};

/**
 * Resumes zone cleaning after being paused
 * Returns an error if there is one as the first parameter of the callback
 * On success, 2nd param of callback looks like this: 'ok'
 * @param callback
 */
Vacuum.prototype.resumeCleaningZone = function(callback) {
	this.sendMessage("resume_zoned_clean", [], {}, Vacuum.GET_ARRAY_HANDLER(callback));
};

/**
 * Resumes segment cleaning after being paused
 * Returns an error if there is one as the first parameter of the callback
 * On success, 2nd param of callback looks like this: 'ok'
 * @param callback
 */
Vacuum.prototype.resumeCleaningSegment = function(callback) {
	this.sendMessage("resume_segment_clean", [], {}, Vacuum.GET_ARRAY_HANDLER(callback));
};

/**
 * Go back to the dock
 * Returns an error if there is one as the first parameter of the callback
 * On success, 2nd param of callback looks like this: 'ok'
 * @param callback
 */
Vacuum.prototype.driveHome = function(callback) {
	this.sendMessage("app_charge", [], {}, Vacuum.GET_ARRAY_HANDLER(callback));
};

Vacuum.prototype.spotClean = function(callback) {
	this.sendMessage("app_spot", [], {}, Vacuum.GET_ARRAY_HANDLER(callback));
};

Vacuum.prototype.startManualControl = function(callback) {
	this.sendMessage("app_rc_start", [], {}, callback)
};

Vacuum.prototype.stopManualControl = function(callback) {
	this.sendMessage("app_rc_end", [], {}, callback)
};

Vacuum.prototype.setManualControl = function(angle, velocity, duration, sequenceId, callback) {
	this.sendMessage("app_rc_move", [{"omega": angle, "velocity": velocity, "seqnum": sequenceId, "duration": duration}], {}, callback)
};

Vacuum.prototype.autoManualControl = function(angle, velocity, duration, startdelay, callback) {
	const self = this;
	const sendCommand = function(angle, velocity, duration, startdelay, callback) {
		self.autoRCDelayed = true;
		clearTimeout(self.autoRCTimer);
		self.autoRCTimer = setTimeout(() => {
			self.stopManualControl(err => {
				self.autoRCTimer = 0;
			});
		},5e3+duration);
		self.setManualControl(angle, velocity, duration, self.autoRCSeq++, (err,res) => {
			callback(err,res);
			setTimeout(() => {
				if (self.autoRCQueue.length) {
					let args = self.autoRCQueue.shift();
					sendCommand(...args);
				} else {
					self.autoRCDelayed = false;
				}
			},5e2+duration);
		});
		
	};
	this.getCurrentStatus((err,res) => {
		if (err) {
			return callback(err);
		}
		if (res.state === 7 || self.autoRCDelayed) { // already in RC mode or waiting to enter it
			if (!self.autoRCDelayed) {
				// process immediately if there's no delay
				sendCommand(angle, velocity, duration, startdelay, callback);
			} else {
				// or add the request to RC queue to run it later
				clearTimeout(self.autoRCTimer);
				self.autoRCQueue.push([angle, velocity, duration, startdelay, callback]);
			}
		} else if ([2,3,10,12].includes(res.state)) { // idle, sleep, ...
			self.autoRCDelayed = true;
			self.startManualControl(err => {
				if (err) {
					self.autoRCDelayed = false;
					return callback(err);
				}
				// apparently sequence number MUST start with 1 (when 0 it is ignored)
				self.autoRCSeq = 1;
				// we need to use some LONG ENOUGH delay to wait after starting remote control mode
				// since otherwise the command seems to be discarded
				setTimeout(() => sendCommand(angle, velocity, duration, startdelay, callback), startdelay || 8e3);
			});
		} else {
			callback("device is at inappropriate state to run autoRC commands (acceptable: 2,3,10,12, now: " + res.state + ")");
		}
	});
};

/**
 * Returns carpet detection parameter like
 * {
 *	  'enable': 1,
 *	  'current_integral': 450,
 *	  'current_low': 400,
 *	  'current_high': 500,
 *	  'stall_time': 10
 * }
 */
Vacuum.prototype.getCarpetMode = function(callback) {
	this.sendMessage("get_carpet_mode", [], {}, function(err, response){
		if(err) {
			callback(err);
		} else {
			callback(null, response);
		}
	})
};

Vacuum.prototype.setCarpetMode = function(enable, current_integral, current_low, current_high, stall_time , callback) {
	this.sendMessage(
		"set_carpet_mode",
		[{
			"enable": (enable === true ? 1 : 0),
			"stall_time": parseInt(stall_time),
			"current_low": parseInt(current_low),
			"current_high": parseInt(current_high),
			"current_integral": parseInt(current_integral)
		}],
		{},
		callback
	);
};

/**
 * Play sound to locate robot
 * Returns an error if there is one as the first parameter of the callback
 * On success, 2nd param of callback looks like this: 'ok'
 * @param callback
 */
Vacuum.prototype.findRobot = function(callback) {
	this.sendMessage("find_me", [], {}, Vacuum.GET_ARRAY_HANDLER(callback));
};

/**
 * Get a list of all timers
 * Returns an error if there is one as the first parameter of the callback
 * On success, returns an array of timers as plain objects:
 * {
 *	 id: "1530115775048",
 *	 cron: "* 2 * * *",
 *	 enabled: true
 * }
 * @param callback
 */
Vacuum.prototype.getTimers = function(callback) {
	this.sendMessage("get_timer", [], {}, function(err, response){
		if(err) {
			callback(err);
		} else {
			const timers = [];
			let err, timer;
			response.forEach(function(elem){
				if(!Array.isArray(elem) || (Array.isArray(elem) && elem.length < 3)){
					err = new Error("Invalid response");
				} else {
					timer = {
						id: elem[0],
						cron: elem[2][0],
						enabled: elem[1] === "on",
						human_desc: prettyCron.toString(elem[2][0].replace(/\ 0,1,2,3,4,5,6$/," *"))
					};
					if (typeof elem[2][1][1] === 'object') {
						timer['fanpower'] = elem[2][1][1]["fan_power"];
						timer['watergrade'] = elem[2][1][1]["water_box_mode"];
						timer['segments'] = elem[2][1][1]["segments"];
						timer['iterations'] = elem[2][1][1]["repeat"];
						timer['map_index'] = elem[2][1][1]["map_index"];
					} else {
						timer['fanpower'] = elem[2][1][1];
					}
					timers.push(timer);
				}
			});
			if(err) {
				callback(err);
			} else {
				callback(null, timers);
			}
		}
	})
};

/**
 * Set a new timer
 * Returns an error if there is one as the first parameter of the callback
 * @param settings {Object}
 * @param callback
 */
Vacuum.prototype.addTimer = function(settings, callback) {
	if (this.featuresInitialized) {
		if (this.features.v3) {
			// TODO add "map_index" : 0 for multi map
			this.sendMessage("set_timer", [[settings.id, [settings.cron, ["start_clean", {"fan_power": settings.fanpower || 102, "segments": settings.segments || "", "repeat": settings.iterations || 1, "clean_order_mode": 1, "water_box_mode": settings.watergrade || 202}]]]], {}, callback);
		} else {
			this.sendMessage("set_timer", [[settings.id, [settings.cron, ["start_clean",settings.fanpower || 60]]]], {}, callback);
		}
	} else {
		callback('features still not initialized.');
	}
};

/**
 * Deletes the timer with the given id
 * Returns an error if there is one as the first parameter of the callback
 * @param id {string}
 * @param callback
 */
Vacuum.prototype.deleteTimer = function(id, callback) {
	this.sendMessage("del_timer", [id], {}, callback);
};

/**
 * Sets the timer with the given id to the given state
 * Returns an error if there is one as the first parameter of the callback
 * @param id {string}
 * @param enabled {boolean}
 * @param callback
 */

Vacuum.prototype.toggleTimer = function(id, enabled, callback) {
	this.sendMessage("upd_timer", [id, enabled === true ? "on" : "off"], {}, callback);
};

/**
 * Returns json dnd timer in the following format
 * {
 *	  'enabled': 1,
 *	  'start_minute': 0,
 *	  'end_minute': 0,
 *	  'start_hour': 22,
 *	  'end_hour': 8
 * }
 * @param callback
 */
Vacuum.prototype.getDndTimer = function(callback) {
	this.sendMessage("get_dnd_timer", [], {}, function(err, response){
		if(err) {
			callback(err);
		} else {
			callback(null, response);
		}
	})
};

/**
 * Set dnd timer
 * @param start_hour
 * @param start_minute
 * @param end_hour
 * @param end_minute
 * @param callback
 */
Vacuum.prototype.setDndTimer = function(start_hour, start_minute, end_hour, end_minute, callback) {
	this.sendMessage("set_dnd_timer", [parseInt(start_hour), parseInt(start_minute), parseInt(end_hour), parseInt(end_minute)], {}, callback);
};

/**
 * Disable dnd
 * @param callback
 */
Vacuum.prototype.deleteDndTimer = function(callback) {
	this.sendMessage("close_dnd_timer", [""], {}, callback);
};

/**
 * Get Timezone
 */
Vacuum.prototype.getTimezone = function(callback) {
	this.sendMessage("get_timezone", [], {}, function(err, response){
		if(err) {
			callback(err);
		} else {
			callback(null, response);
		}
	})
};

/**
 * Set Timezone
 * @param new_zone new timezone
 * @param callback {function}
 */
Vacuum.prototype.setTimezone = function(new_zone, callback) {
	this.sendMessage("set_timezone", [new_zone], {}, callback);
};

/*
	0-100: percent

	Or presets:
	101: quiet
	102: balanced
	103: Turbo
	104: Max
	105: Mop
 */
Vacuum.prototype.setFanSpeed = function(speed, callback) {
	this.queueFanpowerOverride = parseInt(speed);
	this.sendMessage("set_custom_mode", [parseInt(speed)], {}, Vacuum.GET_ARRAY_HANDLER(callback));
};

Vacuum.prototype.setWaterGrade = function(speed, callback) {
	this.queueWaterGradeOverride = parseInt(speed);
	this.sendMessage("set_water_box_custom_mode", [parseInt(speed)], {}, Vacuum.GET_ARRAY_HANDLER(callback));
};

Vacuum.prototype.setSoundVolume = function(volume, callback) {
	this.sendMessage("change_sound_volume", [parseInt(volume)], {}, Vacuum.GET_ARRAY_HANDLER(callback));
};

Vacuum.prototype.getSoundVolume = function(callback) {
	this.sendMessage("get_sound_volume", [], {}, Vacuum.GET_ARRAY_HANDLER(callback));
};

Vacuum.prototype.testSoundVolume = function(callback) {
	this.sendMessage("test_sound_volume", [], {}, callback)
};

Vacuum.prototype.resetConsumable = function(consumable, callback) {
	this.sendMessage("reset_consumable", [consumable], {}, Vacuum.GET_ARRAY_HANDLER(callback));
};

Vacuum.prototype.configureWifi = function(ssid, password, callback) {
	this.sendMessage("miIO.config_router", {"ssid": ssid, "passwd": password, "uid": 0, "cc": "de", "country_domain": "de", "config_type": "app"}, {}, callback)
};

/**
 * Starts the installation of a new voice pack
 * Returns an error if there is one as the first parameter of the callback
 * On success, 2nd param looks like this:
 *  {
 *	  "progress": 0,
 *	  "state": 0,
 *	  "error": 0
 *  }
 *
 *
 * @param url {string}
 * @param md5 {string}
 * @param callback
 */
Vacuum.prototype.installVoicePack = function(url, md5, callback) {
	this.sendMessage("dnld_install_sound", {"url": url, "md5": md5, "sid": 10000}, {}, callback);
};

/**
 * Returns the current voice pack installation status
 * Returns an error if there is one as the first parameter of the callback
 * On success, 2nd param looks like this:
 *  {
 *	  "sid_in_progress": 10000,
 *	  "progress": 100,
 *	  "state": 2,
 *	  "error": 0
 *  }
 *
 *
 * @param callback
 */
Vacuum.prototype.getVoicePackInstallationStatus = function(callback) {
	this.sendMessage("get_sound_progress", [], {}, callback);
};

/**
 * Returns the current status of the robot
 * Returns an error if there is one as the first parameter of the callback
 * On success, 2nd param looks like this:
 *  {
 *	  msg_ver: 2,
 *	  msg_seq: 11,
 *	  state: 8,
 *	  battery: 100,
 *	  clean_time: 0,
 *	  clean_area: 0,
 *	  error_code: 0,
 *	  map_present: 0,
 *	  in_cleaning: 0,
 *	  fan_power: 60,
 * 	  water_box_mode: 202,
 *	  water_box_status: 1,
 *	  water_box_carriage_status: 1,
 *	  mop_forbidden_enable: 1,
 *	  dnd_enabled: 0
 *  }
 *
 *
 * @param callback
 */
Vacuum.prototype.getCurrentStatus = function(callback) {
	const self = this;

	this.sendMessage("get_status", [], {}, Vacuum.GET_ARRAY_HANDLER(function(err, res){
		if(err) {
			callback(err);
		} else {
			res.human_state = Vacuum.GET_STATE_CODE_DESCRIPTION(res.state);
			res.human_error = Vacuum.GET_ERROR_CODE_DESCRIPTION(res.error_code);
			delete(res["msg_seq"]);

			callback(null, res);
		}
	}));
};

/**
 * Returns the current status of the robots consumables
 * Returns an error if there is one as the first parameter of the callback
 * On success, 2nd param looks like this:
 *  {
 *	  main_brush_work_time: 77974,
 *	  side_brush_work_time: 77974,
 *	  filter_work_time: 77974,
 *	  sensor_dirty_time: 77808
 *  }
 *
 *
 * @param callback
 */
Vacuum.prototype.getConsumableStatus = function(callback) {
	this.sendMessage("get_consumable", [], {}, Vacuum.GET_ARRAY_HANDLER(callback));
};

/**
 * Returns the cleaning history
 * Returns an error if there is one as the first parameter of the callback
 * On success, 2nd param looks like this:
 * [81234,1199407500,76,[1530283329,1530130601,...]]
 *
 * total time in seconds
 * total area in mm²
 * total clean count
 * [ array containing up to 20 runs from the past .. ]
 *
 * @param callback
 */
Vacuum.prototype.getCleanSummary = function(callback) {
	this.sendMessage("get_clean_summary", [], {}, callback);
};

/**
 * Returns record of a specific cleaning run.
 * This requires a unique recordId that is provided in the (optional) list attached to getCleanSummary.
 * Result may look like:
 * {
 *  1550328301, //timestamp run was started
 *  1550329141, //timestamp run was finished
 *  840,		//duration in seconds
 *  14497500,   //=> 14.4975 m^2
 *  0,		  //ErrorCode (references to Vacuum.ERROR_CODES)
 *  1		   //CompletedFlag (0: did not complete, 1: did complete)
 * }
 * @param recordId id of the record the details should be fetched for
 * @param callback
 */
Vacuum.prototype.getCleanRecord = function (recordId, callback) {
	this.sendMessage("get_clean_record", [parseInt(recordId)], {}, callback);
};

/**
 * Requests cleaning run map snapshot upload
 * This requires a unique recordId that is provided in the (optional) list attached to getCleanSummary.
 *
 * @param recordId id of the record the details should be fetched for
 * @param callback
 */
Vacuum.prototype.getCleanRecordMap = function (recordId, callback) {
	this.sendMessage("get_clean_record_map", [parseInt(recordId)], {}, callback);
};

/**
 * Sets the lab status aka persistent data feature of the S50
 * @param {boolean} flag true for enabling lab mode and false for disabling
 * @param {(err: Error, res: any) => {}} callback
 */
Vacuum.prototype.setLabStatus = function(flag, callback) {
	const labStatus = flag ? 1 : 0;
	if (this.features.multimap) {
		this.sendMessage("set_lab_status", [{lab_status: labStatus}], {}, callback);
	} else {
		this.sendMessage("set_lab_status", [labStatus], {}, callback);
	}
};

/**
 * Resets all persistent data (map, forbidden zones and virtual walls)
 * @param {(err: Error, res: any) => {}} callback
 */
Vacuum.prototype.resetMap = function(callback) {
	this.sendMessage("reset_map", [], {}, callback);
};

/**
 * Recovers map by id
 * @param {number} id
 * @param {(err: Error, res: any) => {}} callback
 */
Vacuum.prototype.recoverMap = function(id, callback) {
	this.sendMessage("recover_map", [parseInt(id)], {timeout: 2000}, (err) => {
		this.events.emit("valetudo.dummycloud.pollmap");
		callback(err);
	});
};

/**
 * Saves the persistent data like virtual walls and forbidden zones
 * @param persistentData is an array of walls / zones
 * They have to be provided in the following format:
 *	  https://github.com/marcelrv/XiaomiRobotVacuumProtocol/issues/15#issuecomment-447647905
 *	  Software barrier takes a vector of [id, x1,y1,x2,y2]
 *	  And no-go zone takes [id, x1,y1,x2,y2,x3,y3,x4,y4], which are the corners of the zone rectangle?
 *	  Edit: see @JensBuchta's comment. The first parameter appears to be a type: 0 = zone, 1 = barrier
 * @param persistantData
 * @param callback
 */
Vacuum.prototype.savePersistentData = function(persistantData, callback) {
	if(Array.isArray(persistantData)) {
		const flippedYCoordinates = persistantData.map(data => {
			if(data[0] === 0 || data[0] === 2) {
				// this is a zone
				return [
					data[0],
					data[1],
					Tools.DIMENSION_MM - data[2],
					data[3],
					Tools.DIMENSION_MM - data[4],
					data[5],
					Tools.DIMENSION_MM - data[6],
					data[7],
					Tools.DIMENSION_MM - data[8]
				];
			} else {
				// this is a barrier
				return [
					data[0],
					data[1],
					Tools.DIMENSION_MM - data[2],
					data[3],
					Tools.DIMENSION_MM - data[4],
				];
			}
		});

		if (flippedYCoordinates.reduce((total,current) => { return total += (current[0] === 0 || current[0] === 2) ? 4 : 2; }, 0) > 68) {
			callback(new Error("too many forbidden markers to save!"));
			return;
		}

		this.sendMessage("save_map", flippedYCoordinates, {timeout: 2000}, (err) => {
			this.events.emit("valetudo.dummycloud.pollmap");
			callback(err);
		});
	}
	else callback(new Error("persistantData has to be an array."));
};

/* Some words on coordinates for goTo and startCleaningZone:
   Coordinates are in mm and need to be in raw and unflipped format.
   */
Vacuum.prototype.goTo = function(x_coord, y_coord, callback) {
	this.getCurrentStatus((err,res) => {
		if (!err) {
			if (parseInt(x_coord) && parseInt(y_coord)) {
				if (res.state === 16) {
					this.gotoQueue.push([x_coord, y_coord]);
					callback(null,['enqueued']);
					return;
				} else {
					this.resetQueues(0xf0);
					this.gotoQueue = [[x_coord, y_coord]];
				}
			}
			let destination = this.gotoQueue.shift();
			if (destination) {
				this.sendMessage("app_goto_target", [destination[0], Tools.DIMENSION_MM - destination[1]], {}, callback)
			} else {
				callback(new Error("Point coordinates expected."))
			}
		} else {
			callback(err);
		}
	});
};

/* zones is an array of areas to clean:  [[x1, y1, x2, y2, iterations],..] */
Vacuum.prototype.startCleaningZone = function(newZones, callback) {
	this.getCurrentStatus((err,res) => {
		if (!err) {
			if (Array.isArray(newZones) && Array.isArray(newZones[0]) && newZones[0].length > 0) {
				if ([5,17,18].includes(res.state)) {
					this.zonedCleaningQueue = this.zonedCleaningQueue.concat(Tools.ACLONE(newZones));
					this.queueFanpowerOverride = res.fan_power; // 105 is known to reset on finish
					callback(null,['enqueued']);
					return;
				} else {
					this.resetQueues(0x0f);
					this.zonedCleaningQueue = Tools.ACLONE(newZones);
				}
			}
			let zones = this.zonedCleaningQueue.splice(0,5);
			if (zones.length > 0) {
				const flippedZones = zones.map(zone => {
					const yFlippedZone = [
						zone[0],
						Tools.DIMENSION_MM - zone[1],
						zone[2],
						Tools.DIMENSION_MM - zone[3],
						zone[4]
					];
					// x1 has to be < x2 and y1 < y2
					return [
						yFlippedZone[0] > yFlippedZone[2] ? yFlippedZone[2] : yFlippedZone[0],
						yFlippedZone[1] > yFlippedZone[3] ? yFlippedZone[3] : yFlippedZone[1],
						yFlippedZone[0] > yFlippedZone[2] ? yFlippedZone[0] : yFlippedZone[2],
						yFlippedZone[1] > yFlippedZone[3] ? yFlippedZone[1] : yFlippedZone[3],
						yFlippedZone[4]
					];
				});
				this.sendMessage("app_zoned_clean", flippedZones, {}, callback);
			} else {
				callback(new Error("Zones must be a non-empty array."));
			}
		} else {
			callback(err);
		}
	});

};

/* segments - array: [[id1, id2, ..], iterations, clean_order_mode]
 */
Vacuum.prototype.startCleaningSegment = function(newSegments, callback) {
	this.getCurrentStatus((err,res) => {
		if (!err) {
			if (Array.isArray(newSegments) && Array.isArray(newSegments[0]) && newSegments[0].length > 0) {
				if ([5,17,18].includes(res.state)) {
					this.segmentedCleaningQueue.push(Tools.ACLONE(newSegments));
					this.queueFanpowerOverride = res.fan_power; // 105 is known to reset on finish
					callback(null,['enqueued']);
					return;
				} else {
					this.resetQueues(0x0f);
					this.segmentedCleaningQueue = [Tools.ACLONE(newSegments)];
				}
			}
			let segments = this.segmentedCleaningQueue.shift();
			if (segments) {
				this.sendMessage("app_segment_clean", [{segments: segments[0], repeat: segments[1] || 1, clean_order_mode: segments[2] || 1}], {}, callback)
			} else {
				callback(new Error("Array expected, and at least one segment id should be specified."))
			}
		} else {
			callback(err);
		}
	});
};

Vacuum.prototype.getRoomMapping = function(callback) {
	this.sendMessage("get_room_mapping", [], {}, callback)
};

/* names - array: [[id1,'name 1'],[id2,'name 2'],...]
	max length of the name is unknown
 */
Vacuum.prototype.nameSegment = function(names, callback) {
	if(Array.isArray(names)) {
		names = names.map(pair => {
			pair[1] = String(pair[1]);
			while ((new TextEncoder().encode(pair[1])).length > 23) {
				pair[1] = pair[1].slice(0,-1); // it just hangs otherwise
			}
			return {miRoomId: pair[1], robotRoomId: pair[0]};
		});
		this.sendMessage("name_segment", names, {timeout: 2500}, callback);
	} else {
		callback(new Error("Array expected."))
	}
};

/* segments - array: [id1, id2]
 */
Vacuum.prototype.mergeSegment = function(segments, callback) {
	if(Array.isArray(segments) && segments.length === 2) {
		this.sendMessage("merge_segment", segments, {timeout: 5000}, callback);
	} else {
		callback(new Error("Array of 2 segment ids expected."))
	}
};

/* splitBy - array: [id, x1, y1, x2, y2]
 */
Vacuum.prototype.splitSegment = function(splitBy, callback) {
	if(Array.isArray(splitBy) && splitBy.length === 5) {
		const flippedSplitBy = [splitBy[0],
			splitBy[1],
			Tools.DIMENSION_MM - splitBy[2],
			splitBy[3],
			Tools.DIMENSION_MM - splitBy[4],
		];
		this.sendMessage("split_segment", flippedSplitBy, {timeout: 5000}, callback);
	} else {
		callback(new Error("Array of 5 parameters expected."))
	}
};

Vacuum.prototype.manualSegmentMap = function(callback) {
	this.sendMessage("manual_segment_map", [], {timeout: 10000}, callback);
};

Vacuum.prototype.getOtaState = function(callback) {
	this.sendMessage("miIO.get_ota_state", [], {}, Vacuum.GET_ARRAY_HANDLER(callback));
};

/**
 * This method provides some app details like:
 * {
 *  'location': 'de',
 *  'wifiplan': '',
 *  'logserver': 'awsde0.fds.api.xiaomi.com',
 *  'name': 'custom_A.03.0005_CE',
 *  'timezone': 'Europe/Berlin',
 *  'bom': 'A.03.0005',
 *  'language': 'en'
 * }
 */
Vacuum.prototype.getAppLocale = function(callback) {
	this.sendMessage("app_get_locale", [], {}, function(err, response){
		if(err) {
			callback(err);
		} else {
			callback(null, response);
		}
	})
};

Vacuum.prototype.detectFeatures = function() {
	this.getCurrentStatus((err, res) => {
		if (!err) {
			let f = {};
			switch (this.model) {
				case "rockrobo.vacuum.v1": // this is a list of what gen1 CAN'T do :)
					f.npd = true;
					f.nret = true;
					f.nmop = true;
					break;
				case "roborock.vacuum.t4":
				case "roborock.vacuum.s4":
				case "roborock.vacuum.m1s":
					f.lab = null;
					f.v3 = true;
					f.rooms = true;
					f.nmop = true;
					f.ntimers = true;
					break;
				case "roborock.vacuum.s5":
					f.lab = !!res.lab_status;
					if (res.msg_ver === 3) {
						f.v3 = true;
						f.rooms = true;
					}
					break;
				case "roborock.vacuum.s5e":
					f.water_usage_ctrl = true;
					f.water_box_status = true;
					f.mop_install_status = true;
				case "roborock.vacuum.t6":
				case "roborock.vacuum.s6":
				case "roborock.vacuum.a08":	// S6 Pure
				case "roborock.vacuum.p5":
					f.lab = !!res.lab_status;
					f.v3 = true;
					f.rooms = true;
					f.nmopzones = true;
					f.multimap = true;
					f.ntimers = true;
					break;
				case "roborock.vacuum.a09":	// T7 Pro
				case "roborock.vacuum.a10":	// S6 MaxV
				case "roborock.vacuum.a11":	// T7
					f.lab = null;
					f.v3 = true;
					f.rooms = true;
					f.nmopzones = true;
					f.ntimers = true;
					break;
			}
			this.features = f;
			this.featuresInitialized = true;
			this.events.emit("valetudo.features_initialized");
		} else {
			setTimeout(() => this.detectFeatures(),500);
		}
	});
}

Vacuum.PORT = 54321;

Vacuum.GET_ARRAY_HANDLER = function(callback) {
	return function(err, res) {
		if(err) {
			callback(err);
		} else {
			callback(null, res[0])
		}
	}
};

Vacuum.GET_ERROR_CODE_DESCRIPTION = function(errorCodeId) {
	if (Vacuum.ERROR_CODES.hasOwnProperty(errorCodeId)) {
		return Vacuum.ERROR_CODES[errorCodeId];
	} else {
		return "UNKNOWN ERROR CODE";
	}
};

Vacuum.GET_STATE_CODE_DESCRIPTION = function(stateCodeId) {
	if (Vacuum.STATES.hasOwnProperty(stateCodeId)) {
		return Vacuum.STATES[stateCodeId];
	} else {
		return "UNKNOWN STATE CODE";
	}
};

Vacuum.STATES = {
	1: "Starting",
	2: "Charger disconnected",
	3: "Idle",
	4: "Remote control active",
	5: "Cleaning",
	6: "Returning to dock",
	7: "Manual mode",
	8: "Charging",
	9: "Charging problem",
	10: "Paused",
	11: "Spot cleaning",
	12: "Error",
	13: "Shutting down",
	14: "Updating",
	15: "Docking",
	16: "Going to target",
	17: "Zoned cleaning",
	18: "Rooms cleaning"
};

Vacuum.ERROR_CODES = {
	0: "No error",
	1: "Laser distance sensor error",
	2: "Front bumper jammed",
	3: "Cliff sensors alarm, carry the robot to different place",
	4: "Cliff sensors dirty",
	5: "Main brush stuck",
	6: "Side brush stuck",
	7: "Main wheels stuck",
	8: "Device stuck, carry the robot to different place",
	9: "Dust collector missing or bad filter",
	10: "Dust filter dirty",
	11: "Stuck in magnetic barrier",
	12: "Low battery",
	13: "Charging fault",
	14: "Battery fault",
	15: "Wall sensor dirty",
	16: "Surface is not flat, carry the robot to different place",
	17: "Side brush fault, try rebooting",
	18: "Suction fan fault, try rebooting",
	19: "Unpowered charging station",
	21: "Top cover of laser distance sensor pinned",
	22: "Front bumper sensor dirty",
	23: "Signal emission area on the dock dirty",
	24: "Forbidden area detected, evacuate the robot to allowed place",
	25: "Vision sensor dirty",
	26: "Wall sensor dirty",
	100: "General internal error, try resetting",
	101: "Compass error, try resetting",
	102: "Right compass error, try resetting",
	103: "Main brush short circuit, try resetting",
	104: "Main brush open circuit, try resetting",
	105: "Left wheel short circuit, try resetting",
	106: "Left wheel open circuit, try resetting",
	107: "Right wheel short circuit, try resetting",
	108: "Right wheel open circuit, try resetting",
	109: "Fan open circuit, try resetting",
	110: "Motion tracking sensor init error, try resetting",
	111: "Gyroscope init error, try resetting",
	112: "Charging IC error, try resetting",
	113: "NVRAM error, try resetting",
	114: "WiFi module error 1, try resetting",
	115: "WiFi module error 2, try resetting",
	116: "ODO error, try resetting",
	117: "Left ODO error, try resetting",
	118: "Right ODO error, try resetting",
	119: "Audio init error, try resetting",
	120: "Wall sensor init error, try resetting",
	121: "Wall sensor error, try resetting",
	122: "Wall sensor error, try resetting",
	123: "Camera exception, try resetting",
	124: "Camera exception, try resetting",
	125: "Peristaltic pump abnormality, try resetting",
	255: "Unspecified internal error, try resetting",
	644: "Dustbin has not been emptied in a while"
};

module.exports = Vacuum;
