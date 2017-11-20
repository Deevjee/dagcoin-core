/*jslint node: true */
"use strict";

// THIS IS A LIST OF PARAMETERS NEEDED IN THE CORE

exports.deviceName = 'Dagcoin Core';
exports.hub = 'testnetexplorer.dagcoin.org/wss/';
exports.hub.bLight = true;
exports.permanent_pairing_secret = '0000';
exports.CONSOLIDATION_INTERVAL = 60 * 60 * 1000;

exports.DAGCOIN_MESSAGE_TIMEOUT = 30 * 1000;
exports.DB_READY_CHECK_INTERVAL = 10 * 1000;
exports.MIN_PAYMENT_DELAY = 5 * 1000;

exports.MIN_STABLE_BYTES_ON_MAIN_BEFORE_FUNDING = 5000;
exports.MAIN_ADDRESS_FUNDS_INSPECTION_PERIOD = 30 * 1000;
exports.KEYS_FILENAME = "keys.json";

exports.DATABASE_MIGRATION_TOOL = "native-queries"; // CAN BE native-queries OR db-migrate
