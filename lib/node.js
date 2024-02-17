/*
 * Copyright © Portable EHR inc, 2019
 */

'use strict';

const fs = require('fs');

const { capitalizeName, niceJSON, dbMsg, strToDate, buildFromFile, LaunchParams} = require('./utils.js');
const { argv } =  require('yargs');

const self = module.exports;

const epoch = () => new Date('1 january 1970');

class NodeState {
    constructor({mostRecentHeartbeat=epoch(), mostRecentServerPing=epoch()}={}, node, logger ) {
        Object.assign(this, {
            mostRecentHeartbeat: strToDate(mostRecentHeartbeat),
            mostRecentServerPing: strToDate(mostRecentServerPing),
        });
        Object.defineProperty(this, '_node', {value: node});
        Object.defineProperty(this, '_nodeStateFQN', {value: node.nodeStateFQN});
        Object.defineProperty(this, '_logger', {value: logger});
    }
    get node() { return this._node};

    persist() {                                                         //  spawn .persist() best effort, don't await.
        fs.writeFile(this._nodeStateFQN, niceJSON(this), e => {
            if (e) this._logger.error(`persisting [${this._nodeStateFQN}] :\n${e.message}`);
        });
    }
    updateMostRecentHeartbeat() {
        this.mostRecentHeartbeat = new Date();
        this.persist();
    }
    updateMostRecentServerPing() {
        this.mostRecentServerPing = new Date();
        this.persist();
    }
    async report() {
        return {...this};
    }
}
self.NodeState = NodeState;

