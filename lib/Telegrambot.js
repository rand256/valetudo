const fs = require("fs");
const path = require("path");
const Vacuum = require("./miio/Vacuum");
const MapManager = require('./MapManager');
const { exec } = require("child_process");
const SimpleMapDrawer = require("./SimpleMapDrawer");
const SlimbotImproved = require("./telegram/slimbotImproved.js");

/**
 * @param options {object}
 * @param options.configuration {Configuration}
 * @param options.vacuum {Vacuum}
 * @param options.events {EventEmitter}
 * @constructor
 */
const Telegrambot = function (options) {
	const self = this;

	this.configuration = options.configuration;
	this.events = options.events;
	this.vacuum = options.vacuum;
	this.map = options.map;
	this.lastState = {state: -1, error_code: 0, in_cleaning: 0, in_returning: 0}; // todo: update on first start
	if (process.env.VAC_MODEL) {
		this.lastState = {state: 8, error_code: 0, in_cleaning: 0, in_returning: 0}; // for development
		this.debugLogging = true;
	}
	this.lastNotifications = {consumables: 0, binFull: 0};

	this.slimbot = null;

	this.runningState = 1; // 0 - connected, 1 - disconnected, 2 - connection error
	this.connectFailCount = 0;
	this.initiate();

	// todo: move below to initiate
	this.events.on("miio.consume_material_notify", (statusData) => {
		if (self.slimbot !== null && self.sendConsumables && (Date.now() - this.lastNotifications.consumables) > 300e3) {
			this.lastNotifications.consumables = Date.now();
			self.vacuum.getConsumableStatus(function (err, res) {
				if (!err) {
					self.clients.forEach(client => {
						if (!client.silence) {
							self.sendMessage(client.id, self.languageGetter('telegram.consumablesAlert', "One of consumables timers has expired:\n\n") + self.parseConsumables(res),{parse_mode: "Markdown"});
						}
					});
				}
			});
		}
	});
	this.events.on("miio.bin_full", (statusData) => {
		if (self.slimbot !== null && self.sendConsumables && (Date.now() - this.lastNotifications.binFull) > 300e3) {
			this.lastNotifications.binFull = Date.now();
			self.clients.forEach(client => {
				if (!client.silence) {
					self.sendMessage(client.id, self.languageGetter('telegram.binFull', "Dust bin congestion is supposed, check it up!"));
				}
			});
		}
	});
	this.events.on("miio.status", (statusData) => {
		if (!statusData.msg_ver || !statusData.battery) return;
		let res = Object.assign({},statusData);
		if (self.slimbot !== null && self.lastState.state >= 0 && (self.lastState.state !== res.state || (res.state === 12 && (self.lastState.error_code !== res.error_code)))) {
			let notifyAllowed = false, notifyTypes = this.configuration.get("telegramBot").notifyStatusTypes || 0;
			if (notifyTypes === 0 || notifyTypes === 1 && ([3,6,10].includes(res.state) && [5,11,16,17,18].includes(self.lastState.state) || [5,11,16,17,18].includes(res.state)) || [9,12].includes(res.state)) {
				notifyAllowed = true;
			}
			if (notifyAllowed) {
				self.clients.forEach(client => {
					if (!client.silence) {
						let msg = self.languageGetter('telegram.statusChanged',"Status changed: ") + self.languageGetter('robot.states.n' + res.state,Vacuum.GET_STATE_CODE_DESCRIPTION(res.state));
						if (res.error_code !== 0 && res.state === 12) {
							msg += " (" + self.languageGetter('robot.errors.n' + res.error_code,Vacuum.GET_ERROR_CODE_DESCRIPTION(res.error_code)) + ")";
						}
						msg += "\n" + self.languageGetter('telegram.battery',"Battery: ") + res.battery + "%";
						self.sendMessage(client.id, msg);
					}
				});
			}
		}
		Object.assign(self.lastState, res);
	});
	setTimeout(() => { self.initLastState() }, 5e3);
}

