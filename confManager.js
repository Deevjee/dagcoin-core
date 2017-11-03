'use strict';

// My module
function ConfManager () {
	this.conf = require('byteballcore/conf.js');
	this.fs = require('fs');
	this.desktopApp = require('byteballcore/desktop_app.js');
	this.applicationDataDirectory = this.desktopApp.getAppDataDir();
	this.userConfFile = `${this.applicationDataDirectory}/conf.json`;
}

ConfManager.prototype.write = function(entries) {
    const self = this;

    return new Promise((resolve, reject) => {
        self.fs.writeFile(self.userConfFile, JSON.stringify(entries, null, '\t'), 'utf8', function(err) {
            if (err) {
                if (err.code === 'ENOENT') {
                    resolve(false);
                } else {
                    reject(err);
                }
            } else {
                console.log(`WRITTEN TO CONF (${self.userConfFile}): ${JSON.stringify(entries)}`);
                resolve(true);
            }
        });
    }).then((written) => {
        if (written) {
            return Promise.resolve();
        }

        return self.write(entries);
    });
};

module.exports = ConfManager;