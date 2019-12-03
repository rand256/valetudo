const Slimbot = require('slimbot');
const Request = require('request-promise');
const Vacuum = require("./miio/Vacuum");

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

    this.language = require('../client/locales/en.json');
    this.lastState = {state: -1, error: 0};

    this.slimbot = null;
    this.running = false;
    this.initiate();

    this.events.on("miio.consume_material_notify", (statusData) => {
        console.log('tg consumables notify',statusData);
        if (self.slimbot !== null && self.sendConsumables) {
            self.clients.forEach(client => {
                if (!client.silence) {
                    self.slimbot.sendMessage(client.id, statusData);
                }
            });
        }
    });
    this.events.on("miio.bin_full", (statusData) => {
        console.log('tg bin full',statusData);
        // if (!this.slimbot) return;
        // self.clients.forEach(function (client) {
        //     if(!self.shutup)
        //         self.slimbot.sendMessage(client.id, statusData);
        // });
    });
    this.events.on("miio.status", (statusData) => {
        if (self.slimbot !== null && self.lastState.state >= 0 && (self.lastState.state !== statusData.state || self.lastState.error !== statusData.error_code)) {
            self.clients.forEach(client => {
                if (!client.silence) {
                    let msg = self.language.robot.states['n' + statusData.state];
                    if (statusData.error_code !== 0) {
                        res += " " + self.language.robot.states['n' + statusData.error_code];
                    }
                    self.slimbot.sendMessage(client.id, statusData);
                }
            });
        }
        self.lastState = {
            state: statusData.state,
            error: statusData.error_code
        }
    });
}

