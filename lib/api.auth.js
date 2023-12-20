/*
 * Copyright © Portable EHR inc, 2019
 */

//  Then name "auth" is for both authentication and access authorization.

'use strict';
const fileTag = __filename.replace(/(.*\/)(.+?)([.]js)?$/, '$2');

const fs           = require('fs');
const nJwt         = require('njwt');
const secureRandom = require('secure-random');
const {ApiUser}    = require('./config.auth');

const node         = require(process.env.PEHR_NODE_CWD+(process.env.PEHR_NODE_LIB_NODE || '/lib/node'));
const { apiUsers, nodeJwtKeysFQN, isFeedHub, } = node;

const { dateAdd, buildFromFile, toUrlB64, DeclareExpectedError, ErrorExtender, niceJSON }  = require('./utils.js');
const { EFeedHubRequestStatus, BuildFeedHubApiResponse, EFeedRequestStatus, BuildFeedApiResponse } = require('./api');
const BuildNodeApiResponse = isFeedHub ? BuildFeedHubApiResponse : BuildFeedApiResponse;
const ENodeRequestStatus   = isFeedHub ? EFeedHubRequestStatus   : EFeedRequestStatus;
const {                                             //  These 3 are common to EFeedHubRequestStatus & EFeedRequestStatus
    AUTH:                   eNodeRequestStatusAuth,
    ACCESS:                 eNodeRequestStatusAccess,
    NOT_FOUND:              eNodeRequestStatusNotFound,
} = ENodeRequestStatus;

let logger         = require('log4js').getLogger(fileTag);

const self = module.exports;

const cBearerWord = 'bearer';

/**
 *
 * @param {string} message
 */
const authResponse = message => BuildNodeApiResponse({status:eNodeRequestStatusAuth, message});
/**
 *
 * @param {FeedHubApiResponse|FeedApiResponse} ownApiResponse
 * @returns {Error}
 * @constructor
 */
const AuthError = function AuthError(ownApiResponse) { return ErrorExtender('Authorization Error', AuthError,
    { ownApiResponse });
};
DeclareExpectedError(self.AuthError = AuthError);

//region Manage JwtKeys

const epoch = new Date(0);                                  //  1970-01-01T00:00:00.000Z
const jsonDateLen = epoch.toJSON().length;                                      //  always 24
const jsonDate =   dateAndB64Key => dateAndB64Key.slice(0, jsonDateLen);
const jsonB64Key = dateAndB64Key => dateAndB64Key.slice(jsonDateLen);

class JwtKey {
    constructor(creationDate, b64SigningKey, keyId) {
        this.creationDate = new Date(creationDate);
        this.signingKey = Buffer.from(b64SigningKey,'base64');
        Object.defineProperty(this, '_keyId', {value:keyId});
    }
    get keyId() { return this._keyId; }
    toJSON() { return this.creationDate.toJSON() + this.signingKey.toString('base64'); }
    toString() { return `${this.keyId} : ${jsonDate(this.toJSON())}`; }     //  Show .creationDate, but not .signingKey
}

class JwtKeys {
    constructor(jwtKeys={}) {
        let jwtKey, mostRecentCreationDate=epoch;       //  1970-01-01T00:00:00.000Z    : old enough to be the oldest

        for (let [keyId, dateAndB64Key] of Object.entries(jwtKeys)) {
            this[keyId] = jwtKey = new JwtKey(jsonDate(dateAndB64Key), jsonB64Key(dateAndB64Key), keyId);
            if (mostRecentCreationDate < jwtKey.creationDate) {
                mostRecentCreationDate = this._setMostRecent(jwtKey).creationDate;
            }
        }

        const nJwtVerifier = nJwt.createVerifier().withKeyResolver((keyId, callback) => {
            const jwtKey = this[keyId];
            if (jwtKey) {
                return callback(null, jwtKey.signingKey)
            }
            callback(new Error('Unknown kid'));             //  the nJwt Verifier will throw that error.
        });
        Object.defineProperty(this, '_nJwtVerifier',{value: nJwtVerifier});
    }
    /**
     *
     * @returns {nJwt.Verifier}
     */
    get nJwtVerifier() { return this._nJwtVerifier; }
    /**
     *
     * @returns {JwtKey}
     */
    get mostRecent() { return this._mostRecent; }
    /**
     *
     * @param {JwtKey} jwtKey
     * @returns {JwtKey}
     * @private
     */
    _setMostRecent(jwtKey) {
        return Object.defineProperty(this, '_mostRecent', {configurable:true, value:jwtKey})._mostRecent;
    }

