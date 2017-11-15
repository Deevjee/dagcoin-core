'use strict';

let instance = null;
const Raven = require('raven');

// My module
function DatabaseManager() {
    this.db = require('byteballcore/db');
    this.conf = require('byteballcore/conf');
    this.timedPromises = require('./promiseManager');
    this.fileSystemManager = require('./fileSystemManager').getInstance();

    const self = this;

    this.queryQueue = this.timedPromises.PromiseEnqueuer(
        'db-manager',
        (query, parameters) => {
            return new Promise((resolve, reject) => {
                try {
                    self.db.query(query, parameters, resolve);
                } catch (e) {
                    console.error(e, e.stack);
                    Raven.captureException(e);
                    reject(`QUERY ${query} WITH PARAMETER ${JSON.stringify(parameters)} FAILED: ${e.message}`);
                }
            });
        }
    );
}

DatabaseManager.prototype.checkOrUpdateDatabase = function () {
    const self = this;

    const databaseConfigFileName = `database.json`;

    console.log(`CHECKING OR UPDATING DATABASE STATUS. FIRST CHECK: ${databaseConfigFileName}`);

    return self.onReady().then(() => {
        return self.fileSystemManager.readFile(databaseConfigFileName).then(
            (data) => {
                //FILE EXISTS
                console.log(`FILE ${databaseConfigFileName} EXISTS`);
                return Promise.resolve();
            },
            (error) => {
                //FILE DOES NOT EXIST
                console.log(`ERROR READING DATABASE CONFIGURATION FILE NAME (${databaseConfigFileName}). PROBABLY IT DOESN'T EXIST: ${error}`);
                const databaseAccessConfiguration = `{
    "${self.conf.environment}": {
        "driver": "sqlite3",
        "filename": "${self.getFullDatabasePath()}"
    }
}`;

                return self.fileSystemManager.writeFile(
                    databaseConfigFileName,
                    databaseAccessConfiguration,
                    self.fileSystemManager.getDefaultEncoding()
                );
            }
        ).then(() => {
            const dbMigrate = require('db-migrate').getInstance(true, {env: self.conf.environment});
            return dbMigrate.up().then(() => {
                // return dbMigrate.up().then(() => {console.log('MIGRATED');});
                console.log('MIGRATED');
            });
        }).catch((error) => {
            console.log(`FAILED CHECKING/UPDATING THE DATABASE: ${error}`);
            console.log(`STRINGIFIED ERROR: ${JSON.stringify(error)}`);
            process.exit();
        });
    });
};

DatabaseManager.prototype.getDatabaseFileName = function () {
    return this.conf.database.filename || (this.conf.bLight ? 'byteball-light.sqlite' : 'byteball.sqlite');
};

DatabaseManager.prototype.getFullDatabasePath = function () {
    return `${this.fileSystemManager.getDatabaseDirPath()}/${this.getDatabaseFileName()}`
};

/**
 * Makes sure the database is ready.
 * @returns {Promise} A promise that resolves as soon as the database is ready
 */
DatabaseManager.prototype.onReady = function () {
    const self = this;

    return new Promise((resolve) => {
        try {
            self.db.query('SELECT 1', [], () => {
                resolve();
            });
        } catch (e) {
            console.log(`DATABASE NOT READY YET: ${e.message}. RETRYING IN FEW SECONDS ...`)

            setTimeout(() => {
                self.onReady().then(resolve);
            }, self.conf.DB_READY_CHECK_INTERVAL);
        }
    });
};

DatabaseManager.prototype.getIgnore = function (){
    return this.db.getIgnore();
};

/**
 * Executes query in the database sequentially.
 * @param query A SQL query with question marks (?) instead of parameters
 * @param parameters An array of parameters. [] for nothing
 * @returns {Promise} A promise that resolves when the query returns rows.
 */
DatabaseManager.prototype.query = function (query, parameters) {
    return this.queryQueue.enqueue(query, parameters);
};

module.exports = DatabaseManager;
module.exports.getInstance = function () {
    if (!instance) {
        instance = new DatabaseManager();
    }

    return instance;
};
