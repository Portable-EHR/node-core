/*
 * Copyright © Portable EHR inc, 2020
 */

'use strict';
const fileTag = __filename.replace(/(.*\/)(.+?)([.]js)?$/, '$2');

const { readFileSync } = require('fs');
const { Server:WsServer } = require('ws');
const logger = require('log4js').getLogger(fileTag);

const { Enum, EItem, minIntervalInMs, cleanUrlPath, } = require('./utils.js');

const self = module.exports;

const EWebScheme = (f=>{f.prototype=new Enum(f); return new f({});})(function EWebScheme({
    http =(f=>f(f))(function http(f)  { return EItem(EWebScheme, f); }),
    https=(f=>f(f))(function https(f) { return EItem(EWebScheme, f); }),
}) {  Enum.call(Object.assign(this, {http, https})); });
const {
    http  : eHttp,
    https : eHttps,
} = EWebScheme;

class Endpoint {
    /**
     *
     * @param {string} host
     * @param {number}port
     * @param {string} scheme
     * @param {string} path
     * @param {string} credentials
     * @param {string} apiKey
     * @param owner
     * @param {Function} webRequestMethods
     * @param {boolean} bindWebRequestMethodsNow
     */
    constructor({host, port, scheme, path, credentials, apiKey}, owner,
                webRequestMethods=(/*endpoint*/)=>({_StaticOptions: {headers:{}}}), bindWebRequestMethodsNow=true) {
        // it can be an adapter, a BackendServer, etc.. whatever config object this endpoint is part of.
        Object.defineProperty(this, "_owner", {value:owner});
        Object.defineProperty(this, '_WebRequestMethods', {value: webRequestMethods});

        const eScheme = EWebScheme[`${scheme}`];
        this.scheme   = eScheme ? eScheme : eHttps;
        this.host     = host;
        this.port     = port;
        this.setPath(path);

        //  The auth part of the endpoint: typically one or the other is present.
        this.credentials = credentials;     //  typically for feed on https .scheme
        this.apiKey = apiKey;               //  typically for backend

        if (bindWebRequestMethodsNow) this.bindWebRequestMethods();
        else Object.defineProperty(this, "_web", {configurable:true, value:null});
    }
    setPath(path) {
        this.path = path;
        Object.defineProperty(this, '_cleanUrlPath', {configurable:true, value:cleanUrlPath('string' === typeof path  ? path : '')});
    }
    get cleanUrlPath() { return this._cleanUrlPath; }

    get isSchemeHttp() { return this.scheme === eHttp; }
    get verbose() { return this._owner.verbose; }   // owner.verbose might be undefined, resolve to false, ok!
    get web() { return this._web; }
    get feedWeb() { return this._web; }
    get backendWeb() { return this._owner.backendWeb; }    //  null until owner initialized
    get feedProvider() { return this._owner.feedProvider.name; }
    get feedAlias() { return this._owner._feedAlias; }

    bindWebRequestMethods() {
        //  ._WebRequestMethods(endpoint) most return a "web" object with the following properties: {
        //      async Post(),                       //  optional
        //      async Put(),                        //  optional
        //      async Get(),                        //  optional
        //      async Delete(),                     //  optional
        //
        //      obtainJwt(verbose)                  //  conditional: must be present if endpoint target requires jwt.
        //      cacheJwt(verbose)                   //  conditional: must be present if endpoint target requires jwt.
        //      forceJwtRenewalOnNextWebRequest()   //  conditional: must be present if endpoint target requires jwt.
        //  }
        //  The _WebRequestMethods implementation is owner dependent. It depends on the techno of the endpoint.
        //  If the owner is an adapter, ._WebRequestMethods will come from, say, it's sapi.constructor.
        //  If the owner is a BackendServer, it will have to provide an instance of ._WebRequestMethods itself, etc..
        //  Therefore it's the responsability of the owner to provide for the specific of a ._WebRequestMethods,
        //  via a _WebRequestMethods(), for Endpoint to cache the executed result in its _web value property.

        return Object.defineProperty(this, "_web", {configurable:true, value:this._WebRequestMethods(this)})._web;
    }

