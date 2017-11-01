'use strict';

let instance = null;

function DeviceManager() {
    this.device = require('byteballcore/device');
    this.conf = require('byteballcore/conf');
    const DatabaseManager = require('./databaseManager');
    this.dbManager = new DatabaseManager();
    this.DeviceManagerAddresses = [];
    this.DeviceManagerAvailabilityCheckingPromise = null;
    this.timedPromises = require('./promiseManager');

    this.messageCounter = 0;

    this.eventBus = require('byteballcore/event_bus');
    this.eventBus.on('text', function (fromAddress, text) {
        console.log(`TEXT MESSAGE FROM ${fromAddress}: ${text}`);

        let message = null;

        try {
            message = JSON.parse(text);
        } catch (err) {
            console.log(`NEW MESSAGE FROM ${fromAddress}: ${text} NOT A JSON MESSAGE: ${err}`);
        }

        if (message !== null) {
            if (message.protocol === 'dagcoin') {
                console.log(`DAGCOIN MESSAGE RECEIVED FROM ${fromAddress}`);
                eventBus.emit(`dagcoin.${message.title}`, message, fromAddress);
                return Promise.resolve(true);
            }

            console.log(`JSON MESSAGE RECEIVED FROM ${fromAddress} WITH UNEXPECTED PROTOCOL: ${message.protocol}`);
        }
    });
}

/**
 * Ensures the device is connected and responsive.
 */
DeviceManager.prototype.makeSureDeviceIsConnected = function (pairingCode) {
    const self = this;

    return this.checkOrPairDevice(pairingCode).then((correspondent) => {
        console.log(`RECEIVED A CORRESPONDENT: ${JSON.stringify(correspondent)}`);

        return self.sendRequestAndListen(correspondent.device_address, 'is-connected', {});
    });
};

DeviceManager.prototype.lookupDeviceByPublicKey = function (pubkey) {
    return this.dbManager.query(
        'SELECT device_address FROM correspondent_devices WHERE pubkey = ? AND is_confirmed = 1',
        [pubkey]
    ).then((rows) => {
        if (rows.length === 0) {
            console.log(`DEVICE WITH PUBKEY ${pubkey} NOT YET PAIRED`);
            return Promise.resolve(null);
        } else {
            const deviceAddress = rows[0].device_address;
            console.log(`DEVICE WITH PUBKEY ${pubkey} ALREADY PAIRED: ${deviceAddress}`);
            return Promise.resolve(deviceAddress);
        }
    });
};

DeviceManager.prototype.pairDevice = function (pubkey, hub, pairingSecret) {
    const self = this;

    return new Promise((resolve, reject) => {
        try {
            self.device.addUnconfirmedCorrespondent(pubkey, hub, 'New', (deviceAddress) => {
                console.log(`PAIRING WITH ${deviceAddress} ... ADD UNCONFIRMED CORRESPONDENT`);
                resolve(deviceAddress);
            });
        } catch (e) {
            reject(new Error(`WHILE CALLING device.addUnconfirmedCorrespondent WITH pubkey=${pubkey} hub=${hub} device_name=New: ${e.message}`));
        }
    }).then((deviceAddress) => {
        console.log(`PAIRING WITH ${deviceAddress} ... ADD UNCONFIRMED CORRESPONDENT WAITING FOR PAIRING`);
        return new Promise((resolve, reject) => {
            try {
                self.device.startWaitingForPairing((reversePairingInfo) => {
                    resolve({
                        deviceAddress,
                        reversePairingInfo
                    });
                });
            } catch (e) {
                reject(new Error(`WHILE CALLING device.startWaitingForPairing WITH device_address=${deviceAddress}: ${e.message}`));
            }
        });
    }).then((params) => {
        return new Promise((resolve, reject) => {
            console.log(`PAIRING WITH ${params.deviceAddress} ... SENDING PAIRING MESSAGE`);

            try {
                self.device.sendPairingMessage(
                    hub,
                    pubkey,
                    pairingSecret,
                    params.reversePairingInfo.pairing_secret,
                    {
                        ifOk: () => {
                            resolve(params.deviceAddress);
                        },
                        ifError: (error) => {
                            reject(`FAILED DELIVERING THE PAIRING MESSAGE: ${error}`);
                        }
                    }
                );
            } catch(e) {
                reject(new Error(`WHILE CALLING device.sendPairingMessage WITH 
                    hub=${hub} pubkey=${pubkey} pairingSecret=${pairingSecret}
                    reversePairingSecret=${params.reversePairingInfo.pairing_secret}: ${e.message}`));
            }
        });
    }).then((deviceAddress) => {
        console.log(`LOOKING UP CORRESPONDENT WITH DEVICE ADDRESS ${deviceAddress}`);
        return self.getCorrespondent(deviceAddress);
    });
};

