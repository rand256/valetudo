"use strict";
const Slimbot = require('slimbot');
const Request = require('request-promise');
const Vacuum = require("./miio/Vacuum");

/**
 * @param options {object}
 * @param options.sendconsumables {boolean}
 * @param options.sendconsumablesevery {boolean}
 * @param options.telegramtoken {string}
 * @param options.clients {array}
 * @param options.password {string}
 * @constructor
 */
const Telegrambot = function (options) {
    const self = this;
    this.slimbot = null;
    this.running = 0;
    this.events = options.events;
    this.vacuum = options.vacuum;
    this.configuration = options.configuration;
    this.initiate();
    this.laststate = {state: 0, error:0}
    this.shutup = false;

    this.events.on("miio.bin_full", (statusData) => {
        // console.log(statusData);
        // if (!this.slimbot) return;
        // self.clients.forEach(function (client) {
        //     if(!self.shutup)
        //         self.slimbot.sendMessage(client.id, statusData);
        // });
    });
    this.events.on("miio.status", (statusData) => {
        if ((self.laststate.state == statusData.state && self.laststate.error == statusData.error_code) || self.shutup) return;
        var res = self.language.robot.states['n' + statusData.state];
        if (statusData.error_code != 0)
            res += " " + self.language.robot.states['n' + statusData.error_code];
        if (self.slimbot == null) return;
        self.laststate.state = statusData.state;
        self.laststate.error = statusData.error_code;
        self.clients.forEach(function (client) {
            self.slimbot.sendMessage(client.id, res);
        });
    });
}

Telegrambot.prototype.initiate = function() {
    const self = this;
    if (this.slimbot) this.slimbot.stopPolling();
    this.slimbot = null;
    var telegramtoken = this.configuration.get("telegram_token");
    if (!telegramtoken) return;
    this.botname = "";
    this.running = 0;
    this.language = require('../client/locales/en.json');
    
    Request({ uri: 'https://api.telegram.org/bot' + telegramtoken + '/getMe' }).then(resp => {
        var result = JSON.parse(resp);
        this.botname = result.result.username;
        this.running = 1;
    }).catch(error => {
        throw error;
    });
    this.clients = this.configuration.get("telegram_clients");
    this.password = this.configuration.get("telegram_password");
    this.sendconsumables = this.configuration.get("telegram_send_consumables");
    this.sendconsumablesevery = this.configuration.get("telegram_send_consumables_every") ;

    if (this.running==1) return;
    this.slimbot = new Slimbot(telegramtoken);
    this.slimbot.on('message', message => {
        if (message.text.length >= 6 && message.text.substr(0, 6) == "/setme"){
            if (message.text.length == 6 && this.password.length != 0)
                self.slimbot.sendMessage(message.chat.id, self.language.telegram.passwordnotgiven);
            else if (message.text.replace("/setme","").trim() != this.password)
                self.slimbot.sendMessage(message.chat.id, self.language.telegram.passwordwrong);
            else if (message.text.replace("/setme","").trim() == this.password){
                if (!this.clients) this.clients = [];
                var found = false;
                this.clients.forEach(function (client, index, object) {
                    if (client.id == message.chat.id) found = true;
                });
                if (!found){
                    this.clients.push(message.chat);
                    self.configuration.set("telegram_clients", this.clients);
                    self.slimbot.sendMessage(message.chat.id, self.language.telegram.clientauthorized);
                } else
                    self.slimbot.sendMessage(message.chat.id, self.language.telegram.clientalreadyauthorized);
            }
        } else if (!this.clients || !this.clients.find(o => o.id === message.chat.id)){
            self.slimbot.sendMessage(message.chat.id, self.language.telegram.notauthenticated);
        } else if (message.text == "/help" || message.text == "/start")
            self.slimbot.sendMessage(message.chat.id, self.language.telegram.starttext);
        else if (message.text == "/clean"){
            if (self.laststate.state === 10 || self.laststate.state === 2) {
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
            if (this.sendconsumablesevery){
                self.vacuum.getConsumableStatus(function (err, data2) {
                    if (data2.main_brush_work_time > 0 && data2.side_brush_work_time  > 0 && data2.filter_work_time > 0 && data2.sensor_dirty_time > 0) return;
                    var consum = self.language.telegram.consumables.replace("$1",(Math.max(0, 300 - (data2.main_brush_work_time / 60 / 60))).toFixed(1)).replace("$2",
                    (Math.max(0, 200 - (data2.side_brush_work_time / 60 / 60))).toFixed(1)).replace("$3",
                    (Math.max(0, 150 - (data2.filter_work_time / 60 / 60))).toFixed(1)).replace("$4",
                    (Math.max(0, 30 - (data2.sensor_dirty_time / 60 / 60))).toFixed(1));
                    if (err) {
                        console.log(err);
                    }else {
                        if(!self.shutup) self.slimbot.sendMessage(message.chat.id, consum);
                    }
                });
            }
        } else if (message.text == "/stop"){
            if (self.laststate.state == 5 || self.laststate.state == 11){
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
        }  else if (message.text == "/shutup"){
            self.shutup = true;
            self.slimbot.sendMessage(message.chat.id, "ok " + '\u{1F622}' + '\u{1F64A}');
        }  else if (message.text == "/talkagain"){
            self.shutup = false;
            self.slimbot.sendMessage(message.chat.id, "ok " + '\u{1F50A}');
        } else if (message.text == "/home"){
            self.vacuum.driveHome(function (err, data) {
                if (err) {
                    self.slimbot.sendMessage(message.chat.id, err);
                    console.log(err);
                }
            });
        } else if (message.text == "/status"){
            self.vacuum.getCurrentStatus(function(emtyvar, res){
                //console.log(res);
                var msg = self.language.robot.states['n' + res.state];
                if (res.error_code != 0)
                    msg += " " + self.language.robot.states['n' + res.error_code];
                self.slimbot.sendMessage(message.chat.id, msg);
            });
        }else if (message.text == "/consumablesstatus"){
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
        }
    });
    
    // Call API
    
    this.slimbot.startPolling();
}
Telegrambot.prototype.get_status = function(){
    if (this.running == 0)
    return "Telegram token empty";
else if (this.running == 1)
    return "Telegram connected as " + this.botname;
    return this.running;
}

module.exports = Telegrambot;