'use strict';

let instances = {};

// My module
function Signer (xPrivateKey) {
    this.xPrivateKey = xPrivateKey;

	this.constants = require('byteballcore/constants.js');
	this.objectHash = require('byteballcore/object_hash.js');
	this.ecdsaSig = require('byteballcore/signature.js');
	this.db = require('byteballcore/db');
	this.device = require('byteballcore/device');
    this.eventBus = require('byteballcore/event_bus');
    this.walletGeneral = require('byteballcore/wallet_general');
    this.async = require('async');
}

Signer.prototype.signWithLocalPrivateKey = function (wallet_id, account, is_change, address_index, text_to_sign, handleSig) {
	const path = "m/44'/0'/" + account + "'/"+is_change+"/"+address_index;
	const privateKey = this.xPrivateKey.derive(path).privateKey;
    const privKeyBuf = privateKey.bn.toBuffer({size:32}); // https://github.com/bitpay/bitcore-lib/issues/47
    handleSig(this.ecdsaSig.sign(text_to_sign, privKeyBuf));
};

Signer.prototype.readSigningPaths = function(conn, address, handleLengthsBySigningPaths) {
    const self = this;

    const arrSigningDeviceAddresses = [self.device.getMyDeviceAddress()];

    this.readFullSigningPaths(conn, address, arrSigningDeviceAddresses, function(assocTypesBySigningPaths){
        var assocLengthsBySigningPaths = {};
        for (var signing_path in assocTypesBySigningPaths){
            var type = assocTypesBySigningPaths[signing_path];
            if (type === 'key')
                assocLengthsBySigningPaths[signing_path] = self.constants.SIG_LENGTH;
            else
                throw Error("unknown type "+type+" at "+signing_path);
        }
        handleLengthsBySigningPaths(assocLengthsBySigningPaths);
    });
};

Signer.prototype.readDefinition = function(conn, address, handleDefinition) {
    conn.query("SELECT definition FROM my_addresses WHERE address=?", [address], function(rows){
        if (rows.length !== 1)
            throw "definition not found";
        handleDefinition(null, JSON.parse(rows[0].definition));
    });
};

Signer.prototype.sign = function(objUnsignedUnit, assocPrivatePayloads, address, signing_path, handleSignature) {
    const self = this;

    var buf_to_sign = self.objectHash.getUnitHashToSign(objUnsignedUnit);

    self.findAddress(address, signing_path, {
        ifError: function(err){
            throw Error(err);
        },
        ifUnknownAddress: function(err){
            throw Error("unknown address "+address+" at "+signing_path);
        },
        ifLocal: function(objAddress){
            self.signWithLocalPrivateKey(objAddress.wallet, objAddress.account, objAddress.is_change, objAddress.address_index, buf_to_sign, function(sig){
                handleSignature(null, sig);
            });
        },
        ifRemote: function(device_address){
            // we'll receive this event after the peer signs
            self.eventBus.once("signature-"+device_address+"-"+address+"-"+signing_path+"-"+buf_to_sign.toString("base64"), function(sig){
                handleSignature(null, sig);
                if (sig === '[refused]')
                    self.eventBus.emit('refused_to_sign', device_address);
            });
            self.walletGeneral.sendOfferToSign(device_address, address, signing_path, objUnsignedUnit, assocPrivatePayloads);
            if (!bRequestedConfirmation){
                self.eventBus.emit("confirm_on_other_devices");
            }
        },
        ifMerkle: function(bLocal){
            if (!bLocal)
                throw Error("merkle proof at path "+signing_path+" should be provided by another device");
            if (!merkle_proof)
                throw Error("merkle proof at path "+signing_path+" not provided");
            handleSignature(null, merkle_proof);
        }
    });
};