Telegrambot.prototype.initiate = function() {
	const self = this;

	let token = this.configuration.get("telegramBot").token;
	if (!token || !this.configuration.get("telegramBot").enabled) {
		if (this.slimbot) {
			this.slimbot._timeout.stop();
		}
		return;
	}

	this.botname = "";
	this.runningState = 1;

	this.clients = this.configuration.get("telegramBot").clients || [];
	this.password = this.configuration.get("telegramBot").password;
	this.sendConsumables = this.configuration.get("telegramBot").sendConsumables;
	this.sendConsumablesEvery = this.configuration.get("telegramBot").sendConsumablesEvery;

	this.language = {};
	this.languageGetter = function(id,def) {
		try {
			let lang = this.configuration.get("webInterface").localization;
			if (!this.language[lang]) {
				if (fs.existsSync(path.join(__dirname, '../client/locales/' + lang + '.json'))) {
					let locale = JSON.parse(fs.readFileSync(path.join(__dirname, '../client/locales/' + lang + '.json')));
					this.language[lang] = {telegram: locale.telegram, common: locale.common, home: locale.home, robot: locale.robot};
				} else {
					this.language[lang] = {};
				}
			}
			return id.split('.').reduce((prev, curr) => prev && prev[curr], this.language[lang]) || def;
		} catch (e) {
			return def;
		}
	}

	let apiHost = this.configuration.get("telegramBot").host;
	let proxy = this.configuration.get("telegramBot").proxy,
		proxyObj = {},
		proxyCredentials,
		proxyAddress;
	if (proxy && proxy.length) {
		proxy = proxy.split('@');
		if (proxy.length > 1) {
			proxyCredentials = proxy[0].split(':');
			if (proxyCredentials[0].length > 0) {
				proxyObj.socksUsername = proxyCredentials[0];
			}
			if (proxyObj.socksUsername && proxyCredentials.length > 1 && proxyCredentials[1].length > 0) {
				proxyObj.socksPassword = proxyCredentials[1];
			}
			proxyAddress = proxy[1];
		} else {
			proxyAddress = proxy[0];
		}
		proxyAddress = proxyAddress.split(':');
		if (proxyAddress[0].length > 0) {
			proxyObj.socksHost = proxyAddress[0];
		}
		if (proxyObj.socksHost && proxyAddress.length > 1 && proxyAddress[1].length > 0 && parseInt(proxyAddress[1])) {
			proxyObj.socksPort = parseInt(proxyAddress[1]);
		}
		if (!proxyObj.socksHost || !proxyObj.socksPort) {
			console.error('bad proxy address specified for telegramBot', proxy);
			proxyObj = {};
		}
	}

	this.slimbotCatcher = function(error) {
		if (error === null) return;
		self.runningState = 3;
		if (self.slimbot && self.slimbot._useProxy && ++self.connectFailCount > 20) {
			console.error(new Date(),'tgBot polling: too many connection failures in a row, probably the proxy has died. stopping...');
			if (self.slimbot) {
				self.slimbot._timeout.stop();
				self.runningState = 2;
			}
			self.configuration.get("telegramBot").enabled = false;
		}
		console.error(new Date(),'tgBot polling:', error.message ? error.message : error);
	};

	this.slimbotRefresher = {
		_timeout: 0,
		_stopped: true,
		start: function() {
			this._stopped = false;
			this.poll();
		},
		stop: function() {
			this._stopped = true;
			self.runningState = 1;
			clearTimeout(this._timeout);
		},
		poll: function() {
			if (!this._stopped && self.slimbot) {
				self.slimbot.startPolling(self.slimbotCatcher);
			}
		},
		getName: function() {
			if (!self.slimbot) return;
			self.slimbot.getMe(function(err,res) {
				if (!err && res.ok && res.result && res.result.username) {
					self.runningState = 0;
					self.botname = res.result.username;
				} else {
					self.runningState = 1;
				}
			});
		},
		refresh: function() {
			if (!this._stopped) {
				if (self.runningState > 0) {
					self.runningState--;
				}
				if (!self.runningState) {
					self.connectFailCount = 0;
					if (!self.botname) {
						this.getName();
					}
				}
				this._timeout = setTimeout(() => this.poll(), self.runningState ? 5e3 : 5e2);
			}
		}
	};

	if (this.slimbot) {
		this.slimbot._token = token;
		this.slimbot._host = apiHost || null;
		this.slimbot._useProxy = proxyObj.socksHost ? true : false;
		this.slimbot._proxy = proxyObj;
		this.slimbot._probeV6 = true;
	} else {
		this.slimbot = new SlimbotImproved(token, apiHost, proxyObj.socksHost ? proxyObj : undefined);
		this.slimbot._timeout = this.slimbotRefresher;
		this.slimbot.on('message', message => this.parseMessage(message));
		this.slimbot.on('callback_query', message => this.parseCallbackQuery(message));
	}
	if (this.slimbot._timeout._stopped) {
		this.slimbot._timeout.start();
	}
}

Telegrambot.prototype.initLastState = function() {
	this.vacuum.getCurrentStatus((err, res) => {
		if (!err) {
			this.lastState = res;
		}
	});
}

Telegrambot.prototype.formatFanPower = function(power) {
	switch (power) {
		case 38:
		case 101: return this.languageGetter('telegram.fanpower.quiet',"Quiet");
		case 60:
		case 102: return this.languageGetter('telegram.fanpower.balanced',"Balanced");
		case 75:
		case 103: return this.languageGetter('telegram.fanpower.turbo',"Turbo");
		case 100:
		case 104: return this.languageGetter('telegram.fanpower.max',"MAX");
		case 105: return this.languageGetter('telegram.fanpower.mop',"Mop");
		default: return power + '%';
	}
}

