'use strict';

let instance = null;

// My module
function DatabaseManager() {
    this.db = require('byteballcore/db');
    this.conf = require('byteballcore/conf');
    this.timedPromises = require('./promiseManager');

    const self = this;

    this.queryQueue = this.timedPromises.PromiseEnqueuer(
        'db-manager',
        (query, parameters) => {
            return new Promise((resolve, reject) => {
                try {
                    self.db.query(query, parameters, resolve);
                } catch (e) {
                    console.error(e, e.stack);
                    reject(`QUERY ${query} WITH PARAMETER ${JSON.stringify(parameters)} FAILED: ${e.message}`);
                }
            });
        }
    );
}

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