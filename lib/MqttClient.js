const fs = require("fs");
const { spawn } = require("child_process");
const mqtt = require("mqtt");
const Tools = require("./Tools");
const Vacuum = require("./miio/Vacuum");

const MQTT_COMMANDS = {
	START: "start",
	RETURN_TO_BASE: "return_to_base",
	STOP: "stop",
	CLEAN_SPOT: "clean_spot",
	LOCATE: "locate",
	PAUSE: "pause"
};

const CUSTOM_COMMANDS = {
	GO_TO: "go_to",
	ZONED_CLEANUP: "zoned_cleanup",
	SEGMENTED_CLEANUP: "segmented_cleanup",
	RESET_CONSUMABLE: "reset_consumable",
	LOAD_MAP: "load_map",
	STORE_MAP: "store_map",
	GET_DESTINATIONS: "get_destinations",
	PLAY_SOUND: "play_sound",
	SET_WATER_GRADE: "set_water_grade",
	SEND_RC_COMMAND: "remote_control"
};

//TODO: since this is also displayed in the UI it should be moved somewhere else
const FAN_SPEEDS = {
	whisper: 1,
	min: 38,
	medium: 60,
	high: 75,
	max: 100,
	mop: 105
};
const FAN_SPEEDS_V3 = {
	min: 101,
	medium: 102,
	high: 103,
	max: 104,
	mop: 105
};
const WATER_GRADES = {
	off: 200,
	low: 201,
	medium: 202,
	high: 203,
};

/**
 * These mapping maps the xiaomi-specific states to the standardized HA State Vacuum States
 * They can be found here:
 * https://github.com/home-assistant/home-assistant/blob/master/homeassistant/components/vacuum/__init__.py#L58
 *
 */
const HA_STATES = {
	CLEANING: "cleaning",
	PAUSED: "paused",
	IDLE: "idle",
	RETURNING: "returning",
	DOCKED: "docked",
	ERROR: "error",
	ZONE_CLEANUP: "cleaning",
	SEGMENT_CLEANUP: "cleaning"
};

const HA_STATE_MAPPINGS = {
	2: HA_STATES.IDLE,
	3: HA_STATES.IDLE,
	5: HA_STATES.CLEANING,
	7: HA_STATES.CLEANING,
	11: HA_STATES.CLEANING,
	16: HA_STATES.CLEANING,
	17: HA_STATES.ZONE_CLEANUP,
	18: HA_STATES.SEGMENT_CLEANUP,
	6: HA_STATES.RETURNING,
	15: HA_STATES.RETURNING,
	8: HA_STATES.DOCKED,
	9: HA_STATES.ERROR,
	12: HA_STATES.ERROR,
	10: HA_STATES.PAUSED
};

/**
 * @param valetudo {Valetudo}
 * @constructor
 */
const MqttClient = function (valetudo) {
	this.configuration = valetudo.configuration;
	this.vacuum = valetudo.vacuum;
	this.events = valetudo.events;
	this.map = valetudo.map;
	this.mapManager = valetudo.mapManager;
	this.version = valetudo.version;

	this.last_ha_state = HA_STATES.IDLE;
	this.last_state = {
		id: -1,
		name: Vacuum.GET_STATE_CODE_DESCRIPTION(-1)
	};
	this.last_bin_full = 0;

	this.bin_mark_file = '/mnt/data/valetudo/last_bin_';
	this.bin_in_time = 0;
	this.readBinState('out');
	this.readBinState('full');

	this.isStopped = false;

	this.isPublishingAttrs = false;
	this.nextAttrsToPublish = null;

	this.isPublishingMap = false;
	this.nextMapToPublish = null;

	this.statusDelayTimer = null;

	this.soundProc = null;

	this.deferredInit = function() {
		if (this.vacuum.features.v3) {
			Object.assign(FAN_SPEEDS,FAN_SPEEDS_V3);
			delete FAN_SPEEDS['whisper'];
		}
		if (this.vacuum.features.nmop) {
			delete FAN_SPEEDS['mop'];
		}
		if (!this.isStopped) {
			this.connect();
		}
	};

	if (this.vacuum.featuresInitialized) {
		this.deferredInit();
	}

	this.events.on("valetudo.features_initialized", this.deferredInit.bind(this));
	this.events.on("valetudo.map", () => {
		if(this.provideMapData) {
			this.updateMapDataTopic();
		}
	});
	this.events.on("miio.status", (statusData) => {
		clearTimeout(this.statusDelayTimer);
		if ([3,6,10].includes(statusData.state)) {
			this.statusDelayTimer = setTimeout(() => {
				this.statusDelayTimer = null;
				this.updateStatusTopic(statusData);
				this.updateAttributesTopicOnEvent(statusData)
			},10e3);
			return;
		};
		this.updateStatusTopic(statusData);
		this.updateAttributesTopicOnEvent(statusData)
	});
	this.events.on("miio.bin_full", () => {
		this.writeBinState('full');
		this.updateAttributesTopic();
	});
};