Telegrambot.prototype.initiate = function() {
    const self = this;

    if (this.slimbot) this.slimbot.stopPolling();
    this.slimbot = null;

    let token = this.configuration.get("telegramBot").token;
    if (!token) {
        return;
    }

    this.botname = "";
    this.running = false;

    this.clients = this.configuration.get("telegramBot").clients || [];
    this.password = this.configuration.get("telegramBot").password;
    this.sendConsumables = this.configuration.get("telegramBot").sendConsumables;
    this.sendConsumablesEvery = this.configuration.get("telegramBot").sendConsumablesEvery;

    this.slimbot = new Slimbot(token);
    this.slimbot.on('message', message => {
        let text = message.text.split(' ');
        let client, variables = text.slice(1);
        const authFailed = function() {
            if (!self.clients.some(client => client.id === message.chat.id)) {
                self.slimbot.sendMessage(message.chat.id, self.language.telegram.notauthenticated);
                return 1;
            }
            return 0;
        };
        const saveClients = function() {
            let telegramBotCfg = self.configuration.get("telegramBot");
            telegramBotCfg.clients = self.clients;
            self.configuration.set("telegramBot", telegramBotCfg);
        };
        switch (text[0]) {
            case '/setme':
                let password = variables.join(' ').trim();
                if (!password === '' && self.password.length > 0) {
                    self.slimbot.sendMessage(message.chat.id, self.language.telegram.passwordnotgiven);
                } else if (password.toString() !== self.password.toString()) {
                    self.slimbot.sendMessage(message.chat.id, self.language.telegram.passwordwrong);
                } else {
                    if (!self.clients.some(client => client.id === message.chat.id)) {
                        self.clients.push(message.chat);
                        saveClients();
                        self.slimbot.sendMessage(message.chat.id, self.language.telegram.clientauthorized);
                    } else {
                        self.slimbot.sendMessage(message.chat.id, self.language.telegram.clientalreadyauthorized);
                    }
                }
                break;
            case "/help":
            case "/start":
                if (authFailed()) return 0;
                self.slimbot.sendMessage(message.chat.id, self.language.telegram.starttext);
                break;
            case "/off":
            case "/shutup":
                if (authFailed()) return 0;
                client = self.clients.find(client => client.id === message.chat.id);
                if (client && !client.silence) {
                    client.silence = true;
                    saveClients();
                }
                self.slimbot.sendMessage(message.chat.id, "ok " + '\u{1F622}' + '\u{1F64A}');
                break;
            case "/on":
            case "/talkagain":
                if (authFailed()) return 0;
                client = self.clients.find(client => client.id === message.chat.id);
                if (client && client.silence) {
                    delete client.silence;
                    saveClients();
                }
                self.slimbot.sendMessage(message.chat.id, "ok " + '\u{1F50A}');
                break;
            case "/clean":
                if (authFailed()) return 0;
                if (self.lastState.state === 10 || self.lastState.state === 2) {
                    self.vacuum.resumeCleaningZone((err, data) => {
                        if (err) {
                            self.slimbot.sendMessage(message.chat.id, err);
                            console.log(err);
                        }
                    });
                } else {
                    self.vacuum.startCleaning((err, data) => {
                        if (err) {
                            self.slimbot.sendMessage(message.chat.id, err);
                            console.log(err);
                        }
                    });
                }
                if (this.sendConsumablesEvery && self.clients.some(client => client.id === message.chat.id && client.silence !== true)) {
                    self.vacuum.getConsumableStatus(function (err, data2) {
                        if (data2.main_brush_work_time > 0 && data2.side_brush_work_time  > 0 && data2.filter_work_time > 0 && data2.sensor_dirty_time > 0) return;
                        var consum = self.language.telegram.consumables.replace("$1",(Math.max(0, 300 - (data2.main_brush_work_time / 60 / 60))).toFixed(1)).replace("$2",
                        (Math.max(0, 200 - (data2.side_brush_work_time / 60 / 60))).toFixed(1)).replace("$3",
                        (Math.max(0, 150 - (data2.filter_work_time / 60 / 60))).toFixed(1)).replace("$4",
                        (Math.max(0, 30 - (data2.sensor_dirty_time / 60 / 60))).toFixed(1));
                        if (err) {
                            console.log(err);
                        } else {
                            self.slimbot.sendMessage(message.chat.id, consum);
                        }
                    });
                }
                break;
            case "/stop":
                if (authFailed()) return 0;
                if (self.lastState.state == 5 || self.lastState.state == 11){
                    self.vacuum.pauseCleaning(function (err, data) {
                        if (err) {
                            self.slimbot.sendMessage(message.chat.id, err);
                            console.log(err);
                        }
                    });
                }else { 
                    self.vacuum.stopCleaning(function (err, data) {
                        if (err) {
                            self.slimbot.sendMessage(message.chat.id, err);
                            console.log(err);
                        }
                    });
                }
                break;
            case "/home":
                if (authFailed()) return 0;
                // todo: check conditions
                self.vacuum.driveHome(function (err, data) {
                    if (err) {
                        self.slimbot.sendMessage(message.chat.id, err);
                        console.log(err);
                    }
                });
                break;
            case "/status":
                if (authFailed()) return 0;
                self.vacuum.getCurrentStatus(function(emtyvar, res){
                    //console.log(res);
                    var msg = self.language.robot.states['n' + res.state];
                    if (res.error_code != 0)
                        msg += " " + self.language.robot.states['n' + res.error_code];
                    self.slimbot.sendMessage(message.chat.id, msg);
                });
                break;
            case "/consumables":
                if (authFailed()) return 0;
                self.vacuum.getConsumableStatus(function (err, data2) {
                    var consum = self.language.telegram.consumables.replace("$1",(Math.max(0, 300 - (data2.main_brush_work_time / 60 / 60))).toFixed(1)).replace("$2",
                    (Math.max(0, 200 - (data2.side_brush_work_time / 60 / 60))).toFixed(1)).replace("$3",
                    (Math.max(0, 150 - (data2.filter_work_time / 60 / 60))).toFixed(1)).replace("$4",
                    (Math.max(0, 30 - (data2.sensor_dirty_time / 60 / 60))).toFixed(1));
                    if (err) {
                        console.log(err);
                    }else {
                        self.slimbot.sendMessage(message.chat.id, consum);
                    }
                });
                break;
            default:
                if (authFailed()) return 0;
                self.slimbot.sendMessage(message.chat.id, "unknown command");
                break;
        }
    });
    // Call API
    this.slimbot.startPolling();
    /*Request({ uri: 'https://api.telegram.org/bot' + token + '/getMe' }).then(resp => {
        let result = JSON.parse(resp);
        this.botname = result.result.username;
        this.running = true;
    }).catch(error => {
        console.error('telegramBot error:', error);
    });*/
}

Telegrambot.prototype.getStatus = function() {
    if (!this.running)
        return "Telegrambot not running";
    else
        return "Telegrambot connected as " + this.botname;
}

module.exports = Telegrambot;