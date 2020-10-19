const fs = require("fs");
const Vacuum = require("./miio/Vacuum");
const Dummycloud = require("./miio/Dummycloud");
const Webserver = require("./webserver/WebServer");
const MqttClient = require("./MqttClient");
const Configuration = require("./Configuration");
const EventEmitter = require('events');
const SSHManager = require('./SSHManager');
const Telegrambot = require('./Telegrambot');
const MapManager = require('./MapManager');
const CronScheduler = require('./CronScheduler');

const Valetudo = function() {
	this.configuration = new Configuration();
	this.address = process.env.VAC_ADDRESS ? process.env.VAC_ADDRESS : "127.0.0.1";
	this.events = new EventEmitter();

	this.model = Valetudo.VACUUM_MODEL_PROVIDER();
	this.cloudKey = Valetudo.CLOUD_KEY_PROVIDER();
	this.deviceId = Valetudo.DEVICE_ID_PROVIDER();

	if(process.env.VAC_TOKEN) {
		this.tokenProvider = function() {
			return Buffer.from(process.env.VAC_TOKEN, "hex");
		}
	} else {
		this.tokenProvider = Valetudo.NATIVE_TOKEN_PROVIDER;
	}

	this.webPort = process.env.VAC_WEBPORT ? parseInt(process.env.VAC_WEBPORT) : 80;
	this.sslPort = process.env.VAC_SSL_PORT ? parseInt(process.env.VAC_SSL_PORT) : 443;
	this.sslCert = process.env.VAC_SSL_CERT ? process.env.VAC_SSL_CERT : "/mnt/data/valetudo/cert.pem";
	this.sslKey = process.env.VAC_SSL_KEY ? process.env.VAC_SSL_KEY : "/mnt/data/valetudo/key.pem";
	this.map = {snapshots: [], bin: null, hash: null};

	this.createInstance = function(type,enabled) {
		enabled = enabled || enabled === undefined;
		switch(type) {
			case "tgbot":
				this.telegramBot = enabled ? new Telegrambot(this) : null;
				break;
			case "cron":
				this.cronScheduler = enabled ? new CronScheduler(this) : null;
				break;
			case "mqtt":
				this.mqttClient = enabled ? new MqttClient(this) : null;
				break;
		}
	}

	this.dummycloud = new Dummycloud(this);
	this.vacuum = new Vacuum(this);
	this.sshManager = new SSHManager();
	this.mapManager = new MapManager(this);

	this.createInstance("mqtt", this.configuration.get("mqtt").enabled);
	this.createInstance("cron", this.configuration.get("ztimers").length && this.configuration.get("ztimers").some(zt => zt[0]));
	this.createInstance("tgbot", this.configuration.get("telegramBot").enabled && !!this.configuration.get("telegramBot").token);

	this.webserver = new Webserver(this);
};

function readValueFromDeviceConf(key) {
	let deviceConf;
	try {
		deviceConf = fs.readFileSync("/mnt/default/device.conf");
	} catch(e) {
		console.error(e);
	}
	if(deviceConf) {
		const value = deviceConf.toString().match(new RegExp("^"+ key + "=(.*)$", "m"));
		if(Array.isArray(value) && value[1]) {
			return value[1];
		} else {
			console.error("Failed to fetch " + key + " from device.conf");
		}
	} else {
		console.error("Failed to read device.conf");
	}
}

Valetudo.NATIVE_TOKEN_PROVIDER = function() {
	const token = fs.readFileSync("/mnt/data/miio/device.token");
	if (token && token.length >= 16) {
		return token.slice(0,16);
	} else {
		throw new Error("Unable to fetch token")
	}
};

Valetudo.CLOUD_KEY_PROVIDER = function() {
	if (process.env.VAC_CLOUDKEY) {
		return process.env.VAC_CLOUDKEY;
	} else {
		const cloudKey = readValueFromDeviceConf("key");
		return cloudKey ? cloudKey : "0000000000000000"; //This doesnt work but it wont crash the system
	}
};

Valetudo.DEVICE_ID_PROVIDER = function() { //TODO: merge with CLOUD_KEY_PROVIDER
	if (process.env.VAC_DID) {
		return process.env.VAC_DID;
	} else {
		const did = readValueFromDeviceConf("did");
		return did ? did: "00000000"; //This doesnt work but it wont crash the system
	}
};

Valetudo.VACUUM_MODEL_PROVIDER = function() {
	if (process.env.VAC_MODEL) {
		return process.env.VAC_MODEL;
	} else {
		const model = readValueFromDeviceConf("model");
		return model ? model : "rockrobo.vacuum.v1";
	}
};

module.exports = Valetudo;
