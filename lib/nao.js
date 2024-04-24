/*
 * Copyright © Portable EHR inc, 2020
 */

'use strict';
const loggerCat = __filename.replace(/.*\/(.+?)([.]js)?$/, '$1');

const querystring = require('querystring');
const logger = require('log4js').getLogger(loggerCat);

const { Enum, EItem, ErrorExtender, ErrorWrapper, DeclareExpectedError, Jwt, } = require('./utils');
const { Credentials } = require('./config.auth');

const self = module.exports;

//region nao error definitions

//  WARNING
//
//  IpSocketError MUST NOT be used as the right-hand expression of the JavaScript "instanceof" operator.
//  The lib/utils function isInstanceOfError() MUST be used instead.
//  Wrapping errors of potentially multiple different prototypes can cause "instanceof" to wrongly return false.
/**
 *
 * @param {Error} error
 * @param {function():string} msgHead
 * @returns {Error}
 * @constructor
 */
const IpSocketError = self.IpSocketError = function IpSocketError(error, msgHead=()=>'') {
    return ErrorWrapper(error, IpSocketError, ()=>`${msgHead()}: `,'IpSocket ');
};
DeclareExpectedError(IpSocketError);                                //  Overridden by DeclareFeedOpError() later soon.


const StatusError = self.StatusError = function StatusError(statusCode, msgHead, message, receivedBody=SelfStatusErrorBody()){
    return ErrorExtender(message, StatusError, {statusCode, body:receivedBody}, ()=>`${msgHead()}\n`);
};
DeclareExpectedError(StatusError);                                  //  Overridden by DeclareFeedOpError() later soon.


//  WARNING
//
//  Unpacking MUST NOT be used as the right-hand expression of the JavaScript "instanceof" operator.
//  The lib/utils function isInstanceOfError() MUST be used instead.
//  Wrapping errors of potentially multiple different prototypes can cause "instanceof" to wrongly return false.
/**
 *
 * @param {Error} error
 * @param {function():string} msgHead
 * @param {string} callContext
 * @param {string} errorContext
 * @param {string} body
 * @returns {Error}
 * @constructor
 */
const Unpacking = self.Unpacking = function Unpacking(error, msgHead=()=>'', callContext='', errorContext='', body=undefined) {
    const e=ErrorWrapper(error, Unpacking, ()=>`${msgHead()}\n`, callContext+errorContext, {body});
    return Object.assign(e,  {
        shortMessage() {                                        //  a closure to use errorContext without callContext
            const {feedOp:{isOfFeed, FeedProviderName, isPumpOp}, extraStr} = this;
            const { message, constructor:{name:wrappedErrorName}} = error;
            const server = isOfFeed ? `${FeedProviderName} Feed` : 'Backend';
            return `Unpacking${isPumpOp ? ': ' : ` ${server} response: ${errorContext}`}${wrappedErrorName}: ${
                                                  message} :${extraStr}${isOfFeed && !isPumpOp? `\n${msgHead()}` : ''}`;
        }});
};
DeclareExpectedError(Unpacking);                                    //  Overridden by DeclareFeedOpError() later soon.


const BackendError = self.BackendError = function BackendError({msgHead, statusCode, backendApiResponse}) {
    const {apiVersion, status, message} = backendApiResponse.requestStatus;
    return ErrorExtender(`Backend${apiVersion ? ` Api[${apiVersion}]` : ''}: [${status}] : ${message}`, BackendError, {
                                backendApiResponse,
                            },()=>`${msgHead()} resulted in (HTTP statusCode [${statusCode}]) :\n`);
};
DeclareExpectedError(BackendError);                                 //  Overridden by DeclareFeedOpError() later soon.


const FeedHubError = self.FeedHubError = function FeedHubError({msgHead, statusCode, requestStatus}) {
    const {status, message} = requestStatus;
    return ErrorExtender(`FeedHub: [${status}] : ${message}`, FeedHubError, {
        feedHubApiRequestStatus:requestStatus,
    },()=>`${msgHead()} resulted in (HTTP statusCode [${statusCode}]) :\n`);
};
DeclareExpectedError(FeedHubError);                                 //  Overridden by DeclareFeedOpError() later soon.


