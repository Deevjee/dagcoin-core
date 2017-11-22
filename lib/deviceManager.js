'use strict';

var instance = null;

function DeviceManager() {
    var _this = this;

    this.device = require('byteballcore/device');
    this.conf = require('byteballcore/conf');
    var DatabaseManager = require('./databaseManager');
    this.dbManager = new DatabaseManager();
    this.DeviceManagerAddresses = [];
    this.DeviceManagerAvailabilityCheckingPromise = null;
    this.timedPromises = require('./promiseManager');

    this.messageCounter = 0;

    this.eventBus = require('byteballcore/event_bus');
    this.exceptionManager = require('./exceptionManager');

    var self = this;

    // For backward compatibility with older versions
    self.eventBus.on('dagcoin.is-connected', function (fromAddress, message) {
        var reply = {
            protocol: 'dagcoin',
            title: 'connected'
        };

        self.exceptionManager.logOnFailure(_this.device.sendMessageToDevice, fromAddress, 'text', JSON.stringify(reply), {
            ifOk: function ifOk() {
                console.log('REPLIED TO ' + fromAddress + ', WHO WANTED TO KNOW WHETHER I WERE CONNECTED');
            },
            ifError: function ifError(error) {
                self.exceptionManager.logError(error);
            }
        });
    });

    self.eventBus.on('dagcoin.request.is-connected', function (fromAddress, message) {
        self.sendResponse(fromAddress, 'is-connected', {}, message.id);
    });

    self.eventBus.on('text', function (fromAddress, text) {
        console.log('TEXT MESSAGE FROM ' + fromAddress + ': ' + text);

        var message = null;

        try {
            message = JSON.parse(text);
        } catch (err) {
            console.log('NEW MESSAGE FROM ' + fromAddress + ': ' + text + ' NOT A JSON MESSAGE: ' + err);
        }

        if (message !== null) {
            if (message.protocol === 'dagcoin') {
                console.log('DAGCOIN MESSAGE RECEIVED FROM ' + fromAddress);
                self.eventBus.emit('dagcoin.' + message.title, fromAddress, message);
                return Promise.resolve(true);
            }

            console.log('JSON MESSAGE RECEIVED FROM ' + fromAddress + ' WITH UNEXPECTED PROTOCOL: ' + message.protocol);
        }
    });
}

/**
 * Ensures the device is connected and responsive.
 */
DeviceManager.prototype.makeSureDeviceIsConnected = function (pairingCode) {
    var self = this;

    return self.checkOrPairDevice(pairingCode).then(function (correspondent) {
        console.log('RECEIVED A CORRESPONDENT: ' + JSON.stringify(correspondent));

        return self.sendRequestAndListen(correspondent.device_address, 'is-connected', {}).then(function () {
            return Promise.resolve(correspondent.device_address);
        }, function (legacy) {
            self.exceptionManager.logError(legacy);
            // THIS REQUEST DOES NOT WORK ON LEGACY NOT SUPPORTING THE request-response MECHANISM
            /*** === LEGACY STUFF === ***/

            var listener = null;

            var promise = new Promise(function (resolve) {
                listener = function listener(message, fromAddress) {
                    if (fromAddress === correspondent.device_address) {
                        console.log('DEVICE WITH ADDRESS ' + fromAddress + ' IS RESPONSIVE');
                        resolve(correspondent.device_address);
                    } else {
                        console.log('DISCARDED connected message MESSAGE ' + fromAddress + ' != ' + correspondent.device_address);
                    }
                };

                self.eventBus.on('dagcoin.connected', listener);
            }).then(function (deviceAddress) {
                self.eventBus.removeListener('dagcoin.connected', listener);
                return Promise.resolve(deviceAddress);
            }, function (error) {
                self.eventBus.removeListener('dagcoin.connected', listener);
                return Promise.reject(self.exceptionManager.generateError(error));
            });

            return new Promise(function (resolve, reject) {
                self.exceptionManager.rejectOnException(self.device.sendMessageToDevice, correspondent.device_address, 'text', JSON.stringify({
                    protocol: 'dagcoin',
                    title: 'is-connected'
                }), {
                    ifOk: function ifOk() {
                        console.log('MESSAGE SENT: is-connected');
                        resolve();
                    },
                    ifError: function ifError(error) {
                        reject(error);
                    }
                }).catch(function (e) {
                    reject(e);
                });
            }).then(function () {
                return self.timedPromises.timedPromise(promise, self.conf.DAGCOIN_MESSAGE_TIMEOUT, 'DEVICE ' + correspondent.device_address + ' DID NOT REPLY TO THE LEGACY CONNECTION TEST');
            });
        });
    });
};

DeviceManager.prototype.lookupDeviceByPublicKey = function (pubkey) {
    return this.dbManager.query('SELECT device_address FROM correspondent_devices WHERE pubkey = ? AND is_confirmed = 1', [pubkey]).then(function (rows) {
        if (rows.length === 0) {
            console.log('DEVICE WITH PUBKEY ' + pubkey + ' NOT YET PAIRED');
            return Promise.resolve(null);
        } else {
            var deviceAddress = rows[0].device_address;
            console.log('DEVICE WITH PUBKEY ' + pubkey + ' ALREADY PAIRED: ' + deviceAddress);
            return Promise.resolve(deviceAddress);
        }
    });
};

