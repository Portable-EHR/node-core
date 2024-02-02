/*
 * Copyright © Portable EHR inc, 2021
 */

'use strict';
const loggerCat = __filename.replace(/.*\/(.+?)([.]js)?$/, '$1');

const logger   = require('log4js').getLogger(loggerCat);
const sql       = require('mssql');

const { repr, niceJSON, } = require('./utils');
const { NoRow, } = require('./dao');

const self = module.exports;


Object.assign(self, { NoRow, });     // Attach to ms-dao too.

//region Basic DB utilities

//  Note that pool will be set before it's finished being validated below.
//  That's ok. Failed validation will cause exit(1) when done anyway.
const pool = (node => {
    const { host:server, port, user, password, database } = node.config.msDatabaseConfig;
    const poolConf = {
        server, user, password, port, database,
        stream : false,                 //  default : false
        parseJSON : false,              //  default : false
        pool : {
            max : 50,                   //  default : 10
            min : 0,                    //  default : 0
            idleTimeoutMillis : 30000,  //  default : 30000
        },
        options : {
            useUTC: true,              //  default : true
            encrypt: true,             //  default : true
            trustServerCertificate: true,
            connectionTimeout : 15000,      //  default : 15000
            requestTimeout : 15000,         //  default : 15000
        }
    };
    try {
        const pool = new sql.ConnectionPool(poolConf);
        pool.maxUsedConnections = 0;

        //  self.poolConnectionTestPromise is await-ed by node .initialize(), right after 1st require('./dao'),
        //  then immediately deleted.
        self.poolConnectionTestPromise = new Promise( (fulfill, reject) => {
            pool.connect().catch(e => {
                e.bailOutMsg = `Could not obtain connection from pool for MS-SQL database [${database}] :`;
                reject(e);
            }).then( pool =>
                pool.request().query('select 1+1 as answer')
            ).then(({recordset}) => {
                const {answer} = recordset[0];
                logger.info(`MS-SQL Database connection pool to [${database}] of [${server}:${port}] configured and functional! [1+1=${answer}]`);
                fulfill(pool);
            }).catch( e => {
                e.bailOutMsg = `Could not use ${repr(pool)} with test query :`;
                reject(e);
            });
        });
        return pool;    //  Note: At this point the pool has been created but the
    }                   //        two above validation callbacks have not completed.
    catch (e) {
        throw Error(`Could not create connection pool to db with conf : ${niceJSON(poolConf)}\n${e.message}`);
    }                       //  node.config is defined:
})(require(process.env.PEHR_NODE_CWD+(process.env.PEHR_NODE_LIB_NODE || '/lib/node')));   //  node is already loaded up to the point of pool definition in initialize().

/**
 *
 * @param {string} insertQueryString
 * @param filterResults
 * @return {Promise<object|int>}
 */
const dbInsert = async (insertQueryString, filterResults=results =>
                                                                    results.recordset[0].id) => {
    const request = new sql.Request(pool);
    return await(new Promise( (fulfill, reject) => {
        request.query(insertQueryString, (e, results) => {
            if (e) reject(e);
            else {
                // console.log(`MS-SQL dbInsert(): results :`, results);
                const rowsAffected = results.rowsAffected[0];
                if (rowsAffected > 0) fulfill(filterResults(results));
                else reject(NoRow(`MS-SQL dbInsert() : rowsAffected [${rowsAffected}] < 1, performing DB query :\n"${
                                    insertQueryString}"`, results));
            }
        });
    }));
};
self.dbInsert = dbInsert;

/**
 *
 * @param {string} updateQueryString
 * @param filterResults
 * @return {Promise<object|int>}
 */
const dbUpdate = async (updateQueryString, filterResults=(results, reject) => {
                            // console.log(`MS-SQL dbUpdate(): results :`, results);
                            const rowsAffected = results.rowsAffected[0];
                            if (rowsAffected > 0) return rowsAffected;
                            reject(NoRow(`MS-SQL dbUpdate() : rowsAffected [${rowsAffected
                                            }] < 1, performing DB query :\n"${updateQueryString}"`, results)); }) => {
    const request = new sql.Request(pool);
    return await(new Promise( (fulfill, reject) => {
        request.query(updateQueryString, (e, results) => {
            if (e) reject(e);
            //  REMINDER :  if reject() is called in filterResults(), the Promise is resolved :
            //              calling fulfill() afterward has no effect.
            else fulfill(filterResults(results, reject));
        });
    }));
};
self.dbUpdate = dbUpdate;

/**
 *
 * @param {string} deleteQueryString
 * @param filterResults
 * @return {Promise<object|int>}
 */
