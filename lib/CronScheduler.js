const cron = require('cron');

const CronScheduler = function (parameters) {
    const self = this;

    this.configuration = parameters.configuration;
    this.vacuum = parameters.vacuum;
    this.schedules = [];
    this.timezone = "Europe/Berlin";

    this.createSchedule = function(job,check) {
        if (!job || !job[0] && !check || job.length !== 4) {
            return false;
        }
        // todo: add some more validation maybe
        try {
            let task = new cron.CronJob(job[2], () => {
                self.vacuum.getCurrentStatus(function (err, data) {
                    // running ONLY when state = 8 (charging)
                    if (!err && data && data.state === 8) {
                        self.vacuum.startCleaningZone(job[3], function (err, data) {
                            if (err) {
                                console.log(new Date(),'error starting scheduled zoned cleaning', err);
                            } else {
                                console.log(new Date(),'started scheduled zoned cleaning', data);
                            }
                        })
                    } else {
                        console.log(new Date(),'scheduled zoned cleaning conditions not met', err, data);
                    }
                });
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
                self.timezone = data.join();
            }
            self.resetSchedules();
        });
    };

    setTimeout(() => { self.initSchedules() }, 5e3);
};

module.exports = CronScheduler;
