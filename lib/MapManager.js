const fs = require("fs");

const slotNameRegex = /^[a-zа-яё0-9\-_\ ]+$/i;
const requiredFiles = ['last_map'];
const optionalFiles = ['ChargerPos.data', 'PersistData_1.data', 'PersistData_2.data', 'PersistData_3.data', 'PersistData_4.data', 'PersistData_5.data'];
const cleanedFiles = ['StartPos.data', 'user_map0', 'user_map1', 'user_map2', 'user_map3', 'user_map4'];

/***
 * stores current map to a backup folder
 * @param name
 */
function storeMap(name, callback) {
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
		callback(null);
	} catch(e) {
		callback(e);
	}
}

/***
 * restores backed up map
 * @param name
 */
function loadMap(name, callback) {
	try {
		name = name.trim();
		if (!slotNameRegex.test(name)) {
			throw "invalid name";
		}
		if (requiredFiles.some(file => !fs.existsSync("/mnt/data/valetudo/maps/" + name + "/" + file))) {
			throw "required files at slot '"+name+"' missing";
		}
		optionalFiles.concat(cleanedFiles).forEach(file => {
			if (fs.existsSync("/mnt/data/rockrobo/" + file)) fs.unlinkSync("/mnt/data/rockrobo/" + file);
		});
		requiredFiles.concat(optionalFiles).forEach(file => {
			if (fs.existsSync("/mnt/data/valetudo/maps/" + name + "/" + file)) fs.copyFileSync("/mnt/data/valetudo/maps/" + name + "/" + file, "/mnt/data/rockrobo/" + file);
		});
		fs.copyFileSync("/mnt/data/rockrobo/last_map", "/mnt/data/rockrobo/user_map0"); // is it really required?
		callback(null, "ok");
	} catch(e) {
		callback(e);
	};
}

/***
 * removes backed up map
 * @param name
 */
function removeMap(name, callback) {
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
}

/***
 * lists stored maps
 */
function listStoredMaps(callback) {
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
}

module.exports = { storeMap, loadMap, removeMap, listStoredMaps };