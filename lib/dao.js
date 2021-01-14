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

const{niceJSON, DeclareExpectedError, ErrorExtender, Enum, EItem, }= require('./utils');

const self = module.exports;


self.CURRENT_TIMESTAMP = { toSqlString: ()=>'CURRENT_TIMESTAMP()'};
self.CURRENT_TIMESTAMP_3 = { toSqlString: ()=>'CURRENT_TIMESTAMP(3)'};

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
 * @param {array} args
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
 * @param {array} args
 * @param filterResults
 * @return {Promise<object|int>}
 */
const dbUpdate = async (updateQueryString, args=[], filterResults=(results, reject) => {
                            const {changedRows} = results;
                            if (changedRows > 0) return changedRows;
                            reject(NoRow(`dbUpdate : changedRows [${changedRows}] < 1, performing DB query :\n"${
                                                                    updateQueryString}" [${args}]`, results)); }) => {
    const connection = await getPoolConnectionAsync();      // no try-catch: Error at getting a connection just throws.
    return await(new Promise( (fulfill, reject) => {
        connection.query(updateQueryString, args, (e, results) => {
            connection.release();
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
 * @param {array} args
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
 * @param {string|{sql, nestTables}} selectQueryString
 * @param {array}args
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
        };
    }

    get transDbInsert() { return this.dbInsert.bind(this); }
    get transDbUpdate() { return this.dbUpdate.bind(this); }
    get transDbDelete() { return this.dbDelete.bind(this); }
    get transFetchFromDb() { return this.fetchFromDb.bind(this); }
    get transCountTableWhere() { return this.countTableWhere.bind(this); }

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

    async dbUpdate(updateQueryString, args=[], filterResults=(results, reject) => {
                        const {changedRows} = results;
                        if (changedRows > 0) return changedRows;
                        reject(NoRow(`dbUpdate : changedRows [${changedRows}] < 1, performing DB query :\n"${
                                                                       updateQueryString}" [${args}]`, results)); }) {
        const { _connection } = this;
        return await(new Promise( (fulfill, reject) => {
            _connection.query(updateQueryString, args, (e, results) => {
                if (e) reject(e);
                //  REMINDER :  if reject() is called in filterResults(), the Promise is resolved :
                //              calling fulfill() afterward has no effect.
                else fulfill(filterResults(results, reject));
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

//region  sqlDate <=> isoDate string

//  The mysql npm package uses jsDate <=> sqlDate conversion by default, translating SQL date column value
//  into jsDate at 00:00 in local time.
//  JS new Date('yyyy-mm-dd') converts a standard iso8601 date into a 'yyyy-mm-ddT00:00Z' timestamp.
//  When submitted to mysql npm JsDate => sqlDate default conversion, that UTC timestamp is then converted
//  to local time zone (a day earlier T19:00-05:00 in Quebec).
//  Considering the time zone -1200, +1200, +1245 and even +1300 exists, there's no simple arithmetic to prevent
//  this behavior using .toISOString().
//  So we do it very boldly:
//      - isNaN(jsDate.getTime()) is first used to validate a datetime string;
//      - then a regex is used to validate a strict "yyyy-mm-dd" format and respecting 1000-01-01 to 9999-12-31
//          maximum range of MySql date;
//      - then we overcome the fact that Chrome JS VM used by jsNode considers 2021-02-31 a valid date;
//      - then the yyyy, mm, dd values are extracted to create a date from "yyyy/mm/dd" in local time zone,
//          i.e. in the format the mySql npm package works in.

const isoDateStrToDbDate = str => {
    //  NOTE :  in jsNode (and thus Chrome JS VM),  2021-02-31 is considered a valid date by isNaN (but not YYYY-MM-32).
    if ('string' === typeof str  &&  ! isNaN((new Date(str)).getTime())) {

        const m = str.match(/^([1-9]\d{3})-(\d{2})-(\d{2})$/);
        if (m) {
            const [, yyyy, mm, dd] = m;
            if ((new Date(str)).toISOString().slice(0, 10) === str) {   //  rejects 2021-02-31 !== 2021-03-03
                return new Date(`${yyyy}/${mm}/${dd}`);
            }
        }
    }
};
self.isoDateStrToDbDate = isoDateStrToDbDate;
// console.log(isoDateStrToDbDate('1938-11-27'));
// console.log(isoDateStrToDbDate('1938-11-27T12:00:00Z'));
// console.log(isoDateStrToDbDate('1938-11-31'));
// console.log('fin');

//  Take the jsDate in local time returned by the npm package for a sqlDate, then extract  yyyy, mm, dd,
const dbDateToIsoDateStr = dbDate =>                                        //  and return 'yyyy-mm-dd'.
    `${dbDate.getFullYear()}-${`${dbDate.getMonth()+1}`.padStart(2, '0')}-${`${dbDate.getDate()}`.padStart(2, '0')}`;
self.dbDateToIsoDateStr = dbDateToIsoDateStr;

//endregion

const Enumm = Enum;
const EDbJsType = (f=>{f.prototype=new Enumm(f); return new f({});})(function EDbJsType({
    number =(f=>f(f))(function number(f) { return EItem(EDbJsType, f); }),
    boolean=(f=>f(f))(function boolean(f){ return EItem(EDbJsType, f); }),
    string =(f=>f(f))(function string(f) { return EItem(EDbJsType, f); }),
    binary =(f=>f(f))(function binary(f) { return EItem(EDbJsType, f); }),
    date   =(f=>f(f))(function date(f)   { return EItem(EDbJsType, f); }),
    Enum   =(f=>f(f))(function Enum(f)   { return EItem(EDbJsType, f); }),
    uuid   =(f=>f(f))(function uuid(f)   { return EItem(EDbJsType, f); }),
    sha    =(f=>f(f))(function sha(f)    { return EItem(EDbJsType, f); }),
}) {  Enumm.call(Object.assign(this, {number, boolean, string, binary, date, Enum, uuid, sha})); });
self.EDbJsType = EDbJsType;
const {
    number: eNumberDbJsType,
    boolean:eBooleanDbJsType,
    string: eStringDbJsType,
    binary: eBinaryDbJsType,
    date:   eDateDbJsType,
    Enum:   eEnumDbJsType,
    uuid:   eUuidDbJsType,
    sha:    eShaDbJsType,
} = EDbJsType;
[eNumberDbJsType, eBooleanDbJsType, eStringDbJsType, eBinaryDbJsType, eDateDbJsType,
 eEnumDbJsType, eUuidDbJsType, eShaDbJsType, ].join();              //  Kludge to prevent stupid 'unused' warnings.


//region MySql Schema parser

const mySqlTableLineReservedNameSet= new Set([
    'primary',
    'key',
    'index',
    'fulltext',
    'spatial',
    'unique',
    'constraint',
    'foreign',
    'check',
]);

const mySqlTableColumnTypeMapOb = {
    integer:    eNumberDbJsType,
    int:        eNumberDbJsType,
    bigint:     eNumberDbJsType,
    mediumint:  eNumberDbJsType,
    smallint:   eNumberDbJsType,
    tinyint:    eNumberDbJsType,
    bit:        eNumberDbJsType,
    decimal:    eNumberDbJsType,
    dec:        eNumberDbJsType,
    fixed:      eNumberDbJsType,
    float:      eNumberDbJsType,
    real:       eNumberDbJsType,
    double:     eNumberDbJsType,
    year:       eNumberDbJsType,

    bool:       eBooleanDbJsType,       //  a tinyint(1), really
    boolean:    eBooleanDbJsType,       //  a tinyint(1), really

    date:       eDateDbJsType,
    datetime:   eDateDbJsType,
    timestamp:  eDateDbJsType,

    text:       eStringDbJsType,
    blob:       eStringDbJsType,
    char:       eStringDbJsType,
    varchar:    eStringDbJsType,
    time:       eStringDbJsType,

    binary:     eBinaryDbJsType,
    varbinary:  eBinaryDbJsType,

    'enum':     eEnumDbJsType,
    'set':      eEnumDbJsType,
};

const cleanMySqlParam = (param, eType) => (
                                      cleanParam =>  eEnumDbJsType === eType  ? cleanParam // then for all params but enum
                                                                              : parseInt(cleanParam)  //  go get the int.
                                     )(param.match(/\w+/)[0]);   //  first trim / get rid of any '' as in enum('a','b')

//  A {primary|unique|foreign| } key can be defined over multiple columns, e.g. "`contact_id`", or "`seq`,`patient_id`".
/**
 *
 * @param colNamesStr
 * @returns {(string)[] | string}
 */
const getKeyColNames = colNamesStr =>
                                      ((colNames) =>             //  either colName array  or   single colName string.
                                                     (colNames.length > 1)   ?   colNames   :   colNames[0]
                                      )(colNamesStr.split(',')
                                                   .map(colName =>
                                                                   colName.match(/^\s*`?([^`]+)`?/)[1]));

const parseMySqlTableSchema = (tableSchemaSrcOb) => {
    let primaryKey = undefined;
    const uniqueKeys = [];
    const uniqueKeySet = new Set();
    const foreignKeys = [];
    const foreignKeyMapOb = {};                                                //  tableName     table_def      /i:case-insensitive
    const schema = tableSchemaSrcOb['Create Table'].replace(/(^\s*CREATE\s+TABLE\s+`?\w+`?\s+\()([^]+?)(\).*$)/i,'$2')
            .split(',\n')   // split table_def by line:  ',' would catch the enum(,,,), set(,,), float(,) etc.
            .filter(
                    line => {                                           //  get rid of the KEY, CONSTRAINT, etc...
                        if ( mySqlTableLineReservedNameSet.has(         //  and only keep the column definitions
                                                                line.match(/^\s*(\S+)\s/)[1].toLowerCase() )) {

                            //  More than just filter: Perform on-the-fly FOREIGN KEY schema extraction.
                            //  e.g. with:
                            //      CONSTRAINT `fk` FOREIGN KEY (`practitioner_id`) REFERENCES `Practitioner` (`id`) ...

                            const fkMatch = line.match(/\s*foreign\s+key\s+[^(]*\(([^)]+)\)\s+references\s+(\S+)\s+\(([^]+?)\)/i);
                            if (fkMatch) {
                                //  e.g.          `practitioner_id`     `Practitioner`         `id`
                                const [ /*whole*/,  foreignKeyStr,   referencedTableName, referencedKeyStr] = fkMatch,

                                //  A foreign key can be defined over multiple columns, so instead of foreignKeyStr
                                //  being "`practitioner_id`" here, it could have been "`col_a`,`col_b`".
                                fkColName = getKeyColNames(foreignKeyStr),              //  colName array OR single colName string.

                                //  referencedKey can be defined over multiple columns too, mirroring foreignKey
                                fkReferencedColName= getKeyColNames(referencedKeyStr),  //  colName array OR single colName string.

                                fkReferencedTableName  = referencedTableName.match(/^\s*`?([^`]+)`?/)[1];

                                foreignKeys.push({fkColName, fkReferencedTableName, fkReferencedColName});

                                if ("string" === typeof fkColName) {    //  if the foreign key is over a single column,
                                //  e.g.   ['practitioner_id'] = {    :'Practitioner',           :'id'        }
                                    foreignKeyMapOb[fkColName] = { fkReferencedTableName, fkReferencedColName }
                                }
                            }

                            //  More than just filter: Perform on-the-fly PRIMARY KEY schema extraction.
                            //  e.g. with:
                            //              CONSTRAINT `pk` PRIMARY KEY (`id`)  ...
                            //
                            //  NOTE:   In schema obtained from SHOW CREATE TABLE, PRIMARY KEY is always defined
                            //          as a single line constraint, not as a column definition attribute.

                            const pkMatch = line.match(/\s*primary\s+key\s+[^(]*\(([^)]+)\)/i);
                            if (pkMatch) {
                                //  e.g.         `practitioner_id`  `Practitioner`      `id`
                                const [ /*whole*/,  colNamesStr ] = pkMatch;

                                //  A primary key can be defined over multiple columns, so instead of colNamesStr
                                //  being "`id`" here, it could be "`col_a`,`col_b`".
                                primaryKey = getKeyColNames(colNamesStr);   //  colName array OR single colName string.
                            }

                            //  More than just filter: Perform on-the-fly UNIQUE KEY schema extraction.
                            //  e.g. with:
                            //              CONSTRAINT `pk` UNIQUE [KEY | INDEX] (`id`)  ...
                            //
                            //  NOTE:   In schema obtained from SHOW CREATE TABLE, UNIQUE KEY is always defined
                            //          as a single line constraint, not as a column definition attribute.

                            const ukMatch = line.match(/\s*unique\s+(?:key|index)\s+[^(]*\(([^)]+)\)/i);
                            if (ukMatch) {
                                //  e.g.         `practitioner_id`  `Practitioner`      `id`
                                const [ /*whole*/,  colNamesStr ] = ukMatch,

                                //  A unique key can be defined over multiple columns, so instead of colNamesStr
                                //  being "`id`" here, it could be "`col_a`,`col_b`".
                                uniqueKey = getKeyColNames(colNamesStr);    //  colName array OR single colName string.
                                uniqueKeys.push( uniqueKey );
                                if ("string" === typeof uniqueKey) {      //  if the unique key is over a single column,
                                    uniqueKeySet.add(uniqueKey)
                                }
                            }


                            return false;                   //  filter() :  get rid of the KEY, CONSTRAINT, etc...
                        }
                        return true;                                    //  and only keep the column definitions
                    })
            .map(
                col => {                                          //  regex the colName  colType(colType params if present).
                    let [name, sqlType, paramStr] = col.replace(/\s*`?(\w+)`?\s+(\w+)(\(([^]+?)\))?.*$/, '$1;$2;$4')
                                                       .split(';'); // => [ colName, colType, typeParamIfPresent ]
                    sqlType = sqlType.toLowerCase();
                    let eType = mySqlTableColumnTypeMapOb[sqlType];             //  eType : EDbJsType
                    if (! eType) {
                        throw Error(`no EDbJsType eType found for sqlType [${sqlType}] of column [${name}].`);
                    }
                    let typeParam =  ! paramStr  ?  undefined   //  typeParam are optional;  if not present : undefined
                                                 :  (params =>
                                                        params.length > 1  ?  params.map(                       //  array or
                                                                                         p => cleanMySqlParam(p, eType))
                                                                           :  cleanMySqlParam(params[0], eType) //  single value
                                                    )(paramStr.split(','));

                    if (eBinaryDbJsType === eType) {                            //  Upgrade {var}binary(16) to uuid,
                        if (typeParam === 16) {
                            eType = eUuidDbJsType;
                        }                                                       //  Upgrade {var}binary(32) to sha 256,
                        if (typeParam === 32) {
                            //  https://stackoverflow.com/questions/2240973/how-long-is-the-sha256-hash
                            //  UPDATE...SET hash_column=UNHEX(sha256HexString).    //  string of fix 64 length
                            //  Then, when retrieving it, you SELECT HEX(hash_column) AS hash_column
                            eType = eShaDbJsType;
                        }
                    }
                    else if ('tinyint' === sqlType  &&  1 === typeParam) {      //  Upgrade tinyint(1) to boolean
                        eType = eBooleanDbJsType;
                    }
                    return {
                        name,                                                           //  colName
                        sqlType,
                        eType,
                        typeParam,
                        canBeNull: col.search(/NOT\s+NULL/i) === -1,    //  .canBeNull: 'NOT NULL' not found !
                    };
           });

        return Object.assign(
            schema.map(field =>   //  add the .fkTableName and .fkColName properties to a uni-column foreign key field.
                                Object.assign(field,
                                              foreignKeyMapOb[field.name],      // may be undefined, and it's ok!
                                    //  e.g.  foreignKeyMapOb['practitioner_id'] = {
                                    //            fkReferencedTableName: 'Practitioner',
                                    //            fkReferencedColName  : 'id',
                                    //        }
                                              {     //  also add the bool .isPrimaryKey and .isUniqueKey
                                                  isPrimaryKey: field.name===primaryKey,
                                                  isUniqueKey : field.name===primaryKey || uniqueKeySet.has(field.name),
                                              })),              //  if it's a uni-column primary|unique key field.
            { primaryKey,  uniqueKeys,  uniqueKeySet,  foreignKeys,    foreignKeyMapOb });
    };   //  attach .primaryKey, .uniqueKeys, .uniqueKeySet, .foreignKeys and foreignKeyMapOb props to column/field [].
self.parseTableSchema = parseMySqlTableSchema;

//endregion


logger.trace("Initialized ...");