    //  jwtKeys.addNew() must be done at a much slower rate than the (current 12 hours) of jwt delay before expiration:
    //  the signingKey must persist for longer than that expiration delay. Since jwtKeys "rotate" the keys, keeping at
    //  most two of them and eliminating the oldest every time a 3rd is added, if it is decided to add/rotate the keys
    //  at all, it is suggested the period of this rotation be of the order of a week, and NEVER less than a day.
    /**
     *
     * @param {string} keyId        30 x 8b = 240b, enough to avoid collision, multiple of 3B so b64 won't be padded.
     * @param {Buffer} signingKey   64 x 8b = 512b, more than enough for HS256.
     * @param {Date} creationDate   new Date() : now : de facto mostRecent.
     */
    addNew(keyId=toUrlB64(secureRandom(30, {type:'Buffer'})), signingKey=secureRandom(64, {type:'Buffer'}), creationDate=new Date()) {

        const key = this[keyId] = new JwtKey(creationDate, signingKey.toString('base64'), keyId);
        const {mostRecent} = this;
        if (! mostRecent  ||  mostRecent.creationDate < key.creationDate ) this._setMostRecent(key);

        //  Only two signingKeys max alive at the same time, though current implementation starts with one.
        // noinspection JSCheckFunctionSignatures
        const entries = Object.entries(this);
        if (entries.length > 2) {                       //  The 2 most recent jwtKeys are kept, the oldest is deleted.
            // noinspection JSCheckFunctionSignatures
            const oldest = entries.reduce(  //  extract jwtKey.creationDate from each [keyId, jwtKey] entry and keep the oldest
                ((oldest, [keyId, {creationDate}]) => (creationDate < oldest.creationDate ? {keyId, creationDate} : oldest)),
                {keyId, creationDate});   //  initial 'oldest': the newly created jwtKey with creationDate 'now'
            delete this[oldest.keyId];
        }
        this.persist();
        logger.warn(`Added a JwtKey created [${creationDate}] and persisted it in [${this.persistPath}].`);
        return this;
    }

    persist() {
        try {   //  makeDirIfNeeded(node.processPath) already done early in nodeConfig()
            fs.writeFileSync(this.persistPath, niceJSON(this), 'utf8');
        }
        catch (e) {
            logger.error(`Error persisting JwtKeys : ${e.stack}`);
        }
    }
    /**
     *
     * @returns {string}
     */
    get persistPath() { return nodeJwtKeysFQN; }
}

logger.bailOut = function() {
    logger.warn(...arguments);
    return (new JwtKeys()).addNew();    //  If no valid JwtKeys file exist, make one with one JwtKey in it.
};
/**
 *
 * @type {JwtKeys}
 */
const jwtKeys = buildFromFile(logger, JwtKeys.prototype.persistPath, JwtKeys);
delete logger.bailOut;

logger.trace(`Most recent JwtKey : ${jwtKeys._mostRecent}`);

//  jwtKeys.addNew() must be done at a much slower rate than the (current 12 hours) of jwt delay before expiration: the
//  signingKey must persist for longer than that expiration delay. Since jwtKeys "rotate" the keys, keeping at most
//  two of them and eliminating the oldest every time a 3rd is added, if it is decided to add/rotate the signingKeys
//  at all, it is suggested the period of this rotation be of the order of a week, and NEVER less than a day.
if ([false,true][ 0 ]) {                //  every Sunday at 4 am, add a new key, remove oldest if there's three keys
    require('node-schedule').scheduleJob("* 4 * * 0", () => { jwtKeys.addNew(); });
}
// self.addNewJwtKey = () => { jwtKeys.addNew(); };                 //  Don't export jwtKeys.addNew() except for test.

//endregion

// const jwtHoursOfValidity = 1/60;                    //  Make the jwt expire 1 minute from now.
const jwtHoursOfValidity = 12;                     //  Make the jwt expire 12 hours from now.
Object.defineProperty(self, 'jwtHoursOfValidity', {value:jwtHoursOfValidity});

/**
 *
 * @param {ApiUser} apiUser
 * @return {string} jwToken b64encoded
 */
self.createJwt = apiUser => {
    const claims = {
        iss  : "https://feed.portableehr.net",  // The URL of your service
        sub  : apiUser.username,                   // The UID of the apiUser in your system
        // scope: apiUser.role                        //  Unused as long as all node users fits in config file and ram.
    };
    const { signingKey, keyId } = jwtKeys.mostRecent;
    const jwt = nJwt.create(claims, signingKey);            //  Default HS256
    jwt.setExpiration(dateAdd.hour(jwtHoursOfValidity));    //  Make the jwt expire jwtHoursOfValidity hours from now.
    jwt.setNotBefore(undefined);                            //  Make the jwt enabled for validation now.
    jwt.setHeader('kid', keyId);                            //  Set the keyId for the verifier to use the right key.

    return jwt.compact();
};