MqttClient.prototype.connect = function () {
	if (!this.client || (this.client && this.client.connected === false && this.client.reconnecting === false)) {
		const mqttConfig = this.configuration.get("mqtt");

		this.brokerURL = mqttConfig.broker_url;
		this.identifier = mqttConfig.identifier || "rockrobo";
		this.deviceName = mqttConfig.deviceName || "vacuum";
		this.topicPrefix = mqttConfig.topicPrefix || "valetudo";
		this.autoconfPrefix = mqttConfig.autoconfPrefix || "homeassistant";
		this.attributesUpdateInterval = mqttConfig.attributesUpdateInterval || 60000;
		this.provideMapData = mqttConfig.provideMapData !== undefined ? mqttConfig.provideMapData : true;
		this.caPath = mqttConfig.caPath || "";
		this.qos = mqttConfig.qos || 0;

		this.topics = {
			command: this.topicPrefix + "/" + this.identifier + "/command",
			set_fan_speed: this.topicPrefix + "/" + this.identifier + "/set_fan_speed",
			send_command: this.topicPrefix + "/" + this.identifier + "/custom_command",
			state: this.topicPrefix + "/" + this.identifier + "/state",
			map_data: this.topicPrefix + "/" + this.identifier + "/map_data",
			attributes: this.topicPrefix + "/" + this.identifier + "/attributes",
			homeassistant_autoconf_vacuum: this.autoconfPrefix + "/vacuum/" + this.topicPrefix + "_" + this.identifier + "/config",
			destinations: this.topicPrefix + "/" + this.identifier + "/destinations",
			command_status: this.topicPrefix + "/" + this.identifier + "/command_status"
		};

		this.last_attributes = {};
		this.last_status = {};

		this.autoconf_payloads = {
			vacuum: {
				name: this.identifier,
				unique_id: this.identifier,
				schema: "state",
				device: { manufacturer: "Roborock", model: this.vacuum.model, name: this.deviceName, identifiers: [ this.identifier ], sw_version: this.version },
				supported_features: [
					"start",
					"pause",
					"stop",
					"return_home",
					"battery",
					"status",
					"locate",
					"clean_spot",
					"fan_speed",
					"send_command"
				],
				command_topic: this.topics.command,
				state_topic: this.topics.state,
				set_fan_speed_topic: this.topics.set_fan_speed,
				fan_speed_list: Object.keys(FAN_SPEEDS),
				send_command_topic: this.topics.send_command,
				json_attributes_topic: this.topics.attributes
			}
		};

		const options = {reconnectPeriod: 10e3};
		if (this.caPath) {
			options.ca = fs.readFileSync(this.caPath);
		}
		this.client = mqtt.connect(this.brokerURL, options);
		this.connectCallback = () => {
			console.info(new Date(),"Connected successfully to mqtt server");
			this.client.subscribe([
				this.topics.command,
				this.topics.set_fan_speed,
				this.topics.send_command
			], {qos:this.qos}, err => {
				if (!err) {
					this.client.publish(this.topics.homeassistant_autoconf_vacuum, JSON.stringify(this.autoconf_payloads.vacuum), {
						retain: true, qos:this.qos
					});
					this.updateAttributesTopic();
				} else {
					//TODO: needs more error handling
					this.publishCommandStatus("mqtt_subscribe_error",null,err);
				}
			});
		};
		this.messageCallback = (topic, message) => {
			message = message.toString();
			switch (topic) {
				case this.topics.send_command:
					this.handleCustomCommand(message);
					break;
				case this.topics.set_fan_speed:
					this.handleFanSpeedRequest(message);
					break;
				case this.topics.command:
					this.handleCommand(message);
					break;
			}
		};
		this.errorCallback = (e) => {
			if(e && e.message === "Not supported") {
				console.info(new Date(),"Connected to non standard compliant MQTT Broker.")
			} else {
				this.publishCommandStatus("mqtt_general_error",null,e);
			}
		};
		this.offlineCallback = () => {
			console.info(new Date(),"Disconnected from mqtt server");
		};
		this.client.on("connect", this.connectCallback);
		this.client.on("message", this.messageCallback);
		this.client.on("error", this.errorCallback);
		this.client.on("offline", this.offlineCallback);
	}
};

