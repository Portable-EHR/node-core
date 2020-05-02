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

const { makeDirIfNeeded, buildFromFile, bailOut } = require('./utils');
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
function WtfConfig({push, purgeAfterInDays, verbose, pushInterval=5}) {
    const o = Object.create(WtfConfigProto);
    Object.assign(o, {push, purgeAfterInDays, verbose, pushInterval});
    return o;
}
(self.WtfConfig = WtfConfig).chainProto();

//region DatabaseConfig

const DbEndpointProto = {};
function DbEndpoint({host, port}) {
    const o = Object.create(DbEndpointProto);
    Object.assign(o, {host, port});
    return o;
}
DbEndpoint.chainProto();

const ServerNetworkSpecProto = {};
function ServerNetworkSpec ({endpoint, caCertFile}={}) {
    const o = Object.create(ServerNetworkSpecProto);
    Object.assign(o, {endpoint:DbEndpoint(endpoint), caCertFile});
    return o;
}
ServerNetworkSpec.chainProto(ServerNetworkSpecProto);

const DatabaseConfigProto = {};
function DatabaseConfig({serverNetworkSpec, user, password, database, debug}={}) {
    const o = Object.create(DatabaseConfigProto);
    Object.assign(o, {serverNetworkSpec:ServerNetworkSpec(serverNetworkSpec), user, password, database, debug});
    return o;
}
DatabaseConfig.chainProto(DatabaseConfigProto);

//endregion


class NodeConfig {

    constructor(srcJsOb, node) {
        Object.defineProperty(this, '_node', {value: node});     // link to top object
        Object.defineProperty(this, '_configLogger', {configurable: true, value: node});
        const configLogger = () => this._configLogger;      //  Will return undefined after config time!
        const {launchParams: {environment, application, netFlavor:netFlavorId, feedFlavor:feedFlavorId } } = node;

        Object.defineProperty(this, '_environment', {value: environment});  // cache the argv launch Params
        Object.defineProperty(this, '_application', {value: application});
        Object.defineProperty(this, '_netFlavor',   {value: netFlavorId});
        Object.defineProperty(this, '_feedFlavor',  {value: feedFlavorId});

        const { language, nodeName, selfRestServers, selfCliServers, selfWsServers, databaseConfigs,
                                    apiUsers, credentials, netFlavors } = srcJsOb;
        Object.assign(this, {language, nodeName, selfRestServers, selfCliServers, selfWsServers, databaseConfigs,
                                                        apiUsers, credentials, netFlavors});

        Object.defineProperty(this, '_apiUsers',    {value: new ApiUsers(apiUsers, this)});
        Object.defineProperty(this, '_allCredentials', {value: new AllCredentials(credentials, this)});

        const { configFQN } = node.launchParams;

        const netFlavor =  netFlavors && netFlavors[this.netFlavor];
        if (undefined === netFlavor) {
            configLogger().bailOut(`launchParam (n)et flavor [${netFlavorId}] not found in .netFlavors {} section of config file [${configFQN}].`);
        }

        //  SelfWebRequestMethods() needs feedConfig.ApiUsers, so we build _selfRestServer after loading them.

        const selfRestServer = selfRestServers && selfRestServers[netFlavor.selfRestServer];
        if (undefined === selfRestServer) {
            configLogger().bailOut(`netFlavor [${netFlavorId}] .selfRestServer: "${netFlavor.selfRestServer}" definition not found in .selfRestServers {} section of config file [${configFQN}].`);
        }
        Object.defineProperty(this, '_selfRestServer', {value: new Endpoint(selfRestServer, this, endpoint => SelfWebRequestMethods(endpoint, this))});

        const selfCliWsServerId = netFlavor.selfCliWsServer;
        const selfCliWsServer = selfWsServers && selfWsServers[selfCliWsServerId];
        if (selfCliWsServerId) {
            if (undefined === selfCliWsServer) {
                configLogger().bailOut(`netFlavor [${netFlavorId}] .selfCliServer: "${selfCliWsServerId}" definition not found in .selfWsServers {} section of config file [${configFQN}].`);
            }
            Object.defineProperty(this, '_selfCliWsServer', {value: new WsSelfServer(selfCliWsServer, this)});
        }

        const selfWsServerId = netFlavor.selfWsServer;
        const selfWsServer = selfWsServers && selfWsServers[selfWsServerId];
        if (selfWsServerId) {
            if (undefined === selfWsServer) {
                configLogger().bailOut(`netFlavor [${netFlavorId}] .selfWsServer: "${selfWsServerId}" definition not found in .selfWsServers {} section of config file [${configFQN}].`);
            }
            Object.defineProperty(this, '_selfWsServer', {value: new WsSelfServer(selfWsServer, this)});
        }

        const databaseConfig = databaseConfigs && databaseConfigs[netFlavor.databaseConfig];
        if (undefined === databaseConfig) {
            configLogger().bailOut(`netFlavor [${netFlavorId}] .databaseConfig: "${netFlavor.databaseConfig}" definition not found in .databaseConfigs {} section of config file [${configFQN}].`);
        }
        Object.defineProperty(this, '_databaseConfig', {value: DatabaseConfig(databaseConfig)});

    }

    get environment() { return this._environment; }
    get application() { return this._application; }
    get netFlavor()   { return this._netFlavor; }
    get feedFlavor()  { return this._feedFlavor; }

    get node() { return this._node; }
    get allApiUsers() { return this._apiUsers; }
    get allCredentials() { return this._allCredentials; }

    //region net flavor

    get selfRestServer() { return this._selfRestServer; }
    get selfCliWsServer()  { return this._selfCliWsServer; }
    get selfWsServer()   { return this._selfWsServer; }
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

    const { environment, variant, processPath, processResourcesPath, instanceResourcesPath } = launchParams;
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

