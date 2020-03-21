const fs = require("fs");
const mqtt = require("mqtt");
const Tools = require("./Tools");
const Vacuum = require("./miio/Vacuum");
const MapManager = require('./MapManager');
const { exec } = require("child_process");

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
	STORE_MAP: "store_map"
};

//TODO: since this is also displayed in the UI it should be moved somewhere else
const FAN_SPEEDS = {
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
 *
 * @param options {object}
 * @param options.configuration {Configuration}
 * @param options.vacuum {Vacuum}
 * @param options.events {EventEmitter}
 * @param options.map {MapDTO}
 * @constructor
 */
const MqttClient = function (options) {
	this.configuration = options.configuration;
	this.vacuum = options.vacuum;

	let mqttConfig = this.configuration.get("mqtt");

	this.brokerURL = mqttConfig.broker_url;
	this.identifier = mqttConfig.identifier || "rockrobo";
	this.topicPrefix = mqttConfig.topicPrefix || "valetudo";
	this.autoconfPrefix = mqttConfig.autoconfPrefix || "homeassistant";
	this.attributesUpdateInterval = mqttConfig.attributesUpdateInterval || 60000;
	this.provideMapData = mqttConfig.provideMapData !== undefined ? mqttConfig.provideMapData : true;
	this.caPath = mqttConfig.caPath || "";
	this.qos = mqttConfig.qos || 0;
	this.events = options.events;
	this.map = options.map;

	this.topics = {
		command: this.topicPrefix + "/" + this.identifier + "/command",
		set_fan_speed: this.topicPrefix + "/" + this.identifier + "/set_fan_speed",
		send_command: this.topicPrefix + "/" + this.identifier + "/custom_command",
		state: this.topicPrefix + "/" + this.identifier + "/state",
		map_data: this.topicPrefix + "/" + this.identifier + "/map_data",
		attributes: this.topicPrefix + "/" + this.identifier + "/attributes",
		homeassistant_autoconf_vacuum: this.autoconfPrefix + "/vacuum/" + this.topicPrefix + "_" + this.identifier + "/config",
	};

	this.autoconf_payloads = {
		vacuum: {
			name: this.identifier,
			unique_id: this.identifier,
			schema: "state",
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

	this.last_ha_state = HA_STATES.IDLE;
	this.last_state = {
		id: -1,
		name: Vacuum.GET_STATE_CODE_DESCRIPTION(-1)
	};
	this.last_attributes = {};

	this.isPublishingMap = false;
	this.nextMapToPublish = null;


	this.connect();
	this.updateAttributesTopic();


	this.events.on("valetudo.map", () => {
		if(this.provideMapData) {
			this.updateMapDataTopic();
		}
	});

	this.events.on("miio.status", (statusData) => {
		if (statusData.msg_ver === 3) {
			Object.assign(FAN_SPEEDS,FAN_SPEEDS_V3);
		}
		this.updateStatusTopic(statusData);
		this.updateAttributesTopicOnEvent(statusData)
	});
};

MqttClient.prototype.connect = function () {
	if (!this.client || (this.client && this.client.connected === false && this.client.reconnecting === false)) {
		const options = {};
		if (this.caPath) {
			options.ca = fs.readFileSync(this.caPath);
		}
		this.client = mqtt.connect(this.brokerURL, options);

		this.client.on("connect", () => {
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
				} else {
					//TODO: needs more error handling
					console.error(new Date(),err);
				}
			});
		});

		this.client.on("message", (topic, message) => {
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
		});

		this.client.on("error", (e) => {
			if(e && e.message === "Not supported") {
				console.info(new Date(),"Connected to non standard compliant MQTT Broker.")
			} else {
				console.error(new Date(),e);
			}
		})
	}
};

/**
 *
 * @param mapDataStr {string}
 */
MqttClient.prototype.asyncUpdateMapDataTopic = async function() {
	this.isPublishingMap = true;
	while (true) {
		await new Promise((resolve,reject) => {
			this.nextMapToPublish = false;
			let timeout = setTimeout(() => reject('mqtt updateMapDataTopic timed out'),30e3); // looks like a bug in MqttClient: on disconnect it may NEVER run a callback
			this.client.publish(this.topics.map_data, this.map.bin, {retain: true, qos:this.qos}, err => {
				clearTimeout(timeout);
				resolve();
			});
		}).catch((err) => { console.error(new Date(),err); });
		if (!this.nextMapToPublish) break;
	}
	this.isPublishingMap = false;
}