Telegrambot.prototype.parseCallbackQuery = function(query) {
	const self = this;
	let answerCommand = function() { self.answerCallbackQuery(query.id); },
		answerCommandOK = function() { self.answerCallbackQuery(query.id,{text: self.languageGetter('telegram.cbqReceivedOK',"Command accepted!")}); },
		answerCommandFailed = function(err) { self.answerCallbackQuery(query.id,{text: err || self.languageGetter('telegram.cbqFailed',"Error while running a command!")}); },
		answerCommandWrongState = function() { self.answerCallbackQuery(query.id,{text: self.languageGetter('telegram.cbqWrongState',"Command unavailable in current device state!")}); },
		sendErrorMessage = function(err) { self.sendMessage(query.message.chat.id, self.languageGetter('telegram.errorReply',"There was an error: {{error}}").replace('{{error}}',err)); },
		sendAfterCommandSequence = function(err) {
			self.deleteMessage(query.message.chat.id, query.message.message_id);
			if (err) {
				sendErrorMessage(err);
			}
			setTimeout(() => self.showMainMenu(query.message.chat.id),1000);
		}
	let isV3 = self.lastState.msg_ver === 3;
	let action = query.data.split(' ');
	switch (action[0]) {
		case "start":
			if ([2,3,8,10].includes(self.lastState.state)) { // todo: in which modes it's possible to start new full cleaning?
				answerCommandOK();
				if (self.sendConsumablesEvery && self.clients.some(client => client.id === query.message.chat.id && client.silence !== true)) {
					self.vacuum.getConsumableStatus(function (err, res) {
						if (!err && (!res.main_brush_work_time || !res.side_brush_work_time || !res.filter_work_time || !res.sensor_dirty_time)) {
							self.sendMessage(query.message.chat.id, self.languageGetter('telegram.consumablesHeader', "Remaining time until consumables timers expire:\n\n") + self.parseConsumables(res),{parse_mode: "Markdown"});
							this.lastNotifications.consumables = Date.now();
						}
					});
				}
				self.sendMessage(query.message.chat.id,self.languageGetter('telegram.performingCleaning',"Going to do a full cleaning."));
				self.vacuum.startCleaning((err, data) => {
					sendAfterCommandSequence();
				});
			} else {
				answerCommandWrongState();
			}
			break;
		case "pause":
		case "resume":
			if ([5,6,11,16,17,18].includes(self.lastState.state)) {
				answerCommandOK();
				self.vacuum.pauseCleaning(function (err, data) {
					sendAfterCommandSequence();
				});
			} else if (self.lastState.state === 10 || (self.lastState.state === 2 && self.lastState.in_cleaning > 0)) {
				answerCommandOK();
				if (self.lastState.in_cleaning === 1) {
					self.vacuum.startCleaning((err, data) => {
						sendAfterCommandSequence();
					});
				} else if (self.lastState.in_cleaning === 2) {
					self.vacuum.resumeCleaningZone((err, data) => {
						sendAfterCommandSequence();
					});
				} else if (self.lastState.in_cleaning === 3) {
					self.vacuum.resumeCleaningSegment((err, data) => {
						sendAfterCommandSequence();
					});
				} else if (self.lastState.in_returning === 1 || self.vacuum.model === "rockrobo.vacuum.v1" && self.lastState.state === 10 && self.lastState.in_cleaning === 0)  { // Gen1 is missing in_returning state
					self.vacuum.driveHome(function (err, data) {
						sendAfterCommandSequence();
					});
				}
			} else {
				answerCommandWrongState();
			}
			break;
		case "stop":
			if ([1,2,5,12,17,18].includes(self.lastState.state)) {
				answerCommandOK();
				self.vacuum.stopCleaning(function (err, data) {
					sendAfterCommandSequence();
				});
			} else if ([6,11,16].includes(self.lastState.state)) {
				answerCommandOK();
				self.vacuum.pauseCleaning(function (err, data) {
					sendAfterCommandSequence();
				});
			} else {
				answerCommandWrongState();
			}
			break;
		case "home":
			if ([2,3,10,12].includes(self.lastState.state)) {
				answerCommandOK();
				self.vacuum.driveHome(function (err, data) {
					sendAfterCommandSequence();
				});
			} else {
				answerCommandWrongState();
			}
			break;
		case "findme":
			answerCommandOK();
			self.vacuum.findRobot(function (err, data) {
				sendAfterCommandSequence();
			});
			break;
		case "spot":
			if ([2,3,10].includes(self.lastState.state)) {
				answerCommandOK();
				self.vacuum.spotClean(function (err, data) {
					sendAfterCommandSequence();
				});
			} else {
				answerCommandWrongState();
			}
			break;
		case "map":
			if (!self.map.bin) {
				answerCommandFailed(self.languageGetter('telegram.noMapAvailable',"Sorry, the map is currently unavailable."));
				return;
			}
			SimpleMapDrawer.drawMap({gzippedMap: self.map.bin, status: self.lastState},(err,data) => {
				if (err || !data) {
					answerCommandFailed(self.languageGetter('telegram.noMapAvailable',"Sorry, the map is currently unavailable."));
				} else {
					answerCommand();
					self.deleteMessage(query.message.chat.id, query.message.message_id);
					self.slimbot._request('sendPhoto', {chat_id: query.message.chat.id}, {photo: { value: data, options: { filename: 'map.png' }}}, self.slimbotCatcher);
					self.showMainMenu(query.message.chat.id);
				}
			});
			break;
		case "goto_run":
			if ([2,3,8,10,12].includes(self.lastState.state)) {
				var spot, spots = this.configuration.get("spots"),
					chosen = action.slice(1);
				spot = spots.find(s => s[1] === +chosen[0] && s[2] === +chosen[1]);
				if (!spot) {
					answerCommandFailed(self.languageGetter('telegram.noGotoTargetSpecified',"You need to select a spot for Goto."));
					return;
				}
				answerCommandOK();
				self.sendMessage(query.message.chat.id,self.languageGetter('telegram.performingGoto',"Going to move to \"{{spotName}}\" spot.").replace('{{spotName}}',spot[0]));
				self.vacuum.goTo(spot[1],spot[2],function (err, data) {
					sendAfterCommandSequence();
				});
			} else {
				answerCommandWrongState();
			}
			break;
		case "goto_menu":
			var spots = this.configuration.get("spots").filter(s => s[1] !== undefined);
			if (!spots.length) {
				answerCommandFailed(self.languageGetter('telegram.noSpotsConfigured',"No spots configured yet."));
			} else {
				answerCommand();
				self.editMessageText(query.message.chat.id, query.message.message_id, self.languageGetter('telegram.selectGotoTarget',"Select target for Goto."), {reply_markup: self.inlineKeyboardGenerator("goto_menu", spots)});
			}
			break;
		case "zones_run":
			if ([2,3,8,10].includes(self.lastState.state)) {
				var names = [], hashed = {}, zones = this.configuration.get("areas"),
					chosen = action.slice(1);
				zones.forEach(z => { return hashed[self.hash33(z[0])] = z; });
				chosen = chosen.filter(c => hashed[c.replace(/\+/g,'')] !== undefined);
				if (!chosen.length) {
					answerCommandFailed(self.languageGetter('telegram.noZonesSpecified',"You need to select at least one zone."));
					return;
				}
				chosen.forEach(c => names.push(hashed[c.replace(/\+/g,'')][0] + ((c.match(/\+/g)||[]).length > 0 ? ' (\u{00D7}' + ((c.match(/\+/g)||[]).length + 1) + ')' : '')));
				chosen = chosen.map(c => {
					if ((c.match(/\+/g)||[]).length > 0) {
						let nzone, nzones = [];
						hashed[c.replace(/\+/g,'')][1].forEach(n => {
							nzone = [...n];
							nzone[4] = (c.match(/\+/g)||[]).length + 1;
							nzones.push(nzone);
						});
						return nzones;
					} else {
						return hashed[c.replace(/\+/g,'')][1];
					}
				});
				chosen = chosen.reduce((accumulator, currentValue) => accumulator.concat(currentValue), []);
				answerCommandOK();
				if (self.sendConsumablesEvery && self.clients.some(client => client.id === query.message.chat.id && client.silence !== true)) {
					self.vacuum.getConsumableStatus(function (err, res) {
						if (!err && (!res.main_brush_work_time || !res.side_brush_work_time || !res.filter_work_time || !res.sensor_dirty_time)) {
							self.sendMessage(query.message.chat.id, self.languageGetter('telegram.consumablesHeader', "Remaining time until consumables timers expire:\n\n") + self.parseConsumables(res),{parse_mode: "Markdown"});
							this.lastNotifications.consumables = Date.now();
						}
					});
				}
				self.sendMessage(query.message.chat.id, self.languageGetter('telegram.performingZoned',"Going to zoned cleaning:\n{{zoneNames}}").replace('{{zoneNames}}',names.join(', ')));
				self.vacuum.startCleaningZone(chosen,function (err, data) {
					sendAfterCommandSequence();
				});
			} else {
				answerCommandWrongState();
			}
			break;
		case "zones_menu":
			var zones = this.configuration.get("areas").filter(z => z[1].length);
			if (!zones.length) {
				answerCommandFailed(self.languageGetter('telegram.noZonesConfigured',"No zones configured yet."));
			} else {
				var msg, subzones, names = [], hashed = {}, offset = 0,
					chosen = action.slice(1);
				if (chosen.length) {
					offset = +chosen.shift();
				}
				zones.forEach(z => { hashed[self.hash33(z[0])] = z; });
				chosen = chosen.filter(c => hashed[c.replace(/\+/g,'')] !== undefined);
				subzones = chosen.reduce((accumulator, currentValue) => accumulator + hashed[currentValue.replace(/\+/g,'')][1].length, 0);
				if (subzones > 5) {
					answerCommandFailed(self.languageGetter('telegram.tooManyZones',"Too many subzones selected! Allowed - 5, requested - {{zonesCount}}.").replace('{{zonesCount}}',subzones));
					return;
				}
				msg = self.languageGetter('telegram.selectZones',"Select zones to clean.");
				if (chosen.length) {
					chosen.forEach(c => {
						names.push(hashed[c.replace(/\+/g,'')][0] + ((c.match(/\+/g)||[]).length > 0 ? ' (\u{00D7}' + ((c.match(/\+/g)||[]).length + 1) + ')' : ''))
					});
					msg += "\n" + self.languageGetter('telegram.selectedZones',"Currently selected: {{zonesList}} ({{subzonesCount}}/5 subzones)").replace('{{zonesList}}',names.join(", ")).replace('{{subzonesCount}}',subzones);
				} else {
					msg += " " + self.languageGetter('telegram.selectZoneIterations',"Click multiple times for tuning iterations count.");
				}
				answerCommand();
				if (query.message.text !== msg || JSON.stringify(query.message.reply_markup) !== self.inlineKeyboardGenerator("zones_menu", zones, [offset].concat(chosen))) {
					self.editMessageText(query.message.chat.id, query.message.message_id, msg, {reply_markup: self.inlineKeyboardGenerator("zones_menu", zones, [offset].concat(chosen))});
				}
			}
			break;
		case "segments_run":
			if (!isV3) {
				answerCommandFailed(self.languageGetter('telegram.noSegmentsSupported',"Room cleaning is not supported in your device's firmware."));
				return;
			}
			if ([2,3,8,10].includes(self.lastState.state)) {
				var names = [], iterations = 1,
					chosen = action.slice(1);
				if (chosen.length && chosen[chosen.length-1][0] === 'x') {
					iterations = +chosen[chosen.length-1][1] || 1;
					chosen.pop();
				}
				if (!chosen.length) {
					answerCommandFailed(self.languageGetter('telegram.noSegmentsSpecified',"You need to select at least one room."));
					return;
				}
				self.getActualSegments()
				.then(res => {
					if (!res.length) {
						return Promise.reject("empty list");
					}
					var segment, names = [];
					chosen = chosen.map(c => { return +c; });
					chosen.forEach(c => {
						segment = res.find(r => c === r.id);
						if (segment) {
							names.push(segment.name);
						} else {
							names.push('#' + c); // should never be here
						}
					});
					answerCommandOK();
					if (self.sendConsumablesEvery && self.clients.some(client => client.id === query.message.chat.id && client.silence !== true)) {
						self.vacuum.getConsumableStatus(function (err, res) {
							if (!err && (!res.main_brush_work_time || !res.side_brush_work_time || !res.filter_work_time || !res.sensor_dirty_time)) {
								self.sendMessage(query.message.chat.id, self.languageGetter('telegram.consumablesHeader', "Remaining time until consumables timers expire:\n\n") + self.parseConsumables(res),{parse_mode: "Markdown"});
								this.lastNotifications.consumables = Date.now();
							}
						});
					}
					self.sendMessage(query.message.chat.id, self.languageGetter('telegram.performingSegments',"Going to room cleaning:\n{{segmentNames}}").replace('{{segmentNames}}',names.join(', ')) + (iterations > 1 ? ' (\u{00D7}' + iterations + ')' : ''));
					self.vacuum.startCleaningSegment([chosen,iterations],function (err, data) {
						sendAfterCommandSequence();
					});
				})
				.catch(err => {
					console.log(err)
					answerCommandFailed(self.languageGetter('telegram.noSegmentsConfigured',"No rooms available on the map."));
				});
			} else {
				answerCommandWrongState();
			}
			break;
		case "segments_menu":
			if (!isV3) {
				answerCommandFailed(self.languageGetter('telegram.noSegmentsSupported',"Room cleaning is not supported in your device's firmware."));
				return;
			}
			self.getActualSegments()
			.then(res => {
				if (!res.length) {
					return Promise.reject("empty list");
				}
				var msg, segment, names = [], offset = 0, iterations = 1,
					chosen = action.slice(1);
				if (chosen.length) {
					offset = +chosen.shift();
				}
				if (chosen.length && chosen[chosen.length-1][0] === 'x') {
					iterations = +chosen[chosen.length-1][1] || 1;
					chosen.pop();
				}
				msg = self.languageGetter('telegram.selectSegments',"Select rooms to clean.");
				if (chosen.length) {
					chosen.forEach(c => {
						segment = res.find(r => +c === r.id);
						if (segment) {
							names.push(segment.name);
						} else {
							names.push('#' + c);  // should never be here
						}
					});
					msg += "\n" + self.languageGetter('telegram.selectedSegments', "Currently selected: {{segmentsList}}").replace('{{segmentsList}}',names.join(", ")) + (iterations > 1 ? ' (\u{00D7}' + iterations + ')' : '');
				}
				answerCommand();
				if (query.message.text !== msg || JSON.stringify(query.message.reply_markup) !== self.inlineKeyboardGenerator("segments_menu", res, [offset].concat(chosen, 'x' + iterations))) {
					self.editMessageText(query.message.chat.id, query.message.message_id, msg, {reply_markup: self.inlineKeyboardGenerator("segments_menu", res, [offset].concat(chosen, 'x' + iterations))});
				}
			})
			.catch(err => {
				console.log(err)
				answerCommandFailed(self.languageGetter('telegram.noSegmentsConfigured',"No rooms available on the map."));
			});
			break;
		case "power_set":
			var speed = +action[1];
			answerCommandOK();
			self.vacuum.setFanSpeed(speed, function (err, data) {
				if (err) {
					self.deleteMessage(query.message.chat.id, query.message.message_id);
					sendErrorMessage(err);
				} else {
					self.editMessageText(query.message.chat.id, query.message.message_id, self.languageGetter('telegram.powerChanged',"Fan power changed to {{fanPower}}.").replace('{{fanPower}}',self.formatFanPower(speed)));
				}
				self.showMainMenu(query.message.chat.id);
			})
			break;
		case "power_menu":
			self.editMessageText(query.message.chat.id, query.message.message_id, self.languageGetter('telegram.selectPower',"Select fan power mode."), {reply_markup: self.inlineKeyboardGenerator("power_menu")});
			answerCommand();
			break;
		case "notif_on":
			var client = self.clients.find(client => client.id === query.message.chat.id);
			if (client && client.silence) {
				delete client.silence;
				self.saveClients();
			}
			answerCommand();
			self.deleteMessage(query.message.chat.id, query.message.message_id);
			self.sendMessage(query.message.chat.id, self.languageGetter('telegram.notificationsEnabled',"Status notifications enabled."));
			self.showMainMenu(query.message.chat.id);
			break;
		case "notif_off":
			var client = self.clients.find(client => client.id === query.message.chat.id);
			if (client && !client.silence) {
				client.silence = true;
				self.saveClients();
			}
			answerCommand();
			self.deleteMessage(query.message.chat.id, query.message.message_id);
			self.sendMessage(query.message.chat.id, self.languageGetter('telegram.notificationsDisabled',"Status notifications disabled."));
			self.showMainMenu(query.message.chat.id);
			break;
		case "status":
			answerCommandOK();
			self.vacuum.getCurrentStatus(function(err, res) {
				self.deleteMessage(query.message.chat.id, query.message.message_id);
				if (!err) {
					let msg = self.languageGetter('telegram.currentStatus',"Current status: ") + self.languageGetter('robot.states.n' + res.state,Vacuum.GET_STATE_CODE_DESCRIPTION(res.state));
					if (res.error_code !== 0) {
						msg += " (" + self.languageGetter('robot.errors.n' + res.error_code,Vacuum.GET_ERROR_CODE_DESCRIPTION(res.error_code)) + ")";
					}
					msg += "\n" + self.languageGetter('telegram.power',"Power: ") + self.formatFanPower(res.fan_power);
					msg += "\n" + self.languageGetter('telegram.battery',"Battery: ") + res.battery + "%";
					self.sendMessage(query.message.chat.id, msg);
					Object.assign(self.lastState, res);
				} else {
					sendErrorMessage(err);
				}
				self.showMainMenu(query.message.chat.id);
			});
			break;
		case "consumables":
			answerCommandOK();
			self.vacuum.getConsumableStatus(function (err, res) {
				self.deleteMessage(query.message.chat.id, query.message.message_id);
				if (err) {
					sendErrorMessage(err);
				} else {
					self.sendMessage(query.message.chat.id, self.languageGetter('telegram.consumablesHeader', "Remaining time until consumables timers expire:\n\n") + self.parseConsumables(res),{parse_mode: "Markdown"});
				}
				self.showMainMenu(query.message.chat.id);
			});
			break;
		case "maps_run":
			if ([3,8].includes(self.lastState.state) || (self.lastState.state === 2 && self.lastState.in_cleaning === 0)) {
				MapManager.listStoredMaps((err, maps) => {
					if (err) {
						answerCommandFailed();
						return;
					}
					if (!maps.length) {
						answerCommandFailed(self.languageGetter('telegram.noMapsStored',"No maps stored yet."));
						return;
					}
					var hashed = {}, chosen = action.slice(1);
					maps.forEach(m => { hashed[self.hash33(m)] = m; });
					if (hashed[chosen] === undefined) {
						answerCommandFailed(self.languageGetter('telegram.noMapSpecified',"You need to select the map name."));
						return;
					}
					answerCommandOK();
					new Promise((res,rej) => MapManager.loadMap(hashed[chosen], function (err, data) {
						if (err) rej(err);
						res();
					}))
					.then(() => {
						if (self.lastState['lab_status'] === 1) {
							return new Promise((res,rej) => {
								setTimeout(() => self.vacuum.startCleaning(function (err, data2) {
									if (err) rej(err);
									res();
								}),1e3);
							})
							.then(res => new Promise((res,rej) => {
								setTimeout(() => self.vacuum.stopCleaning(function (err, data2) {
									if (err) rej(err);
									res();
								}),2e3);
							}))
							.then(res => {
								self.deleteMessage(query.message.chat.id, query.message.message_id);
								self.sendMessage(query.message.chat.id, self.languageGetter('telegram.mapLoadOK',"Map should be reloaded now."));
							});
						} else {
							self.deleteMessage(query.message.chat.id, query.message.message_id);
							self.sendMessage(query.message.chat.id, self.languageGetter('telegram.mapLoadWait',"Map should be reloaded in 30 seconds. Please wait."));
							exec("/bin/sleep 2 && /sbin/restart rrwatchdoge");
							return;
						}
					})
					.catch(err => {
						self.deleteMessage(query.message.chat.id, query.message.message_id);
						sendErrorMessage(err);
						return;
					})
					.finally(() => self.showMainMenu(query.message.chat.id));
				});
			} else {
				answerCommandWrongState();
			}
			break;
		case "maps_menu":
			MapManager.listStoredMaps((err, maps) => {
				if (err) {
					answerCommandFailed();
					return;
				}
				if (!maps.length) {
					answerCommandFailed(self.languageGetter('telegram.noMapsStored',"No maps stored yet."));
					return;
				}
				answerCommand();
				self.editMessageText(query.message.chat.id, query.message.message_id, self.languageGetter('telegram.selectMap',"Select a map to restore."), {reply_markup: self.inlineKeyboardGenerator("maps_menu", maps)});
			});
			break;
		default:
			self.editMessageText(query.message.chat.id, query.message.message_id, self.languageGetter('telegram.selectCommand',"Waiting for a command."), {reply_markup: self.inlineKeyboardGenerator("main_menu")});
			self.answerCallbackQuery(query.id);
	}
}