const dbDelete = async (deleteQueryString, filterResults=(results, reject)=>{
                        // console.log(`MS-SQL dbDelete(): results :`, results);
                        const rowsAffected = results.rowsAffected[0];
                        if (rowsAffected > 0) return rowsAffected;
                        reject(NoRow(`MS-SQL dbDelete() : rowsAffected [${rowsAffected}] < 1, performing DB query :\n"${
                                deleteQueryString}"`, results));}) => {
    const request = new sql.Request(pool);
    return await (new Promise( (fulfill, reject) => {
        request.query(deleteQueryString, (e, results) => {
            if (e) reject(e);
            //  REMINDER :  if reject() is called in filterResults(), the Promise is resolved :
            //              calling fulfill() afterward has no effect.
            else fulfill(filterResults(results, reject));
        });
    }));
};
self.dbDelete = dbDelete;

/**
 *
 * @param {string|{sql, nestTables}} selectQueryString
 * @param filterResults
 * @returns {Promise<array|object>}
 */
const fetchFromDb = async (selectQueryString, filterResults=results =>
                                                                        results.recordset) => {
    const request = new sql.Request(pool);
    return await(new Promise((fulfill, reject) =>{
        request.query(selectQueryString, (e, results) => {
            if (e) {
                reject(e);
            }
            else {
                // console.log(`MS-SQL fetchFromDb(): results :`, results);
                fulfill(filterResults(results/*, reject*/));
            }
        })
    }));
};
self.fetchFromDb = fetchFromDb;

const countTableWhere = (tableName, criteria) => {
    if ('string'!== typeof criteria || !criteria.trim()) criteria='1=1';  //  Whole table size

    return fetchFromDb(`SELECT COUNT(*) AS count FROM ${tableName} WHERE ${criteria}`,
                        ({results}) => results.length ? results[0].count : 0);
};//return Promise<int>
self.countTableWhere = countTableWhere;

// const dbGetRecord = (selectQueryString, args=[]) => fetchFromDb(selectQueryString, args,(
//     {results}, reject) => {
//         if (results.length) return results;
//         reject( NoRow(`dbGetRecord : no record selected, performing DB query :\n"${selectQueryString}" [${args}]`, results) );
//     });
// self.dbGetRecord = dbGetRecord;


class PreparedStatement {
    /**
     *
     * @param {string} statement
     * @param {object} inputsMapOb
     * @param {object} outputsMapOb
     */
    constructor(statement, inputsMapOb={}, outputsMapOb={}) {

        Object.defineProperty(this, '_statement', {value:statement});

        const { _prepSt } = Object.defineProperty(this, '_prepSt', {value: new sql.PreparedStatement(pool)});

        for (let [name, sqlType] of Object.entries(inputsMapOb)) {
            _prepSt.input(name, sqlType);
        }
        for (let [name, sqlType] of Object.entries(outputsMapOb)) {
            _prepSt.output(name, sqlType);
        }
    }

    /**
     *
     * @param {function(function(object):Promise<Object|Object[]|Request|Promise>):Promise<object|object[]|undefined>} executeScript
     * @return {Promise<object|object[]>}
     */
    async execute(executeScript) {
        const { _prepSt } = this;

        await _prepSt.prepare(this._statement);
        /**
         *
         * @param {object} values
         * @return {Promise<Object|Object[]|Request|Promise>}
         */
        const executePreparedStatement = async function executePreparedStatement(values) {
            return _prepSt.execute(values);
        };
        const results = await executeScript(executePreparedStatement);

        await _prepSt.unprepare();
        return results;
    }

}
self.PreparedStatement = PreparedStatement;
self.sqlTypes = sql.TYPES;

/**
 *
 * @param {string} statement
 * @param {function(function(object))} executeScript
 * @param {object} inputsMapOb
 * @param {object} outputsMapOb
 * @return {Promise<*>}
 */
const runPreparedStatement = async (statement, executeScript, inputsMapOb={}, outputsMapOb={}) =>
                            await (new PreparedStatement(statement, inputsMapOb, outputsMapOb)).execute(executeScript);
self.runPreparedStatement = runPreparedStatement;
//
//  USAGE :
//
//      try {
//
//          await runPreparedStatement(`select @param as value`,
//                                      async executePreparedStatement => {
//                                          return await executePreparedStatement({param: 12345'});
//                                      },
//                                      {param: sqlTypes.Int});
//      }
//      catch (e) {
//          console.log(`doing whatever : `, dbMsg(e));
//      }


class DbTransaction {
    constructor() {
        Object.defineProperty(this, '_transaction', {value:new sql.Transaction(pool)});
    }

    get transDbInsert() { return this.dbInsert.bind(this); }
    get transDbUpdate() { return this.dbUpdate.bind(this); }
    get transDbDelete() { return this.dbDelete.bind(this); }
    get transFetchFromDb() { return this.fetchFromDb.bind(this); }
    get transCountTableWhere() { return this.countTableWhere.bind(this); }

