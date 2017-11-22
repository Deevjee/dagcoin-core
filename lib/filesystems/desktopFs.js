'use strict';

var instance = null;

// My module
function DesktopFs() {
    this.fs = require('fs');
    this.desktopApp = require('byteballcore/desktop_app.js');
}

DesktopFs.prototype.getDatabaseDirPath = function () {
    return this.desktopApp.getAppDataDir();
};

DesktopFs.prototype.readFileFromForm = function (file) {
    var self = this;

    return new Promise(function (resolve, reject) {
        try {
            resolve(self.fs.createReadStream(file.path));
        } catch (e) {
            reject(e);
        }
    });
};

DesktopFs.prototype.readFile = function (path) {
    var self = this;

    return new Promise(function (resolve, reject) {
        self.fs.readFile(path, self.getDefaultEncoding(), function (err, data) {
            if (err) {
                reject(err);
            } else {
                resolve(data);
            }
        });
    });
};

DesktopFs.prototype.getDefaultEncoding = function () {
    return 'utf8';
};

DesktopFs.prototype.writeFile = function (path, data, userEncoding) {
    var self = this;

    var encoding = userEncoding;

    if (encoding == null) {
        encoding = self.getDefaultEncoding();
    }

    return new Promise(function (resolve, reject) {
        self.fs.writeFile(path, data, encoding, function (err) {
            if (err) {
                reject(err);
            } else {
                resolve();
            }
        });
    });
};

DesktopFs.prototype.getUserConfFilePath = function () {
    return this.getAppDataDir() + '/conf.json';
};

DesktopFs.prototype.readdir = function (path) {
    var self = this;

    return new Promise(function (resolve, reject) {
        self.fs.readdir(path, function (err, entries) {
            if (err) {
                reject(err);
            } else {
                resolve(entries);
            }
        });
    });
};

DesktopFs.prototype.getAppDataDir = function () {
    return '.';
};

module.exports.DesktopFs = DesktopFs;
module.exports.getInstance = function () {
    if (!instance) {
        instance = new DesktopFs();
    }

    return instance;
};