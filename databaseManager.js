'use strict';

let instance = null;
const Raven = require('raven');

// My module
function DatabaseManager() {
    this.db = require('byteballcore/db');
    this.conf = require('byteballcore/conf')
    this.confManager = require('./confManager').getInstance();
    this.timedPromises = require('./promiseManager');
    this.fileSystemManager = require('./fileSystemManager').getInstance();
    this.osManager = require('./operatingSystemManager').getInstance();
    this.exceptionManager = require('./exceptionManager');

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

    return self.onReady().then(() => {
        return self.confManager.get('environment');
    }).then((environment) => {
        let dbMigrateEngine = null;

        if (self.osManager.isNode()) {
            dbMigrateEngine = require('./migrating/dbMigrate');
        } else {
            dbMigrateEngine = require('./migrating/nativeQueries');
        }

        if (dbMigrateEngine == null) {
            console.log('NO MIGRATING ENGINE AVAILABLE. NOT MIGRATING THE DATABASE');
            return Promise.resolve();
        }

        return dbMigrateEngine.migrate(environment, self.getFullDatabasePath());
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
