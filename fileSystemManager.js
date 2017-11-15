'use strict';

let instance = null;

// My module
function FileSystemManager () {
    this.fs = require('fs');

    try {
        this.desktopApp = require('byteballcore/desktop_app.js');
    } catch (e) {
        console.log(`COULD NOT INITIALIZE desktopApp INSIDE FileSystem CONSTRUCTOR: ${e}`);
    }

    this.initialized = false;
}

FileSystemManager.prototype.isCordova = function () {
    if (typeof window === 'undefined' || !window) {
        return false;
    }

    return !!window.cordova;
};

FileSystemManager.prototype.initCordova = function () {
    if (!this.isCordova()) {
        throw new Error('FileSystemManager.initCordova() IS ALLOWED IN CORDOVA ONLY');
    }

    if (this.initialized) {
        return Promise.resolve();
    }

    return new Promise((resolve, reject) => {
        function onFileSystemSuccess(fileSystem) {
            console.log('File system started: ', fileSystem.name, fileSystem.root.name);
            this.initialized = true;
            resolve();
        }

        function fail(evt) {
            const msg = `Could not init file system: ${evt.target.error.code}`;
            console.log(msg);
            reject(msg);
        }

        window.requestFileSystem(LocalFileSystem.PERSISTENT, 0, onFileSystemSuccess, fail);
    });
};

FileSystemManager.prototype.readFileFromForm = function (file) {
    const self = this;

    return new Promise((resolve, reject) => {
        if (self.isCordova()) {
            const reader = new FileReader();
            reader.onloadend = function () {
                const fileBuffer = Buffer.from(new Uint8Array(this.result));
                resolve(fileBuffer);
            };
            try {
                reader.readAsArrayBuffer(file);
            } catch (e) {
                reject(e);
            }
        } else {
            try {
                resolve(this.fs.createReadStream(file.path));
            } catch (e) {
                reject(e);
            }
        }
    });
};

FileSystemManager.prototype.readFile = function (path) {
    const self = this;

    return new Promise((resolve, reject) => {
        if (self.isCordova()) {
            self.initCordova().then(() => {
                window.resolveLocalFileSystemURL(
                    path,
                    (fileEntry) => {
                        fileEntry.file(
                            (file) => {
                                self.readFileFromForm(file, function (err, data) {
                                    if (err) {
                                        reject (err);
                                    } else {
                                        resolve(data);
                                    }
                                });
                            }
                        );
                    },
                    (e) => {
                        reject(new Error(`error: ${JSON.stringify(e)}`));
                    }
                );
            });
        } else {
            self.fs.readFile(path, (err, data) => {
                if (err) {
                    reject(err);
                } else {
                    resolve(data);
                }
            });
        }
    });
};

FileSystemManager.prototype.getPath = function (path) {
    return path.replace(/\\/g, '/');
};

FileSystemManager.prototype.cordovaWriteFile = function (dirEntry, name, data) {
    let inputData = data;

    if (typeof inputData !== 'string') {
        inputData = inputData.buffer;
    }

    return new Promise((resolve, reject) => {
        const resultHandler = function (err) {
            if (err) {
                reject(err);
            } else {
                resolve();
            }
        };

        dirEntry.getFile(name, { create: true, exclusive: false }, (file) => {
            file.createWriter((writer) => {
                writer.onwriteend = function () {
                    cb(null);
                };
                writer.write(inputData);
            }, resultHandler);
        }, resultHandler);
    });
};

FileSystemManager.prototype.writeFile = function (path, data, encoding) {
    const self = this;

    if (self.isCordova()) {
        return self.initCordova().then(() => {
            const pathParts = path.split('\\').join('/').split('/');
            const fileName = pathParts.pop();
            const folder = `${pathParts.join('/')}/`;

            return new Promise((resolve, reject) => {
                const resultHandler = function (err) {
                    if (err) {
                        reject(err);
                    } else {
                        resolve();
                    }
                };

                window.resolveLocalFileSystemURL(folder, (dirEntry) => {
                    if (!path || path === '.' || path === '/') {
                        self.cordovaWriteFile(dirEntry, fileName, data).then(
                            () => { resolve() },
                            (err) => { reject(err); }
                        );
                    } else {
                        dirEntry.getDirectory(path, { create: true, exclusive: false }, (dirEntry1) => {
                            self.cordovaWriteFile(dirEntry1, fileName, data).then(
                                () => { resolve() },
                                (err) => { reject(err); }
                            );
                        }, resultHandler);
                    }
                }, resultHandler);
            });
        });
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

FileSystemManager.prototype.getUserConfFilePath = function () {
    const appDataDir = this.getDatabaseDirPath();
    return `${appDataDir}/conf.json`;
};

FileSystemManager.prototype.readdir = function (path) {
    const self = this;

    if (self.isCordova()) {
        return self.initCordova().then(() => {
            return new Promise((resolve, reject) => {
                window.resolveLocalFileSystemURL(path,
                    (fileSystem) => {
                        const reader = fileSystem.createReader();
                        reader.readEntries(
                            (entries) => {
                                resolve(entries.map(entry => entry.name));
                            },
                            (err) => {
                                reject(err);
                            });
                    }, (err) => {
                        reject(err);
                    }
                );
            });
        });
    }

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

FileSystemManager.prototype.nwMoveFile = function (oldPath, newPath) {
    const self = this;

    return new Promise((resolve, reject) => {
        const read = self.fs.createReadStream(oldPath);
        const write = self.fs.createWriteStream(newPath);

        read.pipe(write);
        read.on('end', () => {
            self.fs.unlink(oldPath, function(err) {
                if(err) {
                    reject(err);
                } else {
                    resolve();
                }
            });
        });
    });
};

FileSystemManager.prototype.nwUnlink = function (path) {
    const self = this;

    return new Promise((resolve, reject) => {
        self.fs.unlink(path, function(err) {
            if(err) {
                reject(err);
            } else {
                resolve();
            }
        });
    });
};

FileSystemManager.prototype.nwRmDir = function (path) {
    const self = this;

    return new Promise((resolve, reject) => {
        self.fs.rmdir(path, function(err) {
            if(err) {
                reject(err);
            } else {
                resolve();
            }
        });
    });
};

FileSystemManager.prototype.nwExistsSync = function (path) {
    return this.fs.existsSync(path);
};


FileSystemManager.prototype.getParentDirPath = function () {
    if (!this.isCordova()) {
        return false;
    }

    switch (window.cordova.platformId) {
        case 'ios':
            return `${window.cordova.file.applicationStorageDirectory}/Library`;
        case 'android':
        default:
            return window.cordova.file.applicationStorageDirectory;
    }
};

FileSystemManager.prototype.getDatabaseDirName = function () {
    if (!this.isCordova()) {
        return false;
    }

    switch (window.cordova.platformId) {
        case 'ios':
            return 'LocalDatabase';
        case 'android':
        default:
            return 'databases';
    }
};

FileSystemManager.prototype.getDatabaseDirPath = function () {
    if (this.isCordova()) {
        return `${this.getParentDirPath()}/${this.getDatabaseDirName()}`;
    }

    return this.desktopApp.getAppDataDir();
};

FileSystemManager.prototype.getAppDataDir = function() {
    return this.desktopApp.getAppDataDir();
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