const cron = require('cron');

const CronScheduler = function (valetudo) {
	this.configuration = valetudo.configuration;
	this.vacuum = valetudo.vacuum;
	this.schedules = [];
	this.timezone = "Europe/Berlin";

	setTimeout(() => this.initSchedules(), 5e3);
}

CronScheduler.prototype.createSchedule = function(job,check) {
	if (!job || !job[0] && !check || job.length < 4) {
		return false;
	}
	// todo: add some more validation maybe
	try {
		let task = new cron.CronJob(job[2], () => {
			let status;
			new Promise((resolve,reject) => {
				this.vacuum.getCurrentStatus(function (err, data) {
					// running when state is charging, idle or sleep
					if (!err && data && ([3,8].includes(data.state) || (data.state === 2 && data.in_cleaning === 0))) {
						status = data;
						resolve(true);
					} else {
						reject('conditions not met');
					}
				});
			})
			.then(_ => {
				return new Promise((resolve,reject) => {
					if (job[4] && status.fan_power !== job[4]) {
						this.vacuum.setFanSpeed(job[4], function (err, data) {
							if (err) {
								reject('failed to set fanpower: ' + err);
							} else {
								console.log(new Date(),'scheduled zoned cleaning set fanpower to ' + job[4], data);
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
					this.vacuum.startCleaningZone(job[3], function (err, data) {
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
		}, null, check ? false : true, this.timezone);
		if (!check) {
			this.schedules.push(task);
		}
	} catch (e) {
		console.log(new Date(),'creating task timer for zoned task failed', e, this.timezone);
		return e.toString() + ' (' + this.timezone + ')';
	}
	return true;
};

CronScheduler.prototype.removeSchedule = function(index) {
	if (this.schedules[index]) {
		this.schedules[index].stop();
		this.schedules.splice(index, 1);
		return true;
	}
	return false;
};

CronScheduler.prototype.resetSchedules = function() {
	for (let i = this.schedules.length - 1; i >= 0 ; i--) {
		this.removeSchedule(i);
	}
	this.configuration.get("ztimers").forEach(task => {
		this.createSchedule(task);
	});
};

CronScheduler.prototype.initSchedules = function() {
	this.vacuum.getTimezone((err, data) => {
		if (!err) {
			this.timezone = data[0];
			this.resetSchedules();
			console.log(new Date(),'scheduled zoned cleaning timezone set to', this.timezone);
		} else {
			setTimeout(() => this.initSchedules(),5e3);
		}
	});
};

module.exports = CronScheduler;