MqttClient.prototype.stop = async function () {
	if (this.client) {
		this.client.off("connect", this.connectCallback);
		this.client.off("message", this.messageCallback);
		this.client.off("error", this.errorCallback);
		this.client.off("offline", this.offlineCallback);
		await new Promise(res => this.client.end(true,() => {
			console.info(new Date(),"Closed connection to mqtt server");
			this.client = null;
			res();
		}));
	}
	this.isStopped = true;
};
MqttClient.prototype.reload = async function () {
	await this.stop();
	this.isStopped = false;
	if (this.vacuum.featuresInitialized) {
		this.connect();
	}
};

MqttClient.prototype.asyncUpdateMapDataTopic = async function() {
	this.isPublishingMap = true;
	while (true) {
		if (!this.client || !this.client.connected) break;
		await new Promise((resolve,reject) => {
			this.nextMapToPublish = false;
			let timeout = setTimeout(() => reject('mqtt updateMapDataTopic timed out'),30e3); // looks like a bug in MqttClient: on disconnect it may NEVER run a callback
			this.client.publish(this.topics.map_data, this.map.bin, {retain: true, qos:this.qos}, err => {
				clearTimeout(timeout);
				resolve();
			});
		}).catch(err => this.publishCommandStatus("update_map_data_topic",null,err));
		if (!this.nextMapToPublish) break;
	}
	this.isPublishingMap = false;
}

MqttClient.prototype.updateMapDataTopic = function () {
	if (this.map.bin) {
		if (!this.isPublishingMap) {
			this.asyncUpdateMapDataTopic();
		} else {
			this.nextMapToPublish = true;
		}
	}
};

MqttClient.prototype.updateAttributesTopicOnEvent = function (statusData) {
	this.last_ha_state = HA_STATE_MAPPINGS[statusData.state];
	this.last_state = {
		id: statusData.state,
		name: Vacuum.GET_STATE_CODE_DESCRIPTION(statusData.state)
	};
	this.updateAttributesTopic();
};

MqttClient.prototype.updateAttributesTopic = function () {
	if (this.isPublishingAttrs) {
		this.nextAttrsToPublish = true;
		return;
	}
	if (this.attributesUpdateTimeout) {
		clearTimeout(this.attributesUpdateTimeout);
	}
	if (this.client && this.client.connected === true) {
		this.isPublishingAttrs = true;
		var response = {};
		new Promise((resolve,reject) => {
			this.vacuum.getConsumableStatus((err, data) => {
				if (!err) {
					response.mainBrush = (Math.max(0, 300 - (data.main_brush_work_time / 60 / 60))).toFixed(1);
					response.sideBrush = (Math.max(0, 200 - (data.side_brush_work_time / 60 / 60))).toFixed(1);
					response.filter = (Math.max(0, 150 - (data.filter_work_time / 60 / 60))).toFixed(1);
					response.sensor = (Math.max(0, 30 - (data.sensor_dirty_time / 60 / 60))).toFixed(1);
					resolve();
				} else {
					reject(err);
				}
			});
		})
		.then(_ => new Promise((resolve,reject) => {
			this.vacuum.getCurrentStatus((err, data) => {
				if (!err) {
					response.currentCleanTime = (data.clean_time / 60).toFixed(1);
					response.currentCleanArea = (data.clean_area / 1000000).toFixed(1);
					resolve();
				} else {
					reject(err);
				}
			});
		}))
		.then(_ => new Promise((resolve,reject) => {
			this.vacuum.getCleanSummary((err, data) => {
				if (!err) {
					response.cleanTime = (data[0] / 60 / 60).toFixed(1);
					response.cleanArea = (data[1] / 1000000).toFixed(1);
					response.cleanCount = data[2];
					var last_runs = data[3];
					if (last_runs.length > 0) {
						this.vacuum.getCleanRecord(last_runs[0], (err, data) => {
							if (!err) {
								response.last_run_stats = {
									startTime: data[0][0] * 1000, //convert to ms
									endTime: data[0][1] * 1000, //convert to ms
									duration: data[0][2],
									area: (data[0][3] / 1000000).toFixed(1),
									errorCode: data[0][4],
									errorDescription: Vacuum.GET_ERROR_CODE_DESCRIPTION(data[0][4]),
									finishedFlag: (data[0][5] === 1)
								};
								resolve();
							} else {
								reject(err);
							}
						});
					} else {
						resolve();
					}
				} else {
					reject(err);
				}
			});
		}))
		.then(_ => {
			let rCfgPath = '/mnt/data/rockrobo/RoboController.cfg',
				rCfgData = fs.existsSync(rCfgPath) && fs.readFileSync(rCfgPath,'utf8') || '',
				binInTime = +(rCfgData.match(/bin_in_time = (\d+);/) || {})[1];
			if (binInTime < this.bin_in_time) {
				this.writeBinState('out');
			}
			response.bin_in_time = this.bin_in_time = binInTime;
			response.last_bin_out = this.last_bin_out;
			response.last_bin_full = this.last_bin_full;
			response.last_loaded_map = this.configuration.get("lastLoadedMap") || null;
			response.last_run_stats = response.last_run_stats || {};
			response.state = this.last_ha_state;
			response.valetudo_state = this.last_state;
			if (JSON.stringify(response) !== JSON.stringify(this.last_attributes)) {
				this.client.publish(this.topics.attributes, JSON.stringify(response), {retain: true, qos:this.qos});
				this.last_attributes = response;
			}
		})
		.catch(err => this.publishCommandStatus("update_attributes_topic",null,err))
		.finally(_ => {
			this.attributesUpdateTimeout = setTimeout(() => {
				this.updateAttributesTopic()
			}, this.nextAttrsToPublish ? 100 : this.attributesUpdateInterval);
			this.isPublishingAttrs = false;
			this.nextAttrsToPublish = false;
		});
	} else {
		this.attributesUpdateTimeout = setTimeout(() => {
			this.updateAttributesTopic()
		}, this.attributesUpdateInterval);
	}
};

