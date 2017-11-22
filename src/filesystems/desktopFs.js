'use strict';

let instance = null;

// My module
function DesktopFs () {
    this.fs = require('fs');
    this.desktopApp = require('byteballcore/desktop_app.js');
}

DesktopFs.prototype.getDatabaseDirPath = function () {
    return this.desktopApp.getAppDataDir();
};

DesktopFs.prototype.readFileFromForm = function (file) {
    const self = this;

    return new Promise((resolve, reject) => {
        try {
            resolve(self.fs.createReadStream(file.path));
        } catch (e) {
            reject(e);
        }
    });
};

DesktopFs.prototype.readFile = function (path) {
    const self = this;

    return new Promise((resolve, reject) => {
        self.fs.readFile(path, self.getDefaultEncoding(), (err, data) => {
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
    const self = this;

    let encoding = userEncoding;

    if (encoding == null) {
        encoding = self.getDefaultEncoding();
    }

    return new Promise((resolve, reject) => {
        self.fs.writeFile(path, data, encoding, (err) => {
            if (err) {
                reject(err);
            } else {
                resolve();
            }
        });
    });
};

DesktopFs.prototype.getUserConfFilePath = function () {
    return `${this.getAppDataDir()}/conf.json`;
};

DesktopFs.prototype.readdir = function (path) {
    const self = this;

    return new Promise((resolve, reject) => {
        self.fs.readdir(path, (err, entries) => {
            if (err) {
                reject(err);
            } else {
                resolve(entries);
            }
        });
    });
};

DesktopFs.prototype.getAppDataDir = function() {
    return '.';
};

module.exports.DesktopFs = DesktopFs;
module.exports.getInstance = function  () {
    if (!instance) {
        instance = new DesktopFs();
    }

    return instance;
};