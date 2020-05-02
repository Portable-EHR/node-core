/*
 * Copyright © Portable EHR inc, 2019
 */

'use strict';

const fs = require('fs');

const { capitalizeName, niceJSON, dbMsg, strToDate, buildFromFile, LaunchParams} = require('./utils.js');

const self = module.exports;

const epoch = () => new Date('1 january 1970');

class NodeState {
    constructor({mostRecentHeartbeat=epoch(), mostRecentServerPing=epoch()}={}, node, logger ) {
        Object.assign(this, {
            mostRecentHeartbeat: strToDate(mostRecentHeartbeat),
            mostRecentServerPing: strToDate(mostRecentServerPing),
        });
        Object.defineProperty(this, '_nodeStateFQN', {value: node.nodeStateFQN});
        Object.defineProperty(this, '_logger', {value: logger});
    }
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
    constructor (nodeName, dbName, {appAlias, appGuid, appVersion},
                 dfltLaunchParamsFnc=({a,e,i,p,n,f,r,c})=>({a,e,i,p,n,f,r,c}), NodeStateClass, preConfig=function(){}) {

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
                                                        new LaunchParams(dfltLaunchParamsFnc(require('yargs').argv)))});
        this.launchParams.log();
        this.launchParams.ensureLogPath();
        Object.defineProperty(this, "processPath", {value: this.launchParams.processPath});

        preConfig.call(this);
        Object.defineProperty(this,"config", {value: Object.freeze(require('../../lib/config').nodeConfig(this))});
        Object.defineProperty(this, "credentials", {value: this.config.allCredentials});
        Object.defineProperty(this, "apiUsers", {value: this.config.allApiUsers});

        Object.defineProperty(this, "serverApp", {configurable:true, value:null});
        Object.defineProperty(this, "nodeDetail", {configurable:true, value: null});
        Object.defineProperty(this, "nodeState", {configurable:true, value: null});
        Object.defineProperty(this, "pool", {configurable:true, value: null});

        Object.defineProperty(this, "_nodeCore_initialize", {configurable:true, value: async function(app, logger) {
                //  Not used anywhere, to fde knowledge, as of 2019-05-29
                Object.defineProperty(this, "serverApp", {value: app});     //  non-configurable anymore.

                //  Setup of DB pool.
                const dao = require('./dao');       //  First require of dao. The pool connection is initialized here !
                const pool = await dao.poolConnectionTestPromise;       //  May throw! Catch by NodeServerApp and bailOut!
                Object.defineProperty(this, "pool", {value: pool});         //  non-configurable anymore.
                delete dao.poolConnectionTestPromise;
                logger.info(`[DB CONNECTIONS POOL]        : initialized`);

                try {
                    const result = await dao.fetchFromDb(`SELECT db_version FROM ${dbName}.Configuration`);
                    // noinspection JSUnresolvedVariable
                    const res = result[0].db_version;
                    if (res) logger.info(`[DB VERSION]                 : ${res}`);
                    else logger.error("*** Could not extract DB_VERSION from database.")
                }  catch (e) { logger.error(`querying db_version from DB ${dbName}.Configuration :\n` + dbMsg(e)); }


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

                //  buildFromFile is not known to throw on error but it calls logger.bailOut() and returns undefined.
                const nodeState = (nodeState => nodeState ? (()=>{
                    logger.info(`[${NODENAME} STATE]${pad} : loaded`);
                    return nodeState;
                })()                                              : (()=>{
                    logger.info(`[${NODENAME} STATE]${pad} : initialized anew`);
                    return new NodeStateClass({}, this, logger);
                })()             )(buildFromFile(logger, this.nodeStateFQN, NodeStateClass, [this, logger]));

                delete logger.bailOut;
                Object.defineProperty(this, "nodeState", {value: nodeState});   // non-configurable anymore


                delete this._nodeCore_initialize;
            }});
    }

    get application() { return this.launchParams.application; }
    get environment() { return this.launchParams.environment; }

    get nodeDetailFQN() {  return `${this.processPath}/node.detail.json`; }
    get nodeStateFQN() {  return `${this.processPath}/node.state.json`; }
    get nodeJwtKeys() {  return `${this.processPath}/jwt.keys.json`; }

    get srcProcessResourcesPath()  { return process.cwd()+`/processResources/${this.environment}/${this.application}`; }
    get srcInstanceResourcesPath() { return process.cwd()+`/nodeCore/resources/${this.environment}`; }
}
self.Node = Node;


