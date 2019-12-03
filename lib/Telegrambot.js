const Slimbot = require('slimbot');
const Agent = require('socks5-https-client/lib/Agent');
const Request = require('request-promise');
const Vacuum = require("./miio/Vacuum");

// hack for handling bad proxies: see https://github.com/mattcg/socks5-https-client/issues/21
class SlimbotProxyWorkaround extends Slimbot {
  _request(method, params, formData) {
    if (arguments.length === 0 || typeof arguments[0] !== 'string') {
      throw new Error('Please provide method as a string');
    }

    // the 2nd, 3rd or 4th argument could be a callback
    let callback;
    if (typeof arguments[3] == 'function') {
      callback = arguments[3];
    } else if (typeof arguments[2] == 'function') {
      callback = arguments[2];
      formData = null;
    } else if (typeof arguments[1] == 'function') {
      callback = arguments[1];
      params = null;
    }

    let options = {
      uri: 'https://api.telegram.org/bot' + this._token + '/' + method,
      qs: params,
      formData: formData,
      simple: false,
      resolveWithFullResponse: true,
      forever: true
    };

    if(this._useProxy){
      options.strictSSL = true;
      options.agentClass = Agent;
      options.agentOptions = {
        socksHost: this._proxy.socksHost,
        socksPort: this._proxy.socksPort
      };
      options.pool = {maxSockets: Infinity}; // we can get stuck with the broken proxy otherwise
      if(this._proxy.socksUsername && this._proxy.socksPassword){
        options.agentOptions.socksUsername = this._proxy.socksUsername;
        options.agentOptions.socksPassword = this._proxy.socksPassword;
      }
    }

    return Request(options)
    .then(resp => {
      if (resp.statusCode !== 200) {
        throw new Error(resp.statusCode + ':\n'+ resp.body);
      }

      let updates = JSON.parse(resp.body);

      if (updates.ok) {
        if (callback) { 
          callback(null, updates);
        }

        return updates;
      }
      return null;
    })
    .catch(error => {
      if (callback) {
        callback(error);
      }
      else {
        throw error;
      }
    });
  }
}
// end of telegram.js copy-paste

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
    this.lastState = {state: -1, error_code: 0, in_cleaning: 0, in_returning: 0}; // todo: update on first start
    if (process.env.VAC_MODEL) {
        this.lastState = {state: 8, error_code: 0, in_cleaning: 0, in_returning: 0}; // for development
        this.debugLogging = true;
    }

    this.language = require('../client/locales/en.json');
    this.lastState = {state: -1, error: 0};

    this.slimbot = null;
    this.slimbotCatcher = function(error) {
        if (error === null) return;
        self.runningState = 3;
        if (self.slimbot && self.slimbot._useProxy && ++self.connectFailCount > 10) {
            console.error('too many connection failures in a row, probably the proxy has died. stopping...');
            if (self.slimbot && self.slimbot._timeout) {
                self.slimbot._timeout.stop();
                self.runningState = 2;
            }
            self.slimbot = null;
            self.configuration.get("telegramBot").enabled = false;
        }
        console.error('tgBot polling error:', error.message ? error.message : error);
    };
    this.slimbotRefresher = function(slimbot,catcher) {
        this._timeout = 0;
        this._timeout2 = 0;
        this._stopped = false;
        this._key = Math.random();
        this.start = function() {
            self.debugLogging && console.log(new Date(), this._key, 'called start');
            this._stopped = false;
            this.poll();
        };
        this.stop = function() {
            self.debugLogging && console.log(new Date(), this._key, 'called stop');
            this._stopped = true;
            self.runningState = 1;
            clearTimeout(this._timeout);
            clearTimeout(this._timeout2);
        };
        this.poll = function() {
            self.debugLogging && console.log(new Date(), this._key, 'called poll');
            if (!this._stopped && slimbot) {
                this._timeout2 = setTimeout(() => this.reset(), 120e3); // poll deadline timer
                slimbot.startPolling(catcher);
            }
        };
        this.getName = function() {
            self.debugLogging && console.log(new Date(), this._key, 'called getName');
            if (!slimbot) return;
            slimbot.getMe(function(err,res) {
                if (!err && res.ok && res.result && res.result.username) {
                    self.runningState = 0;
                    self.botname = res.result.username;
                } else {
                    self.runningState = 1;
                }
            });
        };
        this.reset = function() {
            self.debugLogging && console.log(new Date(), this._key, 'called reset');
            this.stop();
            if (slimbot) {
                self.slimbot._timeout = new self.slimbotRefresher(self.slimbot,self.slimbotCatcher);
                self.slimbot._timeout.start();
            }
        };
        this.refresh = function() {
            self.debugLogging && console.log(new Date(), this._key, 'called refresh');
            clearTimeout(this._timeout2);
            if (!this._stopped) {
                if (self.runningState) {
                    self.runningState--;
                }
                if (!self.runningState) {
                    self.connectFailCount = 0;
                }
                if (!self.botname) {
                    this.getName();
                }
                this._timeout = setTimeout(() => this.poll(), 5e3);
            }
        };
    };
    this.runningState = 1; // 0 - connected, 1 - disconnected, 2 - connection error
    this.connectFailCount = 0;
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

    if (this.slimbot && this.slimbot._timeout) {
        this.slimbot._timeout.stop();
    }
    this.slimbot = null;

    let token = this.configuration.get("telegramBot").token;
    if (!token) {
        return;
    }

    this.botname = "";
    this.runningState = 1;

    this.clients = this.configuration.get("telegramBot").clients || [];
    this.password = this.configuration.get("telegramBot").password;
    this.sendConsumables = this.configuration.get("telegramBot").sendConsumables;
    this.sendConsumablesEvery = this.configuration.get("telegramBot").sendConsumablesEvery;

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

    this.slimbot = new SlimbotProxyWorkaround(token, proxyObj.socksHost ? proxyObj : undefined);
    this.slimbot._timeout = new this.slimbotRefresher(this.slimbot,this.slimbotCatcher);
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

    this.slimbot._timeout.start();
}

Telegrambot.prototype.getStatus = function() {
    if (!this.runningState) {
        return this.botname;
    }
    return this.runningState
}

module.exports = Telegrambot;
