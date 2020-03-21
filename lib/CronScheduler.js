const cron = require('cron');

const CronScheduler = function (parameters) {
	const self = this;

	this.configuration = parameters.configuration;
	this.vacuum = parameters.vacuum;
	this.schedules = [];
	this.timezone = "Europe/Berlin";

	this.createSchedule = function(job,check) {
		if (!job || !job[0] && !check || job.length < 4) {
			return false;
		}
		// todo: add some more validation maybe
		try {
			let task = new cron.CronJob(job[2], () => {
				let status;
				new Promise((resolve,reject) => {
					self.vacuum.getCurrentStatus(function (err, data) {
						// running when state is charging, idle or sleep
						if (!err && data && ([3,8].includes(data.state) || (data.state === 2 && data.in_cleaning === 0))) {
							status = data;
							resolve(true);
						} else {
							reject("conditions not met");
						}
					});
				})
				.then(_ => {
					return new Promise((resolve,reject) => {
						if (job[4] && status.fan_power !== job[4]) {
							self.vacuum.setFanSpeed(job[4], function (err, data) {
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
						self.vacuum.startCleaningZone(job[3], function (err, data) {
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
			}, null, check ? false : true, self.timezone);
			if (!check) {
				self.schedules.push(task);
			}
		} catch (e) {
			console.log(new Date(),'creating task timer for zoned task failed', e, self.timezone);
			return e.toString() + ' (' + self.timezone + ')';
		}
		return true;
	};

	this.removeSchedule = function(index) {
		if (self.schedules[index]) {
			let task = self.schedules[index];
			task.stop();
			self.schedules.splice(index, 1);
			return true;
		}
		return false;
	};

	this.resetSchedules = function() {
	   for (let i = self.schedules.length - 1; i >= 0 ; i--) {
		   self.removeSchedule(i);
	   }
	   self.configuration.get("ztimers").forEach(task => {
		   self.createSchedule(task);
	   });
	};

	this.initSchedules = function() {
		self.vacuum.getTimezone(function (err, data) {
			if (!err) {
				self.timezone = data[0];
			}
			self.resetSchedules();
		});
	};

	setTimeout(() => { self.initSchedules() }, 5e3);
};

module.exports = CronScheduler;
