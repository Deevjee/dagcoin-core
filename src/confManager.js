'use strict';

let instance = null;

// My module
function ConfManager () {
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
            this.userConfFile = `${this.applicationDataDirectory}/conf.json`;
        } catch (e) {
            console.log(`COULD NOT INITIALIZE desktopApp INSIDE ConfManager CONSTRUCTOR: ${e}`);
        }
    } else {

    }
}

ConfManager.prototype.addConfigSource = function (source) {
    if (source == null) {
        return Promise.reject(new Error('PARAMETER source IS NOT DEFINED'));
    }

    if (source.name == null) {
        return Promise.reject(new Error('PARAMETER source.name IS NOT DEFINED'));
    }

    if (typeof source.get != 'function') {
        return Promise.reject(new Error(`METHOD source.get IS NOT A FUNCTION: ${typeof source.get}`));
    }

    this.alterativeConfigSources.push(source);

    return Promise.resolve();
};

ConfManager.prototype.searchSources = function (key, sourceIndex) {
    const self = this;

    if (key == null) {
        return Promise.reject(new Error('PARAMETER key IS UNDEFINED'));
    }

    if (sourceIndex == null) {
        return Promise.reject(new Error(`PARAMETER sourceIndex IS UNDEFINED WHILE LOOKING FOR KEY ${key}`));
    }

    if (sourceIndex >= self.alterativeConfigSources.length) {
        console.log(`ALL ALTERNATIVE SOURCES EXPLORED. COULD NOT FIND ${key} ANYWHERE IN THOSE.`);
        return Promise.resolve(null);
    }

    const source = self.alterativeConfigSources[sourceIndex];

    console.log(`LOOKING FOR ${key} INTO SOURCE ${source.name}`);

    return source.get(key).then((value) => {
        if (value == null) {
            console.log(`KEY ${key} NOT FOUND INTO SOURCE ${source.name}: MOVING ON TO NEXT SOURCE`);
            return self.searchSources(key, sourceIndex + 1);
        } else {
            console.log(`KEY ${key} FOUND INTO SOURCE ${source.name}: ${value}`);
            return Promise.resolve(value);
        }
    });
};

ConfManager.prototype.get = function (key) {
    const self = this;

    console.log(`LOOKING INTO THE conf.js CONFIGURATION FOR ${key}`);

    let value = this.conf[key];

    if (value != null) {
        return Promise.resolve(value);
    }

    console.log(`CONFIGURATION NOT FOUND INTO THE conf.js FOR ${key}. LOOKING INTO ALTERNATIVE SOURCES`);

    return self.searchSources(key, 0);
};

ConfManager.prototype.getMultiple = function (keys, values) {
    const self = this;

    if (typeof keys === 'string') {
        return self.get(keys);
    }

    if (!Array.isArray(keys)) {
        return Promise.reject(new Error(`PARAMETER keys IS NOT A STRING NOR AN ARRAY: ${typeof keys} ${JSON.stringify(keys)}`));
    }

    if (keys == null || keys.length === 0) {
        return Promise.resolve(values);
    }

    const nextKey = keys.shift();

    return self.get(nextKey).then((value) => {
        if (values == null) {
            values = {};
        }

        values[nextKey] = value;

        return self.getMultiple(keys, values);
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