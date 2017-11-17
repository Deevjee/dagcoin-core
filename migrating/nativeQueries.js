'use strict';

module.exports.migrate = function (environment, databaseFile) {
    const dbManager = require('../databaseManager').getInstance();

    /* dbManager.query(
        'CREATE TABLE IF NOT EXISTS dagcoin_migrations (' +
        'version NUMBER, ' +
        'creation_date TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP, ' +
        'name VARCHAR(255) NOT NULL' +
        ');',
        []
    ).then(() => {
        console.log('TABLE dagcoin_migrations SHOULD NOW EXIST');
    }); */

    dbManager.query('SELECT version FROM dagcoin_migrations', []).then((rows) => {
        const count = rows ? rows.length : 0;
        console.log(`FOUND ${count} ROWS IN dagcoin_migrations`);
    })
    //TODO: apply migrations
};