const FeedError = self.FeedError = function FeedError({msgHead, statusCode, feedApiResponse}) {
    const {status, message} = feedApiResponse.requestStatus;
    return ErrorExtender(`Feed: [${status}] : ${message}`, FeedError, {
                                feedApiResponse,
                            },()=>`${msgHead()} resulted in (HTTP statusCode [${statusCode}]) :\n`);
};
DeclareExpectedError(FeedError);                                 //  Overridden by DeclareFeedOpError() later soon.

//endregion

//region Enums: EWebMethod, EWebStatusCode

const EWebMethod = (f=>{f.prototype=new Enum(f); return new f({});})(function EWebMethod({
    POST  =(f=>f(f))(function POST(f)   { return EItem(EWebMethod, f); }),
    PUT   =(f=>f(f))(function PUT(f)    { return EItem(EWebMethod, f); }),
    GET   =(f=>f(f))(function GET(f)    { return EItem(EWebMethod, f); }),
    DELETE=(f=>f(f))(function DELETE(f) { return EItem(EWebMethod, f); }),
}) {  Enum.call(Object.assign(this, {POST, PUT, GET, DELETE})); });
self.EWebMethod = EWebMethod;

const EWebStatusCode = (f=>{f.prototype=new Enum(f); return new f({});})(function EWebStatusCode({
    NoContent    =(f=>f(f))(function NoContent(f,     i=204) { return EItem(EWebStatusCode, f, i); }),
    BadRequest   =(f=>f(f))(function BadRequest(f,    i=400) { return EItem(EWebStatusCode, f, i); }),
    Unauthorized =(f=>f(f))(function Unauthorized(f,  i=401) { return EItem(EWebStatusCode, f, i); }),
    NotFound     =(f=>f(f))(function NotFound(f,      i=404) { return EItem(EWebStatusCode, f, i); }),
    NotAcceptable=(f=>f(f))(function NotAcceptable(f, i=406) { return EItem(EWebStatusCode, f, i); }),
    Conflict     =(f=>f(f))(function Conflict(f,      i=409) { return EItem(EWebStatusCode, f, i); }),
    Gone         =(f=>f(f))(function Gone(f,          i=410) { return EItem(EWebStatusCode, f, i); }),
    UnsupportedMediaType=(f=>f(f))(function UnsupportedMediaType(f,i=415){ return EItem(EWebStatusCode, f,i); }),
    ServerError  =(f=>f(f))(function ServerError(f,   i=500) { return EItem(EWebStatusCode, f, i); }),
}) {  Enum.call(Object.assign(this, {NoContent, BadRequest, Unauthorized, NotFound, NotAcceptable, Conflict,
                                            Gone, UnsupportedMediaType, ServerError})); });
self.EWebStatusCode = EWebStatusCode;

//endregion


class WebRequest {
    //  StaticOptions specifies extra constant properties that should be added to the "options" of the WebRequest
    //  via its .nodeOptions(). If it includes a "headers: { ... }" property, the sub properties of that headers
    //  object will be Object.assign()-ed to the existing options.headers object property.

    /**
     *
     * @param {Endpoint} endpoint
     * @param {object} StaticOptions
     * @param {function(boolean=): Promise<Jwt>} obtainJwt
     */
    constructor ({endpoint, StaticOptions, obtainJwt=async ()=>Jwt()}) {
        //                  StaticOptions:{StatusErrorBody:(ob)=>{expose:()=>''}, headers: {}}
        Object.defineProperty(this, 'endpoint',     {value: endpoint});
        Object.defineProperty(this, 'StaticOptions',{value: StaticOptions});
        Object.defineProperty(this, 'obtainJwt',    {value: obtainJwt});
        Object.defineProperty(this, 'nodeHttp',     {value: require(endpoint.scheme.name)});
    }
    get verbose() { return this.endpoint.verbose; }
    get cachedJwt() { return this._cachedJwt; }                                  //  Candidate for overriding
    set cachedJwt(value) { Object.defineProperty(this, '_cachedJwt', {configurable:true, value }); }
    deleteCachedJwt() { delete this._cachedJwt; }