Telegrambot.prototype.inlineKeyboardGenerator = function(type, values, chosen) {
	const self = this;
	let output, perPage = 12, back = {text: self.languageGetter('telegram.buttons.back',"-- back --"), callback_data: "main_menu"};
	switch(type) {
		case "power_menu":
			let isV3 = self.lastState.msg_ver === 3;
			output = [
				[{text: self.languageGetter('telegram.fanpower.quiet',"Quiet"), callback_data: "power_set " + (isV3 ? 101 : 38)}],
				[{text: self.languageGetter('telegram.fanpower.balanced',"Balanced"), callback_data: "power_set " + (isV3 ? 102 : 60)}],
				[{text: self.languageGetter('telegram.fanpower.turbo',"Turbo"), callback_data: "power_set " + (isV3 ? 103 : 75)}],
				[{text: self.languageGetter('telegram.fanpower.max',"Max"), callback_data: "power_set " + (isV3 ? 104 : 100)}],
			[],[back]];
			if (self.vacuum.model !== "rockrobo.vacuum.v1") {
				output[4] = [{text: self.languageGetter('telegram.fanpower.mop',"Mop"), callback_data: "power_set 105"}];
			}
			if (!isV3) {
				output.unshift([{text: self.languageGetter('telegram.fanpower.whisper',"Whisper"), callback_data: "power_set " + 1}])
			}
			break;
		case "zones_menu":
			var zone, hash, chosen_next, pages = false, offset = 0, chosen_multi = {};
			output = [];
			if (chosen.length) {
				offset = +chosen.shift();
			}
			chosen.forEach(c => {
				chosen_multi[c.replace(/\+/g,'')] = (c.match(/\+/g)||[]).length;
			});
			if (values.length > perPage) pages = true;
			values.sort();
			for (let i = offset; i < values.length; i++) {
				if (i - offset >= perPage) break;
				if (i % 3 === 0) {
					output.push([]);
				};
				hash = self.hash33(values[i][0]); // max 7 chars, 5 zones and limit is 64 -- should fit
				if (chosen_multi[hash] !== undefined) {
					if (chosen_multi[hash] > 1) {
						chosen_next = chosen.filter(z => z.replace(/\+/g,'') !== hash);
					} else {
						chosen_next = chosen.map(z => { if (z.replace(/\+/g,'') === hash) return z + '+'; return z; });
					}
					zone = {text: '['.repeat(chosen_multi[hash]+1) + (pages ? (i+1) + '. ' : '') + values[i][0] + ']'.repeat(chosen_multi[hash]+1), callback_data: [type].concat(offset, chosen_next).join(' ')};
				} else {
					zone = {text: (pages ? (i+1) + '. ' : '') + values[i][0], callback_data: [type].concat(offset, chosen, hash).join(' ')};
				}
				output[output.length-1].push(zone);
			}
			output.push([{text: self.languageGetter('telegram.buttons.runZoned',"-- Run zoned cleaning --"), callback_data: ["zones_run"].concat(chosen).join(' ')}]);
			if (pages) {
				output.push([{text: '<', callback_data: [type].concat((offset - perPage > 0 ? offset - perPage : 0), chosen).join(' ') }, back, {text: '>', callback_data: [type].concat((offset + perPage < values.length ? offset + perPage : offset), chosen).join(' ') }]);
			} else {
				output.push([back]);
			}
			break;
		case "segments_menu":
			var segment, pages = false, offset = 0, iterations = 1;
			if (chosen.length) {
				offset = +chosen.shift();
			}
			if (chosen.length && chosen[chosen.length-1][0] === 'x') {
				iterations = +chosen[chosen.length-1][1] || 1;
				chosen.pop();
			}
			output = [];
			if (values.length > perPage) pages = true;
			values.sort();
			for (let i = 0; i < values.length; i++) {
				if (i - offset >= perPage) break;
				if (i % 3 === 0) {
					output.push([]);
				};
				if (chosen.includes(values[i].id.toString())) {
					segment = {text: '[' + (pages ? (i+1) + '. ' : '') + values[i].name + ']', callback_data: [type].concat(offset, chosen.filter(s => s !== values[i].id.toString()),'x' + iterations).join(' ')};
				} else {
					segment = {text: (pages ? (i+1) + '. ' : '') + values[i].name, callback_data: [type].concat(offset, chosen,values[i].id,'x' + iterations).join(' ')};
				}
				output[output.length-1].push(segment);
			}
			segment = [];
			for (let i = 1; i <= 3; i++) {
				segment.push({text: (i === iterations ? '[' : '') + " \u{00D7}" + i + " " + (i === iterations ? ']' : ''), callback_data: ["segments_menu"].concat(offset, chosen, 'x' + i).join(' ')});
			}
			output.push(segment, [{text: self.languageGetter('telegram.buttons.runSegments',"-- Run room cleaning --"), callback_data: ["segments_run"].concat(chosen, 'x' + iterations).join(' ')}]);
			if (pages) {
				output.push([{text: '<', callback_data: [type].concat((offset - perPage > 0 ? offset - perPage : 0), chosen, 'x' + i).join(' ') }, back, {text: '>', callback_data: [type].concat((offset + perPage < values.length ? offset + perPage : offset), chosen, 'x' + i).join(' ') }]);
			} else {
				output.push([back]);
			}
			break;
		case "goto_menu":
			output = [];
			values.sort();
			for (let i = 0; i < values.length; i++) {
				if (i % 3 === 0) {
					output.push([]);
				};
				output[output.length-1].push({text: values[i][0], callback_data: ["goto_run"].concat(values[i].slice(1)).join(' ')});
			}
			output.push([back]);
			break;
		case "maps_menu":
			output = [];
			for (let i = 0; i < values.length; i++) {
				if (i % 3 === 0) {
					output.push([]);
				};
				output[output.length-1].push({text: values[i], callback_data: ["maps_run", self.hash33(values[i])].join(' ')});
			}
			output.push([back]);
			break;
		default:
			var isPaused = self.lastState.state === 10 || (self.lastState.state === 2 && self.lastState.in_cleaning > 0); 
			output = [
				[{text: self.languageGetter('telegram.buttons.status',"Status"), callback_data: "status"},{text: self.languageGetter('telegram.buttons.map',"Map"), callback_data: "map"},{text: self.languageGetter('telegram.buttons.consumables',"Consumables"), callback_data: "consumables"}],
				[{text: self.languageGetter('telegram.buttons.start',"Start"), callback_data: "start"},(isPaused ? {text: self.languageGetter('telegram.buttons.resume',"Resume"), callback_data: "resume"} : {text: self.languageGetter('telegram.buttons.pause',"Pause"), callback_data: "pause"}),{text: self.languageGetter('telegram.buttons.stop',"Stop"), callback_data: "stop"}],
				[{text: self.languageGetter('telegram.buttons.zones',"Zones"), callback_data: "zones_menu"},{text: self.languageGetter('telegram.buttons.spot',"Spot"), callback_data: "spot"},{text: self.languageGetter('telegram.buttons.rooms',"Rooms"), callback_data: "segments_menu"}],
				[{text: self.languageGetter('telegram.buttons.home',"Home"), callback_data: "home"},{text: self.languageGetter('telegram.buttons.findMe',"Find Me"), callback_data: "findme"},{text: self.languageGetter('telegram.buttons.goto',"Goto"), callback_data: "goto_menu"}],
				[{text: "\u{1F300}", callback_data: "power_menu"},{text: "\u{1F507}", callback_data: "notif_off"},{text: "\u{1F50A}", callback_data: "notif_on"},{text: "\u{1F504}", callback_data: "maps_menu"}]
			];
	}
	return JSON.stringify({inline_keyboard: output});
}

