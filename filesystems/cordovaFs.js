'use strict';

let instance = null;

// My module
function CordovaFs () {}

CordovaFs.prototype.initCordova = function () {
    const self = this;

    if (self.initialized) {
        return Promise.resolve();
    }

    return new Promise((resolve, reject) => {
        function onFileSystemSuccess(fileSystem) {
            console.log(`File system started: ${fileSystem.name} ${fileSystem.root.name}`);
            self.initialized = true;
            resolve(fileSystem);
        }

        function fail(evt) {
            const msg = `Could not init file system: ${evt.target.error.code}`;
            console.log(msg);
            reject(msg);
        }

        window.requestFileSystem(LocalFileSystem.PERSISTENT, 0, onFileSystemSuccess, fail);
    });
};

CordovaFs.prototype.getParentDirPath = function () {
    switch (window.cordova.platformId) {
        case 'ios':
            return `${window.cordova.file.applicationStorageDirectory}/Library`;
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
    return `${this.getParentDirPath()}/${this.getDatabaseDirName()}`;
};

CordovaFs.prototype.readFileFromForm = function (file) {
    return new Promise((resolve, reject) => {
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
    });
};

CordovaFs.prototype.readFile = function (path) {
    const self = this;

    return new Promise((resolve, reject) => {
        self.initCordova().then((fileSystem) => {
            console.log(`${JSON.stringify(fileSystem)}`);

            console.log(`BEFORE resolveLocalFileSystemURL ON ${path}`);

            window.resolveLocalFileSystemURL(
                path,
                (fileEntry) => {
                    console.log(`HAS A FILE ENTRY FOR ${path}`);
                    fileEntry.file(
                        (file) => {
                            self.readFileFromForm(file).then(
                                (data) => { resolve(data); },
                                (err) => { reject(err); }
                            );
                        }
                    );
                },
                (e) => {
                    reject(new Error(`error: ${JSON.stringify(e)}`));
                }
            );
        });
    });
};

CordovaFs.prototype.cordovaWriteFile = function (dirEntry, name, data) {
    let inputData = data;

    if (typeof inputData !== 'string') {
        console.log(`DATA TO BE WRITTEN IS AN OBJECT: ${JSON.stringify(data)}`);
        inputData = inputData.buffer;
    } else {
        console.log(`DATA TO BE WRITTEN IS A STRING: ${data}`);
    }

    console.log(`WRITING ${JSON.stringify(dirEntry)}/${name}: ${JSON.stringify(data)}`);

    return new Promise((resolve, reject) => {
        const resultHandler = function (err) {
            if (err) {
                reject(err);
            } else {
                resolve();
            }
        };

        dirEntry.getFile(name, { create: true, exclusive: false }, (file) => {
            console.log('CREATING THE WRITER ...');
            file.createWriter((writer) => {
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
    const printFilesInDir = function (entries, level) {
        if (entries == null || entries.length === 0) {
            return Promise.resolve();
        }

        let gap = '';

        for(let i = 0; i < level; i += 1) {
            gap = `${gap}\t`;
        }

        const entry = entries.pop();

        console.log(`${gap}${entry.name}`);

        if (entry.isFile) {
            return printFilesInDir(entries, level);
        }

        return new Promise((resolve, reject) => {
            window.resolveLocalFileSystemURL(entry.nativeURL,
                function (fileSystem) {
                    var reader = fileSystem.createReader();
                    reader.readEntries(
                        function (subEntries) {
                            printFilesInDir(subEntries, level + 1).then(() => {
                                return printFilesInDir(entries, level);
                            }).then(() => {
                                resolve();
                            });
                        },
                        function (err) {
                            reject(err);
                        }
                    );
                }, function (err) {
                    reject(err);
                }
            );
        });
    };

    console.log(`FILE TREE FOR ${path}`);
    console.log(`${path}`);

    return new Promise((resolve, reject) => {
        window.resolveLocalFileSystemURL(
            path,
            function (fileSystem) {
                var reader = fileSystem.createReader();
                reader.readEntries(
                    function (entries) {
                        printFilesInDir(entries, 1).then(
                            () => { resolve(); },
                            (err) => { reject(err); }
                        );
                    },
                    function (err) {
                        reject(err);
                    }
                );
            },
            function (err) {
                reject(err);
            }
        );
    });
};

CordovaFs.prototype.writeFile = function (path, data) {
    const self = this;

    console.log('INIT ...');

    return self.initCordova().then(() => {
        console.log('INIT SUCCESSFUL');

        const pathParts = path.split('\\').join('/').split('/');
        const fileName = pathParts.pop();
        let folder = `${pathParts.join('/')}`;

        if (folder != null && folder !== '') {
            folder = `${folder}/`;
        } else {
            folder = '.';
        }

        return new Promise((resolve, reject) => {
            const resultHandler = function (err) {
                if (err) {
                    reject(err);
                } else {
                    resolve();
                }
            };

            console.log(`RESOLVING ${folder} FROM PATH ${path}. FOR THE RECORD: ${window.cordova.file.applicationDirectory}`);

            /* self.cordovaFileTree(window.cordova.file.applicationDirectory).then(() => {
                return self.cordovaFileTree(window.cordova.file.applicationStorageDirectory);
            }).then(() => {
                return self.cordovaFileTree(window.cordova.file.dataDirectory);
            }); */

            // console.log("APPLICATION DATA");
            // printDir(window.cordova.file.dataDirectory, 1);

            window.resolveLocalFileSystemURL(folder, (dirEntry) => {
                // if (!path || path === '.' || path === '/') {
                    console.log(`RESOLVED ${JSON.stringify(dirEntry)}. SIMPLE PATH: ${path}`);

                    self.cordovaWriteFile(dirEntry, fileName, data).then(
                        () => { resolve() },
                        (err) => { reject(err); }
                    );
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
    return `${this.getDatabaseDirPath()}/conf.json`;
};

CordovaFs.prototype.readdir = function (path) {
    return this.initCordova().then(() => {
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
};

CordovaFs.prototype.getAppDataDir = function() {
    return `${window.cordova.file.applicationDirectory}/www`;
};

module.exports.CordovaFs = CordovaFs;
module.exports.getInstance = function  () {
    if (!instance) {
        instance = new CordovaFs();
    }

    return instance;
};