    get url() {
        const {scheme, host, port, cleanUrlPath } = this;
        if (!host) logger.warn("No host, will use localhost");
        return `${scheme}://${host? host:'127.0.0.1'}${port ? `:${port}` : ''}${cleanUrlPath}`;
    }
}
self.Endpoint = Endpoint;

class Adapter {
    /**
     *
     * @param {string} name
     * @param {string} version
     * @param {boolean} verbose
     * @param {string|undefined} comment
     * @param {string} backendServer
     * @param {Endpoint} endpoint
     * @param {number} bundleChunkIntervalInMs
     * @param {boolean} cachingEnabled
     * @param {Feed} feed
     */
    constructor({name, version, verbose, comment, backendServer, endpoint, bundleChunkIntervalInMs, cachingEnabled}={}, feed) {   // config Object typically
        Object.defineProperty(this, "_feed", {value:feed});

        const { config } = feed;
        const { feedProviders, NodeName } = config.node;

        const feedProviderVersions = feedProviders[name];
        if ( ! feedProviderVersions) {
            config._configLogger.bailOut(`${NodeName} variant [${config.variant}] : ${feed.fullTag} adapter name [${name
                    }] is not one of available FeedProviders : {\n  ${Object.keys(feedProviders).join(',\n  ')}\n}`);
        }

        const feedProvider = feedProviderVersions[version];
        if ( ! feedProvider) {
            config._configLogger.bailOut(`${NodeName} variant [${config.variant}] : ${feed.fullTag} adapter version [${version
                                }] is not of available versions of FeedProvider [${feedProviderVersions.name}] : {\n  ${
                                                                 Object.keys(feedProviderVersions).join(',\n  ')}\n}`);
        }
        Object.defineProperty(this, "_feedProvider", { value: feedProvider});

        Object.defineProperty(this, "name", {enumerable:true, value:name});  // non-{configurable|writable}
        Object.defineProperty(this, "version", {enumerable:true, value:version});   //  same with version!
        this.verbose = verbose ? verbose : false;
        if (comment) {
            this.comment = comment;
        }

        Object.defineProperty(this, "backendServer", {enumerable:true, value:backendServer});

        const { providerDir, versionDir } = feedProvider;
        Object.defineProperty(this, "_sapiModule", {get(){return require(`../../ext/${providerDir}/${versionDir}/spi`);}});
        Object.defineProperty(this, "_sapi", {configurable:true, value:null});  // configurable, non-{enumerable|writable}

        Object.defineProperty(this, "_feedWeb", {configurable:true, value:null});
        Object.defineProperty(this, "_backendWeb", {configurable:true, value:null});

        //  The webRequestMethods arrow function argument is run in .bind(), below, after this._sapi is instanciated.
        this.endpoint = new Endpoint(endpoint, this,endpoint => this._sapi.constructor._WebRequestMethods(endpoint),
                                    false);
        Object.defineProperty(this, "_backendpoint", {configurable:true, value:config._getBackendpoint(this)}); //  May be undefined.

        this.cachingEnabled =  Boolean(cachingEnabled);     //  (undefined, null, 0, '') => false
        this.bundleChunkIntervalInMs = bundleChunkIntervalInMs ? minIntervalInMs(bundleChunkIntervalInMs) : 200;
    }

    get feedWeb() { return this._feedWeb; }
    get backendWeb() { return this._backendWeb; }
    get backendpoint() { return this._backendpoint; }
    get config() { return this._feed._feeds._config; }
    get feedProvider() { return this._feedProvider; } //.config.node.feedProviders[this.name][this.version];
    get feed() { return this._feed; }
    get feedAlias() { return this._feedAlias; }

    /**
     *
     * @param {AllCredentials} allCredentials
     * @param {object} configLogger
     * @param {string[]} errMsgs
     */
    validateAndLinkEndpointCredentials(allCredentials, configLogger, errMsgs, configFQN) {
        const { endpoint,  feedProvider } = this;
        const { credentials:credentialsName } = endpoint;

        const credentials = allCredentials[credentialsName];

        if ('string' !== typeof credentialsName  &&  feedProvider.isCredentialsMandatory) {
            errMsgs.push(`Invalid ${this.feed.fullTag} mandatory endpoint.credentials string [${credentialsName}].`);
        }
        else if (credentials) {                                           // Non-configurable for the moment
            Object.defineProperty(endpoint, "_credentials", {value: credentials});
            configLogger.info(`${this.feed.fullTag} Adapter bound with valid credentials.`);
        }
        else {
            errMsgs.push(`${this.feed.fullTag} endpoint.credentials [${credentialsName
                                                }] not found in .feedsConfig {} section of config file [${configFQN}]`);
        }
    }