Telegrambot.prototype.parseMessage = function(message) {
	const self = this;
	let text = message.text.replace(/\s\s+/g, ' ').split(' ');
	let client, parameters = text.slice(1);
	const accessAllowed = function() {
		if (!self.clients.some(client => client.id === message.chat.id)) {
			self.sendMessage(message.chat.id, self.languageGetter('telegram.notAuthenticated',"You are not authenticated, use\n/setme *password*"),{parse_mode: "Markdown"});
			return 0;
		}
		return 1;
	};
	if (text[0] === '/setme') {
		var password = parameters.join(' ').trim();
		if (password === '') {
			self.sendMessage(message.chat.id, self.languageGetter('telegram.missingPassword',"Password not given."));
		} else if (password !== self.password.toString().trim()) {
			self.sendMessage(message.chat.id, self.languageGetter('telegram.wrongPassword',"Password is wrong."));
		} else {
			if (!self.clients.some(client => client.id === message.chat.id)) {
				self.clients.push(message.chat);
				self.saveClients();
				self.sendMessage(message.chat.id, self.languageGetter('telegram.clientAuthorized',"Client authorized, type /start to begin."));
			} else {
				self.sendMessage(message.chat.id, self.languageGetter('telegram.clientAlreadyAuthorized',"Client already authorized, type /start to begin."));
			}
		}
	} else if (accessAllowed()) {
		self.showMainMenu(message.chat.id);
	}
}

