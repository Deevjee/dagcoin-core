'use strict';

let instance = null;

// My module
function ConfManager () {
	this.conf = require('byteballcore/conf.js');
	this.fs = require('fs');
    this.osManager = require('./operatingSystemManager').getInstance();
    this.fileSystemManager = require('./fileSystemManager').getInstance();

    if (!this.osManager.isCordova()) {
        try {
            this.desktopApp = require('byteballcore/desktop_app.js');
            this.applicationDataDirectory = this.desktopApp.getAppDataDir();
            this.userConfFile = `${this.applicationDataDirectory}/conf.json`;
        } catch (e) {
            console.log(`COULD NOT INITIALIZE desktopApp INSIDE ConfManager CONSTRUCTOR: ${e}`);
        }
    } else {

    }
}

ConfManager.prototype.getEnvironment = function (key) {
    let environment = this.conf.environment;

    if (environment != null) {
        return Promise.resolve(environment);
    }

    angular.injector(['config']).invoke(function(ENV) {
        return Promise.resolve(ENV.environment);
    });
};

ConfManager.prototype.get = function (key) {
    let value = this.conf[key];

    if (value != null) {
        return Promise.resolve(value);
    }

    return new Promise((resolve, reject) => {
        try {
            angular.injector(['config']).invoke(function(ENV) {
                resolve(ENV[key]);
            });
        } catch (e) {
            reject(e);
        }
    });
};

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
module.exports.getInstance = function  () {
    if (!instance) {
        instance = new ConfManager();
    }

    return instance;
};