    get jwtMethods() { return { obtainJwt: this.obtainJwt,              //  function passed as constructor argument.
                                cacheJwt : async (verbose) => await this.getJwt(verbose),
                                forceJwtRenewalOnNextWebRequest: () => { this.deleteCachedJwt(); }   };
    }

    nodeOptions(eMethod, path, {timeoutInMs, maxAttempts, verbose, ...extraOptions})  {

        //  Set the static options and options.headers
        const { StatusErrorBody, headers:staticHeaders, ...restOfStaticOptions } = this.StaticOptions;

        //  Set the dynamic extra options and options.headers received by arguments. May override the static ones
        const { headers:extraHeaders, ...restOfExtraOptions } = extraOptions;

        if (timeoutInMs) {
            Object.assign(restOfExtraOptions, { timeout: timeoutInMs });    //  add .timeout if (timeoutInMs)
        }

        const { host:hostname, port, scheme, cleanUrlPath, verbose:endpointVerbose } = this.endpoint;

        return {
            hostname,
            port,
            protocol: `${scheme}:`,
            path    : cleanUrlPath + path,
            method  : `${eMethod}`,
            //  timeout: timeoutInMs,       // only if (timeoutInMs), see above
            ...restOfStaticOptions,
            ...restOfExtraOptions,          //  order matters: restOfExtraOptions may override restOfStaticOptions
            headers : {
                ...staticHeaders,
                ...extraHeaders             //  order matters: extraHeaders may override staticHeaders
            },
            _endpoint: {    //  Put all the options for endpoint._webRequest in one private _endpoint place.
                maxAttempts,
                verbose:  undefined === verbose  ?  endpointVerbose  :  verbose,
                StatusErrorBody,
            },

            _ipSocketMsgHead() { return `${this.protocol}//${this.hostname}${this.port?`:${this.port}`:''}`;},
            ipSocketMsgHead() { return `Reaching (${this._ipSocketMsgHead()})`;},
            msgHead() { return `webRequest.${this.method}(${this._ipSocketMsgHead()}${this.path})`;}
        };
    }

    async addJwtHeaders(nodeOptions) {
        const { verbose } = this;
        try {
            return Object.assign(nodeOptions.headers, {
                Authorization: `Bearer ${(await this.getJwt(verbose)).jwToken}`, // may await in this.getJwt()
                Accept: 'application/json'
            });
        } catch (e) {
            if (verbose) logger.error(`${nodeOptions.msgHead()} : Caught error inserting jwt headers.`);
            if (verbose && !e.isExpected) logger.error(e.stack);
            throw e;
        }
    }

    async getJwt(verbose) {
        const { cachedJwt } = this;                                            //  try using ._cachedJwt
        if (cachedJwt) {
            if ( ! cachedJwt.willBeExpiredIn({seconds:30})) {
                if (verbose) logger.trace("getJwt() : reusing cached jwt.");
                return cachedJwt;

            } else if (verbose) logger.trace("getJwt() : cached jwt expired, obtaining new one");
        } else if (verbose) logger.trace("getJwt() : no cached jwt, obtaining new one");

        //  Obtain jwt from endpoint.

        //  A non-undefined .endpoint._credentials is required to ._obtainJwt().
        //  Instead of testing it here on every request, its validation is either done *once* at config load time,
        //  using adapter.validateAndLinkEndpointCredentials(), or by some other means (e.g. implicitly in selfServer).
        try {
            const jwt =  (this.cachedJwt = await this.obtainJwt(verbose));   // set cachedJwt(value)    //  May throw !
            if (verbose || this.verbose) logger.trace(`getJwt() : obtained new jwt ${jwt} from server`);
            return jwt;
        } catch (e) {
            logger.error(`${this.endpoint.tag} getJwt() : Could not obtain jwt from server : ${e.message}`);
            throw e;
        }
    }

    //  Performs an HTTP request (or return the closures for the caller to perform it).
    //
    //  The behavior of _webRequest depends mainly on the nodeOption._endpoint.maxAttempts argument.
    //
    //  - If maxAttempts is 0, _webRequest performs no HTTP request attempt and throws special StatusError().
    //
    //  - If maxAttempts is > 0, _webRequest performs up to maxAttempts attempts at the HTTP request, handling all but
    //      the last attempt exception handling internally, logging an error and nothing else for now.
    //
    //  - If maxAttempts is < 0, _webRequest returns the closures { performOneRequest, msgHead } for the caller to have
    //      complete control on the error handling and re-attempt process.

