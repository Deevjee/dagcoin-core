'use strict';

module.exports.migrate = function (environment, databaseFile) {
    const osManager = require('../operatingSystemManager').getInstance();

    const options = {
        env: environment,
        config: {
            [environment] : {
                driver: "sqlite3",
                filename: databaseFile
            }
        }
    };

    console.log('REQUIRING db-migrate');

    const dbMigrate = require('db-migrate').getInstance(osManager.isNode(), options);

    console.log('PREPARING TO MIGRATE');

    return dbMigrate.up();
};