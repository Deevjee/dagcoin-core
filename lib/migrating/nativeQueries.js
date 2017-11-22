'use strict';

var dbManager = require('../databaseManager').getInstance();
var fsManager = require('../fileSystemManager').getInstance();
var osManager = require('../operatingSystemManager').getInstance();
var exManager = require('../exceptionManager');

function applyMigrationQueries(queries, migration) {
    if (queries == null || queries.length === 0) {
        console.log('FINISHED APPLYING MIGRATION ' + migration.version);
        return Promise.resolve();
    }

    var nextQuery = queries.pop();

    return dbManager.query(nextQuery, []).then(function () {
        return applyMigrationQueries(queries, migration);
    });
}

function applyMigration(migration, currentVersion) {
    if (migration.version == null) {
        return Promise.reject('FOUND MIGRATION WITHOUT VERSION');
    }

    if (migration.version <= currentVersion) {
        console.log('WILL NOT APPLY MIGRATION ' + migration.version + ': CURRENT VERSION IS GREATER OR EQUAL: ' + currentVersion);
        return Promise.resolve();
    }

    var queries = migration.queries;

    if (queries == null) {
        return Promise.reject('MIGRATION ' + migration.version + ' HAS NO QUERIES. THIS IS NOT ALLOWED');
    }

    if (typeof queries == 'string') {
        queries = [queries]; // Coalesce single element to array
    }

    if (queries.length === 0) {
        return Promise.reject('MIGRATION ' + migration.version + ' HAS NO QUERIES. THIS IS NOT ALLOWED');
    }

    return applyMigrationQueries(queries, migration).then(function () {
        return dbManager.query('INSERT INTO dagcoin_migrations (' + 'version, ' + 'queries, ' + 'rollback, ' + 'creation_date, ' + 'name' + ') VALUES (' + (migration.version + ', ') + (JSON.stringify(migration.queries) + ', ') + (JSON.stringify(migration.rollback) + ', ') + 'CURRENT_TIMESTAMP, ' + ('"' + migration.name + '"') + ');', []);
    });
}

function applyMigrations(migrations, currentVersion) {
    if (migrations == null || migrations.length === 0) {
        console.log('FINISHED MIGRATING');
        return Promise.resolve();
    }

    var nextMigration = migrations.pop();

    return applyMigration(nextMigration, currentVersion).then(function () {
        return applyMigrations(migrations, currentVersion);
    });
}

module.exports.migrate = function (environment, databaseFile) {
    var currentVersion = null;

    return dbManager.query('CREATE TABLE IF NOT EXISTS dagcoin_migrations (' + 'version NUMBER, ' + 'queries TEXT, ' + 'rollback TEXT, ' + 'creation_date TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP, ' + 'name VARCHAR(255) NOT NULL' + ');', []).then(function (result) {
        console.log('TABLE dagcoin_migrations SHOULD NOW EXIST. QUERY RESULT: ' + JSON.stringify(result) + '. READING THE LATEST VERSION');
        return dbManager.query('SELECT coalesce(max(version),0) as current_version FROM dagcoin_migrations', []).then(function (rows) {
            return Promise.resolve(rows[0].current_version);
        });
    }).then(function (versionReadInDb) {
        console.log('COULD ACCESS dagcoin_migrations. CURRENT MIGRATION VERSION : ' + versionReadInDb);
        currentVersion = versionReadInDb;
        console.log('READING MIGRATION FILE ...');
        return fsManager.readFile(fsManager.getAppDataDir() + '/migrations/migrations.json');
    }).then(function (data) {
        console.log('FILE migrations.json READ: ' + data);

        if (data == null) {
            console.log('FILE migrations.json IS EMPTY. NOTHING TO MIGRATE');
            return Promise.resolve([]);
        } else {
            var jsonString = data.toString();

            if (jsonString == null || jsonString === "" || jsonString.trim() === "") {
                console.log('FILE migrations.json IS EMPTY. NOTHING TO MIGRATE');
                return Promise.resolve([]);
            }

            try {
                return Promise.resolve(JSON.parse(jsonString.trim()));
            } catch (e) {
                console.log('FILE migrations.json CONTENT COULD NOT BE PARSED INTO JSON.');
                return Promise.reject(e);
            }
        }
    }, function (err) {
        if (err && err.code && (osManager.isCordova() && err.code === 1 || osManager.isNode() && err.code === 'ENOENT')) {
            console.log('FILE migrations.json NOT FOUND. SIMPLY NOT GOING TO MIGRATE');
            return Promise.resolve([]);
        } else {
            return Promise.reject(err);
        }
    }).then(function (migrations) {
        return dbManager.query('BEGIN TRANSACTION', []).then(function () {
            return applyMigrations(migrations, currentVersion);
        }).then(function () {
            return dbManager.query('COMMIT TRANSACTION', []);
        }, function (err) {
            console.log('COULD NOT APPLY ALL MIGRATIONS, ROLLING BACK');
            exManager.logError(err);
            return dbManager.query('ROLLBACK TRANSACTION', []);
        });
    });
};