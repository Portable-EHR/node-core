/*
 * Copyright © Portable EHR inc, 2020
 */

'use strict';
const loggerCat = __filename.replace(/.*\/(.+?)([.]js)?$/, '$1');

const { readFileSync } = require('fs');
const { Server:WsServer } = require('ws');
const logger = require('log4js').getLogger(loggerCat);

const { commentsLitOb, sansCommentLitOb, niceJSON, Enum, EItem, cleanUrlPath, } = require('./utils.js');

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
     * @param {string=} host
     * @param {number=}port
     * @param {string} scheme
     * @param {string=} path
     * @param {number} timeoutInMs
     * @param {string=} credentials
     * @param {string=} apiKey
     * @param {...*} _rest
     * @param owner
     * @param {{kind: string=, alias: string=}} kindAndAlias
     * @param {function(Endpoint, ...*):{
     *      Post: function({path:string, params:object=, requiresJwt:boolean=},{verbose:boolean=}=):Promise<{body:string, statusCode2XX:number, msgHead:(function():string)}|(function():Promise<{body:string, statusCode2XX:number, msgHead:(function():string)}>)>,
     *      Put?: function({path:string, params:object=, requiresJwt:boolean=},{verbose:boolean=}=):Promise<{body:string, statusCode2XX:number, msgHead:(function():string)}|(function():Promise<{body:string, statusCode2XX:number, msgHead:(function():string)}>)>,
     *      Get?: function({path:string, params:object=, requiresJwt:boolean=},{verbose:boolean=}=):Promise<{body:string, statusCode2XX:number, msgHead:(function():string)}|(function():Promise<{body:string, statusCode2XX:number, msgHead:(function():string)}>)>,
     *      Delete?: function({path:string, params:object=, requiresJwt:boolean=},{verbose:boolean=}=):Promise<{body:string, statusCode2XX:number, msgHead:(function():string)}|(function():Promise<{body:string, statusCode2XX:number, msgHead:(function():string)}>)>,
     *      obtainJwt?: function(boolean=):Promise<Jwt>,
     *      cacheJwt?: function(boolean=):Promise<Jwt>,
     *      forceJwtRenewalOnNextWebRequest?: function():void
     * }} webRequestMethods
     * @param {boolean} bindWebRequestMethodsNow
     */
    constructor({host, port, scheme, path, timeoutInMs, credentials, apiKey, ..._rest}, owner, kindAndAlias={},
                webRequestMethods=endpoint=>({ Post: async ({path})=> ({body:endpoint.host, statusCode2XX:200, msgHead:()=>path})}), bindWebRequestMethodsNow=true) {
        // it can be an adapter, a BackendServer, etc... whatever config object this endpoint is part of.
        Object.defineProperty(this, "_owner", {value:owner});
        Object.defineProperty(this, "_kindAndAlias", {value:kindAndAlias});

        Object.defineProperty(this, '_webRequestMethods', {value: webRequestMethods});

        const eScheme = EWebScheme[`${scheme}`];
        this.scheme   = eScheme ? eScheme : eHttps;
        this.host     = host;
        this.port     = port;
        this.setPath(path);

        this.timeoutInMs = timeoutInMs;     //  The default value is resolved at the individual webRequestMethods level

        //  The auth part of the endpoint: typically one or the other is present.
        this.credentials = credentials;     //  typically for feed on https .scheme
        this.apiKey = apiKey;               //  typically for backend

        Object.assign(this, commentsLitOb(_rest));

        if (bindWebRequestMethodsNow) this.bindWebRequestMethods();
        else Object.defineProperty(this, "_web", {configurable:true, value:null});
    }
    setPath(path) {
        this.path = path;
        Object.defineProperty(this, '_cleanUrlPath', {configurable:true, value:cleanUrlPath('string' === typeof path  ? path : '')});
    }
    get cleanUrlPath() { return this._cleanUrlPath; }
    /**
     *
     * @param {Credentials} credentials
     */
    linkCredentials(credentials) {
        Object.defineProperty(this, "_credentials", {value: credentials});
    }

    get isSchemeHttp() { return this.scheme === eHttp; }
    get verbose() { return this._owner.verbose; }   // owner.verbose might be undefined, resolve to false, ok!
    /**
     *
     * @return {{
     *      Post: function({path:string, params:object=, requiresJwt:boolean=},{verbose:boolean=}=):Promise<{body:string, statusCode2XX:number, msgHead:(function():string)}|(function():Promise<{body:string, statusCode2XX:number, msgHead:(function():string)}>)>,
     *      Put?: function({path:string, params:object=, requiresJwt:boolean=},{verbose:boolean=}=):Promise<{body:string, statusCode2XX:number, msgHead:(function():string)}|(function():Promise<{body:string, statusCode2XX:number, msgHead:(function():string)}>)>,
     *      Get?: function({path:string, params:object=, requiresJwt:boolean=},{verbose:boolean=}=):Promise<{body:string, statusCode2XX:number, msgHead:(function():string)}|(function():Promise<{body:string, statusCode2XX:number, msgHead:(function():string)}>)>,
     *      Delete?: function({path:string, params:object=, requiresJwt:boolean=},{verbose:boolean=}=):Promise<{body:string, statusCode2XX:number, msgHead:(function():string)}|(function():Promise<{body:string, statusCode2XX:number, msgHead:(function():string)}>)>,
     *      obtainJwt?: function(boolean=):Promise<Jwt>,
     *      cacheJwt?: function(boolean=):Promise<Jwt>,
     *      forceJwtRenewalOnNextWebRequest?: function():void
     * }}
     */
    get web() { return this._web; }
    /**
     *
     * @return {{
     *      Post: function({path:string, params:object=, requiresJwt:boolean=},{verbose:boolean=}=):Promise<{body:string, statusCode2XX:number, msgHead:(function():string)}|(function():Promise<{body:string, statusCode2XX:number, msgHead:(function():string)}>)>,
     *      Put?: function({path:string, params:object=, requiresJwt:boolean=},{verbose:boolean=}=):Promise<{body:string, statusCode2XX:number, msgHead:(function():string)}|(function():Promise<{body:string, statusCode2XX:number, msgHead:(function():string)}>)>,
     *      Get?: function({path:string, params:object=, requiresJwt:boolean=},{verbose:boolean=}=):Promise<{body:string, statusCode2XX:number, msgHead:(function():string)}|(function():Promise<{body:string, statusCode2XX:number, msgHead:(function():string)}>)>,
     *      Delete?: function({path:string, params:object=, requiresJwt:boolean=},{verbose:boolean=}=):Promise<{body:string, statusCode2XX:number, msgHead:(function():string)}|(function():Promise<{body:string, statusCode2XX:number, msgHead:(function():string)}>)>,
     *      obtainJwt?: function(boolean=):Promise<Jwt>,
     *      cacheJwt?: function(boolean=):Promise<Jwt>,
     *      forceJwtRenewalOnNextWebRequest?: function():void
     * }}
     */
    get feedWeb() { return this._web; }
    get backendWeb() { return this._owner.backendWeb; }    //  null until owner initialized
    get feedProviderName() { return this._owner.feedProviderName; }
    get feedAlias() { return this._owner._feedAlias; }

    get kind() { return this._kindAndAlias.kind; }
    get alias() { return this._kindAndAlias.alias; }
    get tag() {
        const { alias, kind } = this;
        return `${this.kind ? kind : ''}${kind && alias ? ' ' : ''}${alias ? `[${alias}]`: ''}`;
    }

    get sansCommentLitOb() {
        return sansCommentLitOb(this);
    }
    get sansCommentJSON() { return niceJSON(this.sansCommentLitOb); }

    /**
     *
     * @return {{
     *      Post: function({path:string, params:object=, requiresJwt:boolean=},{verbose:boolean=}=):Promise<{body:string, statusCode2XX:number, msgHead:(function():string)}|(function():Promise<{body:string, statusCode2XX:number, msgHead:(function():string)}>)>,
     *      Put?: function({path:string, params:object=, requiresJwt:boolean=},{verbose:boolean=}=):Promise<{body:string, statusCode2XX:number, msgHead:(function():string)}|(function():Promise<{body:string, statusCode2XX:number, msgHead:(function():string)}>)>,
     *      Get?: function({path:string, params:object=, requiresJwt:boolean=},{verbose:boolean=}=):Promise<{body:string, statusCode2XX:number, msgHead:(function():string)}|(function():Promise<{body:string, statusCode2XX:number, msgHead:(function():string)}>)>,
     *      Delete?: function({path:string, params:object=, requiresJwt:boolean=},{verbose:boolean=}=):Promise<{body:string, statusCode2XX:number, msgHead:(function():string)}|(function():Promise<{body:string, statusCode2XX:number, msgHead:(function():string)}>)>,
     *      obtainJwt?: function(boolean=):Promise<Jwt>,
     *      cacheJwt?: function(boolean=):Promise<Jwt>,
     *      forceJwtRenewalOnNextWebRequest?: function():void
     * }}
     */
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
        //  The _webRequestMethods implementation is owner dependent. It depends on the techno of the endpoint.
        //  If the owner is an adapter, ._webRequestMethods will come from, say, it's spi._webRequestMethods overriding.
        //  If the owner is a BackendServer, it will have to provide an instance of ._webRequestMethods itself, etc...
        //  Therefore, it's the responsibility of the owner to provide for the specific of a ._webRequestMethods,
        //  via a _webRequestMethods(), for Endpoint to cache the executed result in its _web value property.

        return Object.defineProperty(this, "_web", {configurable:true, value:this._webRequestMethods(this)})._web;
    }

    get url() {
        const {scheme, host, port, cleanUrlPath } = this;
        if (!host) logger.warn("No host, will use localhost");
        return `${scheme}://${host? host:'127.0.0.1'}${port ? `:${port}` : ''}${cleanUrlPath}`;
    }
}
self.Endpoint = Endpoint;

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
