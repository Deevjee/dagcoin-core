'use strict';

let instance = null;

function DeviceManager() {
    this.device = require('byteballcore/device');
    this.conf = require('byteballcore/conf');
    this.dbManager = require('./databaseManager').getInstance();
    this.timedPromises = require('./promiseManager');

    this.messageCounter = 0;

    this.eventBus = require('byteballcore/event_bus');
    this.exceptionManager = require('./exceptionManager');

    const self = this;

    // For backward compatibility with older versions
    self.eventBus.on('dagcoin.is-connected', (fromAddress, message) => {
        const reply = {
            protocol: 'dagcoin',
            title: 'connected'
        };

        self.exceptionManager.logOnFailure(
            this.device.sendMessageToDevice,
            fromAddress,
            'text',
            JSON.stringify(reply),
            {
                ifOk: () => {
                    console.log(`REPLIED TO ${fromAddress}, WHO WANTED TO KNOW WHETHER I WERE CONNECTED`);
                },
                ifError: (error) => {
                    self.exceptionManager.logError(error);
                }
            }
        );
    });

    self.eventBus.on('dagcoin.request.is-connected', (fromAddress, message) => {
        self.sendResponse(fromAddress, 'is-connected', {}, message.id);
    });

    self.eventBus.on('text', function (fromAddress, text) {
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
                self.eventBus.emit(`dagcoin.${message.title}`, fromAddress, message);
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

    return self.checkOrPairDevice(pairingCode).then((correspondent) => {
        console.log(`RECEIVED A CORRESPONDENT: ${JSON.stringify(correspondent)}`);

        return self.sendRequestAndListen(correspondent.device_address, 'is-connected', {}).then(
            () => {
                return Promise.resolve(correspondent.device_address);
            },
            (legacy) => {
                self.exceptionManager.logError(legacy);
                // THIS REQUEST DOES NOT WORK ON LEGACY NOT SUPPORTING THE request-response MECHANISM
                /*** === LEGACY STUFF === ***/

                let listener = null;

                const promise = new Promise((resolve) => {
                    listener = function (message, fromAddress) {
                        if (fromAddress === correspondent.device_address) {
                            console.log(`DEVICE WITH ADDRESS ${fromAddress} IS RESPONSIVE`);
                            resolve(correspondent.device_address);
                        } else {
                            console.log(`DISCARDED connected message MESSAGE ${fromAddress} != ${correspondent.device_address}`);
                        }
                    };

                    self.eventBus.on('dagcoin.connected', listener);
                }).then(
                    (deviceAddress) => {
                        self.eventBus.removeListener('dagcoin.connected', listener);
                        return Promise.resolve(deviceAddress);
                    },
                    (error) => {
                        self.eventBus.removeListener('dagcoin.connected', listener);
                        return Promise.reject(self.exceptionManager.generateError(error));
                    }
                );

                return new Promise((resolve, reject) => {
                    self.exceptionManager.rejectOnException(
                        self.device.sendMessageToDevice,
                        correspondent.device_address,
                        'text',
                        JSON.stringify({
                            protocol: 'dagcoin',
                            title: 'is-connected'
                        }),
                        {
                            ifOk() {
                                console.log(`MESSAGE SENT: is-connected`);
                                resolve();
                            },
                            ifError(error) {
                                reject(error);
                            }
                        }
                    ).catch((e) => {reject(e)});
                }).then(() => {
                    return self.timedPromises.timedPromise(
                        promise,
                        self.conf.DAGCOIN_MESSAGE_TIMEOUT,
                        `DEVICE ${correspondent.device_address} DID NOT REPLY TO THE LEGACY CONNECTION TEST`
                    );
                });
            }
        );
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
        self.exceptionManager.rejectOnException(
            self.device.addUnconfirmedCorrespondent,
            pubkey,
            hub,
            'New',
            (deviceAddress) => {
                console.log(`PAIRING WITH ${deviceAddress} ... ADD UNCONFIRMED CORRESPONDENT`);
                resolve(deviceAddress);
            }
        ).catch((e) => {reject(e)});
    }).then((deviceAddress) => {
        console.log(`PAIRING WITH ${deviceAddress} ... ADD UNCONFIRMED CORRESPONDENT WAITING FOR PAIRING`);
        return new Promise((resolve, reject) => {
            self.exceptionManager.rejectOnException(
                self.device.startWaitingForPairing,
                (reversePairingInfo) => {
                    resolve({
                        deviceAddress,
                        reversePairingInfo
                    });
                }
            ).catch((e) => {reject(e)});
        });
    }).then((params) => {
        return new Promise((resolve, reject) => {
            self.exceptionManager.rejectOnException(
                self.device.sendPairingMessage,
                hub,
                pubkey,
                pairingSecret,
                params.reversePairingInfo.pairing_secret,
                {
                    ifOk: () => {
                        resolve(params.deviceAddress);
                    },
                    ifError: (error) => {
                        reject(self.exceptionManager.generateError(error));
                    }
                }
            ).catch((e) => {reject(e)});
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
        self.exceptionManager.rejectOnException(
            self.device.readCorrespondent,
            deviceAddress,
            resolve
        ).catch((e) => {reject(e)});
    });
};


DeviceManager.prototype.getCorrespondentList = function () {
    return this.dbManager.query(`SELECT device_address, hub, name, my_record_pref, peer_record_pref, latest_message_date
        FROM correspondent_devices CD
        LEFT JOIN (SELECT correspondent_address, MAX(creation_date) AS latest_message_date 
        FROM chat_messages GROUP BY correspondent_address) CM
        ON CM.correspondent_address = CD.device_address
        ORDER BY latest_message_date DESC, name ASC`)
    .then((rows) => {
        return Promise.resolve(rows);
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

    const message = {
        protocol: 'dagcoin',
        title: `${messageType}.${subject}`,
        id: messageId,
        messageType,
        messageBody
    };

    return new Promise((resolve, reject) => {
        self.exceptionManager.rejectOnException(
            self.device.sendMessageToDevice,
            deviceAddress,
            'text',
            JSON.stringify(message),
            {
                onSaved: function () {
                    console.log(`A MESSAGE WAS SAVED INTO THE DATABASE: ${JSON.stringify(message)}`);
                },
                ifOk() {
                    resolve(message.id);
                },
                ifError(error) {
                    reject(error);
                }
            }
        ).catch((e) => {reject(e)});
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
        self.conf.DAGCOIN_MESSAGE_TIMEOUT,
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
