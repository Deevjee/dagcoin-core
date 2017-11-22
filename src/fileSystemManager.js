'use strict';

let instance = null;

// My module
function FileSystemManager () {
    this.osManager = require('./operatingSystemManager').getInstance();

    if (this.osManager.isCordova()) {
        this.fileSystem = require('./filesystems/cordovaFs').getInstance();
    } else {
        this.fileSystem = require('./filesystems/desktopFs').getInstance();
    }
}

FileSystemManager.prototype.readFileFromForm = function (file) {
    return this.fileSystem.readFileFromForm(file);
};

FileSystemManager.prototype.readFile = function (path) {
    return this.fileSystem.readFile(path);
};

FileSystemManager.prototype.readAppFile = function (path) {
    console.log(`FULL FILE PATH: ${this.getDatabaseDirPath()}/${path}`);
    return this.fileSystem.readFile(`${this.getDatabaseDirPath()}/${path}`);
};

FileSystemManager.prototype.getPath = function (path) {
    return path.replace(/\\/g, '/');
};

FileSystemManager.prototype.writeFile = function (path, data, encoding) {
    return this.fileSystem.writeFile(path, data, encoding);
};

FileSystemManager.prototype.writeAppFile = function (path, data, encoding) {
    console.log(`FULL FILE PATH: ${this.getDatabaseDirPath()}/${path}`);
    return this.writeFile(`${this.getDatabaseDirPath()}/${path}`, data, encoding);
};

FileSystemManager.prototype.getUserConfFilePath = function () {
    return this.fileSystem.getUserConfFilePath();
};

FileSystemManager.prototype.readdir = function (path) {
    return this.fileSystem.readdir(path);
};

FileSystemManager.prototype.getDatabaseDirPath = function () {
    return this.fileSystem.getDatabaseDirPath();
};

FileSystemManager.prototype.getAppDataDir = function() {
    return this.fileSystem.getAppDataDir();
};

FileSystemManager.prototype.getDefaultEncoding = function () {
    return 'utf8';
};

module.exports.FileSystemManager = FileSystemManager;
module.exports.getInstance = function  () {
    if (!instance) {
        instance = new FileSystemManager();
    }

    return instance;
};