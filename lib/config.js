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

const fs       = require('fs');
const log4js   = require('log4js');

const { commentsLitOb, makeDirIfNeeded, buildFromFile, bailOut, ExpectedError } = require('./utils');
const { ApiUsers, AllCredentials } = require('./config.auth');
const { Endpoint, WsSelfServer } = require('./config.nao');
const { SelfWebRequestMethods, } = require('./nao');

const self = module.exports;

self.epoch = () => new Date('1 january 1970'); //  That's 1970-01-01T05:00:00.000Z, T00:00:00.000Z only in GMT zone

const WtfConfigProto = {};
/**
 *
 * @param {boolean} push
 * @param {int} purgeAfterInDays
 * @param {boolean} verbose
 * @param {number} pushInterval in second
 * @returns {WtfConfig}
 * @constructor
 */
function WtfConfig({push, purgeAfterInDays, verbose, pushInterval=5}={}) {
    const o = Object.create(WtfConfigProto);
    Object.assign(o, {push, purgeAfterInDays, verbose, pushInterval});
    return o;
}
(self.WtfConfig = WtfConfig).chainProto();

//region DatabaseConfig

const DbEndpointProto = {};
function DbEndpoint({host, port, ..._rest}={}) {
    const o = Object.create(DbEndpointProto);
    Object.assign(o, {host, port}, commentsLitOb(_rest), );
    return o;
}
DbEndpoint.chainProto();

const ServerNetworkSpecProto = {};
function ServerNetworkSpec ({endpoint, caCertFile, ..._rest}={}) {
    const o = Object.create(ServerNetworkSpecProto);
    Object.assign(o, {endpoint:DbEndpoint(endpoint), caCertFile}, commentsLitOb(_rest));
    return o;
}
ServerNetworkSpec.chainProto(ServerNetworkSpecProto);

const DatabaseConfigProto = {};
function DatabaseConfig({serverNetworkSpec, user, password, database, debug, ..._rest}={}) {
    const o = Object.create(DatabaseConfigProto);
    Object.assign(o, {serverNetworkSpec:ServerNetworkSpec(serverNetworkSpec), user, password, database, debug},
                    commentsLitOb(_rest));
    return o;
}
DatabaseConfig.chainProto(DatabaseConfigProto);

//endregion


class NodeConfig {