DeviceManager.prototype.getCorrespondent = function (deviceAddress) {
    const self = this;
    console.log(`GETTING CORRESPONDENT FROM DB WITH DEVICE ADDRESS ${deviceAddress}`);
    return new Promise((resolve, reject) => {
        try {
            self.device.readCorrespondent(deviceAddress, (correspondent) => {
                resolve(correspondent);
            });
        } catch(e) {
            reject(new Error(`WHILE CALLING device.readCorrespondent WITH deviceAddress=${deviceAddress}: ${e.message}`));
        }
    });
};

DeviceManager.prototype.checkOrPairDevice = function(pairCode) {
    const matches = pairCode.match(/^([\w\/+]+)@([\w.:\/-]+)#([\w\/+-]+)$/);
    const pubkey = matches[1];
    const hub = matches[2];
    const pairingSecret = matches[3];

    return this.lookupDeviceByPublicKey(pubkey).then((deviceAddress) => {
        if (deviceAddress === null) {
            return this.pairDevice(pubkey, hub, pairingSecret);
        }

        return this.getCorrespondent(deviceAddress);
    });
};

DeviceManager.prototype.nextMessageId = function () {
    const id = this.messageCounter;
    this.messageCounter += 1;
    return id;
};

DeviceManager.prototype.sendMessage = function (deviceAddress, messageType, subject, messageBody, messageId) {
    if (!deviceAddress) {
        return Promise.reject(Error('CALLING deviceManager.sendMessage: PARAMETER deviceAddress UNSPECIFIED'));
    }

    if (!messageType) {
        return Promise.reject(Error('CALLING deviceManager.sendMessage: PARAMETER messageType UNSPECIFIED'))
    }

    if (!subject) {
        return Promise.reject(Error('CALLING deviceManager.sendMessage: PARAMETER subject UNSPECIFIED'))
    }

    const self = this;

    if (messageId == null) {
        messageId = this.nextMessageId();
    }

    return new Promise((resolve, reject) => {
        const message = {
            protocol: 'dagcoin',
            title: `${messageType}.${subject}`,
            id: messageId,
            messageType,
            messageBody
        };
        try {
            self.device.sendMessageToDevice(deviceAddress, 'text', JSON.stringify(message), {
                ifOk() {
                    resolve(message.id);
                },
                ifError(error) {
                    reject(error);
                }
            });
        } catch(e) {
            reject(new Error(`WHILE CALLING device.sendMessageToDevice WITH 
            deviceAddress=${deviceAddress} subject=text body=${JSON.stringify(message)}: ${e.message}`));
        }
    });
};

DeviceManager.prototype.sendRequest = function (deviceAddress, subject, messageBody, messageId) {
    return this.sendMessage(deviceAddress, 'request', subject, messageBody, messageId);
};

DeviceManager.prototype.sendResponse = function (deviceAddress, subject, messageBody, messageId) {
    return this.sendMessage(deviceAddress, 'response', subject, messageBody, messageId);
};

DeviceManager.prototype.sendRequestAndListen = function (deviceAddress, subject, messageBody) {
    const self = this;

    const messageId = self.nextMessageId();

    console.log(`SENDING MESSAGE WITH ID: ${messageId}`);

    const listeningPromise = self.timedPromises.listeningTimedPromise(
        `dagcoin.response.${subject}`,
        messageId,
        deviceAddress,
        `TIMEOUT WAITING FOR RESPONSE TO MESSAGE ${messageId} FROM ${deviceAddress} FOR ${JSON.stringify(messageBody)}`,
        `DID NOT RECEIVE A REPLY TO MESSAGE ${messageId} FROM ${deviceAddress} FOR ${JSON.stringify(messageBody)}`
    );

    console.log(`SENDING REQUEST ${subject} TO ${deviceAddress}`);

    return this.sendMessage(deviceAddress, 'request', subject, messageBody, messageId).then(() => {
        console.log(`LISTENING ${subject} FROM ${deviceAddress}`);

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
