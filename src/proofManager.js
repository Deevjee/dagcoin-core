'use strict';

let instance = null;

// My module
function ProofManager() {
    this.ecdsaSig = require('byteballcore/signature');
    this.db = require('byteballcore/db');
    this.hasher = require('byteballcore/object_hash');
    this.crypto = require('crypto');
    this.deviceManager = require('dagcoin-core/lib/deviceManager').getInstance();

    this.active = false;
}

ProofManager.prototype.proofAddressBatch = function (proofAddressBatch, deviceAddress) {
    const self = this;

    if (!proofAddressBatch || proofAddressBatch.length === 0) {
        console.log('NOTHING TO PROOF');
        return Promise.resolve({validBatch: [], invalidBatch: []});
    }

    const proof = proofAddressBatch.pop();

    return self.proofAddressBatch(proofAddressBatch, deviceAddress).then((result) => {
        return self.proofAddressAndSaveToDB(proof, deviceAddress).then((valid) => {
            if (valid) {
                result.validBatch.push(proof);
            } else {
                result.invalidBatch.push(proof);
            }

            return Promise.resolve(result);
        });
    });
};

ProofManager.prototype.proofAddress = function (proof, proofDeviceAddress) {
    const self = this;

    let deviceAddress = proofDeviceAddress;

    if (!deviceAddress) {
        deviceAddress = proof.device_address;

        if (!deviceAddress) {
            throw Error('NO DEVICE ADDRESS AVAILABLE FOR PROOFING');
        }
    }

    if (!proof) {
        throw Error('PARAMETER proof IS NOT SET');
    }

    if (!proof.address) {
        throw Error('PARAMETER proof.address IS NOT SET');
    }

    if (!proof.address_definition) {
        throw Error('PARAMETER proof.address_definition IS NOT SET');
    }

    const definition = JSON.parse(proof.address_definition);

    const definitionHash = self.hasher.getChash160(definition);

    if (definitionHash !== proof.address) {
        console.log(`DEFINITION VALIDATION FAILED: ${proof.address} IS NOT THE HASH OF ${proof.address_definition} (THI IS: ${definitionHash})`);
        return Promise.resolve(false);
    }

    console.log(`HASH 160 VALIDATED: ${proof.address} IS THE HASH OF ${proof.address_definition}`);

    console.log(`PROOFING ${deviceAddress} AGAINST ${proof.device_address_signature}`);
    const valid = self.proof(deviceAddress, proof.device_address_signature, definition);

    // IT MEANS IT DOES NOT HAVE A MASTER ADDRESS (SO IT IS ONE) OR IS ALREADY INVALID
    if (!proof.master_address || !valid) {
        console.log(`PROOF RESULT: ${valid}`);
        return Promise.resolve(valid);
    }

    //FURTHER PROOF IN CASE OF LINK TO A MASTER ADDRESS
    return new Promise((resolve, reject) => {
        self.db.query(
            `SELECT device_address, address_definition
             FROM dagcoin_proofs 
             WHERE proofed = 1 AND address = ? AND device_address = ?`,
            [proof.master_address, deviceAddress],
            (rows) => {
                if (!rows || rows.length === 0) {
                    console.log(`COULD NOT FIND PROOF FOR MASTER ADDRESS ${proof.master_address} OF ${proof.address} WITH DEVICE
                    ${deviceAddress}`);
                    resolve(false);
                    return;
                }

                if (rows.length > 1) {
                    reject(`TOO MANY PROOF FOR MASTER ADDRESS ${proof.master_address} OF ${proof.address} WITH DEVICE
                    ${deviceAddress}`);
                    return;
                }

                const masterDeviceAddress = rows[0].device_address;

                if (!masterDeviceAddress) {
                    reject(`NO DEVICE ADDRESS FOR MASTER ADDRESS ${proof.master_address} OF ${proof.address} WITH DEVICE
                ${deviceAddress}`);
                    return;
                }

                if (masterDeviceAddress !== deviceAddress) {
                    console.log(`DEVICE ADDRESSES OF MASTER ADDRESS ${proof.master_address} AND ${proof.address} DO NOT MATCH:
                ${deviceAddress} ≃ ${masterDeviceAddress}`);
                    resolve(false);
                    return;
                }

                const masterAddressDefinition = JSON.parse(rows[0].address_definition);

                if (!masterAddressDefinition) {
                    reject(`NO ADDRESS DEFINITION FOR MASTER ADDRESS ${proof.master_address} OF ${proof.address} WITH DEVICE
                ${deviceAddress}`);
                    return;
                }

                resolve(self.proof(proof.address, proof.master_address_signature, masterAddressDefinition));
            }
        );
    });
};

ProofManager.prototype.proof = function (textToProve, signature, definition) {
    if (!textToProve) {
        throw Error('PARAMETER textToProve IS NOT SET');
    }

    if (!signature) {
        throw Error('PARAMETER signature IS NOT SET');
    }

    if (!definition) {
        throw Error('PARAMETER definition IS NOT SET');
    }

    if (!definition[0] === 'sig' || !definition[1].pubkey) {
        throw Error(`DEFINITION DOES NOT CONTAIN A PUBLIC KEY. CHECK THE DEFINITION: ${JSON.stringify(definition)}`);
    }

    const publicKey = definition[1].pubkey;

    const publicKeyBase64 = new Buffer(publicKey, 'base64');
    const bufferOfTextToProve = this.crypto.createHash('sha256').update(textToProve, 'utf8').digest();

    return this.ecdsaSig.verify(bufferOfTextToProve, signature, publicKeyBase64);
};