    /**
     *
     * @param {Object} options
     * @param {Object} _bodyToSendObCandidate
     * @returns {Promise<{body:string, statusCode2XX:number, msgHead:(function():string)}|(function():Promise<{body:string, statusCode2XX:number, msgHead:(function():string)}>)>}
     */
    async performRequest({nodeOptions:options, _bodyToSendObCandidate={}}) {
        const bodyToSend = Object.keys(_bodyToSendObCandidate).length  ?  JSON.stringify(_bodyToSendObCandidate)
                                                                       :  '';        // don't json {}
        const contentLenghtOption  = () => (bodyToSend          ?  {
            'Content-Type': 'application/json; charset=utf-8',
            'Content-Length': Buffer.byteLength(bodyToSend) }   :  {});
        Object.assign(options.headers, {...contentLenghtOption()});

        const { command, trackingId } = _bodyToSendObCandidate;
        const msgHead = ()=>`${options.msgHead()}${'string'===typeof command    ? `.${command}` : ''}${
                                                   'string'===typeof trackingId ? ` (trackingId [${trackingId}])` : ''}`;
        msgHead.body = bodyToSend ? _bodyToSendObCandidate : undefined;

        const {verbose, maxAttempts=1, StatusErrorBody} = options._endpoint;  //  Cache verbose and maxAttempt locally.

        //  definition of the performOneRequest subroutine/closure, run one or more times below...
        const performOneRequest = async () => new Promise(async (fulfill, reject) => {
            //  Minimal number of node Events to handle to cover all the cases (the rest is superfluous) :
            //  to fulfill/succeed: ( res.data, res.end ), to reject/fail: ( req.timeout, req.error, res.aborted )
            let receivedBody = '';
            const req = this.nodeHttp.request(options, res => {
                const statusCode =  res.statusCode;

                if (verbose) logger.trace(`${msgHead()}\n` +
                    `STATUS : ${statusCode}\n` +
                    `HEADERS: ${JSON.stringify(res.headers, null, 4)}`);

                res.setEncoding('utf8');

                res.on('data', receivedChunk => {
                    if (verbose) logger.trace(`${msgHead()} result.on.data: received body chunk of length ${receivedChunk.length}`);
                    receivedBody += receivedChunk}
                );
                res.on('end', () => {
                    try {
                        if (verbose && receivedBody) logger.trace(`${msgHead()}\nBODY   : ${receivedBody}`);

                        if (statusCode < 200 || statusCode >= 300)
                            reject(StatusError(statusCode, msgHead, `HTTP server responded with status code [${statusCode}].`,
                                                                      StatusErrorBody({statusCode,body:receivedBody})));

                        fulfill({body:receivedBody, statusCode2XX:statusCode, msgHead});
                    } catch (e) {
                        if (verbose) logger.error(`${msgHead()} Caught error when marshalling server response.`);
                        if (verbose) logger.error(e.stack);
                        reject (e);
                    }
                });
                //  res.aborted event occurs when this client aborts the request (likely due to timeout, see below) and
                //  data has started to be received. (If this client aborts the request before any data has been
                //  received, it will result in a req.error ('Error: socket hang up' and code 'ECONNRESET') instead.)
                //
                //  WARNING: this can result in a StatusError with statusCode 2XX if timeout or any other abort occurs
                //              part-way through the reception of a Success response.
                res.on('aborted', () => {           //  All "expected" errors are either .StatusError or .IpSocketError.
                    reject(StatusError(statusCode, msgHead, `Client aborted while server responding with HTTP status ${statusCode}.`,
                                                                    StatusErrorBody({statusCode,body:receivedBody})));
                });
            });
            req.on('error', err => { reject(IpSocketError(err, ()=>options.ipSocketMsgHead())); });

            if (options.timeout) {
                req.on('timeout', () => {
                    if (verbose) logger.error(`${msgHead()} Socket inactive for ${options.timeout} ms. Aborting.`);
                    req.abort(); });    // this req.abort() is what the Node doc tells to do on Event request.timeout.
                //  The doc says it "Marks the request as aborting. Calling this will cause remaining data in the
                //  response to be dropped and the socket to be destroyed."
                //  It will also generate one of two possible Events, that are handled above: either
                //  - req.error ('Error: socket hang up' and code 'ECONNRESET') if data hasn't been received yet; or
                //  - res.aborted if data has started to be received.
                //  These are the two events already unconditionally handled here, above. For error reporting purpose.
                //
                //  A destroyed socket will cause this _nodeHttp.request() to become unusable, so with timeout or any
                //  other kind of 'error' if we want to do retries it will have to be re attempted from outside.
            }
            req.end(bodyToSend);
        });
        //  end of performOneRequest() closure.

        // *
        // _webRequest() really starts here! :-)

        if (maxAttempts < 0) {      //  If maxAttempts is negative, return the closures performOneRequest, with msgHead
            //  and options attached to performOneRequest, for the caller to have full control over the process.
            return Object.assign(performOneRequest, {msgHead/*, options*/});
        }

        //  Cycle through as many attempts of performOneRequest as specified by maxAttempts.

        for (let attemptCnt = 0; attemptCnt++ < maxAttempts; ) {    //  Note the post-increment! Readies the test below.
            try {
                return await performOneRequest();   //  This can fail due to timeout or any other http or socket error.
            }
            catch (e) {
                if (attemptCnt >= maxAttempts) {
                    throw e;    //  enough attempts, propagates e out for good.
                }
                //  at least one more attempt to try, so, report the error of this failed attempt before retrying.
                if (verbose) {
                    const xtra = (feedItem => feedItem ? feedItem.feedOp.srcAndDstItemStrs.join('') : ''
                                 )( _bodyToSendObCandidate._feedItem  ||
                                   (_bodyToSendObCandidate.parameters && _bodyToSendObCandidate.parameters._feedItem));
                    logger.error(`${msgHead()} Attempt [ ${attemptCnt} / ${maxAttempts} ] :\n${
                                 xtra + (xtra ? '\n' : '') + (e.isExpected ? e.verboseMsg : e.message)}`);
                }
            }
        }   //  only if maxAttempts = 0;
        throw StatusError(0, msgHead, `No _webRequest was performed due to argument maxAttempts = 0.`);
    }
}
self.WebRequest = WebRequest;