MqttClient.prototype.updateStatusTopic = function (statusData) {
	if (this.client && this.client.connected === true && statusData.battery !== undefined) {
		var response = {};
		response.state = HA_STATE_MAPPINGS[statusData.state];
		response.battery_level = statusData.battery;
		response.fan_speed = Object.keys(FAN_SPEEDS).find(key => FAN_SPEEDS[key] === statusData.fan_power) || statusData.fan_power + "%";
		if (this.vacuum.features.water_box_status) {
			response.water_box_status = ({1:true,0:false})[statusData.water_box_status];
		}
		if (this.vacuum.features.mop_install_status) {
			response.water_box_carriage_status = ({1:true,0:false})[statusData.water_box_carriage_status];
		}
		if (this.vacuum.features.water_usage_ctrl) {
			response.water_box_mode = (Object.entries(WATER_GRADES).find(([key,val]) => val === statusData.water_box_mode) || '')[0];
		}
		if (statusData.error_code !== undefined && statusData.error_code !== 0) {
			response.error = Vacuum.GET_ERROR_CODE_DESCRIPTION(statusData.error_code);
			response.errorCode = statusData.error_code;
		}
		if (JSON.stringify(response) !== JSON.stringify(this.last_status)) {
			this.client.publish(this.topics.state, JSON.stringify(response), {retain: true, qos:this.qos});
			this.last_status = response;
		}
	}
};

MqttClient.prototype.handleFanSpeedRequest = function (speed) {
	if (Object.keys(FAN_SPEEDS).includes(speed)) {
		this.vacuum.setFanSpeed(FAN_SPEEDS[speed], (err, data) => this.publishCommandStatus("set_fan_speed",data,err));
	} else if (parseInt(speed)) {
		this.vacuum.setFanSpeed(parseInt(speed), (err, data) => this.publishCommandStatus("set_fan_speed",data,err));
	}
};

/**
 * @param command {string}
 */
