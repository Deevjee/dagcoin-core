'use strict';

const dbManager = require('../databaseManager').getInstance();
const fsManager = require('../fileSystemManager').getInstance();
const osManager = require('../operatingSystemManager').getInstance();
const exManager = require('../exceptionManager');

function applyMigrationQueries (queries, migration) {
    if (queries == null || queries.length === 0) {
        console.log(`FINISHED APPLYING MIGRATION ${migration.version}`);
        return Promise.resolve();
    }

    const nextQuery = queries.pop();

    return dbManager.query(nextQuery, []).then(() => {
        return applyMigrationQueries (queries, migration);
    });
}

function applyMigration(migration, currentVersion) {
    if (migration.version == null) {
        return Promise.reject('FOUND MIGRATION WITHOUT VERSION');
    }

    if (migration.version <= currentVersion) {
        console.log(`WILL NOT APPLY MIGRATION ${migration.version}: CURRENT VERSION IS GREATER OR EQUAL: ${currentVersion}`);
        return Promise.resolve();
    }

    let queries = migration.queries;

    if (queries == null) {
        return Promise.reject(`MIGRATION ${migration.version} HAS NO QUERIES. THIS IS NOT ALLOWED`);
    }

    if (typeof queries == 'string') {
        queries = [queries]; // Coalesce single element to array
    }

    if (queries.length === 0) {
        return Promise.reject(`MIGRATION ${migration.version} HAS NO QUERIES. THIS IS NOT ALLOWED`);
    }

    return applyMigrationQueries(queries, migration).then(() => {
        return dbManager.query('INSERT INTO dagcoin_migrations (' +
            'version, ' +
            'queries, ' +
            'rollback, ' +
            'creation_date, ' +
            'name' +
            ') VALUES (' +
            `${migration.version}, ` +
            `${JSON.stringify(migration.queries)}, ` +
            `${JSON.stringify(migration.rollback)}, ` +
            'CURRENT_TIMESTAMP, ' +
            `"${migration.name}"` +
            ');',
            []
        );
    });
}

function applyMigrations(migrations, currentVersion) {
    if (migrations == null || migrations.length === 0) {
        console.log('FINISHED MIGRATING');
        return Promise.resolve();
    }

    const nextMigration = migrations.shift();

    return applyMigration(nextMigration, currentVersion).then(() => {
        return applyMigrations(migrations, currentVersion);
    });
}

module.exports.migrate = function (environment, databaseFile) {
    let currentVersion = null;

    return dbManager.query(
        'CREATE TABLE IF NOT EXISTS dagcoin_migrations (' +
        'version NUMBER, ' +
        'queries TEXT, ' +
        'rollback TEXT, ' +
        'creation_date TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP, ' +
        'name VARCHAR(255) NOT NULL' +
        ');',
        []
    ).then((result) => {
        console.log(`TABLE dagcoin_migrations SHOULD NOW EXIST. QUERY RESULT: ${JSON.stringify(result)}. READING THE LATEST VERSION`);
        return dbManager.query('SELECT coalesce(max(version),0) as current_version FROM dagcoin_migrations', []).then((rows) => {
            return Promise.resolve(rows[0].current_version);
        })
    }).then((versionReadInDb) => {
        console.log(`COULD ACCESS dagcoin_migrations. CURRENT MIGRATION VERSION : ${versionReadInDb}`);
        currentVersion = versionReadInDb;
        console.log('READING MIGRATION FILE ...');
        return fsManager.readFile(`${fsManager.getAppDataDir()}/migrations/migrations.json`);
    }).then(
        (data) => {
            console.log(`FILE migrations.json READ: ${data}`);

            if (data == null) {
                console.log('FILE migrations.json IS EMPTY. NOTHING TO MIGRATE');
                return Promise.resolve([]);
            } else {
                const jsonString = data.toString();

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
        },
        (err) => {
            if (
                err &&
                err.code &&
                (
                    (osManager.isCordova() && err.code === 1) ||
                    (osManager.isNode() && err.code === 'ENOENT')
                )
            ) {
                console.log('FILE migrations.json NOT FOUND. SIMPLY NOT GOING TO MIGRATE');
                return Promise.resolve([]);
            } else {
                return Promise.reject(err);
            }
        }
    ).then((migrations) => {
        return dbManager.query('BEGIN TRANSACTION', []).then(() => {
            return applyMigrations(migrations, currentVersion);
        }).then(
            () => {
                return dbManager.query('COMMIT TRANSACTION', []);
            },
            (err) => {
                console.log('COULD NOT APPLY ALL MIGRATIONS, ROLLING BACK');
                exManager.logError(err);
                return dbManager.query('ROLLBACK TRANSACTION', []);
            }
        );
    });
};