//region SelfWebRequestMethods

const SelfStatusErrorBodyProto = { toString() { return this.body; }, expose() { return '';}, };
function SelfStatusErrorBody({statusCode=0,body=''}={}) { const o = Object.create(SelfStatusErrorBodyProto); Object.assign(o, {statusCode,body}); return o;}
(self.SelfStatusErrorBody = SelfStatusErrorBody).chainProto();  //  SelfStatusErrorBody is the Default/Base/Trivial StatusErrorBody()

class SelfWebRequest extends WebRequest {
    get cachedJwt() { return this.endpoint._credentials._jwt; }
    set cachedJwt(value) {   this.endpoint._credentials._jwt = value; }         //  writable non-configurable prop
    deleteCachedJwt() {      this.endpoint._credentials._jwt = undefined; }     //  writable non-configurable prop
}

self.SelfWebRequestMethods = (endpoint, {allApiUsers}) => {
    const {POST:eWebPOST} = EWebMethod;

    const webRequest = new SelfWebRequest({ endpoint,
        //  This is the place to specify extra constant properties that should be added to the "options" of the
        //  WebRequest via its .nodeOptions(). If it includes a "headers: { ... }"  property, the sub properties
        //  of that headers object will be Object.assign()-ed to the existing options.headers object property.
       StaticOptions : {
            StatusErrorBody: SelfStatusErrorBody,
            rejectUnauthorized: false,
            headers: {
                'Accept': 'application/json',
                'Accept-Charset': 'utf-8',
                'User-Agent': 'EHR(106) - agent (c)',
            }
        },
        //  Define _obtainJwt(), as a pseudo Feed, jwt-using, backend accessing, feed/dispensary-role apiUser.
        obtainJwt: async (verbose) => {
            const {body/*, statusCode2XX, msgHead*/} = await Post({
                path: '/login',
                params: endpoint._credentials,
            }, {
                verbose, /* headers: no authHeaders at all for login */
            });                                                                                 //  May throw !
            logger.debug(`SelfServer obtainJwt(): [${body}]`);
            //  We take for granted Post('/login.) won't fail. apiUsers.authenticateUser() can't, createJwt() shouldn't.
            //  If it fails, an undefined .token we'll throw a TypeError in Jwt().  Only used in someSyncTest anyway.
            return Jwt(JSON.parse(body).responseContent.token);
        },
    });

    const cTimeoutInMs = endpoint.timeoutInMs || 1000*150,
          webRequestEndpointOptions = ({timeoutInMs=cTimeoutInMs, maxAttempts=1, verbose=undefined, ...extraOptions}={}) => ({
                                        timeoutInMs, maxAttempts, verbose, ...extraOptions});

    const addBearerHeaders = async (apiUser, nodeOptions) => {
        //  We add ._allCreds to self/restServer webRequest, to store auto-crafted Credentials for each bearer apiUser.
        const { _allCreds=Object.defineProperty(webRequest, '_allCreds', {value:{}})._allCreds } = webRequest;
        const { username } = apiUser, errMsgs = [];
        const creds = _allCreds[username]  ||  (_allCreds[username] =
                                                new Credentials(apiUser, username, errMsgs, _allCreds)); // no errMsgs:
                               //  apiUser deconstructs into {username, password}, already validated for method: bearer.

        //  Change the restServer endpoint ._credentials on every call so that endpoint.addJwtHeaders() could be used.
        Object.defineProperty(endpoint, '_credentials', {configurable:true, value: creds});
        return await webRequest.addJwtHeaders(nodeOptions);
    };

    /**
     *
     * @param {string} path that the selfWebRequest is addressed to.
     * @param {Object} params sent in body to the selfWebRequest url, defaults to undefined
     * @param {Boolean|undefined} verbose: if undefined (default), endpoint.verbose is used
     * @param {Object} headers, set apart from extraOptions, to be passed Post.authHeadersForApiUser(apiUserName)
     * @param {...Object} timeOutInMs_maxAttempts_extraOptions: optional arguments to override selfWebRequest default
     * @returns {Promise<{body:string, statusCode2XX:number, msgHead:(function():string)}|(function():Promise<{body:string, statusCode2XX:number, msgHead:(function():string)}>)>}
     * @constructor
     */
    const Post = async ({path, params=undefined},
                        {verbose=undefined, headers={}, ...timeOutInMs_maxAttempts_extraOptions}={}) => {

        const nodeOptions = webRequest.nodeOptions(eWebPOST, path, webRequestEndpointOptions({verbose,
            ...timeOutInMs_maxAttempts_extraOptions, headers}));

        return webRequest.performRequest({nodeOptions, _bodyToSendObCandidate:params});
    };
    /**
     *
     * @param {string} apiUserName: name of the apiUser pretending to perform this selfWebRequest, defaults to undefined
     * @returns {Promise<{"x-portableehr-api-key": string, "x-portableehr-user-guid": string}|{Authorization: string, Accept: string}|{}>}
     */
    Post.authHeadersForApiUser = async apiUserName => {
        if (!apiUserName) throw Error(`apiUserName parameter missing from SelfWebRequestMethods.Post() call.`);
        const apiUser = allApiUsers.getUser(apiUserName);
        if (!apiUser) throw Error(`No ApiUser found with name [${apiUserName}].`);

        return apiUser.allowsCustomAuthMethod  ?  apiUser.optionsHeadersApikeyAndGuid.headers :
               apiUser.allowsBearerAuthMethod  ?  await addBearerHeaders(apiUser, {headers:{}}) :
                                                  {};
    }

    return Object.freeze({
        Post,
        ...webRequest.jwtMethods
    });
};

