'use strict';

function _defineProperty(obj, key, value) { if (key in obj) { Object.defineProperty(obj, key, { value: value, enumerable: true, configurable: true, writable: true }); } else { obj[key] = value; } return obj; }

module.exports.migrate = function (environment, databaseFile) {
    var osManager = require('../operatingSystemManager').getInstance();

    var options = {
        env: environment,
        config: _defineProperty({}, environment, {
            driver: "sqlite3",
            filename: databaseFile
        })
    };

    console.log('REQUIRING db-migrate');

    var dbMigrate = require('db-migrate').getInstance(osManager.isNode(), options);

    console.log('PREPARING TO MIGRATE');

    return dbMigrate.up();
};