Telegrambot.prototype.showMainMenu = function(target) {
	this.sendMessage(
		target,
		this.languageGetter('telegram.selectCommand',"Waiting for a command."),
		{reply_markup: this.inlineKeyboardGenerator("main_menu")}
	);
}

Telegrambot.prototype.parseConsumables = function(res) {
	let formatter = function(value,limit) {
		value = (Math.max(0, limit - (value / 60 / 60))).toFixed(2);
		return parseInt(value) ? value : "*" + value + "*";
	}
	return this.languageGetter('telegram.consumablesContent',"Main brush {{mainBrush}} hours left\nSide brush {{sideBrush}} hours left\nFilter {{filter}} hours left\nSensors {{sensors}} hours left")
		.replace('{{mainBrush}}',formatter(res.main_brush_work_time,300))
		.replace('{{sideBrush}}',formatter(res.side_brush_work_time,200))
		.replace('{{filter}}',formatter(res.filter_work_time,150))
		.replace('{{sensors}}',formatter(res.sensor_dirty_time,30));
}

Telegrambot.prototype.getActualSegments = function() {
	var segmentNames = {};
	return new Promise((resolve,reject) => {
		if (!this.map.bin || this.lastState.msg_ver !== 3) {
			return reject(null);
		}
		this.vacuum.getRoomMapping(function (err, data) {
			if (err) {
				return reject(err);
			}
			resolve(data);
		});
	})
	.then(res => {
		res.forEach(pair => segmentNames[pair[0]] = pair[1]);
		return new Promise((resolve,reject) => {
			require('zlib').gunzip(this.map.bin, (err, mapBuf) => {
				if (err) {
					return reject(err);
				}
				const mapData = require('./RRMapParser').PARSEDATA(mapBuf);
				if (!mapData.image) {
					return reject("image broken");
				}
				resolve(mapData);
			});
		});
	})
	.then(res => {
		let segments = [];
		if (res.image && res.image.segments && res.image.segments.id) {
			segments = res.image.segments.id.map(id => { return {id: id, name: segmentNames[id] || '#' + id}; });
		}
		segments.sort((a, b) => a.name - b.name);
		return segments;
	});
}

