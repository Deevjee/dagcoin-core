'use strict';

var _typeof = typeof Symbol === "function" && typeof Symbol.iterator === "symbol" ? function (obj) { return typeof obj; } : function (obj) { return obj && typeof Symbol === "function" && obj.constructor === Symbol && obj !== Symbol.prototype ? "symbol" : typeof obj; };

var instance = null;

// My module
function ConfManager() {
    this.conf = require('byteballcore/conf.js');
    this.fs = require('fs');
    this.osManager = require('./operatingSystemManager').getInstance();
    this.fileSystemManager = require('./fileSystemManager').getInstance();
    this.exManager = require('./exceptionManager');
    this.alterativeConfigSources = [];

    if (!this.osManager.isCordova()) {
        try {
            this.desktopApp = require('byteballcore/desktop_app.js');
            this.applicationDataDirectory = this.desktopApp.getAppDataDir();
            this.userConfFile = this.applicationDataDirectory + '/conf.json';
        } catch (e) {
            console.log('COULD NOT INITIALIZE desktopApp INSIDE ConfManager CONSTRUCTOR: ' + e);
        }
    } else {}
}

ConfManager.prototype.addConfigSource = function (source) {
    if (source == null) {
        return Promise.reject(new Error('PARAMETER source IS NOT DEFINED'));
    }

    if (source.name == null) {
        return Promise.reject(new Error('PARAMETER source.name IS NOT DEFINED'));
    }

    if (typeof source.get != 'function') {
        return Promise.reject(new Error('METHOD source.get IS NOT A FUNCTION: ' + _typeof(source.get)));
    }

    this.alterativeConfigSources.push(source);

    return Promise.resolve();
};

ConfManager.prototype.searchSources = function (key, sourceIndex) {
    var self = this;

    if (key == null) {
        return Promise.reject(new Error('PARAMETER key IS UNDEFINED'));
    }

    if (sourceIndex == null) {
        return Promise.reject(new Error('PARAMETER sourceIndex IS UNDEFINED WHILE LOOKING FOR KEY ' + key));
    }

    if (sourceIndex >= self.alterativeConfigSources.length) {
        console.log('ALL ALTERNATIVE SOURCES EXPLORED. COULD NOT FIND ' + key + ' ANYWHERE IN THOSE.');
        return Promise.resolve(null);
    }

    var source = self.alterativeConfigSources[sourceIndex];

    console.log('LOOKING FOR ' + key + ' INTO SOURCE ' + source.name);

    return source.get(key).then(function (value) {
        if (value == null) {
            console.log('KEY ' + key + ' NOT FOUND INTO SOURCE ' + source.name + ': MOVING ON TO NEXT SOURCE');
            return self.searchSources(key, sourceIndex + 1);
        } else {
            console.log('KEY ' + key + ' FOUND INTO SOURCE ' + source.name + ': ' + value);
            return Promise.resolve(value);
        }
    });
};

ConfManager.prototype.get = function (key) {
    var self = this;

    console.log('LOOKING INTO THE conf.js CONFIGURATION FOR ' + key);

    var value = this.conf[key];

    if (value != null) {
        return Promise.resolve(value);
    }

    console.log('CONFIGURATION NOT FOUND INTO THE conf.js FOR ' + key + '. LOOKING INTO ALTERNATIVE SOURCES');

    return self.searchSources(key, 0).then(function (value) {
        if (value != null) {
            return Promise.resolve(value);
        }

        console.log('CONFIGURATION NOT FOUND INTO THE ALTERNATIVE SOURCES FOR ' + key + '. LOOKING INTO ANGULAR');

        return new Promise(function (resolve, reject) {
            if (self.osManager.isNode()) {
                console.log('ANGULAR IS NOT DEFINED. MAYBE YOU CALLED IT TOO EARLY?');
                return Promise.resolve(null);
            }

            if (angular == null) {
                console.log('RUNNIG: UNDER NODE: ANGULAR HERE IS NOT ALLOWED AS CONFIGURATION SOURCE');
                return Promise.resolve(null);
            }

            console.log('LOOKING INTO THE ANGULAR CONFIGURATION FOR ' + key);
            try {
                angular.injector(['config']).invoke(function (ENV) {
                    console.log('CONFIGURATION VALUE FOR ' + key + ' FOUND: ' + ENV[key]);
                    resolve(ENV[key]);
                });
            } catch (e) {
                console.log('CONFIGURATION VALUE FOR ' + key + ' COULD NOT BE RETRIEVED');
                self.exManager.logError(e);
                reject(e);
            }
        });
    });
};

ConfManager.prototype.write = function (entries) {
    var self = this;

    return new Promise(function (resolve, reject) {
        self.fs.writeFile(self.userConfFile, JSON.stringify(entries, null, '\t'), 'utf8', function (err) {
            if (err) {
                if (err.code === 'ENOENT') {
                    resolve(false);
                } else {
                    reject(err);
                }
            } else {
                console.log('WRITTEN TO CONF (' + self.userConfFile + '): ' + JSON.stringify(entries));
                resolve(true);
            }
        });
    }).then(function (written) {
        if (written) {
            return Promise.resolve();
        }

        return self.write(entries);
    });
};

module.exports = ConfManager;
module.exports.getInstance = function () {
    if (!instance) {
        instance = new ConfManager();
    }

    return instance;
};