    constructor(srcJsOb, node) {
        Object.defineProperty(this, '_node', {value: node});     // link to top object
        Object.defineProperty(this, '_configLogger', {configurable: true, value: node});
        const configLogger = () => this._configLogger;      //  Will return undefined after config time!
        const {environment, application, netFlavor:netFlavorAlias, feedFlavor:feedFlavorAlias, configFQN } = node.launchParams;

        Object.defineProperty(this, '_environment', {value: environment});  // cache the argv launch Params
        Object.defineProperty(this, '_application', {value: application});
        Object.defineProperty(this, '_netFlavorAlias',   {value: netFlavorAlias});
        Object.defineProperty(this, '_feedFlavorAlias',  {value: feedFlavorAlias});
        Object.defineProperty(this, '_configFQN',  {value: configFQN});

        const { language, nodeName, selfRestServers, selfCliWsServers, selfWsServers, databaseConfigs,
                                    apiUsers, credentials, netFlavors } = srcJsOb;
        Object.assign(this, {language, nodeName, selfRestServers, selfCliWsServers, selfWsServers, databaseConfigs,
                                                        apiUsers, credentials, netFlavors});

        Object.defineProperty(this, '_apiUsers',    {value: new ApiUsers(apiUsers, this)});
        Object.defineProperty(this, '_allCredentials', {value: new AllCredentials(credentials, this)});

        const netFlavor = this._netFlavor;
        if (undefined === netFlavor) {
            configLogger().bailOut(`launchParam (n)et flavor [${netFlavorAlias}] not found in .netFlavors {} section of config file [${configFQN}].`);
        }
        Object.defineProperty(this, '_netFlavor', {value: netFlavor});      //  overrides proto._netFlavor

        //  SelfWebRequestMethods() needs feedConfig.ApiUsers, so we build _selfRestServer after loading them.

        const selfRestServerAlias = this.selfRestServerAlias;
                    //  overrides proto._selfRestServerAlias
        Object.defineProperty(this, '_selfRestServerAlias', {configurable:true, value: selfRestServerAlias});

        const selfRestServer = this._selfRestServer;
        if (undefined === selfRestServer) {
            configLogger().bailOut(`netFlavor [${netFlavorAlias}] .selfRestServer: "${netFlavor.selfRestServer}" definition not found in .selfRestServers {} section of config file [${configFQN}].`);
        }
                    //  overrides proto._selfRestServer
        Object.defineProperty(this, '_selfRestServer', {configurable:true, value: new Endpoint(
                                    selfRestServer, this, {kind:'selfRestServer', alias:selfRestServerAlias},
                                    endpoint => SelfWebRequestMethods(endpoint, this))});


        const selfCliWsServerAlias = this.selfCliWsServerAlias;
                    //  overrides proto._selfCliWsServerAlias
        Object.defineProperty(this, '_selfCliWsServerAlias', {configurable:true, value: selfCliWsServerAlias});

        const selfCliWsServer = this._selfCliWsServer;
        if (selfCliWsServerAlias) {
            if (undefined === selfCliWsServer) {
                configLogger().bailOut(`netFlavor [${netFlavorAlias}] .selfCliWsServer: "${selfCliWsServerAlias}" definition not found in .selfCliWsServers {} section of config file [${configFQN}].`);
            }
            Object.defineProperty(this, '_selfCliWsServer', {configurable:true, value: new WsSelfServer(selfCliWsServer, this)});
        }


        const selfWsServerAlias = this.selfWsServerAlias;
                    //  overrides proto._selfWsServerAlias
        Object.defineProperty(this, '_selfWsServerAlias', {configurable:true, value: selfWsServerAlias});

        const selfWsServer = this._selfWsServer;
        if (selfWsServerAlias) {
            if (undefined === selfWsServer) {
                configLogger().bailOut(`netFlavor [${netFlavorAlias}] .selfWsServer: "${selfWsServerAlias}" definition not found in .selfWsServers {} section of config file [${configFQN}].`);
            }
            Object.defineProperty(this, '_selfWsServer', {configurable:true, value: new WsSelfServer(selfWsServer, this)});
        }

        const databaseConfigAlias = this.databaseConfigAlias;
                    //  overrides proto._databaseConfigAlias
        Object.defineProperty(this, '_databaseConfigAlias', {configurable:true, value: databaseConfigAlias});

        const databaseConfig = this._databaseConfig;
        if (undefined === databaseConfig) {
            configLogger().bailOut(`netFlavor [${netFlavorAlias}] .databaseConfig: "${netFlavor.databaseConfig}" definition not found in .databaseConfigs {} section of config file [${configFQN}].`);
        }
        Object.defineProperty(this, '_databaseConfig', {configurable:true, value: DatabaseConfig(databaseConfig)});

    }

    get environment() { return this._environment; }
    get application() { return this._application; }
    get netFlavorAlias()   { return this._netFlavorAlias; }
    get feedFlavorAlias()  { return this._feedFlavorAlias; }
    get configFQN()    { return this._configFQN; }

    get node() { return this._node; }
    get allApiUsers() { return this._apiUsers; }
    get allCredentials() { return this._allCredentials; }

    get _netFlavor() { return this.netFlavors && this.netFlavors[this.netFlavorAlias]; }                            //  overridden with instance value prop in constructor.
    get netFlavor()  { return this._netFlavor; }

//  getFeedFlavor() has different versions in feedHub and feedCore.

    //region selfServers and databases

    get _selfRestServerAlias() { return this.netFlavor.selfRestServer; }                                            //  overridden with instance value prop in constructor.
    get selfRestServerAlias() { return this._selfRestServerAlias; }

    get _selfRestServer() { return this.selfRestServers && this.selfRestServers[this._selfRestServerAlias]; }       //  overridden with instance value prop in constructor.
    get selfRestServer() { return this._selfRestServer; }


