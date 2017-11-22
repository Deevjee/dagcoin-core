'use strict';

// My module

function WalletManager() {
	this.walletDefinedByKeys = require('byteballcore/wallet_defined_by_keys.js');
	this.db = require('byteballcore/db.js');
	this.device = require('byteballcore/device');
	this.Bitcore = require('bitcore-lib');
}

WalletManager.prototype.getWalletId = function () {
	return this.walletId;
};

WalletManager.prototype.exists = function () {
	var self = this;

	return new Promise(function (resolve, reject) {
		self.db.query("SELECT wallet FROM wallets", function (rows) {
			if (rows.length === 0) {
				resolve(false);
			} else if (rows.length > 1) {
				reject('MORE THAN ONE WALLET FOUND: ' + rows.length);
			} else {
				resolve(true);
			}
		});
	});
};

WalletManager.prototype.getSingle = function () {
	var self = this;

	if (this.walletId) {
		return Promise.resolve(this.walletId);
	}

	return new Promise(function (resolve, reject) {
		self.db.query("SELECT wallet FROM wallets", function (rows) {
			if (rows.length === 0) {
				reject("NO WALLETS AVAILABLE");
			} else if (rows.length > 1) {
				reject('MORE THAN ONE WALLET FOUND: ' + rows.length);
			} else {
				self.walletId = rows[0].wallet;
				resolve(rows[0].wallet);
			}
		});
	});
};

WalletManager.prototype.issueAddress = function () {
	var self = this;

	return self.getSingle().then(function (walletId) {
		return new Promise(function (resolve, reject) {
			self.walletDefinedByKeys.issueNextAddress(walletId, 0, function (addressInfo) {
				if (addressInfo) {
					resolve(addressInfo.address);
				} else {
					reject('COULD NOT ISSUE A NEW ADDRESS. NO EXCEPTION WAS THROWN');
				}
			});
		});
	});
};

WalletManager.prototype.create = function (xPrivKey) {
	var self = this;

	return new Promise(function (resolve) {
		var devicePrivKey = xPrivKey.derive("m/1'").privateKey.bn.toBuffer({ size: 32 });

		self.device.setDevicePrivateKey(devicePrivKey); // we need device address before creating a wallet
		var strXPubKey = self.Bitcore.HDPublicKey(xPrivKey.derive("m/44'/0'/0'")).toString();

		self.walletDefinedByKeys.createWalletByDevices(strXPubKey, 0, 1, [], 'any walletName', true, function (walletId) {
			console.log('WALLET CREATED WITH ID: ' + walletId);
			self.walletId = walletId;
			resolve(walletId);
		});
	}).then(function () {
		return self.issueAddress();
	});
};

WalletManager.prototype.readSingleAddress = function () {
	var _this = this;

	var self = this;

	return this.getSingle().then(function (walletId) {
		return new Promise(function (resolve, reject) {
			_this.db.query("SELECT address FROM my_addresses WHERE wallet=?", [walletId], function (rows) {
				if (rows.length === 0) {
					reject('NO ADDRESSES FOUND');
				} else if (rows.length > 1) {
					reject('MORE THAN ONE ADDRESS FOUND: ' + rows.length);
				} else {
					resolve(rows[0].address);
				}
			});
		});
	});
};

module.exports = WalletManager;