MqttClient.prototype.handleCommand = function (command) {
	switch (command) { //TODO: error handling
		case MQTT_COMMANDS.START:
			this.vacuum.getCurrentStatus((err, res) => {
				if (!err) {
					if (res.in_cleaning === 2 && [2,10,12].includes(res.state)) {
						this.vacuum.resumeCleaningZone((err, data) => this.publishCommandStatus(command + ' (resumeCleaningZone)',data,err));
					} else if (res.in_cleaning === 3 && [2,10,12].includes(res.state)) {
						this.vacuum.resumeCleaningSegment((err, data) => this.publishCommandStatus(command + ' (resumeCleaningSegment)',data,err));
					} else {
						this.vacuum.startCleaning((err, data) => this.publishCommandStatus(command,data,err));
					}
				}
			});
			break;
		case MQTT_COMMANDS.STOP:
			this.vacuum.stopCleaning((err, data) => this.publishCommandStatus(command,data,err));
			break;
		case MQTT_COMMANDS.RETURN_TO_BASE:
			this.vacuum.stopCleaning((err, data) => {
				this.publishCommandStatus(command,data,err);
				this.vacuum.driveHome((err, data) => {
					this.publishCommandStatus(command,data,err);
				});
			});
			break;
		case MQTT_COMMANDS.CLEAN_SPOT:
			this.vacuum.spotClean((err, data) => this.publishCommandStatus(command,data,err));
			break;
		case MQTT_COMMANDS.LOCATE:
			this.vacuum.findRobot((err, data) => this.publishCommandStatus(command,data,err));
			break;
		case MQTT_COMMANDS.PAUSE:
			this.vacuum.pauseCleaning((err, data) => this.publishCommandStatus(command,data,err));
			break;
		default:
			this.publishCommandStatus(command,null,"Received unknown command");
	}
};

/**
 * Expects a stringified JSON payload
 * Must contain a field named "command"
 *
 * @param message
 */