    bind() {    //  bind sapi and endpoint WebRequestMethods
        const { _sapiModule:{SapiProvider},     //  getting ._sapiModule results in loading of this adapter spi module.
                endpoint, _feed:feed, } = this;
        //  .bind() is not called in constructor because we only load the spi module / instanciate SapiProvider of
        //  Feeds that are *enabled*. Because of feed.enabledByLink, a Feed is known for sure to be enabled only _after_
        //  each Feed (and their Adapter) has been loaded/constructed, and those .enabledByLink are resolved. Therefore,
        //  this bind() is called on the Adapter of each enabled Feed as the last step of Feeds construction.

        Object.defineProperty(this, "_feedAlias", {configurable:true, value: feed.alias}); // cache it!

        //  Instanciate the Sapi.Provider.                  It also binds the feedOps to the sapi interface calls.
        Object.defineProperty(this, "_sapi", {configurable:true, value: new SapiProvider(feed)});

        //  Because endpoint._WebRequestMethods was set to endpoint=>this._sapi.constructor._WebRequestMethods(endpoint)
        //  in Adapter constructor above, we can only call endpoint.bindWebRequestMethods() now that _sapi has been set.
        Object.defineProperty(this, "_feedWeb", {configurable:true, value: endpoint.bindWebRequestMethods()});
        const { backendpoint } = this;
        Object.defineProperty(this, "_backendWeb", {configurable:true, value: backendpoint && backendpoint._web});

        //  Now that this adapter.feedWeb is bound, we can add the .caching to spi (if there's any), which requires it.
        this._sapi.addCaching();

        return this._sapi;
    }
}
self.Adapter = Object.seal(Adapter);

class WsSelfServer {
    constructor({host='localhost', port, keyFilename, certFilename}, config) {
        const eScheme = keyFilename && certFilename ?  eHttps  : eHttp;
        Object.assign(this, {host, port, keyFilename, certFilename});
        Object.defineProperty(this, '_config', {value: config});
        Object.defineProperty(this, '_eScheme', {value: eScheme});
    }
    get config() { return this._config; }
    get eScheme(){ return this._eScheme; }
    get scheme() { return this._eScheme.name; }

    get webServer() {               //  only one _webServer (http|https) per WsSelfServer for possibly many webSockets.
        return this._webServer || (() => {                  //  if _webServer doesn't exist yet, create it on the fly.
            const { instanceResourcesPath } = this.config.node.launchParams;
            const { createServer } = require(this.scheme);
            // const { SSL_OP_NO_TLSv1, SSL_OP_NO_SSLv3 } = require('constants');

            return Object.defineProperty(this, '_webServer', {configurable:true, value:
                    (this.eScheme === eHttps)   ?   createServer({
                        //secureOptions     : SSL_OP_NO_TLSv1 | SSL_OP_NO_SSLv3,
                        cert: readFileSync(instanceResourcesPath + '/' + this.certFilename),
                        key:  readFileSync(instanceResourcesPath + '/' + this.keyFilename),
                    })                          :   createServer()  //  eHttp
            })._webServer;
        })();
    }
    _newWsServer(connectionFnc, authorizeFnc=async ()=>([])) {

        const wsServer = new WsServer({noServer:true});
        wsServer.on('connection', connectionFnc);

        const { webServer } =  this;

        webServer.on('upgrade', async (request, socket, head) => {

            let args;
            try {
                args = await authorizeFnc(request);
            }
            catch (e) {
                socket.destroy();
                logger.error(`authorizing access to webSocket : ${e.message}`);
                return;
            }

            wsServer.handleUpgrade(request, socket, head, /* then when done : */ webSocket => {
                wsServer.emit('connection', webSocket, request, ...args)
            });
        });

        webServer.listen(this.port);
        return wsServer;
    }

}
self.WsSelfServer = WsSelfServer;

logger.trace("Initialized ...");