DeviceManager.prototype.pairDevice = function (pubkey, hub, pairingSecret) {
    var self = this;

    return new Promise(function (resolve, reject) {
        self.exceptionManager.rejectOnException(self.device.addUnconfirmedCorrespondent, pubkey, hub, 'New', function (deviceAddress) {
            console.log('PAIRING WITH ' + deviceAddress + ' ... ADD UNCONFIRMED CORRESPONDENT');
            resolve(deviceAddress);
        }).catch(function (e) {
            reject(e);
        });
    }).then(function (deviceAddress) {
        console.log('PAIRING WITH ' + deviceAddress + ' ... ADD UNCONFIRMED CORRESPONDENT WAITING FOR PAIRING');
        return new Promise(function (resolve, reject) {
            self.exceptionManager.rejectOnException(self.device.startWaitingForPairing, function (reversePairingInfo) {
                resolve({
                    deviceAddress: deviceAddress,
                    reversePairingInfo: reversePairingInfo
                });
            }).catch(function (e) {
                reject(e);
            });
        });
    }).then(function (params) {
        return new Promise(function (resolve, reject) {
            self.exceptionManager.rejectOnException(self.device.sendPairingMessage, hub, pubkey, pairingSecret, params.reversePairingInfo.pairing_secret, {
                ifOk: function ifOk() {
                    resolve(params.deviceAddress);
                },
                ifError: function ifError(error) {
                    reject(self.exceptionManager.generateError(error));
                }
            }).catch(function (e) {
                reject(e);
            });
        });
    }).then(function (deviceAddress) {
        console.log('LOOKING UP CORRESPONDENT WITH DEVICE ADDRESS ' + deviceAddress);
        return self.getCorrespondent(deviceAddress);
    });
};

DeviceManager.prototype.getCorrespondent = function (deviceAddress) {
    var self = this;
    console.log('GETTING CORRESPONDENT FROM DB WITH DEVICE ADDRESS ' + deviceAddress);

    return new Promise(function (resolve, reject) {
        self.exceptionManager.rejectOnException(self.device.readCorrespondent, deviceAddress, resolve).catch(function (e) {
            reject(e);
        });
    });
};

DeviceManager.prototype.checkOrPairDevice = function (pairCode) {
    var _this2 = this;

    var matches = pairCode.match(/^([\w\/+]+)@([\w.:\/-]+)#([\w\/+-]+)$/);
    var pubkey = matches[1];
    var hub = matches[2];
    var pairingSecret = matches[3];

    return this.lookupDeviceByPublicKey(pubkey).then(function (deviceAddress) {
        if (deviceAddress === null) {
            return _this2.pairDevice(pubkey, hub, pairingSecret);
        }

        return _this2.getCorrespondent(deviceAddress);
    });
};

DeviceManager.prototype.nextMessageId = function () {
    var id = this.messageCounter;
    this.messageCounter += 1;
    return id;
};

DeviceManager.prototype.sendMessage = function (deviceAddress, messageType, subject, messageBody, messageId) {
    if (!deviceAddress) {
        return Promise.reject(Error('CALLING deviceManager.sendMessage: PARAMETER deviceAddress UNSPECIFIED'));
    }

    if (!messageType) {
        return Promise.reject(Error('CALLING deviceManager.sendMessage: PARAMETER messageType UNSPECIFIED'));
    }

    if (!subject) {
        return Promise.reject(Error('CALLING deviceManager.sendMessage: PARAMETER subject UNSPECIFIED'));
    }

    var self = this;

    if (messageId == null) {
        messageId = this.nextMessageId();
    }

    var message = {
        protocol: 'dagcoin',
        title: messageType + '.' + subject,
        id: messageId,
        messageType: messageType,
        messageBody: messageBody
    };

    return new Promise(function (resolve, reject) {
        self.exceptionManager.rejectOnException(self.device.sendMessageToDevice, deviceAddress, 'text', JSON.stringify(message), {
            onSaved: function onSaved() {
                console.log('A MESSAGE WAS SAVED INTO THE DATABASE: ' + JSON.stringify(message));
            },
            ifOk: function ifOk() {
                resolve(message.id);
            },
            ifError: function ifError(error) {
                reject(error);
            }
        }).catch(function (e) {
            reject(e);
        });
    });
};

DeviceManager.prototype.sendRequest = function (deviceAddress, subject, messageBody, messageId) {
    return this.sendMessage(deviceAddress, 'request', subject, messageBody, messageId);
};

DeviceManager.prototype.sendResponse = function (deviceAddress, subject, messageBody, messageId) {
    return this.sendMessage(deviceAddress, 'response', subject, messageBody, messageId);
};

DeviceManager.prototype.sendRequestAndListen = function (deviceAddress, subject, messageBody) {
    var self = this;

    var messageId = self.nextMessageId();

    console.log('SENDING MESSAGE WITH ID: ' + messageId);

    var listeningPromise = self.timedPromises.listeningTimedPromise('dagcoin.response.' + subject, messageId, deviceAddress, self.conf.DAGCOIN_MESSAGE_TIMEOUT, 'DID NOT RECEIVE A REPLY TO MESSAGE ' + messageId + ' FROM ' + deviceAddress + ' FOR ' + JSON.stringify(messageBody));

    console.log('SENDING REQUEST ' + subject + ' TO ' + deviceAddress);

    return this.sendMessage(deviceAddress, 'request', subject, messageBody, messageId).then(function () {
        console.log('LISTENING ' + subject + ' FROM ' + deviceAddress);

        return listeningPromise;
    });
};

module.exports = DeviceManager;

module.exports.getInstance = function () {
    if (!instance) {
        instance = new DeviceManager();
    }

    return instance;
};