self.verifyJwt = jwToken => jwtKeys.nJwtVerifier.verify(jwToken);

/**
 *
 * @param reqHeaders
 * @return {ApiUser}
 */
const authenticateJwt = reqHeaders => {
    const { authorization:authHeader } = reqHeaders;
    if (!authHeader) throw AuthError(authResponse('No Authorization header in request.'));

    const [method, jwToken] = authHeader.trim().split(/\s+/); // Split at sequence of one or more "any space"
    const isBearer = method.toLowerCase() === cBearerWord;
    if (!isBearer) {
        throw AuthError(authResponse('Method is not [bearer]'));
    }

    const jwt = (()=>{
        try {
            return self.verifyJwt(jwToken);
        } catch (e) {
            throw AuthError(authResponse(e.message));
        }
    })();
    // logger.debug(`Verified jwt OK : ${jwt}`);

    const { sub:username/*, scope:role*/ } = jwt.body; //  scope:role unused as long as all apiUsers fits in config file/ram.
    const apiUser =  apiUsers.getUser(username);
    if (!apiUser) {                                        //  Extremely unlikely, as it was set and signed by us.
        throw AuthError(authResponse(`JWT embedded .sub [${username}] user unknown.`));
    }
    //  user.method validation is done in loginBearer(): once per jwt lifespan.
    //  Note: In node there are very few users, and they're loaded from config files and kept in ram.
    //        If we had to deal with a large user base, we'd need to include the apiUser .role and .feeds list
    //        in the jwt at login time to complete the access authorization without hitting the DB (main jwt feature).
    //        It would then be a good idea to encode the feeds list somehow. To prevent exposing the details.
    return apiUser;
};

/**
 *
 * @param reqHeaders
 * @return {ApiUser|null}
 */
const authenticateCustom = reqHeaders => {
    const { ['x-portableehr-user-guid']:guid,
            ['x-portableehr-api-key']  :apiKey } = reqHeaders;
    if (apiKey && guid) {
        const user = apiUsers.getUserWithApiKeyAndGuid(apiKey, guid);

        if (!user) throw AuthError(authResponse(`Invalid api key and guid credentials provided.`));

        //  ApiUser config validation should normally prevent this.
        if (!user.allowsCustomAuthMethod) throw AuthError(authResponse(`Custom Auth method not allowed for these credentials.`));

        return user;
    }
    return null;
};

const authenticateAndAllowUser = self.authenticateAndAllowUser = (reqHeaders, isRoleAllowed) => {

    const apiUser = authenticateCustom(reqHeaders) || authenticateJwt(reqHeaders);

    if ( ! isRoleAllowed(apiUser)) throw AuthError(BuildNodeApiResponse({
        status  : eNodeRequestStatusAccess,
        message : `User [${apiUser.username}] is denied access to this resource.`
    }));

    return apiUser;
};

/**
 *
 * @param {string} feedAlias
 * @param {object} Feed
 * @returns {Feed}
 */
const getFeed = ({feedAlias, Feed}) => {
    const feed = node.config.allFeedsByAlias[feedAlias];

    if (!feed || !feed.enabled) throw AuthError(BuildNodeApiResponse({
        status  : eNodeRequestStatusNotFound,
        message : `${Feed ? Feed.Feedname: 'feedAlias'} [${feedAlias}].`
    }));
    return feed;
};
self.getFeed = getFeed;

/**
 *
 * @param {object} reqHeaders
 * @param {object} feedAliasAndFeed
 * @param {function(ApiUser):boolean} isRoleAllowed
 * @returns {Feed}
 */
self.authorizeApiRequest = (reqHeaders, feedAliasAndFeed, isRoleAllowed) => {
    const apiUser = authenticateAndAllowUser(reqHeaders, isRoleAllowed);
    const feed = getFeed(feedAliasAndFeed);                     //  throws if no enabled Feed with feedAlias in Feeds.

    if ( ! apiUser.allowsAccessToFeed(feed)) throw AuthError(BuildNodeApiResponse({
        status  : eNodeRequestStatusAccess,
        message : `User [${apiUser.username}] is denied access to ${feed.Feedname} [${feed.alias}] resource.`
    }));

    return feed;
};


/**
 *
 * @param {string} username
 * @param {string} password
 * @return {ApiUser|null}
 */
self.bearerLogin = (username, password) => {

    let apiUser = apiUsers.authenticateUser(username, password);
    if (!apiUser) {
        logger.error(`Failed to bearerLogin : user [${username}].`);
        return null;
    }

    if (apiUser.allowsBearerAuthMethod) {
        logger.info(`bearerLogin : user [${username}] authenticated.`);
        return apiUser;
    }
    logger.error(`user [${username}] not allowed to use bearer authentication method.`);
    return null;
};

logger.trace("Initialized ...");