    async dbInsert(insertQueryString, filterResults=results =>
                                                                results.recordset[0].id) {
        const request = new sql.Request(this._transaction);
        return await(new Promise( (fulfill, reject) => {
            request.query(insertQueryString, (e, results) => {
                if (e) reject(e);
                else {
                    console.log(`MS-SQL trans.dbInsert(): results :`, results);
                    const rowsAffected = results.rowsAffected[0];
                    if (rowsAffected > 0) fulfill(filterResults(results));
                    else reject(NoRow(`MS-SQL trans.dbInsert() : rowsAffected [${rowsAffected
                                        }] < 1, performing DB query :\n"${insertQueryString}"`, results));
                }
            });
        }));
    }

    async dbUpdate(updateQueryString, filterResults=(results, reject) => {
                                // console.log(`MS-SQL trans.dbUpdate(): results :`, results);
                                const rowsAffected = results.rowsAffected[0];
                                if (rowsAffected > 0) return rowsAffected;
                                reject(NoRow(`MS-SQL trans.dbUpdate() : rowsAffected [${rowsAffected
                                                }] < 1, performing DB query :\n"${updateQueryString}"`, results)); }) {
        const request = new sql.Request(this._transaction);
        return await(new Promise( (fulfill, reject) => {
            request.query(updateQueryString, (e, results) => {
                if (e) reject(e);
                    //  REMINDER :  if reject() is called in filterResults(), the Promise is resolved :
                //              calling fulfill() afterward has no effect.
                else fulfill(filterResults(results, reject));
            });
        }));
    }

    async dbDelete(deleteQueryString, filterResults=(results, reject) => {
                                // console.log(`MS-SQL  trans.dbDelete(): results :`, results);
                                const {rowsAffected} = results;
                                if (rowsAffected > 0) return rowsAffected;
                                reject(NoRow(`MS-SQL trans.dbDelete() : rowsAffected [${rowsAffected
                                                }] < 1, performing DB query :\n"${deleteQueryString}"`, results)); }) {
        const request = new sql.Request(this._transaction);
        return await (new Promise( (fulfill, reject) => {
            request.query(deleteQueryString, (e, results) => {
                if (e) reject(e);
                //  REMINDER :  if reject() is called in filterResults(), the Promise is resolved :
                //              calling fulfill() afterward has no effect.
                else fulfill(filterResults(results, reject));
            });
        }));
    }

    async fetchFromDb(selectQueryString, filterResults=results =>
                                                                    results.recordset) {
        const request = new sql.Request(this._transaction);
        return await(new Promise((fulfill, reject) =>{
            request.query(selectQueryString, (e, results) => {
                if (e) {
                    reject(e);
                }
                else {
                    fulfill(filterResults(results/*, reject*/));
                }
            })
        }));
    }

    countTableWhere(tableName, criteria) {
        if ('string'!== typeof criteria || !criteria.trim()) criteria='1=1';  //  Whole table size

        return fetchFromDb(`SELECT COUNT(*) AS count FROM ${tableName} WHERE ${criteria}`,
            ({results}) => results.length ? results[0].count : 0);
    } //return Promise<int>
}

/**
 *
 * @param {function(DbTransaction)} transactionScript
 * @returns {Promise<void>}
 */
const doInTransaction = async (transactionScript) => {
    const   dbTransaction = new DbTransaction(),
          { _transaction } = dbTransaction;

    await (new Promise((fulfill, reject) => {      //  no try-catch: Error on begin() just throws.
        _transaction.begin(sql.ISOLATION_LEVEL.READ_COMMITTED, e => {
            if (e) reject(e);
            else fulfill();
        });
    }));

    try {
        let v = await transactionScript(dbTransaction);// any e thrown inside transactionScript causes a rollback() below.

        return await (new Promise( (fulfill, reject) => {
            // logger.info(`committing MS-SQL transaction`);
            _transaction.commit(e => {                //  convenience function executing SQL command COMMIT.
                if (e) reject(e);
                else fulfill(v);
            });
        }));
    }
    catch (e) {
        await (new Promise( (fulfill) => {
            // logger.error(`rolling back MS-SQL transaction :`);
            _transaction.rollback(e => {             //  convenience function executing SQL command ROLLBACK.
                if (e) logger.error(`Error rolling back MS-SQL transaction`, e);
                fulfill();                                  //  don't double throw on potential rollback error.
            });
        }));
        throw e
    }
};
self.doInTransaction = doInTransaction;
//
//  USAGE :
//
//      try {
//          await doInTransaction(async trans => {
//              await trans.dbInsert('bla blah')
//              const data = await trans.fetchFromDb('bla blah');
//              await trans.dbUpdate('bla blah')
//           });
//      }
//      catch (e) {
//          console.log(`doing whatever : `, dbMsg(e));
//      }

// endregion

[DbTransaction.prototype.transDbInsert.name, DbTransaction.prototype.transDbUpdate.name,
 DbTransaction.prototype.transDbDelete.name, DbTransaction.prototype.transFetchFromDb.name,
 DbTransaction.prototype.transCountTableWhere.name,].join();                                // avoid "Unused" warning.


logger.trace("Initialized ...");