MqttClient.prototype.handleCustomCommand = function (message) {
	const self = this;
	let msg;

	try {
		msg = JSON.parse(message);
	} catch (e) {
		this.publishCommandStatus(null,null,"Unable to parse received command");
	}

	if (msg && msg.command) {
		switch (msg.command) {
			/**
			 * {
			 *   "command": "zoned_cleanup",
			 *   "zone_ids": [
			 *      "Foo",
			 *      {
			 *         "id": "Bar",
			 *         "repeats": 2
			 *      }
			 *   ],
			 OR
			 *   "zone_coordinates": [
			 *      {
			 *         "x1": 123,
			 *         "y1": 234,
			 *         "x2": 345,
			 *         "y2": 456
			 *      },
			 *      {
			 *         "x1": 567,
			 *         "y1": 678,
			 *         "x2": 789,
			 *         "y2": 890,
			 *         "repeats": 2
			 *      }
			 *   ],
			 *   "afterCleaning": "Base" or "Stop" or "YourSavedGotoName" or {x: 123, y: 234} (optional)
			 * }
			 */
			case CUSTOM_COMMANDS.ZONED_CLEANUP:
				if (Array.isArray(msg.zone_ids) || Array.isArray(msg.zone_coordinates)) {
					let zones = [];
					if (Array.isArray(msg.zone_ids)) {
						const areas = this.configuration.get("areas");
						msg.zone_ids.forEach(zone_selector => {
							let zone_id = typeof zone_selector === 'object' ? zone_selector.id : zone_selector;
							let repeats = Number(zone_selector.repeats);
							let area = areas.find(e => Array.isArray(e) && e[0] === zone_id);
							if (area && Array.isArray(area[1])) {
								var area_repeats = null;
								if (!isNaN(repeats)) {
									if (repeats >= 1 && repeats <= 3) {
										console.info(new Date(), "Zone cleanup repeats override for zone '" + zone_id + "': " + repeats);
										area_repeats = repeats;
									} else {
										console.error(new Date(), "Invalid repeats for zone '" + zone_id + "': " + repeats);
									}
								}
								area[1].forEach(function (zone) {
									zones.push([
										zone[0],
										zone[1],
										zone[2],
										zone[3],
										area_repeats || zone[4]
									]);
								});
							}
						});
					} else if (Array.isArray(msg.zone_coordinates)) {
						msg.zone_coordinates.forEach(zone_coordinates => {
							if (zone_coordinates.x1 !== undefined && zone_coordinates.y1 !== undefined && 
								zone_coordinates.x2 !== undefined && zone_coordinates.y2 !== undefined) {
								zones.push([
									zone_coordinates.x1,
									zone_coordinates.y1,
									zone_coordinates.x2,
									zone_coordinates.y2,
									parseInt(zone_coordinates.repeats) || 1
								]);
							}
						});
					}
					if (zones.length) {
						this.vacuum.startCleaningZone(zones, (err, data) => {
							this.publishCommandStatus(msg.command,data,err);
							if (msg.afterCleaning) {
								this.processAfterCleaning(msg.command,msg.afterCleaning);
							}
						});
					} else {
						this.publishCommandStatus(msg.command,null,"Invalid zone_ids or zone_coordinates");
					}
				} else {
					this.publishCommandStatus(msg.command,null,"Missing zone_ids or zone_coordinates");
				}
				break;
			/**
			 * {
			 *   "command": "segmented_cleanup",
			 *   "segment_ids": [
			 *	 16,
			 *	 "Room Name 1",
			 *	 18
			 *   ],
			 *   "repeats": 1,
			 *   "afterCleaning": "Base" or "Stop" or "YourSavedGotoName" or {x: 123, y: 234} (optional)
			 * }
			 */
			case CUSTOM_COMMANDS.SEGMENTED_CLEANUP:
				if (Array.isArray(msg.segment_ids)) {
					let segments = [], repeats = parseInt(msg.repeats) || 1;
					this.vacuum.getRoomMapping((err, data) => {
						if (err) {
							this.publishCommandStatus(msg.command,null,err);
							return;
						}
						if (Array.isArray(data))
						msg.segment_ids.forEach(segment_selector => {
							if (typeof segment_selector === "string") {
								let segment = data.find(e => segment_selector === e[1]);
								if (segment) {
									segments.push(segment[0]);
								}
							} else if (typeof segment_selector === "number") {
								segments.push(segment_selector);
							}
						});
						if (segments.length) {
							if (repeats < 1 || repeats > 3) repeats = 1;
							this.vacuum.startCleaningSegment([segments, repeats], (err, data) => {
								this.publishCommandStatus(msg.command,data,err);
								if (msg.afterCleaning) {
									this.processAfterCleaning(msg.command,msg.afterCleaning);
								}
							});
						} else {
							this.publishCommandStatus(msg.command,null,"Invalid segment_ids");
						}
					});
				} else {
					this.publishCommandStatus(msg.command,null,"Missing segment_ids");
				}
				break;
			/**
			 * {
			 *   "command": "reset_consumable",
			 *   "consumable": "main_brush_work_time"
			 * }
			 */
			case CUSTOM_COMMANDS.RESET_CONSUMABLE:
				if (typeof msg.consumable === "string" && ['main_brush_work_time','side_brush_work_time','filter_work_time','sensor_dirty_time'].includes(msg.consumable)) {
					this.vacuum.resetConsumable(msg.consumable, (err, data) => this.publishCommandStatus(msg.command,data,err));
				} else {
					this.publishCommandStatus(msg.command,null,"Wrong consumable type: possible values are 'main_brush_work_time', 'side_brush_work_time', 'filter_work_time' or 'sensor_dirty_time'");
				}
				break;
			/**
			 * {
			 *   "command": "go_to",
			 *   "spot_id": "Somewhere"
			 OR
			     "spot_coordinates": {x: 123, y: 123}
			 * }
			 */
			case CUSTOM_COMMANDS.GO_TO:
				if (msg.spot_id) {
					const spots = this.configuration.get("spots");
					const spot_coords = spots.find(e => Array.isArray(e) && e[0] === msg.spot_id);
					if (spot_coords) {
						this.vacuum.goTo(spot_coords[1], spot_coords[2], (err, data) => this.publishCommandStatus(msg.command,data,err));
					} else {
						this.publishCommandStatus(msg.command,null,"Invalid spot_id");
					}
				} else if (msg.spot_coordinates) {
					if (msg.spot_coordinates.x !== undefined && msg.spot_coordinates.y !== undefined) {
						this.vacuum.goTo(msg.spot_coordinates.x, msg.spot_coordinates.y, (err, data) => this.publishCommandStatus(msg.command,data,err));
					} else {
						this.publishCommandStatus(msg.command,null,"Invalid spot_coordinates: should be {x: NUMBER, y: NUMBER}");
					}
				} else {
					this.publishCommandStatus(msg.command,null,"Missing spot_id or spot_coordinates");
				}
				break;
			/**
			 * {
			 *   "command": "store_map",
			 *   "name": "Floor1"
			 * }
			 */
			case CUSTOM_COMMANDS.STORE_MAP:
				if (msg.name) {
					this.mapManager.storeMap(msg.name, (err, data) => this.publishCommandStatus(msg.command,data,err));
				} else {
					this.publishCommandStatus(msg.command,null,"Missing map name");
				}
				break;

			/**
			 * {
			 *   "command": "load_map",
			 *   "name": "Floor1"
			 * }
			 */
			case CUSTOM_COMMANDS.LOAD_MAP:
				if (msg.name) {
					this.mapManager.loadMap(msg.name, (err, data) => this.publishCommandStatus(msg.command,data,err));
				} else {
					this.publishCommandStatus(msg.command,null,"Missing map name");
				}
				break;
			/**
			 * {
			 *   "command": "get_destinations"
			 * }
			 */
			case CUSTOM_COMMANDS.GET_DESTINATIONS:
				let result = {
					spots: this.configuration.get("spots").map(spot => {return {name: spot[0], coordinates: [spot[1],spot[2]]}}).sort((a, b) => a.name.localeCompare(b.name)),
					zones: this.configuration.get("areas").map(zone => {return {name: zone[0], coordinates: zone[1]}}).sort((a, b) => a.name.localeCompare(b.name)),
					rooms: [],
					updated: Date.now()
				};
				new Promise((resolve,reject) => {
					if (!this.vacuum.features.v3 || !this.map.bin) {
						return resolve(null);
					}
					this.vacuum.getRoomMapping((err, data) => {
						if (err) {
							return resolve(null);
						}
						let segments = [];
						data.forEach(pair => segments[pair[0]] = pair[1]);
						require('zlib').gunzip(this.map.bin, (err, mapBuf) => {
							if (err) {
								return resolve(null);
							}
							const mapData = require('./RRMapParser').PARSEDATA(mapBuf);
							if (!mapData.image) {
								return resolve(null);
							}
							if (mapData.image && mapData.image.segments && mapData.image.segments.id) {
								segments = mapData.image.segments.id.map(id => {return {name: segments[id] || ('#' + id), id: id}});
							}
							resolve(segments.sort((a, b) => a.name.localeCompare(b.name)));
						});
					});
				})
				.then(res => {
					if (res) {
						result.rooms = res;
					}
					this.client.publish(this.topics.destinations, JSON.stringify(result), {retain: true, qos:this.qos});
					this.publishCommandStatus(msg.command,'ok',null);
				})
				.catch(e => this.publishCommandStatus(msg.command,null,"Getting destinations for MQTT failed:" + e));
				break;
			/**
			 * play with default player:
			 * {
			 *   "command": "play_sound",
			 *   "file": "/opt/rockrobo/resources/sounds/power_on.wav"
			 * }
			 * play with sox player (if installed):
			 * {
			 *   "command": "play_sound",
			 *   "file": "/opt/rockrobo/resources/sounds/power_on.wav",
			 OR
			 *   "location": "http://192.168.1.10/audio.mp3",
			 *   "volume": 0.75
			 * }
			 * stop already playing sound:
			 * {
			 *   "command": "play_sound",
			 *   "file": "none"
			 * }
			 */
			case CUSTOM_COMMANDS.PLAY_SOUND:
				let cmd = null, args = [], stop = false;
				if (fs.existsSync('/usr/bin/sox') && (fs.existsSync(msg.file) || msg.file === 'none' || msg.location)) {
					if (msg.file === 'none' || msg.location === 'none') {
						stop = true;
					} else {
						cmd = '/usr/bin/sox';
						if (msg.volume) {
							args.push('-v', msg.volume);
						}
						args.push(msg.location || msg.file, '-d');
					}
				} else if (fs.existsSync('/usr/bin/uart_test') && (fs.existsSync(msg.file) && msg.file.endsWith('.wav') || msg.file === 'none')) {
					if (msg.file === 'none') {
						stop = true;
					} else {
						cmd = '/usr/bin/uart_test';
						args.push('-e', msg.file);
					}
				}
				if ((stop || cmd) && this.soundProc) {
					this.soundProc.kill();
					this.soundProc = null;
				}
				if (cmd) {
					this.soundProc = spawn(cmd, args, {stdio: 'ignore'});
					this.soundProc.on('error', (err) => {
						this.publishCommandStatus(msg.command,null,"Sound player failed to start: " + err);
						this.soundProc = null;
					});
					this.soundProc.on('close', (code) => {
						this.soundProc = null;
					});
					if (typeof this.soundProc.pid === "number") {
						this.publishCommandStatus(msg.command,'ok',null);
					}
				} else if (stop) {
					this.publishCommandStatus(msg.command,'ok',null);
				} else {
					this.publishCommandStatus(msg.command,null,"Can't play specified file or location.");
				}
				break;
			/**
			 * set a water grade value on devices supporting it:
			 * {
			 *   "command": "set_water_grade",
			 *   "grade": "medium"
			 * }
			 * digital codes can also be used as a value:
			 * {
			 *   "command": "set_water_grade",
			 *   "grade": "201"
			 * }
			 */
			case CUSTOM_COMMANDS.SET_WATER_GRADE:
				if (this.vacuum.features.water_usage_ctrl) {
					if (Object.keys(WATER_GRADES).includes(msg.grade)) {
						this.vacuum.setWaterGrade(WATER_GRADES[msg.grade], (err, data) => this.publishCommandStatus(msg.command,data,err));
					} else if (parseInt(msg.grade)) {
						this.vacuum.setWaterGrade(parseInt(msg.grade), (err, data) => this.publishCommandStatus(msg.command,data,err));
					} else {
						this.publishCommandStatus(msg.command,null,"Unsupported water grade value specified.");
					}
				} else {
					this.publishCommandStatus(msg.command,null,"Setting water grade is not supported on this device.");
				}
				break;
			/**
			 * send a RC mode command to the device
			 * starting and stopping RC mode is done automatically, you can try sending multiple commands in a row
			 * {
			 *   "command": "remote_control",
			 *   "angle": -1.3,       (between -3.14 and 3.14)
			 *   "velocity": 0.0,     (between -0.3 and 0.3)
			 *   "duration": 1000     (in ms)
			 *   "startdelay": 7500   (optional, in ms)
			 * }
			 * startdelay is the delay the device needs to wait after starting RC mode to be able to actually perform RC commands (default: 8 seconds, maybe your device would be faster)
			 * see https://github.com/marcelrv/XiaomiRobotVacuumProtocol/blob/master/rc.md for other parameters which are passed directly to `app_rc_move` miio command
			 */
			case CUSTOM_COMMANDS.SEND_RC_COMMAND:
				if (msg.angle !== undefined && !isNaN(parseFloat(msg.angle)) &&
					msg.velocity !== undefined && !isNaN(parseFloat(msg.velocity)) &&
					msg.duration !== undefined && !isNaN(parseInt(msg.duration))) {
					this.vacuum.autoManualControl(parseFloat(msg.angle), parseFloat(msg.velocity), parseInt(msg.duration), parseInt(msg.startdelay) || null, (err, data) => this.publishCommandStatus(msg.command,data,err));
				} else {
					this.publishCommandStatus(msg.command,null,"Invalid args supplied.");
				}
				break;
			default:
				this.publishCommandStatus(msg.command,null,"Received invalid custom command: " + JSON.stringify(msg));
		}
	}
};

