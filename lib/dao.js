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

const log4js   = require('log4js');
const logger   = log4js.getLogger('dao');
const db       = require('mysql');

const{niceJSON, DeclareExpectedError, ErrorExtender}= require('./utils');

const self = module.exports;

const NoRow = function NoRow(message='') { return ErrorExtender(message, NoRow); };
DeclareExpectedError(self.NoRow = NoRow);

//region Basic DB utilities

//  Note that pool will be set before it's finished being validated below.
//  That's ok. Failed validation will cause exit(1) when done anyway.
const pool = (node => {
    const {serverNetworkSpec:{endpoint:{host, port}}, user, password, database, debug} = node.config.databaseConfig;
    const poolConf = {host, port, user, password, database, debug, acquireTimeout : 15000, connectionLimit: 50};
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
                else reject(NoRow(`dbInsert : insertId [${insertId}] < 1, performing DB query :\n"${insertQueryString}" [${args}]`));
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
                else reject(NoRow(`dbUpdate : changedRows [${changedRows}] < 1, performing DB query :\n"${updateQueryString}" [${args}]`));
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
                                                                                deleteQueryString}" [${args}]`));}) => {
    const connection = await getPoolConnectionAsync();      // no try-catch: Error at getting a connection just throws.
    return await (new Promise( (fulfill, reject) => {
        connection.query(deleteQueryString, args, (e, results) => {
            connection.release();
            if (e) reject(e);
            fulfill(filterResults(results, reject));
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
//         reject( NoRow(`dbGetRecord : no record selected, performing DB query :\n"${selectQueryString}" [${args}]`) );
//     });
// self.dbGetRecord = dbGetRecord;


/*
    Usage review across the project

    getPoolConnectionAsync() (was getConnectionP())                                     throws
        used locally only in:
            dbInsert()
            dbUpdate()
            dbDelete()
            fetchFromDb()

    dbInsert() (was insertQueryP())                                                    throws
        dao.feedItem .Insert() : no catch
            dao.feedItem InsertWithValidationErrorMessage(): no catch
                pump.engine PumpEngine._accept() : uses catch right!
            dao.feedItem InsertAsInvalid(): no catch
                pump.engine PumpEngine._accept() : uses catch right!
        dao.wtf WtfRecord.report() : uses catch right!

    dbUpdate()  NEW! ([WAS UpdateSync before change to async])                         throws
        dao.wtf :  WtfRecord.update(), by Id so self update really
            NodeServerApp WTFpump.doOneCycleAction() persistAccepted()  => uses catch right.
        dao.feedItem : FeedItemRecord.update(), by Id so self update really
            .ChangeTxStatusSendingToQueued();
                pump.engine PumpEngine .start() => uses catch right;
            .recordConvertToDstError();
                pump.engine PumpEngine .pushOnce() prepareOnePushFromDB() => uses catch right;
            .sending();
                pump.engine PumpEngine .pushOnce() prepareOnePushFromDB() => uses catch right;
            .recordPushToDstError()
                .retry()
                    pump.engine PumpEngine ._logAndDevOpWtfOnceThenPersistAndRetryAdlib() => uses catch right;
                pump.engine PumpEngine ._recordPushToDstErrorMessages() => uses catch right;
            .recordPushToDstSuccess()
                pump.engine PumpEngine .pushOnce() => uses catch right;

    dbDelete()  [WAS deleteSync]  NEW!                                                 throws
        rewritten, in replacement of promisified pool.query. (+ check rows affectedRows)
        dao.wtf :  WtfRecord.delete(), by Id so self delete really.
            NodeServerApp WTFpump.doOneCycleAction()                  => uses catch right;
        dao.feedItem : FeedItemRecord.delete(), by Id so self update really             not used anywhere
        NodeServerApp WTFpump.deleteOldRecords() directly             => uses catch right;   (and affectedRows too)

    fetchFromDb() (was performQueryP())                                              throws
        used locally in countTableWhere(), in replacement of promisified pool.query.
        dao.wtf WtfRecord.wtfsWithCriteria() : no catch
            routes.nodes() router.get('/wtf/list') :                uses catch right;
            WTFpump.doOneCycleAction() :                            uses catch right;
        Node initialize() "SELECT db_version FROM FeedNode.Configuration" (replacement of removed performQuerySync()) : uses catch right.
        dao.feedItem HasDuplicate() no catch;
            pump.engine PumpEngine pullOnce() :                  uses catch right;
        previously using fetchRows() [WAS fetchRowsSync] (replaced promisify(pool.query) with fetchFromDb) returning [] instead of throwing:
        dao.feedItem GetWithCriteria(): no catch, [] used right with map(), returns (maybe empty) [] of FeedItemRecord.
            dao.feedItem ChangeTxStatusSendingToQueued: no catch, [] used right
                pump.engine PumpEngine .start() :                uses catch right;
            dao.feedItem GetOldestQueued: no catch,                                     just returns [] or throws
                pump.engine pullOnce() prepareOnePushFromDB() :  uses catch right;

    countTableWhere() [WAS countTableWhereSync] (replaced promisify(pool.query) with fetchFromDb)
        dao.feedItem NumberOfQueuedForPush() :
            pump.engine queueIsFull() :                          uses catch right;
                => PumpCore allowsAction() => PumpAction isActionAllowed() => Cycling _runCycle() : no catch, int used right.
        dao.feedItem ReportTxStatus() : provide best reportStatus : uses catch right;  early to skip error
 */

// endregion

logger.trace("Initialized ...");

