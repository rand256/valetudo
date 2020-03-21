const fs = require("fs");

const SSHManager = function () {};

SSHManager.prototype.setSSHKeys = function (keys, callback) {
	fs.mkdir('/root/.ssh', {recursive: true, mode: 0o700}, (err) => {
		if (err) {
			callback(err);
		} else {
			fs.writeFile("/root/.ssh/authorized_keys", keys, {mode: 0o644}, (err) => {
				if (err) {
					callback(err);
				} else {
					callback(null, keys);
				}
			});
		}
	});
};

SSHManager.prototype.getSSHKeys = function (callback) {
	fs.readFile("/root/.ssh/authorized_keys", (err, data) => {
		if (err) {
			callback(null, "");
		} else {
			callback(null, String(data));
		}
	});
};

module.exports = SSHManager;