MqttClient.prototype.processAfterCleaning = function (command,value) {
	switch (value) {
		case "Stop":
			this.vacuum.postCleaningOverride = 0;
			break;
		case "Base":
			this.vacuum.postCleaningOverride = 1;
			break;
		default:
			if (typeof value === 'object') {
				if (value.x !== undefined && value.y !== undefined) {
					this.vacuum.postCleaningOverride = [value.x, value.y];
				} else {
					this.publishCommandStatus(command,null,"Invalid afterClean target.");
				}
			} else {
				const scoords = this.configuration.get("spots").find(e => Array.isArray(e) && e[0] === value);
				if (scoords !== undefined) {
					this.vacuum.postCleaningOverride = scoords.slice(1,3);
				} else {
					this.publishCommandStatus(command,null,"Unable to find afterClean target.");
				}
			}
	}
};

MqttClient.prototype.publishCommandStatus = function (command,message,error) {
	if (this.client && this.client.connected) {
		this.client.publish(this.topics.command_status, JSON.stringify({
			command: command || "unknown",
			message: message || null,
			error: error || null,
			updated: Date.now()
		}), {retain: true, qos:this.qos});
	}
	if (error) {
		console.error(new Date(),"MQTT Error : " + command + " : " + (typeof error === "string" ? error : JSON.stringify(error)));
	}
};

MqttClient.prototype.writeBinState = function (type) {
	const bfile = this.bin_mark_file + type + '.0';
	const cdt = new Date();
	this['last_bin_' + type] = cdt.getTime();
	try { try { fs.utimesSync(bfile, cdt, cdt); } catch (err) { fs.closeSync(fs.openSync(bfile, 'w')); }; } catch (err) { this.publishCommandStatus("write_bin_state",null,err); };
};

MqttClient.prototype.readBinState = function (type) {
	const bfile = this.bin_mark_file + type + '.0';
	try { this['last_bin_' + type] = +fs.statSync(bfile).mtime; } catch (err) { this['last_bin_' + type] = -1; }
};

module.exports = MqttClient;
