const path = require("path");
const fs = require("fs");
const { exec } = require("child_process");
const os = require('os'); 

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
	this.version = Valetudo.VERSION_PROVIDER();

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

	this.syncTime = function(retry) {
		retry = retry || 0;
		return new Promise((resolve,reject) => {
			const timesync = this.configuration.get('ntpd');
			if (!timesync.disabled && os.userInfo().uid === 0) {
				let cmd = null;
				if (fs.existsSync("/usr/sbin/ntpd")) {
					cmd = '/usr/sbin/ntpd -n -q -p ';
				} else if (fs.existsSync("/usr/sbin/ntpdate")) {
					cmd = '/usr/sbin/ntpdate -b -u -p 2 ';
				} else {
					resolve();
					return;
				}
				exec(cmd + (timesync.server || 'pool.ntp.org'), (error, stdout, stderr) => {
					if (/Alarm clock|timed out waiting|delay .*? is too high/.test(stdout + stderr)) {
						if (retry < 3) {
							console.log(new Date(), "timesync: retry");
							setTimeout(() => {
								this.syncTime(retry+1).then(res => resolve(res));
							},900);
							return;
						} else {
							console.log(new Date(), "timesync: giving up");
						}
					} else if (error) {
						console.error(new Date(),"timesync error:", error);
					} else {
						console.log(new Date(),"timesync:", stderr.trim() || stdout.trim() || "ok");
					}
					resolve();
				});
			} else {
				resolve();
			}
		});
	};

	this.syncTime().then(res => {
		this.dummycloud = new Dummycloud(this);
		this.vacuum = new Vacuum(this);
		this.sshManager = new SSHManager();
		this.mapManager = new MapManager(this);

		this.createInstance("mqtt", this.configuration.get("mqtt").enabled);
		this.createInstance("cron", this.configuration.get("ztimers").length && this.configuration.get("ztimers").some(zt => zt[0]) || this.configuration.get("timers").length && this.configuration.get("timers").some(t => t[0]));
		this.createInstance("tgbot", this.configuration.get("telegramBot").enabled && !!this.configuration.get("telegramBot").token);

		this.webserver = new Webserver(this);
	});
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

Valetudo.VERSION_PROVIDER = function() {
	let packageContent = fs.readFileSync(path.join(__dirname, "..") + '/package.json');
	if (packageContent) {
		packageContent = JSON.parse(packageContent);
		return packageContent.version + (packageContent.versionSuffix || '');
	}
	return '0.0.0';
};

module.exports = Valetudo;