Telegrambot.prototype.saveClients = function() {
	let telegramBotCfg = this.configuration.get("telegramBot");
	telegramBotCfg.clients = this.clients;
	this.configuration.set("telegramBot", telegramBotCfg);
}

Telegrambot.prototype.sendMessage = function(chatId, text, optionalParams) {
	if (this.slimbot) {
		this.slimbot.sendMessage(chatId, text, optionalParams, this.slimbotCatcher);
	}
}

Telegrambot.prototype.editMessageText = function(chatId, messageId, text, optionalParams) {
	if (this.slimbot) {
		this.slimbot.editMessageText(chatId, messageId, text, optionalParams, this.slimbotCatcher);
	}
}

Telegrambot.prototype.deleteMessage = function(chatId, messageId) {
	if (this.slimbot) {
		this.slimbot.deleteMessage(chatId, messageId, this.slimbotCatcher);
	}
}

Telegrambot.prototype.answerCallbackQuery = function(callbackQueryId, optionalParams, callback) {
	if (this.slimbot) {
		this.slimbot.answerCallbackQuery(callbackQueryId, optionalParams, callback, this.slimbotCatcher);
	}
}

Telegrambot.prototype.hash33 = function(text) {
	let hash = 5381,
		index = text.length;
	while (index) {
		hash = (hash * 33) ^ text.charCodeAt(--index);
	}
	return (hash >>> 0).toString(36);
}

Telegrambot.prototype.getStatus = function() {
	if (!this.runningState) {
		return this.botname;
	}
	return this.runningState;
}

module.exports = Telegrambot;
