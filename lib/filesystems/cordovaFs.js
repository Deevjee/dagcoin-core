'use strict';

var instance = null;

// My module
function CordovaFs() {
    this.exceptionManager = require('../exceptionManager');
}

CordovaFs.prototype.initCordova = function () {
    var self = this;

    if (self.initialized) {
        return Promise.resolve();
    }

    return new Promise(function (resolve, reject) {
        function onFileSystemSuccess(fileSystem) {
            console.log('File system started: ' + fileSystem.name + ' ' + fileSystem.root.name);
            self.initialized = true;
            resolve(fileSystem);
        }

        function fail(evt) {
            var msg = 'Could not init file system: ' + evt.target.error.code;
            console.log(msg);
            reject(msg);
        }

        window.requestFileSystem(LocalFileSystem.PERSISTENT, 0, onFileSystemSuccess, fail);
    });
};

CordovaFs.prototype.getParentDirPath = function () {
    switch (window.cordova.platformId) {
        case 'ios':
            return window.cordova.file.applicationStorageDirectory + '/Library';
        case 'android':
        default:
            return window.cordova.file.applicationStorageDirectory;
    }
};

CordovaFs.prototype.getDatabaseDirName = function () {
    switch (window.cordova.platformId) {
        case 'ios':
            return 'LocalDatabase';
        case 'android':
        default:
            return 'databases';
    }
};

CordovaFs.prototype.getDatabaseDirPath = function () {
    return this.getParentDirPath() + '/' + this.getDatabaseDirName();
};

CordovaFs.prototype.readFileFromForm = function (file) {
    return new Promise(function (resolve, reject) {
        var reader = new FileReader();

        reader.onloadend = function () {
            var fileBuffer = Buffer.from(new Uint8Array(this.result));
            resolve(fileBuffer);
        };

        try {
            reader.readAsArrayBuffer(file);
        } catch (e) {
            reject(e);
        }
    });
};

CordovaFs.prototype.readFile = function (path) {
    var self = this;

    return new Promise(function (resolve, reject) {
        self.initCordova().then(function (fileSystem) {
            console.log('' + JSON.stringify(fileSystem));

            console.log('BEFORE resolveLocalFileSystemURL ON ' + path);

            window.resolveLocalFileSystemURL(path, function (fileEntry) {
                console.log('HAS A FILE ENTRY FOR ' + path);
                fileEntry.file(function (file) {
                    self.readFileFromForm(file).then(function (data) {
                        resolve(data);
                    }, function (err) {
                        reject(err);
                    });
                });
            }, function (e) {
                self.exceptionManager.logError(new Error('error: ' + JSON.stringify(e)));
                reject(e);
            });
        });
    });
};

CordovaFs.prototype.cordovaWriteFile = function (dirEntry, name, data) {
    var inputData = data;

    if (typeof inputData !== 'string') {
        console.log('DATA TO BE WRITTEN IS AN OBJECT: ' + JSON.stringify(data));
        inputData = inputData.buffer;
    } else {
        console.log('DATA TO BE WRITTEN IS A STRING: ' + data);
    }

    console.log('WRITING ' + JSON.stringify(dirEntry) + '/' + name + ': ' + JSON.stringify(data));

    return new Promise(function (resolve, reject) {
        var resultHandler = function resultHandler(err) {
            if (err) {
                reject(err);
            } else {
                resolve();
            }
        };

        dirEntry.getFile(name, { create: true, exclusive: false }, function (file) {
            console.log('CREATING THE WRITER ...');
            file.createWriter(function (writer) {
                console.log('WRITER READY');

                writer.onwriteend = function () {
                    console.log('FINISHED WRITING');
                    resultHandler();
                };

                console.log('STARTING TO WRITE');
                writer.write(inputData);
                console.log('WRITING');
            }, resultHandler);
        }, resultHandler);
    });
};

