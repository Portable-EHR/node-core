/*
 * Copyright © Portable EHR inc, 2018
 */

/**
 * Created by WebStorm.
 * User: yvesleborg
 * Date: 2016-08-21
 * Time: 5:21 PM
 */

'use strict';
const fileTag = __filename.replace(/(.*\/)(.+?)([.]js)?$/, '$2');

const logger   = require('log4js').getLogger(fileTag);
const db       = require('mysql');

const{niceJSON, DeclareExpectedError, ErrorExtender}= require('./utils');

const self = module.exports;


self.CURRENT_TIMESTAMP = { toSqlString: ()=>'CURRENT_TIMESTAMP()'};

const NoRow = function NoRow(message='', results) { return ErrorExtender(message, NoRow, {results}); };
DeclareExpectedError(self.NoRow = NoRow);

//region Basic DB utilities

//  Note that pool will be set before it's finished being validated below.
//  That's ok. Failed validation will cause exit(1) when done anyway.
const pool = (node => {
    const {serverNetworkSpec:{endpoint:{host, port}}, user, password, database, debug} = node.config.databaseConfig;
    const poolConf = {  host, port, user, password, database, debug,
                        acquireTimeout : 15000,
                        connectionLimit: 50,
                        supportBigNumbers : true,
    };
    try {
        const pool = db.createPool(poolConf);
        pool.maxUsedConnections = 0;

        //  self.poolConnectionTestPromise is await-ed by node .initialize(), right after 1st require('./dao'),
        //  then immediately deleted.
        self.poolConnectionTestPromise = new Promise( (fulfill, reject) => {
            pool.getConnection((e, connection)=>{
                if (e) {
                    e.bailOutMsg = `Could not obtain connection from pool for database [${database}] :`;
                    reject(e);
                } else {
                    connection.query('select 1+1 as answer', (e, results)=> {
                        connection.release();
                        if (e) {
                            e.bailOutMsg = `Could not use connection connection with test query :`;
                            reject(e);
                        }
                        const {answer} = results[0];
                        logger.info(`Database connection pool configured and functional! [1+1=${answer}]`);
                        fulfill(pool);
                    });
                }
            });
        });
        return pool;    //  Note: At this point the pool has been created but the
    }                   //        two above validation callbacks have not completed.
    catch (e) {
        logger.fatal('Could not create connection pool to db with conf:', niceJSON(poolConf), e.message);
        process.exit(1);
    }                       //  node.config is defined:
})(require('../../lib/node'));   //  node is already loaded up to the point of pool definition in initialize().

/**
 *
 * @return {Promise<object>}
 */
const getPoolConnectionAsync = () => new Promise( (fulfill, reject) => {
    const errMsg = "Unable to get new DB connection from pool :\n";
    try {
        pool.getConnection((e, connection)=>{
            if (e) {
                logger.error(errMsg + e.stack);
                reject(e);
            }

            const usedConnectionCnt = pool._allConnections.length;
            if (usedConnectionCnt > pool.maxUsedConnections) pool.maxUsedConnections = usedConnectionCnt;

            fulfill(connection);
        });
    } catch (e) {
        logger.error(errMsg + e.stack);
        reject(e);
    }
});

/**
 *
 * @param {string} insertQueryString
 * @param {string[]} args
 * @param filterResults
 * @return {Promise<object|int>}
 */
const dbInsert = async (insertQueryString, args=[], filterResults=results=>results.insertId) => {
    const connection = await getPoolConnectionAsync();      // no try-catch: Error at getting a connection just throws.
    return await(new Promise( (fulfill, reject) => {
        connection.query(insertQueryString, args, (e, results) => {
            connection.release();
            if (e) reject(e);
            else {
                const {insertId} = results;
                if (insertId > 0) fulfill(filterResults(results));
                else reject(NoRow(`dbInsert : insertId [${insertId}] < 1, performing DB query :\n"${
                                    insertQueryString}" [${args}]`, results));
            }
        });
    }));
};
self.dbInsert = dbInsert;

/**
 *
 * @param {string} updateQueryString
 * @param {string[]} args
 * @param filterResults
 * @return {Promise<object|int>}
 */
const dbUpdate = async (updateQueryString, args=[], filterResults=results=>results.changedRows) => {
    const connection = await getPoolConnectionAsync();      // no try-catch: Error at getting a connection just throws.
    return await(new Promise( (fulfill, reject) => {
        connection.query(updateQueryString, args, (e, results) => {
            connection.release();
            if (e) reject(e);
            else {
                const {changedRows} = results;
                if (changedRows > 0) fulfill(filterResults(results));
                else reject(NoRow(`dbUpdate : changedRows [${changedRows}] < 1, performing DB query :\n"${
                                            updateQueryString}" [${args}]`, results));
            }
        });
    }));
};
self.dbUpdate = dbUpdate;

/**
 *
 * @param {string} deleteQueryString
 * @param {string[]} args
 * @param filterResults
 * @return {Promise<object|int>}
 */
