const fs = require("fs");
const { exec } = require("child_process");

const slotNameRegex = /^[a-zа-яё0-9\-_\ ]+$/i;
const requiredFiles = ['last_map'];
const optionalFiles = ['ChargerPos.data', 'PersistData_1.data'];
const cleanedFiles = ['StartPos.data', 'user_map0', 'user_map1', 'user_map2', 'user_map3', 'PersistData_2.data', 'PersistData_3.data', 'PersistData_4.data', 'PersistData_5.data'];

const MapManager = function(options) {
	this.configuration = options.configuration;
	this.vacuum = options.vacuum;
	this.events = options.events;
};

MapManager.prototype.storeMap = function(name, callback) {
	try {
		name = name.trim();
		if (!slotNameRegex.test(name)) {
			throw "invalid name";
		}
		requiredFiles.forEach((file) => {
			if (!fs.existsSync("/mnt/data/rockrobo/" + file)) {
				throw "required file '" + file + "' doesn't seem to exist";
			}
		});
		if (!fs.existsSync("/mnt/data/valetudo/maps/" + name)) {
			fs.mkdirSync("/mnt/data/valetudo/maps/" + name, {recursive: true});
		}
		requiredFiles.forEach((file) => {
			fs.copyFileSync("/mnt/data/rockrobo/" + file, "/mnt/data/valetudo/maps/" + name + "/" + file);
		});
		optionalFiles.forEach((file) => {
			if (fs.existsSync("/mnt/data/rockrobo/" + file)) {
				fs.copyFileSync("/mnt/data/rockrobo/" + file, "/mnt/data/valetudo/maps/" + name + "/" + file);
			} else if (fs.existsSync("/mnt/data/valetudo/maps/" + name + "/" + file)) {
				fs.unlinkSync("/mnt/data/valetudo/maps/" + name + "/" + file);
			}
		});
		const currentOpts = {
			zones: this.configuration.get("areas"),
			spots: this.configuration.get("spots")
		};
		fs.writeFileSync("/mnt/data/valetudo/maps/" + name + "/valetudo.json",JSON.stringify(currentOpts));
		callback(null);
	} catch(e) {
		callback(e);
	}
};
MapManager.prototype.loadMap = function(name, callback) {
	const self = this;
	new Promise((resolve,reject) => {
		self.vacuum.getCurrentStatus(function (err, data) {
			if (err) {
				return reject(err.toString());
			}
			if (!(data.state === 3 || data.state === 8 || (data.state === 2 && data.in_cleaning === 0))) {
				return reject("loading map allowed only when docked or idle");
			}
			resolve(data);
		});
	})
	.then(data => {
		name = name.trim();
		if (!slotNameRegex.test(name)) {
			throw "invalid name";
		}
		if (requiredFiles.some(file => !fs.existsSync("/mnt/data/valetudo/maps/" + name + "/" + file))) {
			throw "required files at slot '"+name+"' missing";
		}
		if (data['lab_status'] === 1 && data['msg_ver'] === 3) { // for 2008+ fw
			fs.copyFileSync("/mnt/data/valetudo/maps/" + name + "/last_map", "/mnt/data/rockrobo/user_map2");
			if (fs.existsSync("/mnt/data/valetudo/maps/" + name + "/PersistData_1.data")) {
				fs.copyFileSync("/mnt/data/valetudo/maps/" + name + "/PersistData_1.data", "/mnt/data/rockrobo/PersistData_4.data");
			} else if (fs.existsSync("/mnt/data/rockrobo/PersistData_4.data")) {
				fs.unlinkSync("/mnt/data/rockrobo/PersistData_4.data");
			}
		} else {
			optionalFiles.concat(cleanedFiles).forEach(file => {
				if (fs.existsSync("/mnt/data/rockrobo/" + file)) fs.unlinkSync("/mnt/data/rockrobo/" + file);
			});
			requiredFiles.concat(optionalFiles).forEach(file => {
				if (fs.existsSync("/mnt/data/valetudo/maps/" + name + "/" + file)) fs.copyFileSync("/mnt/data/valetudo/maps/" + name + "/" + file, "/mnt/data/rockrobo/" + file);
			});
			fs.copyFileSync("/mnt/data/rockrobo/last_map", "/mnt/data/rockrobo/user_map0"); // for a single backup
			if (fs.existsSync("/mnt/data/rockrobo/PersistData_1.data")) {
				fs.copyFileSync("/mnt/data/rockrobo/PersistData_1.data", "/mnt/data/rockrobo/PersistData_2.data");
			}
		}
		if (fs.existsSync("/mnt/data/valetudo/maps/" + name + "/valetudo.json")) {
			const loadedOpts = JSON.parse(fs.readFileSync("/mnt/data/valetudo/maps/" + name + "/valetudo.json", "utf8"));
			if (loadedOpts.zones) {
				this.configuration.set("areas",loadedOpts.zones);
			}
			if (loadedOpts.spots) {
				this.configuration.set("spots",loadedOpts.spots);
			}
		}
		if (data['lab_status'] === 1 && data['msg_ver'] === 3) {
			self.vacuum.recoverMap(2,function (err, data2) {
				if (err) {
					return Promise.reject(err.toString());
				}
				callback(null, "ok");
			});
		} else if (data['lab_status'] === 1) {
			self.events.emit("valetudo.dummycloud.lockStatus",1);
			setTimeout(() => self.vacuum.startCleaning(function (err, data2) {
				if (err) {
					return Promise.reject(err.toString());
				}
				setTimeout(() => self.vacuum.stopCleaning(function (err, data2) {
					if (err) {
						return Promise.reject(err.toString());
					}
					callback(null, "ok");
				}),2e3);
			}),1e3);
		} else {
			exec("/bin/sleep 2 && /sbin/restart rrwatchdoge");
			callback(null, "wait");
		}
	})
	.catch(e => callback(e));
};
MapManager.prototype.removeMap = function(name, callback) {
	try {
		name = name.trim();
		if (!slotNameRegex.test(name)) {
			throw "invalid name";
		}
		if (fs.existsSync("/mnt/data/valetudo/maps/" + name) && fs.lstatSync("/mnt/data/valetudo/maps/" + name).isDirectory()) {
			fs.readdirSync("/mnt/data/valetudo/maps/" + name).forEach(file => {
				fs.unlinkSync("/mnt/data/valetudo/maps/" + name + "/" + file);
			});
			fs.rmdirSync("/mnt/data/valetudo/maps/" + name);
		}
		callback(null, "ok");
	} catch(e) {
		callback(e);
	};
};
MapManager.prototype.listStoredMaps = function(callback) {
	if (!fs.existsSync("/mnt/data/valetudo/maps/")) {
		callback(null, []);
		return;
	}
	return fs.readdir("/mnt/data/valetudo/maps", function (err, files) {
		//handling error
		if (err) {
			console.log("unable to scan directory: " + err);
			return callback(err);
		}
		callback(null, files.filter(slot => {
			return slotNameRegex.test(slot) && requiredFiles.every(file => fs.existsSync("/mnt/data/valetudo/maps/" + slot + "/" + file));
		}));
	});
};
module.exports = MapManager;