/**
 *
 * @param mapDTO {MapDTO}
 */
MqttClient.prototype.updateMapDataTopic = function () {
	if (this.client && this.client.connected === true && this.map.bin) {
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
	if (this.attributesUpdateTimeout) {
		clearTimeout(this.attributesUpdateTimeout);
	}

	if (this.client && this.client.connected === true) {
		this.vacuum.getConsumableStatus((err, res) => {
			if (!err) {
				var response = {}, promises = [];
				this.vacuum.getCleanSummary((err, res2) => {
					if (!err) {
						response.cleanTime = (res2[0] / 60 / 60).toFixed(1);
						response.cleanArea = (res2[1] / 1000000).toFixed(1);
						response.cleanCount = res2[2];
						var last_runs = res2[3];
						if (last_runs.length > 0) {
							promises.push(new Promise((resolve,reject) => {
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
							}));
						}
						promises.push(new Promise((resolve,reject) => {
							this.vacuum.getCurrentStatus((err, res2) => {
								if (!err) {
									response.currentCleanTime = (res2.clean_time / 60).toFixed(1);
									response.currentCleanArea = (res2.clean_area / 1000000).toFixed(1);
									resolve();
								} else {
									reject(err);
								}
							});
						}));
						Promise.all(promises).then(_ => {
							response.last_run_stats = response.last_run_stats || {};
							response.mainBrush = (Math.max(0, 300 - (res.main_brush_work_time / 60 / 60))).toFixed(1);
							response.sideBrush = (Math.max(0, 200 - (res.side_brush_work_time / 60 / 60))).toFixed(1);
							response.filter = (Math.max(0, 150 - (res.filter_work_time / 60 / 60))).toFixed(1);
							response.sensor = (Math.max(0, 30 - (res.sensor_dirty_time / 60 / 60))).toFixed(1);
							response.state = this.last_ha_state;
							response.valetudo_state = this.last_state;
							if (JSON.stringify(response) !== JSON.stringify(this.last_attributes)) {
								this.client.publish(this.topics.attributes, JSON.stringify(response), {retain: true, qos:this.qos});
								this.last_attributes = response;
							}
							this.attributesUpdateTimeout = setTimeout(() => {
								this.updateAttributesTopic()
							}, this.attributesUpdateInterval);
						}).catch(err => console.error(new Date(),err));
					} else {
						console.error(new Date(),err);
						this.attributesUpdateTimeout = setTimeout(() => {
							this.updateAttributesTopic()
						}, this.attributesUpdateInterval);
					}
				});
			} else {
				console.error(new Date(),err);
				this.attributesUpdateTimeout = setTimeout(() => {
					this.updateAttributesTopic()
				}, this.attributesUpdateInterval);
			}
		})
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

		if (statusData.error_code !== undefined && statusData.error_code !== 0) {
			response.error = Vacuum.GET_ERROR_CODE_DESCRIPTION(statusData.error_code);
			response.errorCode = statusData.error_code;
		}

		this.client.publish(this.topics.state, JSON.stringify(response), {retain: true, qos:this.qos});
	}
};

MqttClient.prototype.handleFanSpeedRequest = function (speed) {
	if (Object.keys(FAN_SPEEDS).includes(speed)) {
		this.vacuum.setFanSpeed(FAN_SPEEDS[speed], () => {});
	} else if (parseInt(speed)) {
		this.vacuum.setFanSpeed(parseInt(speed), () => {});
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
					if (res.in_cleaning === 2 && HA_STATE_MAPPINGS[res.state] === HA_STATES.PAUSED) {
						this.vacuum.resumeCleaningZone(() => {
						});
					} else {
						this.vacuum.startCleaning(() => {
						});
					}
				}
			});
			break;
		case MQTT_COMMANDS.STOP:
			this.vacuum.stopCleaning(() => {
			});
			break;
		case MQTT_COMMANDS.RETURN_TO_BASE:
			this.vacuum.stopCleaning(() => {
				this.vacuum.driveHome(() => {
				});
			});
			break;
		case MQTT_COMMANDS.CLEAN_SPOT:
			this.vacuum.spotClean(() => {
			});
			break;
		case MQTT_COMMANDS.LOCATE:
			this.vacuum.findRobot(() => {
			});
			break;
		case MQTT_COMMANDS.PAUSE:
			this.vacuum.pauseCleaning(() => {
			});
			break;
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
		console.error(new Date(),e);
	}

	if (msg && msg.command) {
		switch (msg.command) {
			/**
			 * {
			 *   "command": "zoned_cleanup",
			 *   "zone_ids": [
			 *	 "Foobar",
			 *	 {
			 *	   id: "Baz",
			 *	   repeats: 2
			 *	 }
			 *   ]
			 * }
			 */
			case CUSTOM_COMMANDS.ZONED_CLEANUP:
				if (Array.isArray(msg.zone_ids)) {
					const areas = this.configuration.get("areas");
					let zones = [];
					msg.zone_ids.forEach(function (zone_selector) {
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
					if (zones.length) {
						this.vacuum.startCleaningZone(zones, (err) => {
							if (err) console.error(new Date(),err);
						});
					} else {
						console.info(new Date(),"Invalid zone_ids");
					}
				} else {
					console.info(new Date(),"Missing zone_ids");
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
			 *   "repeats": 1
			 * }
			 */
			case CUSTOM_COMMANDS.SEGMENTED_CLEANUP:
				if (Array.isArray(msg.segment_ids)) {
					let segments = [], repeats = parseInt(msg.repeats) || 1;
					this.vacuum.getRoomMapping(function (err, data) {
						if (err) {
							console.error(new Date(), err);
							return;
						}
						msg.segment_ids.forEach(function (segment_selector) {
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
							self.vacuum.startCleaningSegment([segments, repeats], (err) => {
								if (err) console.error(new Date(),err);
							});
						} else {
							console.info(new Date(),"Invalid segment_ids");
						}
					});
				} else {
					console.info(new Date(),"Missing segment_ids");
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
					this.vacuum.resetConsumable(msg.consumable, (err) => {
						if (err) console.error(new Date(),'resetConsumable',err);
					});
				} else {
					console.info(new Date(),"Wrong consumable type");
				}
				break;
			/**
			 * {
			 *   "command": "go_to",
			 *   "spot_id": "Somewhere"
			 * }
			 */
			case CUSTOM_COMMANDS.GO_TO:
				if (msg.spot_id) {
					const spots = this.configuration.get("spots");
					const spot_coords = spots.find(e => Array.isArray(e) && e[0] === msg.spot_id);

					if (spot_coords) {
						this.vacuum.goTo(spot_coords[1], spot_coords[2], () => {
						});
					} else {
						console.info(new Date(),"Invalid spot_id");
					}
				} else {
					console.info(new Date(),"Missing spot_id");
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
					MapManager.storeMap(msg.name, function(err, data) {
						if (err) { console.info(new Date(),err); }
					});
				} else {
					console.info(new Date(),"Missing name");
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
					this.vacuum.getCurrentStatus((err, data) => {
						if (err) {
							console.info(new Date(),err);
							return;
						}
						if (data.state === 3 || data.state === 8) {
							MapManager.loadMap(msg.name, (err, data2) => {
								if (err) {
									console.info(new Date(),err);
									return;
								} else {
									if (data['lab_status'] === 1) {
										setTimeout(() => this.vacuum.startCleaning((err, data2) => {
											if (err) {
												console.info(new Date(),err);
												return;
											} else {
												setTimeout(() => this.vacuum.stopCleaning((err, data2) => {
													if (err) {
														console.info(new Date(),err);
														return;
													}
												}),2e3);
											}
										}),1e3);
									} else {
										exec("/bin/sleep 2 && /sbin/restart rrwatchdoge");
									}
								}
							});
						} else {
							console.info(new Date(),"Restoring map allowed only when docked or idle");
							return;
						}
					});
				} else {
					console.info(new Date(),"Missing name for mqtt restoring map");
				}
				break;
			default:
				console.info(new Date(),"Received invalid custom command", msg.command, msg);
		}
	}
};

module.exports = MqttClient;