ProofManager.prototype.proofText = function (proof, text) {
    const self = this;

    if (!proof) {
        throw Error('PARAMETER proof IS NOT SET');
    }

    if (!proof.address) {
        throw Error('PARAMETER proof.address IS NOT SET');
    }

    if (!proof.address_definition) {
        throw Error('PARAMETER proof.address_definition IS NOT SET');
    }

    const definition = JSON.parse(proof.address_definition);

    const definitionHash = self.hasher.getChash160(definition);

    if (definitionHash !== proof.address) {
        console.log(`DEFINITION VALIDATION FAILED: ${proof.address} IS NOT THE HASH OF ${proof.address_definition} (THI IS: ${definitionHash})`);
        return Promise.resolve(false);
    }

    console.log(`HASH 160 VALIDATED: ${proof.address} IS THE HASH OF ${proof.address_definition}`);

    console.log(`PROOFING ${text} AGAINST ${proof.text_signature}`);
    return self.proof(text, proof.text_signature, definition);
};

ProofManager.prototype.hasAddressProofInDb = function (address, deviceAddress) {
    const self = this;

    return new Promise((resolve, reject) => {
        self.db.query(
            'SELECT proofed FROM dagcoin_proofs WHERE address = ? AND device_address = ? ' +
            'UNION SELECT 1 FROM shared_addresses WHERE shared_address = ? ' +
            'UNION SELECT 1 FROM dagcoin_funding_addresses WHERE master_address = ? AND STATUS = \'LEGACY\'',
            [address, deviceAddress, address],
            (rows) => {
                if (!rows || rows.length === 0) {
                    resolve(false);
                    return;
                }

                if (rows.length > 1) {
                    reject(`MORE THAN A PROOF FOR ${address}, ${deviceAddress}. THIS IS UNEXPECTED`);
                    return;
                }

                resolve(rows[0].proofed === 1);
            }
        );
    });
};

/**
 *
 * @param proof
 * @returns {Promise} Resolves to true when the address proof is stored into the db
 */
ProofManager.prototype.proofAddressAndSaveToDB = function (proof, deviceAddress) {
    const self = this;

    return new Promise((resolve, reject) => {
        self.db.query(
            'SELECT address, proofed FROM dagcoin_proofs WHERE address = ? AND device_address = ?',
            [proof.address, deviceAddress],
            (rows) => {
                if (!rows || rows.length === 0) {
                    console.log(`NO PROOF AVAILABLE FOR ${proof.address} YET`);
                    resolve (false);
                    return;
                }

                if (rows.length > 1) {
                    reject(`TOO MANY PROOFS AVAILABLE FOR ${proof.address}: ${rows.length}. CHECK THE DATABASE STATE`);
                    return;
                }

                const previousProof = rows[0];

                if (!previousProof.proofed) {
                    console.log(`ALREADY DETECTED A FAILED ATTEMPT TO PROOF ${proof.address} OWNERSHIP TO ${deviceAddress}`);

                    self.db.query(
                        'DELETE FROM dagcoin_proofs WHERE address = ? AND device_address = ?',
                        [proof.address, deviceAddress],
                        (result) => {
                            console.log(`DB DELETE OF OLD PROOF OF ${proof.address} OWNERSHIP TO ${deviceAddress} : ${result}`)
                            resolve (false);
                        }
                    );

                    return;
                }

                resolve(true);
            }
        );
    }).then((alreadyProofed) => {
        if(alreadyProofed) {
            return Promise.resolve(true);
        }

        return self.proofAddress(proof, deviceAddress).then((proofed) => {
            return new Promise((resolve) => {
                self.db.query(`
                    INSERT INTO dagcoin_proofs (
                        address,
                        address_definition,
                        device_address_signature,
                        master_address,
                        master_address_signature,
                        device_address,
                        proofed
                    ) VALUES(?, ?, ?, ?, ?, ?, ?)`,
                    [
                        proof.address,
                        proof.address_definition,
                        proof.device_address_signature,
                        proof.master_address,
                        proof.master_address_signature,
                        deviceAddress,
                        proofed
                    ],
                    (result) => {
                        console.log(`DB DELETE OF OLD PROOF OF ${proof.address} OWNERSHIP TO ${deviceAddress} : ${result}`)
                        resolve(proofed);
                    }
                );
            });
        });
    });
};

ProofManager.prototype.askForProofs = function (deviceAddress, addresses) {
    if (!addresses || addresses.length === 0) {
        console.log('ProofManager.askForProofs: CALLED WITH AN EMPTY LIST OF addresses. NOTHING TO BE DONE');
        return Promise.resolve(null);
    }

    const self = this;

    return self.deviceManager.sendRequestAndListen(deviceAddress, 'proofing', { addresses }).then((messageBody) => {
        const proofs = messageBody.proofs;

        console.log(`PROOFS: ${JSON.stringify(proofs)}`);

        if (!proofs || proofs.length === 0) {
            return Promise.reject(`NO PROOFS PROVIDED IN THE CLIENT RESPONSE FOR ${JSON.stringify(addresses)}`);
        } else {
            return Promise.resolve(proofs);
        }
    }).then((proofs) => {
        return self.proofAddressBatch(proofs, deviceAddress);
    });
};

module.exports = ProofManager;
module.exports.getInstance = function () {
    if (!instance) {
        instance = new ProofManager();
    }

    return instance;
};