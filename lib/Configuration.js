const fs = require("fs");
const Tools = require("./Tools");
const path = require("path");

/**
 * @constructor
 */
const Configuration = function() {
	this.location = process.env.VALETUDO_CONFIG ? process.env.VALETUDO_CONFIG : "/mnt/data/valetudo/config.json";
	this.settings = {
		"spots": [],
		"areas": [],
		"timers": [],
		"ztimers": [],
		"mqtt" : {
			enabled: false,
			identifier: "rockrobo",
			deviceName: "vacuum",
			topicPrefix: "valetudo",
			autoconfPrefix: "homeassistant",
			broker_url: "mqtt://user:pass@foobar.example",
			provideMapData: true,
			caPath: "",
			qos: 0
		},
		"dummycloud": {
			spoofedIP: "203.0.113.1",
			bindIP: "127.0.0.1"
		},
		"system": {},
		"ntpd": {
			disabled: false,
			server: "pool.ntp.org"
		},
		"webInterface": {
			localization: "en",
			hideMapReload: true,
			style: ""
		},
		"httpAuth": {
			enabled: false,
			username: "valetudo",
			password: "valetudo"
		},
		"telegramBot": {
			enabled: false,
			token: "",
			password: "",
			host: "",
			proxy: "",
			clients: [],
			sendConsumables: true,
			sendConsumablesEvery: false
		},
		"allowSSHKeyUpload": true,
		"map_upload_host": "http://127.0.0.1"
	};

	/* load an existing configuration file. if it is not present, create it using the default configuration */
	if (fs.existsSync(this.location)) {
		console.log(new Date(), "Loading configuration file:", this.location);
		try {
			this.settings = Object.assign(this.settings, JSON.parse(fs.readFileSync(this.location)));
			this.persist();
		} catch(e) {
			console.error(e);
			console.log("Configuration file is malformed! Fix it or delete the file to get it recreated from scratch.");
			process.exit(1);
		}
	} else {
		console.log(new Date(), "No configuration file present. Creating one at:", this.location);
		Tools.MK_DIR_PATH(path.dirname(this.location));
		this.persist();
	}
};


/**
 *
 * @param key {string}
 * @returns {*}
 */
Configuration.prototype.get = function(key) {
	return this.settings[key];
};

Configuration.prototype.getAll = function() {
	return this.settings;
};

/**
 *
 * @param key {string}
 * @param val {string}
 */
Configuration.prototype.set = function(key, val) {
	this.settings[key] = val;

	this.persist();
};

Configuration.prototype.persist = function() {
	fs.writeFileSync(this.location, JSON.stringify(this.settings, null, 2));
};

module.exports = Configuration;