    get _selfCliWsServerAlias() { return this.netFlavor.selfCliWsServer; }                                          //  overridden with instance value prop in constructor.
    get selfCliWsServerAlias() { return this._selfCliWsServerAlias; }

    get _selfCliWsServer() { return this.selfCliWsServers && this.selfCliWsServers[this._selfCliWsServerAlias]; }   //  overridden with instance value prop in constructor.
    get selfCliWsServer() { return this._selfCliWsServer; }


    get _selfWsServerAlias() { return this.netFlavor.selfWsServer; }                                                //  overridden with instance value prop in constructor.
    get selfWsServerAlias() { return this._selfWsServerAlias; }

    get _selfWsServer() { return this.selfWsServers && this.selfWsServers[this._selfWsServerAlias]; }               //  overridden with instance value prop in constructor.
    get selfWsServer() { return this._selfWsServer; }


    get _databaseConfigAlias() { return this.netFlavor.databaseConfig; }                                            //  overridden with instance value prop in constructor.
    get databaseConfigAlias() { return this._databaseConfigAlias; }

    get _databaseConfig() { return this.databaseConfigs && this.databaseConfigs[this._databaseConfigAlias]; }       //  overridden with instance value prop in constructor.
    get databaseConfig() { return this._databaseConfig; }

    //endregion

}
self.NodeConfig = NodeConfig;

/**
 *
 * @param node
 * @param NodeConfig
 * @returns {undefined}
 */
self.nodeConfig = (node, NodeConfig) => {

    const { launchParams } = node;

    log4js.configure(launchParams.log4jsConfig);
    const logger = log4js.getLogger('CONFIG');

    launchParams.logLoading(msg=>{logger.info(msg);});

    const configLogger = node;  //  Add the configLog properties to node here and remove them in finally{} below.
    Object.defineProperty(configLogger, "configLog", {configurable:true, get () {return logger;}});
    configLogger.bailOut = (msg, e) => bailOut(logger, msg, e);

    const { processPath, processResourcesPath, instanceResourcesPath } = launchParams;
    //  launchParams.processPath normally exists if log4js.configure(launchParams.log4jsConfig) worked above.
    makeDirIfNeeded(processPath, logger);                                   //  processPath includes instancePath
    if ( ! fs.existsSync(processResourcesPath)) {  //  ensure a "resources" symlink exist to node.srcProcessResourcesPath

        const target = node.srcProcessResourcesPath;                    //  the process resources in this project tree.

        fs.symlinkSync(target, processResourcesPath);
        logger.warn(`Added symlink  ${processResourcesPath}  to target  ${target}`);
    }
    if ( ! fs.existsSync(instanceResourcesPath)) {  //  ensure a "resources" symlink exist to node.srcInstanceResourcesPath

        const target = node.srcInstanceResourcesPath;                    //  the process resources in this project tree.

        fs.symlinkSync(target, instanceResourcesPath);
        logger.warn(`Added symlink  ${instanceResourcesPath}  to target  ${target}`);
    }
    try {
        const configFullFilename = launchParams.configFQN;
        return buildFromFile(configLogger, configFullFilename, NodeConfig, [node]);
    }
    finally {
        delete configLogger.configLog;      //  configLogger is node, really.
        delete configLogger.bailOut;
    }
};

self.nodeReloadConfig = (parallelNode, NodeConfig, logger) => {

    const { launchParams } = parallelNode;
    launchParams.logLoading(msg=>{ logger.info('Re-'+msg); });

    const configLogger = parallelNode;  //  Add .configLog and.bailOut to node here and remove them in finally{} below.
    Object.defineProperty(configLogger, "configLog", {configurable:true, get () {return logger;}});
    configLogger.bailOut = (msg, e) => {
        throw ExpectedError(msg + (e ? ('\n' + e.message) : ''));
    };

    //  launchParams haven't changed since original nodeConfig() so all paths are still valid.
    try {
        const configFullFilename = launchParams.configFQN;
        return buildFromFile(configLogger, configFullFilename, NodeConfig, [parallelNode]);
    }
    finally {
        delete configLogger.configLog;      //  configLogger is node, really.
        delete configLogger.bailOut;
    }
};


