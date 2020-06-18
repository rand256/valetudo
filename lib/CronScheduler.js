const { exec } = require("child_process");

const CronScheduler = function (valetudo) {
	this.configuration = valetudo.configuration;
	this.vacuum = valetudo.vacuum;
	this.timezoneOffset = 0;
	this.scheduleInterval = 0;
	this.odd = 0;

	setTimeout(() => this.initSchedules(), 5e3);
}

CronScheduler.prototype.setTimezoneOffset = function(timezone) {
	exec('TZ=":' + timezone + '" date +%z', (error, stdout, stderr) => {
		if (!error && /^[\+-]\d{4}/.test(stdout)) {
			this.timezoneOffset = ((+stdout.slice(1,3)*60) + (+stdout.slice(3,5))) * (stdout[0] === '+' ? 1 : -1);
			console.error(new Date(),'scheduled zoned cleaning timezone offset set to', this.timezoneOffset);
			if (!this.scheduleInterval) {
				this.scheduleInterval = setInterval(() => this.processSchedules(),30e3);
			}
		} else {
			console.error(new Date(),"cannot set timezone offset for scheduled zoned cleaning:", error, stdout);
		}
	});
}

CronScheduler.prototype.processSchedules = function() {
	let currentDate = new Date(Date.now() + this.timezoneOffset*60e3);
	if (this.odd === currentDate.getUTCMinutes()) {
		return;
	}
	this.odd = currentDate.getUTCMinutes();
	this.configuration.get("ztimers").filter(task => task[0]).forEach(task => {
		let cron = task[2].split(' ');
		if (parseInt(cron[0]) !== currentDate.getUTCMinutes() || parseInt(cron[1]) !== currentDate.getUTCHours()
			|| cron[2] !== "*" && parseInt(cron[2]) !== currentDate.getUTCDate()
			|| cron[3] !== "*" && parseInt(cron[3]) !== currentDate.getUTCMonth()
			|| cron[4] !== "*" && !cron[4].split(',').map(d => parseInt(d)).includes(currentDate.getUTCDay())
		) {
			return;
		}
		let status;
		new Promise((resolve,reject) => {
			this.vacuum.getCurrentStatus(function (err, data) {
				// running when state is charging, idle or sleep
				if (!err && data && [2,3,8,10].includes(data.state) && data.in_cleaning === 0) {
					status = data;
					resolve(true);
				} else {
					reject('conditions not met');
				}
			});
		})
		.then(_ => {
			return new Promise((resolve,reject) => {
				if (task[4] && status.fan_power !== task[4]) {
					this.vacuum.setFanSpeed(task[4], function (err, data) {
						if (err) {
							reject('failed to set fanpower: ' + err);
						} else {
							console.log(new Date(),'scheduled zoned cleaning set fanpower to ' + task[4], data);
							resolve(true);
						}
					});
					return;
				}
				resolve(true);
			})
		})
		.then(_ => {
			return new Promise((resolve,reject) => {
				this.vacuum.startCleaningZone(task[3], function (err, data) {
					if (err) {
						reject('error starting: ' + err);
					} else {
						console.log(new Date(),'scheduled zoned cleaning started', data);
						resolve(true);
					}
				});
			})
		})
		.catch(err => console.log(new Date(),'scheduled zoned cleaning:', err));
	});
}

CronScheduler.prototype.checkSchedule = function(task) {
	if (!Array.isArray(task) || task.length < 4) {
		return false;
	}
	// todo: add more meaningful validation
	if (!/^\d{1,2} \d{1,2} [0-9\*]{1,2} [0-9\*]{1,2} [0-9\*,]+$/.test(task[2])) {
		return 'bad cron line';
	}
	if (!Array.isArray(task[3]) || !Array.isArray(task[3][0]) || !task[3][0].length) {
		return 'bad coordinates';
	}
	return true;
};

CronScheduler.prototype.initSchedules = function() {
	this.vacuum.getTimezone((err, data) => {
		if (!err) {
			console.error(new Date(),'setting scheduled zoned cleaning timezone to', data[0]);
			this.setTimezoneOffset(data[0]);
		} else {
			setTimeout(() => this.initSchedules(),5e3);
		}
	});
};

module.exports = CronScheduler;
