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
        console.log('tg bin full',statusData);
        if (self.slimbot !== null && self.sendConsumables && (Date.now() - this.lastNotifications.binFull) > 300e3) {
            this.lastNotifications.binFull = Date.now();
            self.clients.forEach(client => {
                if (!client.silence) {
                    self.sendMessage(client.id, self.languageGetter('telegram.binFull', "Dust bin congestion is detected, cleaning up is required!"));
                }
            });
        }
    });
    this.events.on("miio.status", (statusData) => {
        let res = Object.assign({},statusData);
        if (self.slimbot !== null && self.lastState.state >= 0 && (self.lastState.state !== res.state || self.lastState.error_code !== res.error_code)) {
            self.clients.forEach(client => {
                if (!client.silence) {
                    let msg = self.languageGetter('telegram.statusChanged',"Status changed: ") + self.languageGetter('robot.states.n' + res.state,Vacuum.GET_STATE_CODE_DESCRIPTION(res.state));
                    if (res.error_code !== 0) {
                        msg += " (" + self.languageGetter('robot.errors.n' + res.error_code,Vacuum.GET_ERROR_CODE_DESCRIPTION(res.error_code)) + ")";
                    }
                    msg += "\n" + self.languageGetter('telegram.battery',"Battery: ") + res.battery + "%";
                    self.sendMessage(client.id, msg);
                }
            });
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
                    this.language[lang] = {telegram: locale.telegram, common: locale.common, robot: locale.robot};
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
    }
    if (this.slimbot._timeout._stopped) {
        this.slimbot._timeout.start();
    }
}

Telegrambot.prototype.initLastState = function() {
    this.vacuum.getCurrentStatus((err, res) => {
        if (!res) {
            this.lastState = res;
        }
    });
}

Telegrambot.prototype.parseMessage = function(message) {
    const self = this;

    // don't reply to seriously outdated messages
    if (Date.now()/1000 - 90 > message.date) {
        return;
    }

    let text = message.text.replace(/\s\s+/g, ' ').split(' ');
    let client, parameters = text.slice(1);
    const accessAllowed = function() {
        if (!self.clients.some(client => client.id === message.chat.id)) {
            self.sendMessage(message.chat.id, self.languageGetter('telegram.notAuthenticated',"You are not authenticated, use /setme *password*"),{parse_mode: "Markdown"});
            return 0;
        }
        return 1;
    };
    const saveClients = function() {
        let telegramBotCfg = self.configuration.get("telegramBot");
        telegramBotCfg.clients = self.clients;
        self.configuration.set("telegramBot", telegramBotCfg);
    };
    if (text[0] === '/setme') {
        var password = parameters.join(' ').trim();
        if (password === '') {
            self.sendMessage(message.chat.id, self.languageGetter('telegram.missingPassword',"Password not given"));
        } else if (password !== self.password.toString().trim()) {
            self.sendMessage(message.chat.id, self.languageGetter('telegram.wrongPassword',"Password is wrong"));
        } else {
            if (!self.clients.some(client => client.id === message.chat.id)) {
                self.clients.push(message.chat);
                saveClients();
                self.sendMessage(message.chat.id, self.languageGetter('telegram.clientAuthorized',"Client authorized, type /help for help"));
            } else {
                self.sendMessage(message.chat.id, self.languageGetter('telegram.clientAlreadyAuthorized',"Client already authorized, type /help for help"));
            }
        }
    } else if (accessAllowed())
    switch (text[0]) {
        case "/help":
        case "/start":
            switch (parameters[0]) {
                case "/off":
                case "off": self.sendMessage(message.chat.id, self.languageGetter('telegram.help.off',"/off - bot will stop sending notifications about robot status changes to your account until you turn it back on.")); break;
                case "/on":
                case "on": self.sendMessage(message.chat.id, self.languageGetter('telegram.help.on',"/on - bot will start sending notifications about robot status changes to your account again if it was turned off.")); break;
                case "/clean":
                case "clean": self.sendMessage(message.chat.id, self.languageGetter('telegram.help.clean',"/clean - if you specify zone names separated with plus signs will start zoned cleaning, otherwise will start full cleaning.\n\nYou can also specify a number of cleaning passes for zoned cleaning using `xNumber` postfix. In example, `/clean Room1 x2 + Room2 x1 + Room3` will start zoned cleaning with `Room1` subzones cleaned twice, `Room2` subzones cleaned once and `Room3` subzones cleaned the number of times speficied in the zone description.\n\nNote you can't clean more that 5 subzones at once."),{parse_mode: "Markdown"}); break;
                case "/stop":
                case "stop": self.sendMessage(message.chat.id, self.languageGetter('telegram.help.stop',"/stop - will stop currently running cleaning.")); break;
                case "/pause":
                case "pause": self.sendMessage(message.chat.id, self.languageGetter('telegram.help.pause',"/pause - will pause currently running cleaning or moving.\nSome operations will just stop instead of pause when running this command.")); break;
                case "/resume":
                case "resume": self.sendMessage(message.chat.id, self.languageGetter('telegram.help.resume',"/resume - will attempt to continue running previously paused operation.")); break;
                case "/spot":
                case "spot": self.sendMessage(message.chat.id, self.languageGetter('telegram.help.spot',"/spot - will start local cleaning at the place where robot is currently located.")); break;
                case "/home":
                case "home": self.sendMessage(message.chat.id, self.languageGetter('telegram.help.home',"/home - will send the robot back to its charging dock.")); break;
                case "/goto":
                case "goto": self.sendMessage(message.chat.id, self.languageGetter('telegram.help.goto',"/goto - will send the robot to target location specified by its name.")); break;
                case "/status":
                case "status": self.sendMessage(message.chat.id, self.languageGetter('telegram.help.status',"/status - will print robot current status.")); break;
                case "/consumables":
                case "consumables": self.sendMessage(message.chat.id, self.languageGetter('telegram.help.consumables',"/consumables - will print current state of consumables timers.")); break;
                case "/map":
                case "map": self.sendMessage(message.chat.id, self.languageGetter('telegram.help.map',"/maps - will send you a simple picture of your house map.")); break;
                case "/power":
                case "power": self.sendMessage(message.chat.id, self.languageGetter('telegram.help.power',"/power - specifies current fan power in range 1 to 100, or special value 105 for mop mode for robot supporting it.\n\n38 - Quiet\n60 - Balanced\n75 - Turbo\n100 - Max (not recommended!)")); break;
                case "/zones":
                case "zones": self.sendMessage(message.chat.id, self.languageGetter('telegram.help.zones',"/zones - will list the configured zones that could be used in zoned cleaning.")); break;
                case "/spots":
                case "spots": self.sendMessage(message.chat.id, self.languageGetter('telegram.help.spots',"/spots - will list the configured spots that could be used as /goto targets.")); break;
                case "/loadmap":
                case "loadmap": self.sendMessage(message.chat.id, self.languageGetter('telegram.help.loadmap',"/loadmap - will try to load speficied map, available only in idle or charging state.")); break;
                case "/maps":
                case "maps": self.sendMessage(message.chat.id, self.languageGetter('telegram.help.maps',"/maps - will list saved maps available for loading.")); break;
                default:
                    var msg = self.languageGetter('telegram.startText',"*Valetudo RE Bot* - supported commands\n\n/start & /help - this help text\n/clean - starts full or zoned cleaning\n/stop - stops cleaning\n/pause - pauses current operation if appropriate\n/resume - unpauses current operation if appropriate\n/spot - starts local cleaning\n/home - sends robot back to charging station\n/goto - instructs the robot to move to specified spot\n/status - sends the current status of your robot\n/consumables - sends the current status of consumables\n/zones - list configured zones ready for zoned cleaning\n/spots - list goto target locations\n/off - disables bot messages for you\n/on - enables bot messages for you");
                    if (this.configuration.get("webInterface").showMultimap) {
                        msg += self.languageGetter('telegram.startTextMultimap',"\n/loadmap - loads selected map\n/maps - lists available maps");
                    }
                    msg += self.languageGetter('telegram.startTextPost',"\n\nType `/help command` to get detailed information.");
                    self.sendMessage(message.chat.id, msg, {parse_mode: "Markdown"});
            }
            break;
        case "/off":
        case "/shutup":
            client = self.clients.find(client => client.id === message.chat.id);
            if (client && !client.silence) {
                client.silence = true;
                saveClients();
            }
            self.sendMessage(message.chat.id, "ok " + '\u{1F507}');
            break;
        case "/on":
        case "/talkagain":
            client = self.clients.find(client => client.id === message.chat.id);
            if (client && client.silence) {
                delete client.silence;
                saveClients();
            }
            self.sendMessage(message.chat.id, "ok " + '\u{1F50A}');
            break;
        case "/clean":
            if ([2,3,8,10].includes(self.lastState.state)) { // todo: in which modes it's possible to start new full cleaning?
                parameters = parameters.join(' ');
                // do full cleaning when no parameters given
                if (!parameters.trim().length) {
                    if (self.sendConsumablesEvery && self.clients.some(client => client.id === message.chat.id && client.silence !== true)) {
                        self.vacuum.getConsumableStatus(function (err, res) {
                            if (err) {
                                console.log(err);
                            } else if (!res.main_brush_work_time || !res.side_brush_work_time || !res.filter_work_time || !res.sensor_dirty_time) {
                                self.sendMessage(message.chat.id, self.languageGetter('telegram.consumablesHeader', "Remaining time until consumables timers expire:\n\n") + self.parseConsumables(res),{parse_mode: "Markdown"});
                                this.lastNotifications.consumables = Date.now();
                            }
                        });
                    }
                    self.vacuum.startCleaning((err, data) => {
                        if (err) {
                            console.log(err);
                            self.sendMessage(message.chat.id, self.languageGetter('telegram.errorReply',"There was an error: {{error}}").replace('{{error}}',err));
                        }
                    });
                    return;
                }
                // try zoned cleaning otherwise
                var zone, zones = [], zoneList = [],
                    zonesAvailable = JSON.parse(JSON.stringify(this.configuration.get("areas")));
                parameters = parameters.split('+');
                for (let times, timesMatch, name, i = 0; i < parameters.length; i++) {
                    times = 0;
                    if (timesMatch = parameters[i].match(/ (?:x|х)([1-9]+)/,'')) {
                        if (timesMatch[1] > 3) {
                            times = 3;
                        } else if (timesMatch[1] < 1) {
                            times = 1;
                        } else {
                            times = +timesMatch[1]; 
                        }
                        parameters[i] = parameters[i].replace(/ (?:x|х)([1-9]+)/,'');
                    }
                    name = parameters[i].trim();
                    if ((zone = zonesAvailable.find(item => item[0].trim().toLowerCase() === name.toLowerCase())) !== undefined) {
                        let msg = '"' + zone[0].trim() + '"';
                        if (times > 0) {
                            zone[1].forEach(subzone => {
                                subzone[4] = times;
                            });
                            msg += ' (x' + times + ')';
                        }
                        zones = zones.concat(zone[1]);
                        zoneList.push(msg);
                    } else {
                        self.sendMessage(message.chat.id, self.languageGetter('telegram.zoneNotFound',"Can't find zone by name \"{{zoneName}}\".")
                            .replace('{{zoneName}}',name)
                        );
                        message.text = "/zones";
                        this.parseMessage(message);
                        return;
                    }
                }
                if (!zones.length) {
                    self.sendMessage(message.chat.id, self.languageGetter('telegram.noZonesSpecified',"You need to specify at least one configured zone name."));
                    return;
                }
                if (zones.length > 5) {
                    self.sendMessage(message.chat.id, self.languageGetter('telegram.tooManyZones',"You speficied too many zones!\nMax allowed - 5, you requested - {{zonesCount}}.")
                        .replace('{{zonesCount}}',zones.length)
                    );
                    return;
                }
                self.sendMessage(message.chat.id,self.languageGetter('telegram.performingZoned',"Going to zoned cleaning:\n{{zoneNames}}").replace('{{zoneNames}}',zoneList.join(', ')));
                if (self.sendConsumablesEvery && self.clients.some(client => client.id === message.chat.id && client.silence !== true)) {
                    self.vacuum.getConsumableStatus(function (err, res) {
                        if (err) {
                            console.log(err);
                        } else if (!res.main_brush_work_time || !res.side_brush_work_time || !res.filter_work_time || !res.sensor_dirty_time) {
                            self.sendMessage(message.chat.id, self.languageGetter('telegram.consumablesHeader', "Remaining time until consumables timers expire:\n\n") + self.parseConsumables(res),{parse_mode: "Markdown"});
                            this.lastNotifications.consumables = Date.now();
                        }
                    });
                }
                self.vacuum.startCleaningZone(zones,function (err, data) {
                    if (err) {
                        console.log(err);
                        self.sendMessage(message.chat.id, self.languageGetter('telegram.errorReply',"There was an error: {{error}}").replace('{{error}}',err));
                    }
                });
            } else {
                self.sendMessage(message.chat.id, self.languageGetter('telegram.commandUnavailable',"This command is unavailable in current device state."));
            }
            break;
        case "/stop":
            if ([1,2,5,12,17].includes(self.lastState.state)) {
                self.vacuum.stopCleaning(function (err, data) {
                    if (err) {
                        console.log(err);
                        self.sendMessage(message.chat.id, self.languageGetter('telegram.errorReply',"There was an error: {{error}}").replace('{{error}}',err));
                    }
                });
            } else if ([6,11,16].includes(self.lastState.state)) {
                self.vacuum.pauseCleaning(function (err, data) {
                    if (err) {
                        console.log(err);
                        self.sendMessage(message.chat.id, self.languageGetter('telegram.errorReply',"There was an error: {{error}}").replace('{{error}}',err));
                    }
                });
            } else {
                self.sendMessage(message.chat.id, self.languageGetter('telegram.commandUnavailable',"This command is unavailable in current device state."));
            }
            break;
        case "/pause":
            if ([5,6,11,16,17].includes(self.lastState.state)) {
                self.vacuum.pauseCleaning(function (err, data) {
                    if (err) {
                        console.log(err);
                        self.sendMessage(message.chat.id, self.languageGetter('telegram.errorReply',"There was an error: {{error}}").replace('{{error}}',err));
                    }
                });
            } else {
                self.sendMessage(message.chat.id, self.languageGetter('telegram.commandUnavailable',"This command is unavailable in current device state."));
            }
            break;
        case "/resume":
            if (self.lastState.state === 10 || (self.lastState.state === 2 && self.lastState.in_cleaning === 2)) {
                if (self.lastState.in_returning === 1) {
                    self.vacuum.driveHome(function (err, data) {
                        if (err) {
                            console.log(err);
                            self.sendMessage(message.chat.id, self.languageGetter('telegram.errorReply',"There was an error: {{error}}").replace('{{error}}',err));
                        }
                    });
                } else if (self.lastState.in_cleaning === 2 && (self.lastState.state === 10 || self.lastState.state === 2)) {
                    self.vacuum.resumeCleaningZone((err, data) => {
                        if (err) {
                            self.sendMessage(message.chat.id, self.languageGetter('telegram.errorReply',"There was an error: {{error}}").replace('{{error}}',err));
                        }
                    });
                } else {
                    self.vacuum.startCleaning((err, data) => {
                        if (err) {
                            self.sendMessage(message.chat.id, self.languageGetter('telegram.errorReply',"There was an error: {{error}}").replace('{{error}}',err));
                        }
                    });
                }
            } else {
                self.sendMessage(message.chat.id, self.languageGetter('telegram.commandUnavailable',"This command is unavailable in current device state."));
            }
            break;
        case "/home":
            if ([2,3,10,12].includes(self.lastState.state)) {
                self.vacuum.driveHome(function (err, data) {
                    if (err) {
                        console.log(err);
                        self.sendMessage(message.chat.id, self.languageGetter('telegram.errorReply',"There was an error: {{error}}").replace('{{error}}',err));
                    }
                });
            } else {
                self.sendMessage(message.chat.id, self.languageGetter('telegram.commandUnavailable',"This command is unavailable in current device state."));
            }
            break;
        case "/power":
            var speed = parseInt(parameters[0]);
            if (!parseInt(speed) || (speed <= 0 || speed > 100) && speed !== 105) {
                self.sendMessage(message.chat.id, self.languageGetter('telegram.wrongPower',"Allowed fan speed could be in range from 1 to 100 (plus special value 105 for mop mode if applicable)."));
                return;
            }
            self.vacuum.setFanSpeed(speed, function (err, data) {
                if (err) {
                    console.log(err);
                    self.sendMessage(message.chat.id, self.languageGetter('telegram.errorReply',"There was an error: {{error}}").replace('{{error}}',err));
                } else {
                    message.text = "/status";
                    self.parseMessage(message);
                    return;
                }
            })
            break;
        case "/zones":
            var zones = this.configuration.get("areas");
            if (!zones.length) {
                self.sendMessage(message.chat.id, self.languageGetter('telegram.noZonesConfigured',"No zones configured yet."));
            } else {
                var msg = self.languageGetter('telegram.zones',"List of available zones:");
                zones.forEach(zone => {
                    msg += self.languageGetter('telegram.zonesElement',"\n* {{zoneName}} (subzones: {{subZonesCount}})")
                        .replace('{{zoneName}}',zone[0])
                        .replace('{{subZonesCount}}',zone[1] && zone[1].length || 0);
                });
                self.sendMessage(message.chat.id, msg);
            }
            break;
        case "/spots":
            var spots = this.configuration.get("spots");
            if (!spots.length) {
                self.sendMessage(message.chat.id, self.languageGetter('telegram.noSpotsConfigured',"No spots configured yet."));
            } else {
                var msg = self.languageGetter('telegram.spots',"List of available spots:");
                spots.forEach(spot => {
                    msg += self.languageGetter('telegram.spotsElement',"\n* {{spotName}} (coords: [{{spotCoords}}])")
                        .replace('{{spotName}}',spot[0])
                        .replace('{{spotCoords}}',spot[1] + ',' + spot[2]);
                });
                self.sendMessage(message.chat.id, msg);
            }
            break;
        case "/goto":
            if ([2,3,8,10,12].includes(self.lastState.state)) {
                parameters = parameters.join(' ').trim();
                if (!parameters.length) {
                    self.sendMessage(message.chat.id, self.languageGetter('telegram.gotoExplanation',"You need to specify a spot name for device to go to:\n/goto Super Spot"));
                    return;
                }
                var spot, spotsAvailable = this.configuration.get("spots");
                if ((spot = spotsAvailable.find(item => item[0].trim().toLowerCase() === parameters.toLowerCase())) === undefined) {
                    self.sendMessage(message.chat.id, self.languageGetter('telegram.spotNotFound',"Can't find spot by name \"{{spotName}}\".")
                        .replace('{{spotName}}',name)
                    );
                    message.text = "/spots";
                    this.parseMessage(message);
                    return;
                }
                self.sendMessage(message.chat.id,self.languageGetter('telegram.performingGoto',"Going to move to \"{{spotName}}\" spot.").replace('{{spotName}}',spot[0]));
                self.vacuum.goTo(spot[1],spot[2],function (err, data) {
                    if (err) {
                        console.log(err);
                        self.sendMessage(message.chat.id, self.languageGetter('telegram.errorReply',"There was an error: {{error}}").replace('{{error}}',err));
                    }
                });
            } else {
                self.sendMessage(message.chat.id, self.languageGetter('telegram.commandUnavailable',"This command is unavailable in current device state."));
            }
            break;
        case "/spot":
            if ([2,3,10].includes(self.lastState.state)) {
                self.vacuum.spotClean(function (err, data) {
                    if (err) {
                        console.log(err);
                        self.sendMessage(message.chat.id, self.languageGetter('telegram.errorReply',"There was an error: {{error}}").replace('{{error}}',err));
                    }
                });
            } else {
                self.sendMessage(message.chat.id, self.languageGetter('telegram.commandUnavailable',"This command is unavailable in current device state."));
            }
            break;
        case "/status":
            self.vacuum.getCurrentStatus(function(err, res) {
                if (!err) {
                    let msg = self.languageGetter('telegram.currentStatus',"Current status: ") + self.languageGetter('robot.states.n' + res.state,Vacuum.GET_STATE_CODE_DESCRIPTION(res.state));
                    if (res.error_code !== 0) {
                        msg += " (" + self.languageGetter('robot.errors.n' + res.error_code,Vacuum.GET_ERROR_CODE_DESCRIPTION(res.error_code)) + ")";
                    }
                    msg += "\n" + self.languageGetter('telegram.power',"Power: ") + (res.fan_power !== 105 ? res.fan_power + "%" : self.languageGetter('telegram.mop',"Mop Mode"));
                    msg += "\n" + self.languageGetter('telegram.battery',"Battery: ") + res.battery + "%";
                    self.sendMessage(message.chat.id, msg);
                    Object.assign(self.lastState, res);
                } else {
                    console.log(err);
                    self.sendMessage(message.chat.id, self.languageGetter('telegram.errorReply',"There was an error: {{error}}").replace('{{error}}',err));
                }
            });
            break;
        case "/consumables":
            self.vacuum.getConsumableStatus(function (err, res) {
                if (err) {
                    console.log(err);
                    self.sendMessage(message.chat.id, self.languageGetter('telegram.errorReply',"There was an error: {{error}}").replace('{{error}}',err));
                } else {
                    self.sendMessage(message.chat.id, self.languageGetter('telegram.consumablesHeader', "Remaining time until consumables timers expire:\n\n") + self.parseConsumables(res),{parse_mode: "Markdown"});
                }
            });
            break;
        case "/map":
            if (!self.map.bin) {
                self.sendMessage(message.chat.id, self.languageGetter('telegram.noMapAvailable',"Sorry, the map is currently unavailable."));
                return;
            }
            SimpleMapDrawer.drawMap({gzippedMap: self.map.bin},(err,data) => {
                if (err || !data) {
                    console.log(err);
                    self.sendMessage(message.chat.id, self.languageGetter('telegram.noMapAvailable',"Sorry, the map is currently unavailable."));
                } else {
                    self.slimbot._request('sendPhoto', {chat_id: message.chat.id}, {photo: { value: data, options: { filename: 'map.png' }}}, self.slimbotCatcher);
                }
            });
            break;
        case "/loadmap":
            if ([3,8].includes(self.lastState.state)) {
                parameters = parameters.join(' ').trim();
                if (!parameters.length) {
                    self.sendMessage(message.chat.id, self.languageGetter('telegram.loadmapExplanation',"You need to specify a name for the map to load:\n/loadmap First Floor"));
                    return;
                }
                var mapName;
                new Promise((resolve,reject) => {
                    MapManager.listStoredMaps((err, maps) => {
                        if (err) reject(err);
                        if (!maps.length) {
                            self.sendMessage(message.chat.id, self.languageGetter('telegram.noMapsStored',"No maps stored yet."));
                            reject("cancel");
                        }
                        if ((mapName = maps.find(item => item.trim().toLowerCase() === parameters.toLowerCase())) === undefined) {
                            self.sendMessage(message.chat.id, self.languageGetter('telegram.mapNotFound',"Can't find map by name \"{{mapName}}\".")
                                .replace('{{mapName}}',parameters)
                            );
                            message.text = "/maps";
                            this.parseMessage(message);
                            reject("cancel");
                        }
                        resolve();
                    });
                })
                .then(res => new Promise((resolve,reject) => {
                    MapManager.loadMap(mapName, function (err, data) {
                        if (err) reject(err);
                        resolve();
                    });
                }))
                .then(res => {
                    if (self.lastState['lab_status'] === 1) {
                        return new Promise((resolve,reject) => {
                            setTimeout(() => self.vacuum.startCleaning(function (err, data2) {
                                if (err) reject(err);
                                resolve();
                            }),1e3);
                        })
                        .then(res => new Promise((resolve,reject) => {
                            setTimeout(() => self.vacuum.stopCleaning(function (err, data2) {
                                if (err) reject(err);
                                resolve();
                            }),2e3);
                        }))
                        .then(res => {
                            self.sendMessage(message.chat.id, self.languageGetter('telegram.mapLoadOK',"Map should be reloaded now."));
                        });
                    } else {
                        self.sendMessage(message.chat.id, self.languageGetter('telegram.mapLoadWait',"Map should be reloaded in 30 seconds."));
                        exec("/bin/sleep 2 && /sbin/restart rrwatchdoge");
                    }
                })
                .catch(err => {
                    if (err !== "cancel") self.sendMessage(message.chat.id, self.languageGetter('telegram.errorReply',"There was an error: {{error}}").replace('{{error}}',err));
                });
            } else {
                self.sendMessage(message.chat.id, self.languageGetter('telegram.commandUnavailable',"This command is unavailable in current device state."));
            }
            break;
        case "/maps":
            MapManager.listStoredMaps((err, maps) => {
                if (err) {
                    self.sendMessage(message.chat.id, self.languageGetter('telegram.errorReply',"There was an error: {{error}}").replace('{{error}}',err));
                    return;
                }
                if (!maps.length) {
                    self.sendMessage(message.chat.id, self.languageGetter('telegram.noMapsStored',"No maps stored yet."));
                    return;
                }
                var msg = self.languageGetter('telegram.maps',"List of stored maps:");
                maps.forEach(map => {
                    msg += self.languageGetter('telegram.mapsElement',"\n* {{mapName}}").replace('{{mapName}}',map);
                });
                self.sendMessage(message.chat.id, msg);
            });
            break;
        default:
            self.sendMessage(message.chat.id, "Unknown command.");
            break;
    }
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

Telegrambot.prototype.sendMessage = function(recipient,text,params) {
    if (this.slimbot) {
        this.slimbot.sendMessage(recipient, text, params, this.slimbotCatcher);
    }
}

Telegrambot.prototype.getStatus = function() {
    if (!this.runningState) {
        return this.botname;
    }
    return this.runningState
}

module.exports = Telegrambot;