const dbDelete = async (deleteQueryString, args=[], filterResults=(results, reject)=>{
                            const {affectedRows} = results;
                            if (affectedRows > 0) return affectedRows;
                            reject(NoRow(`dbDelete : affectedRows [${affectedRows}] < 1, performing DB query :\n"${
                                                                    deleteQueryString}" [${args}]`, results));}) => {
    const connection = await getPoolConnectionAsync();      // no try-catch: Error at getting a connection just throws.
    return await (new Promise( (fulfill, reject) => {
        connection.query(deleteQueryString, args, (e, results) => {
            connection.release();
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
 * @param {string} selectQueryString
 * @param {string[]}args
 * @param filterResultsAndFields
 * @returns {Promise<array|object>}
 */
const fetchFromDb = async (selectQueryString, args=[], filterResultsAndFields=resAndFields=>resAndFields.results) => {
    const connection = await getPoolConnectionAsync();      // no try-catch: Error at getting a connection just throws.
    return await(new Promise((fulfill, reject) =>{
        connection.query(selectQueryString, args, (e, results, fields) => {
            connection.release();
            if (e) {
                reject(e);
            }
            else {
                fulfill(filterResultsAndFields({results, fields}/*, reject*/));
            }
        })
    }));
};
self.fetchFromDb = fetchFromDb;

const countTableWhere = (tableName, criteria, args=[]) => {
    if ('string'!== typeof criteria || !criteria.trim()) criteria='1=1';  //  Whole table size

    return fetchFromDb(`SELECT COUNT(*) AS count FROM ${tableName} WHERE ${criteria}`, args,
                        ({results}) => results.length ? results[0].count : 0);
};//return Promise<int>
self.countTableWhere = countTableWhere;

// const dbGetRecord = (selectQueryString, args=[]) => fetchFromDb(selectQueryString, args,(
//     {results}, reject) => {
//         if (results.length) return results;
//         reject( NoRow(`dbGetRecord : no record selected, performing DB query :\n"${selectQueryString}" [${args}]`, results) );
//     });
// self.dbGetRecord = dbGetRecord;

class DbTransaction {
    constructor() {
        this._getConnection = async ()=> {
            delete this._getConnection;
            const connection = await getPoolConnectionAsync();  //  no try-catch: Error on getting a connection just throws.
            return Object.defineProperty(this, '_connection', {value:connection})._connection;
        }
    }

    async dbInsert(insertQueryString, args=[], filterResults=results=>results.insertId) {
        const { _connection } = this;
        return await(new Promise( (fulfill, reject) => {
            _connection.query(insertQueryString, args, (e, results) => {
                if (e) reject(e);
                else {
                    const {insertId} = results;
                    if (insertId > 0) fulfill(filterResults(results));
                    else reject(NoRow(`dbInsert : insertId [${insertId}] < 1, performing DB query :\n"${
                                        insertQueryString}" [${args}]`, results));
                }
            });
        }));
    }

    async dbUpdate(updateQueryString, args=[], filterResults=results=>results.changedRows) {
        const { _connection } = this;
        return await(new Promise( (fulfill, reject) => {
            _connection.query(updateQueryString, args, (e, results) => {
                if (e) reject(e);
                else {
                    const {changedRows} = results;
                    if (changedRows > 0) fulfill(filterResults(results));
                    else reject(NoRow(`dbUpdate : changedRows [${changedRows}] < 1, performing DB query :\n"${
                                        updateQueryString}" [${args}]`, results));
                }
            });
        }));
    }

    async dbDelete(deleteQueryString, args=[], filterResults=(results, reject)=>{
                        const {affectedRows} = results;
                        if (affectedRows > 0) return affectedRows;
                        reject(NoRow(`dbDelete : affectedRows [${affectedRows}] < 1, performing DB query :\n"${
                                        deleteQueryString}" [${args}]`, results));}) {
        const { _connection } = this;
        return await (new Promise( (fulfill, reject) => {
            _connection.query(deleteQueryString, args, (e, results) => {
                if (e) reject(e);
                //  REMINDER :  if reject() is called in filterResults(), the Promise is resolved :
                //              calling fulfill() afterward has no effect.
                else fulfill(filterResults(results, reject));
            });
        }));
    }

    async fetchFromDb(selectQueryString, args=[], filterResultsAndFields=resAndFields=>resAndFields.results) {
        const { _connection } = this;
        return await(new Promise((fulfill, reject) =>{
            _connection.query(selectQueryString, args, (e, results, fields) => {
                if (e) {
                    reject(e);
                }
                else {
                    fulfill(filterResultsAndFields({results, fields}/*, reject*/));
                }
            })
        }));
    }

    countTableWhere(tableName, criteria, args=[]) {
        if ('string'!== typeof criteria || !criteria.trim()) criteria='1=1';  //  Whole table size

        return fetchFromDb(`SELECT COUNT(*) AS count FROM ${tableName} WHERE ${criteria}`, args,
            ({results}) => results.length ? results[0].count : 0);
    } //return Promise<int>
}

/**
 *
 * @param {function(DbTransaction)} transactionScript
 * @returns {Promise<void>}
 */
const doInTransaction = async (transactionScript) => {
    const transaction = new DbTransaction();
    const connection = await transaction._getConnection();
    await (new Promise((fulfill, reject) => {      //  no try-catch: Error on beginTransaction() just throws.
        connection.beginTransaction(e => {          //  convenience function executing SQL command START TRANSACTION.
            if (e) reject(e);
            else fulfill();
        });
    }));

    try {
        let v = await transactionScript(transaction);// any e thrown inside transactionScript causes a rollback() below.

        return await (new Promise( (fulfill, reject) => {
            connection.commit(e => {                //  convenience function executing SQL command COMMIT.
                if (e) reject(e);
                else fulfill(v);
                connection.release();
            });
        }));
    }
    catch (e) {
        await (new Promise( (fulfill) => {
            connection.rollback(() => {             //  convenience function executing SQL command ROLLBACK.
                fulfill();                                  //  don't double throw on potential rollback error.
            });
        }));
        connection.release();
        throw e
    }
};
self.doInTransaction = doInTransaction;
//
//  USAGE :
//
//      try {
//          await doInTransaction(async trans => {
//              await trans.dbInsert('bla bla')
//              const data = await trans.fetchFromDb('bla bla');
//              await trans.dbUpdate('bla bla')
//           });
//      }
//      catch (e) {
//          console.log(`doing whatever : `, dbMsg(e));
//      }

// endregion

logger.trace("Initialized ...");