//endregion

//region FeedHubWebRequestMethods

const FeedHubStatusErrorBodyProto = { toString() { return this.body; }, expose() { return '';}, };
function FeedHubStatusErrorBody({statusCode=0,body=''}={}) { const o = Object.create(FeedHubStatusErrorBodyProto); Object.assign(o, {statusCode,body}); return o;}
(self.FeedHubStatusErrorBody = FeedHubStatusErrorBody).chainProto();

self.FeedHubWebRequestMethods = (endpoint) => {
    const {
        POST:eWebPOST,
        GET :eWebGET,
    } = EWebMethod;

    const webRequest = new WebRequest({ endpoint,
        //  This is the place to specify extra constant properties that should be added to the "options" of the
        //  WebRequest via its .nodeOptions(). If it includes a "headers: { ... }"  property, the sub properties
        //  of that headers object will be Object.assign()-ed to the existing options.headers object property.
        StaticOptions : {
            StatusErrorBody: FeedHubStatusErrorBody,
            rejectUnauthorized: false,
            headers: {
                'Accept': 'application/json',
                'Accept-Charset': 'utf-8',
            }
        },
        obtainJwt: async (verbose) => {
            const {body, statusCode2XX:statusCode, msgHead} = await Post({
                path: '/login',
                params: endpoint._credentials,
                requiresJwt: false
            }, {verbose});                                                                              //  May throw !
            let feedHubError;
            try {
                const { requestStatus, responseContent } = JSON.parse(body);
                if ('OK' === requestStatus.status) {
                    return Jwt(responseContent.token);                                          //  unlikely to throw.
                }
                feedHubError = FeedHubError({msgHead, statusCode, requestStatus});
            } catch (e) {
                throw Unpacking(e, msgHead,`FeedHubWebRequestMethods' WebRequest obtainJwt(): (HTTP statusCode [${
                                statusCode}]) : `, `Unexpected ${!body ? 'empty ' : ''}json body: `, body);
            }
            throw feedHubError;
        },
    });

    const cTimeoutInMs = endpoint.timeoutInMs || 1000*40,
          webRequestEndpointOptions = ({timeoutInMs=cTimeoutInMs, maxAttempts=1, verbose=undefined, ...extraOptions}={}) => ({
                                        timeoutInMs, maxAttempts, verbose, ...extraOptions});

    /**
     *
     * @param {string} path
     * @param {object=} params
     * @param {string} params.feedAlias
     * @param {string} params.command
     * @param {object|string|undefined} params.parameters
     * @param {string|undefined} params.trackingId
     * @param {...object} params.restOfBody
     * @param {boolean} requiresJwt
     * @param {boolean|undefined} verbose: if undefined (default), endpoint.verbose is used
     * @param {...object} timeOutInMs_maxAttempts_extraOptions: optional arguments to override selfWebRequest default
     * @return {Promise<{body: string, statusCode2XX: number, msgHead: (function(): string)}|(function(): Promise<{body: string, statusCode2XX: number, msgHead: (function(): string)}>)>}
     * @constructor
     */
    const Post = async ({path, params=undefined, requiresJwt=true}, {verbose, ...timeOutInMs_maxAttempts_extraOptions}) => {

        const nodeOptions = webRequest.nodeOptions(eWebPOST, path,
                                        webRequestEndpointOptions({verbose, ...timeOutInMs_maxAttempts_extraOptions}));
        if (requiresJwt)
            await webRequest.addJwtHeaders(nodeOptions);     //  conditional auth part
        // else { logger.debug(`_obtainJwt(): [${niceJSON(parameters)}]`); }

        return await webRequest.performRequest({nodeOptions, _bodyToSendObCandidate:params});
    };

    const Get = async ({path, params=undefined, requiresJwt=true}, {verbose, ...timeOutInMs_maxAttempts_extraOptions}) => {

        const nodeOptions = webRequest.nodeOptions(eWebGET, path,
                                        webRequestEndpointOptions({verbose, ...timeOutInMs_maxAttempts_extraOptions}));

        if (requiresJwt) await webRequest.addJwtHeaders(nodeOptions);     //  conditional auth part

        // any GET or DELETE parameters are sent via uri querystring.
        nodeOptions.path += params ? ("?" + querystring.stringify(params)) : '';

        return await webRequest.performRequest({nodeOptions, _bodyToSendObCandidate: undefined});    //  no body!
    };

    return Object.freeze({
        Post,
        Get,
        ...webRequest.jwtMethods
    });
};

//endregion

logger.trace("Initialized ...");

