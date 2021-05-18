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
			console.error(new Date(),'scheduled cleaning timezone offset set to', this.timezoneOffset);
			if (!this.scheduleInterval) {
				this.scheduleInterval = setInterval(() => this.processSchedules(),30e3);
			}
		} else {
			console.error(new Date(),"cannot set timezone offset for scheduled cleaning:", error, stdout);
		}
	});
}

CronScheduler.prototype.processSchedules = function() {
	let currentDate = new Date(Date.now() + this.timezoneOffset*60e3);
	if (this.odd === currentDate.getUTCMinutes() || !this.vacuum.featuresInitialized) {
		return;
	}
	this.odd = currentDate.getUTCMinutes();
	const timers = this.configuration.get("timers"),
		ztimers = this.configuration.get("ztimers");
	timers.concat(ztimers).filter(task => task[0]).forEach(task => {
		let cron = task[2].split(' ');
		if (parseInt(cron[0]) !== currentDate.getUTCMinutes() || parseInt(cron[1]) !== currentDate.getUTCHours()
			|| cron[2] !== "*" && parseInt(cron[2]) !== currentDate.getUTCDate()
			|| cron[3] !== "*" && parseInt(cron[3]) !== currentDate.getUTCMonth()
			|| cron[4] !== "*" && !cron[4].split(',').map(d => parseInt(d)).includes(currentDate.getUTCDay())
		) {
			return;
		}
		let status, zoned = task.length === 6;
		if (!zoned && !this.vacuum.features.ntimers) {
			return;
		}
		if (zoned && cron[4] === "*") {
			this.configuration.set("timers", timers.filter(timer => timer[1] !== task[1]));
		}
		new Promise((resolve,reject) => {
			if (currentDate.getUTCFullYear() === 1970) {
				reject('invalid system date');
				return;
			}
			this.vacuum.getCurrentStatus(function (err, data) {
				// running when state is charging, idle or sleep
				if (!err && data && [2,3,8,10].includes(data.state) && data.in_cleaning === 0) {
					status = data;
					resolve(true);
				} else {
					reject('running conditions not met, device status not ready for cleaning');
				}
			});
		})
		.then(_ => {
			return new Promise((resolve,reject) => {
				let fan = task[zoned ? 4 : 5];
				if (fan && status.fan_power !== fan) {
					this.vacuum.setFanSpeed(fan, function (err, data) {
						if (err) {
							reject('failed to set fanpower: ' + err);
						} else {
							console.log(new Date(),'scheduled cleaning set fanpower to ' + fan, data);
							resolve(true);
						}
					});
					return;
				}
				resolve(true);
			});
		})
		.then(_ => {
			return !this.vacuum.features.water_usage_ctrl ? false : new Promise((resolve,reject) => {
				let water = task[zoned ? 5 : 6];
				if (water && status.water_grade !== water) {
					this.vacuum.setWaterGrade(water, function (err, data) {
						if (err) {
							reject('failed to set watergrade: ' + err);
						} else {
							console.log(new Date(),'scheduled cleaning set watergrade to ' + water, data);
							resolve(true);
						}
					});
					return;
				}
				resolve(true);
			});
		})
		.then(_ => {
			return new Promise((resolve,reject) => {
				const callback = function (err, data) {
					if (err) {
						reject('error starting: ' + err);
					} else {
						console.log(new Date(),'scheduled cleaning started', data);
						resolve(true);
					}
				};
				if (zoned) {
					this.vacuum.startCleaningZone(task[3], callback);
				} else if (task[3] && task[3].split(',').every(s => !isNaN(+s))) {
					this.vacuum.startCleaningSegment([task[3].split(',').map(s => +s), +task[4] || 1], callback);
				} else {
					this.vacuum.startCleaning(callback);
				}
			});
		})
		.catch(err => console.log(new Date(),'scheduled cleaning:', err));
	});
}

CronScheduler.prototype.checkSchedule = function(task,segmented) {
	if (!Array.isArray(task) || task.length < 5) {
		return false;
	}
	// todo: add more meaningful validation
	if (!/^\d{1,2} \d{1,2} [0-9\*]{1,2} [0-9\*]{1,2} [0-9\*,]+$/.test(task[2])) {
		return 'bad cron line';
	}
	if (!!segmented) {
		if (task[3].split(',').some(s => isNaN(+s))) {
			return 'bad segments';
		}
	} else if (!Array.isArray(task[3]) || !Array.isArray(task[3][0]) || !task[3][0].length) {
		return 'bad coordinates';
	}
	return true;
};

CronScheduler.prototype.initSchedules = function() {
	this.vacuum.getTimezone((err, data) => {
		if (!err) {
			console.error(new Date(),'setting scheduled cleaning timezone to', data[0]);
			this.setTimezoneOffset(data[0]);
		} else {
			setTimeout(() => this.initSchedules(),5e3);
		}
	});
};

module.exports = CronScheduler;