// returns assoc array signing_path => (key|merkle)
Signer.prototype.readFullSigningPaths = function (conn, address, arrSigningDeviceAddresses, handleSigningPaths) {
    const self = this;

    var assocSigningPaths = {};

    function goDeeper(member_address, path_prefix, onDone){

        console.log(`SIGNING MEMBER: ${member_address}: ${path_prefix}`);

        // first, look for wallet addresses
        var sql = "SELECT signing_path FROM my_addresses JOIN wallet_signing_paths USING(wallet) WHERE address=?";
        var arrParams = [member_address];
        if (arrSigningDeviceAddresses && arrSigningDeviceAddresses.length > 0){
            sql += " AND device_address IN(?)";
            arrParams.push(arrSigningDeviceAddresses);
        }
        conn.query(sql, arrParams, function(rows){
            rows.forEach(function(row){
                assocSigningPaths[path_prefix + row.signing_path.substr(1)] = 'key';
            });
            if (rows.length > 0)
                return onDone();
            // next, look for shared addresses, and search from there recursively
            sql = "SELECT signing_path, address FROM shared_address_signing_paths WHERE shared_address=?";
            arrParams = [member_address];
            if (arrSigningDeviceAddresses && arrSigningDeviceAddresses.length > 0){
                sql += " AND device_address IN(?)";
                arrParams.push(arrSigningDeviceAddresses);
            }
            conn.query(sql, arrParams, function(rows){
                if(rows.length > 0) {
                    self.async.eachSeries(
                        rows,
                        function (row, cb) {
                            if (row.address === '') { // merkle
                                assocSigningPaths[path_prefix + row.signing_path.substr(1)] = 'merkle';
                                return cb();
                            }

                            goDeeper(row.address, path_prefix + row.signing_path.substr(1), cb);
                        },
                        onDone
                    );
                } else {
                    assocSigningPaths[path_prefix] = 'key';
                    onDone();
                }
            });
        });
    }

    goDeeper(address, 'r', function(){
        console.log(`SIGNING PATHS: ${JSON.stringify(assocSigningPaths)}`);
        handleSigningPaths(assocSigningPaths); // order of signing paths is not significant
    });
};

Signer.prototype.findAddress = function (address, signing_path, callbacks, fallback_remote_device_address){
    const self = this;

    self.db.query(
        "SELECT wallet, account, is_change, address_index, full_approval_date, device_address \n\
        FROM my_addresses JOIN wallets USING(wallet) JOIN wallet_signing_paths USING(wallet) \n\
        WHERE address=? AND signing_path=?",
        [address, signing_path],
        function(rows){
            if (rows.length > 1)
                throw Error("more than 1 address found");
            if (rows.length === 1){
                var row = rows[0];
                if (!row.full_approval_date)
                    return callbacks.ifError("wallet of address "+address+" not approved");
                if (row.device_address !== self.device.getMyDeviceAddress())
                    return callbacks.ifRemote(row.device_address);
                var objAddress = {
                    address: address,
                    wallet: row.wallet,
                    account: row.account,
                    is_change: row.is_change,
                    address_index: row.address_index
                };
                callbacks.ifLocal(objAddress);
                return;
            }
            self.db.query(
                //	"SELECT address, device_address, member_signing_path FROM shared_address_signing_paths WHERE shared_address=? AND signing_path=?",
                // look for a prefix of the requested signing_path
                "SELECT address, device_address, signing_path FROM shared_address_signing_paths \n\
                WHERE shared_address=? AND signing_path=SUBSTR(?, 1, LENGTH(signing_path))",
                [address, signing_path],
                function(sa_rows){
                    if (rows.length > 1)
                        throw Error("more than 1 member address found for shared address "+address+" and signing path "+signing_path);
                    if (sa_rows.length === 0){
                        if (fallback_remote_device_address)
                            return callbacks.ifRemote(fallback_remote_device_address);
                        return callbacks.ifUnknownAddress();
                    }
                    var objSharedAddress = sa_rows[0];
                    var relative_signing_path = 'r' + signing_path.substr(objSharedAddress.signing_path.length);
                    var bLocal = (objSharedAddress.device_address === self.device.getMyDeviceAddress()); // local keys
                    if (objSharedAddress.address === '')
                        return callbacks.ifMerkle(bLocal);
                    self.findAddress(objSharedAddress.address, relative_signing_path, callbacks, bLocal ? null : objSharedAddress.device_address);
                }
            );
        }
    );
};

/**
 /**
 * Verifies an hash signed with a private key
 * @param hash Some hash to be compared
 * @param b64_sig The hash signature (generated using a private key PrK)
 * @param b64_pub_key The public key corresponding to PrK
 *
 * Returns true if the verification succeeded.
 */
Signer.prototype.verify = function(hash, b64_sig, b64_pub_key) {
    return this.ecdsaSig.verify(hash, b64_sig, b64_pub_key);
};

module.exports = Signer;
module.exports.getInstance = function (xPrivateKey) {
    if (!instances[xPrivateKey]) {
        instances[xPrivateKey] = new Signer(xPrivateKey);
    }

    return instances[xPrivateKey];
};