CordovaFs.prototype.cordovaFileTree = function (path) {
    var printFilesInDir = function printFilesInDir(entries, level) {
        if (entries == null || entries.length === 0) {
            return Promise.resolve();
        }

        var gap = '';

        for (var i = 0; i < level; i += 1) {
            gap = gap + '\t';
        }

        var entry = entries.pop();

        console.log('' + gap + entry.name);

        if (entry.isFile) {
            return printFilesInDir(entries, level);
        }

        return new Promise(function (resolve, reject) {
            window.resolveLocalFileSystemURL(entry.nativeURL, function (fileSystem) {
                var reader = fileSystem.createReader();
                reader.readEntries(function (subEntries) {
                    printFilesInDir(subEntries, level + 1).then(function () {
                        return printFilesInDir(entries, level);
                    }).then(function () {
                        resolve();
                    });
                }, function (err) {
                    reject(err);
                });
            }, function (err) {
                reject(err);
            });
        });
    };

    console.log('FILE TREE FOR ' + path);
    console.log('' + path);

    return new Promise(function (resolve, reject) {
        window.resolveLocalFileSystemURL(path, function (fileSystem) {
            var reader = fileSystem.createReader();
            reader.readEntries(function (entries) {
                printFilesInDir(entries, 1).then(function () {
                    resolve();
                }, function (err) {
                    reject(err);
                });
            }, function (err) {
                reject(err);
            });
        }, function (err) {
            reject(err);
        });
    });
};

CordovaFs.prototype.writeFile = function (path, data) {
    var self = this;

    console.log('INIT ...');

    return self.initCordova().then(function () {
        console.log('INIT SUCCESSFUL');

        var pathParts = path.split('\\').join('/').split('/');
        var fileName = pathParts.pop();
        var folder = '' + pathParts.join('/');

        if (folder != null && folder !== '') {
            folder = folder + '/';
        } else {
            folder = '.';
        }

        return new Promise(function (resolve, reject) {
            var resultHandler = function resultHandler(err) {
                if (err) {
                    reject(err);
                } else {
                    resolve();
                }
            };

            console.log('RESOLVING ' + folder + ' FROM PATH ' + path + '. FOR THE RECORD: ' + window.cordova.file.applicationDirectory);

            /* self.cordovaFileTree(window.cordova.file.applicationDirectory).then(() => {
                return self.cordovaFileTree(window.cordova.file.applicationStorageDirectory);
            }).then(() => {
                return self.cordovaFileTree(window.cordova.file.dataDirectory);
            }); */

            // console.log("APPLICATION DATA");
            // printDir(window.cordova.file.dataDirectory, 1);

            window.resolveLocalFileSystemURL(folder, function (dirEntry) {
                // if (!path || path === '.' || path === '/') {
                console.log('RESOLVED ' + JSON.stringify(dirEntry) + '. SIMPLE PATH: ' + path);

                self.cordovaWriteFile(dirEntry, fileName, data).then(function () {
                    resolve();
                }, function (err) {
                    reject(err);
                });
                /*} else {
                    console.log(`RESOLVED ${JSON.stringify(dirEntry)}. COMPLEX PATH: ${path}`);
                     dirEntry.getDirectory(folder, { create: true, exclusive: false }, (dirEntry1) => {
                        console.log(`USING DIRECTORY ${JSON.stringify(dirEntry1)}.`);
                         self.cordovaWriteFile(dirEntry1, fileName, data).then(
                            () => { resolve() },
                            (err) => { reject(err); }
                        );
                    }, resultHandler);
                }*/
            }, resultHandler);
        });
    });
};

CordovaFs.prototype.getUserConfFilePath = function () {
    return this.getDatabaseDirPath() + '/conf.json';
};

CordovaFs.prototype.readdir = function (path) {
    return this.initCordova().then(function () {
        return new Promise(function (resolve, reject) {
            window.resolveLocalFileSystemURL(path, function (fileSystem) {
                var reader = fileSystem.createReader();
                reader.readEntries(function (entries) {
                    resolve(entries.map(function (entry) {
                        return entry.name;
                    }));
                }, function (err) {
                    reject(err);
                });
            }, function (err) {
                reject(err);
            });
        });
    });
};

CordovaFs.prototype.getAppDataDir = function () {
    return window.cordova.file.applicationDirectory + '/www';
};

module.exports.CordovaFs = CordovaFs;
module.exports.getInstance = function () {
    if (!instance) {
        instance = new CordovaFs();
    }

    return instance;
};