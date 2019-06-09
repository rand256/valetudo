const cron = require('node-cron');

const CronScheduler = function (parameters) {
    const self = this;

    this.configuration = parameters.configuration;
    this.vacuum = parameters.vacuum;
    this.schedules = [];
    this.timezone = "Europe/Berlin";

    this.createSchedule = function(job) {
        if (!job || !job[0] || job.length !== 4 || !cron.validate(job[2])) {
            return false;
        }
        // todo: add some more validation maybe
        let task = cron.schedule(job[2], () => {
            self.vacuum.getCurrentStatus(function (err, data) {
                // running ONLY when state = 8 (charging)
                if (!err && data && data.state === 8) {
                    self.vacuum.startCleaningZone(job[3], function (err, data) {
                        if (err) {
                            console.log('error starting scheduled zoned cleaning', err);
                        } else {
                            console.log('started scheduled zoned cleaning', data);
                        }
                    })
                } else {
                    console.log('scheduled zoned cleaning start failed', err, data);
                }
            });
        },{timezone: self.timezone});
        self.schedules.push(task);
        return true;
    };

    this.removeSchedule = function(index) {
        if (self.schedules[index]) {
            let task = self.schedules[index];
            task.destroy();
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
                self.timezone = data;
            }
            self.resetSchedules();
        });
    };
    
    setTimeout(() => { self.initSchedules() }, 30e3);
};

module.exports = CronScheduler;