class Node {
    // noinspection JSPotentiallyInvalidUsageOfClassThis
    constructor (nodeName, {appAlias, appGuid, appVersion},
                 dfltLaunchParamsFnc=({a,e,i,p,n,f,r,c})=>({a,e,i,p,n,f,r,c}), NodeStateClass) {

        const NodeName = capitalizeName(nodeName);
        const NODENAME = nodeName.toUpperCase();
        const nodename = nodeName.toLowerCase();
        Object.defineProperty(this, "nodeName",     {value: nodeName});
        Object.defineProperty(this, "NodeName",     {value: NodeName});
        Object.defineProperty(this, "NODENAME",     {value: NODENAME});
        Object.defineProperty(this, "nodename",     {value: nodename});

        Object.defineProperty(this, "appAlias",     {value: appAlias});
        Object.defineProperty(this, "appGuid",      {value: appGuid});
        Object.defineProperty(this, "appVersion",   {value: appVersion});
        // noinspection JSCheckFunctionSignatures
        Object.defineProperty(this, "launchParams", {value: Object.freeze(
                                                        new LaunchParams(dfltLaunchParamsFnc(argv)))});
        this.launchParams.log();
        this.launchParams.ensureLogPath();
        Object.defineProperty(this, "processPath", {value: this.launchParams.processPath});

        this.preConfig();
        Object.defineProperty(this,"config", {value: Object.freeze(
            require(process.env.PEHR_NODE_CWD+(process.env.PEHR_NODE_LIB_CONFIG || '/lib/config')).nodeConfig(this))});
        Object.defineProperty(this, "credentials", {value: this.config.allCredentials});
        Object.defineProperty(this, "apiUsers", {value: this.config.allApiUsers});

        Object.defineProperty(this, "serverApp", {configurable:true, value:null});
        Object.defineProperty(this, "nodeDetail", {configurable:true, value: null});
        Object.defineProperty(this, "nodeState", {configurable:true, value: null});
        Object.defineProperty(this, "myPool", {configurable:true, value: null});
        Object.defineProperty(this, "schemaOfTable", {configurable:true, value: null});

        Object.defineProperty(this, "_nodecore_initialize", {configurable:true, value: async function(app, logger) {
            //  Not used anywhere, to fde knowledge, as of 2019-05-29
            Object.defineProperty(this, "serverApp", {value: app});     //  non-configurable anymore.

            // //  Setup of .nodeDetail                        NodeDetail is really a NodeExtraConfigFromBackend.
            // const { NodeDetail } = require('./node.detail');                        //  loads nao.util, nao, etc...
            // const nodeDetail = await NodeDetail.Load(logger);                       //  may throw fatal Error!
            // Object.defineProperty(this, "nodeDetail", {value: nodeDetail});//  non-configurable anymore
            // nodeDetail.persist();                           //  a sync call, not async.
            //
            // //                               spawn nodeDetail.update() best effort, every 1 minute, not await-ed.
            // require('node-schedule').scheduleJob("0 * * * * ", ()=>nodeDetail.update());
            // logger.info(`[INFO PULL]                  : scheduled at 1 minute interval`);
            //

            //  Setup of .nodeState
            const pad = ' '.repeat((n => n < 0 ? 0 : n)(20-NODENAME.length));
            logger.bailOut = (msg, e) => {              //  Loaded from file, best effort, (re)initialized on error.
                logger.info(`[${NODENAME} STATE]${pad} : error reloading\n${msg}${e ? ('\n'+e.message) : ''}`);
                return undefined;
            };

            //  buildFromFile is not known to throw on error, but it calls logger.bailOut() and returns undefined.
            // noinspection JSPotentiallyInvalidUsageOfClassThis

            Object.defineProperty(this, "nodeState", {value:    // non-configurable anymore
                (nodeState => nodeState ? (()=>{
                    logger.info(`[${NODENAME} STATE]${pad} : loaded`);
                    return nodeState;
                })()                                      : (()=>{
                    logger.info(`[${NODENAME} STATE]${pad} : initialized anew`);
                    return new NodeStateClass({}, this, logger);
                })()             )(buildFromFile(logger, this.nodeStateFQN, NodeStateClass, [this, logger]))
            });
            delete logger.bailOut;


            //  Setup of MY-DB pool.

            const myDao = require('./my-dao');  //  First require of my-dao. The pool connection is initialized here !
            const myPool = await myDao.poolConnectionTestPromise;   //  May throw! Catch by NodeServerApp and bailOut!
            Object.defineProperty(this, "myPool", {value: myPool});     //  non-configurable anymore.
            delete myDao.poolConnectionTestPromise;
            logger.info(`[MY-DB CONNECTIONS POOL]     : initialized`);

            const {database} = myPool.config.connectionConfig;
            const dbVersions =  await myDao.fetchFromDb(`SELECT db_version FROM Configuration`)
                                           .catch(e => {                                    //  returns undefined
                                                    logger.error(`querying db_version from MY-DB ${
                                                                database}.Configuration :\n` + dbMsg(e))})
                                || [];  //  [] if myDao.fetchFromDb() throws, as catch() returns undefined.

            const { db_version } = dbVersions[0] || {};
            if (db_version) {
                logger.info(`[MY-DB VERSION]              : ${db_version}`);
            }
            else logger.error(`Could not extract db_version from MySQL ${database} database.`)

            const tableNames =  await myDao.fetchFromDb(('SELECT TABLE_NAME FROM information_schema.tables' +
                                                      `\n WHERE table_schema = ? AND table_type = 'BASE TABLE'`),
                                                    [database])
                                            .catch(e => {                                     //  returns undefined
                                                    logger.error(`querying MY-DB ${database} Tables Schema :\n` + dbMsg(e))})
                                || [];  //  [] if myDao.fetchFromDb() throws, as catch() returns undefined.

            Object.defineProperty(this, "schemaOfTable", {value:            //  non-configurable anymore
                    await tableNames.reduce(async (schemaOfTablePromise, {TABLE_NAME:tableName}) =>
                      Object.defineProperty(await  schemaOfTablePromise, tableName, {value:
                                    (await myDao.fetchFromDb(`SHOW CREATE TABLE ${tableName}`))[0]}),
                                                /* schemaOfTablePromise : {} initially */ Promise.resolve({}))});

            logger.info(`[MY-DB SCHEMA]               : ${database} :${' '.repeat((n => n < 0 ? 0 : n)(37-database.length))} read !`);

            if (this.config.msDatabaseConfig) {
                 //  Setup of MS-DB pool.
                const msDao = require('./ms-dao');  //  First require of ms-dao. The pool connection is initialized here !
                const msPool = await msDao.poolConnectionTestPromise;   //  May throw! Catch by NodeServerApp and bailOut!
                Object.defineProperty(this, "msPool", {value: msPool});     //  non-configurable anymore.
                delete msDao.poolConnectionTestPromise;
                logger.info(`[MS-DB CONNECTIONS POOL]     : initialized`);
            }

            delete this._nodecore_initialize;
        }});
    }

    get application() { return this.launchParams.application; }
    get environment() { return this.launchParams.environment; }

    get nodeDetailFQN() {  return `${this.processPath}/node.detail.json`; }
    get nodeStateFQN() {  return `${this.processPath}/node.state.json`; }
    get nodeJwtKeysFQN() {  return `${this.processPath}/jwt.keys.json`; }

    get srcProcessResourcesPath()  { return process.cwd()+`/resources/process/${this.environment}`; }
    get srcInstanceResourcesPath() { return process.cwd()+`/resources/instance/${this.environment}`; }

    preConfig() {}                                                              //  Candidate for overriding !
}
self.Node = Node;

[Node.prototype.nodeJwtKeysFQN,].join();                        // avoid "Unused" warning.

