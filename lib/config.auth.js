/*
 * Copyright © Portable EHR inc, 2019
 */

'use strict';
const loggerCat = __filename.replace(/.*\/(.+?)([.]js)?$/, '$1');

const logger       = require('log4js').getLogger(loggerCat);

const { commentsLitOb, sansCommentLitOb, niceJSON, EItem, Enum, emptyField } = require('./utils.js');

const self = module.exports;

//region ApiUser Enums

const EAuthMethod = (f=>{f.prototype=new Enum(f); return new f({});})(function EAuthMethod({
    none  =(f=>f(f))(function none(f)   { return EItem(EAuthMethod, f); }),
    bearer=(f=>f(f))(function bearer(f) { return EItem(EAuthMethod, f); }),
    custom=(f=>f(f))(function custom(f) { return EItem(EAuthMethod, f); }),
}) {  Enum.call(Object.assign(this, {none, bearer, custom})); });
self.EAuthMethod = EAuthMethod;
const {
    none:   eAuthNone,
    bearer: eAuthBearer,
    custom: eAuthCustom,
} = EAuthMethod;
[eAuthNone].join();                                                     //  Kludge to prevent stupid 'unused' warnings.

const EUserRole = (f=>{f.prototype=new Enum(f); return new f({});})(function EUserRole({
    nobody    =(f=>f(f))(function nobody(f)     { return EItem(EUserRole, f); }),
    admin     =(f=>f(f))(function admin(f)      { return EItem(EUserRole, f); }),
    backend   =(f=>f(f))(function backend(f)    { return EItem(EUserRole, f); }),
    feedhub   =(f=>f(f))(function feedhub(f)     { return EItem(EUserRole, f); }),
    broker    =(f=>f(f))(function broker(f)     { return EItem(EUserRole, f); }),
    dispensary=(f=>f(f))(function dispensary(f) { return EItem(EUserRole, f); }),
    feedstaff =(f=>f(f))(function dispensary(f) { return EItem(EUserRole, f); }),
}) {  Enum.call(Object.assign(this, {nobody, admin, backend, feedhub, broker, dispensary, feedstaff, })); });
self.EUserRole = EUserRole;
const {
    // nobody:     eUserRoleNobody,
    admin:      eUserRoleAdmin,
    backend:    eUserRoleBackend,
    feedhub:    eUserRoleFeedHub,
    broker:     eUserRoleBroker,
    dispensary: eUserRoleDispensary,
    feedstaff:  eUserRoleFeedStaff,
} = EUserRole;

//endregion


/**
 * @param {string} username
 */
class ApiUser {
    constructor({password, role, method, apiKey, guid, feeds, ..._rest}, username, apiUsers) {
        Object.defineProperty(this, "_username", {value: username});     // default non-{writable|enumerable|configurable}
        Object.defineProperty(this, "_apiUsers", {value: apiUsers});

        const errorMsgs=[];                                                   //  Validate the ApiUser definition here.
        const configLogger = () => apiUsers._config._configLogger;
        const eMethod = EAuthMethod[String(method)];
        if (undefined === eMethod) {
            errorMsgs.push(`Invalid method [${method}] specified for apiUser [${username}], must be one of {${EAuthMethod.join('|')}}.`);
        }
        else {
            const validateMethod = {
                [eAuthBearer]: () => {
                    if (undefined === password) {
                        errorMsgs.push(`No password provided for apiUser [${username}] with method [${eMethod}].`);
                    }
                },
                [eAuthCustom]: () => {
                    if (undefined === apiKey) {
                        errorMsgs.push(`No apiKey provided for apiUser [${username}] with method [${eMethod}].`);
                    }
                    if (undefined === guid) {
                        errorMsgs.push(`No guid provided for apiUser [${username}] with method [${eMethod}].`);
                    }
                    else if ('string' !== typeof guid) {
                        errorMsgs.push(`The guid provided for apiUser [${username}] must be a string of text.`);
                    }
                },
            }[eMethod];
            if (validateMethod) validateMethod();
        }
        const eRole = EUserRole[String(role)];
        if (undefined === eRole) {
            errorMsgs.push(`Invalid role [${role}] specified for apiUser [${username}], must be one of {${EUserRole.join('|')}}.`);
        }
        else {
            const validateRole = {
            }[eRole];
            if (validateRole) validateRole();
        }
        if (errorMsgs.length) {
            configLogger().bailOut(errorMsgs.join('\n'));
        }

        this.method   = method;
        this.apiKey   = apiKey;
        this.guid     = guid;
        this.password = password;
        this.role     = role;
        Object.assign(this, commentsLitOb(_rest));
        this.feeds    = feeds ? feeds : [];
        Object.defineProperty(this, '_feeds', {value: new Set(feeds)})
    }

    get username() { return this._username; }
    get apiUsers() { return this._apiUsers; }

    get sansCommentLitOb() {
        return sansCommentLitOb(this);
    }
    get sansCommentJSON() { return niceJSON(this.sansCommentLitOb); }

    get allowsCustomAuthMethod() { return EAuthMethod[this.method] === eAuthCustom; }
    get allowsBearerAuthMethod() { return EAuthMethod[this.method] === eAuthBearer; }

    get allowsAdminRole()       { return EUserRole[this.role] === eUserRoleAdmin; }
    get allowsBackendRole()     { return EUserRole[this.role] === eUserRoleBackend; }
    get allowsFeedHubRole()     { return EUserRole[this.role] === eUserRoleFeedHub; }
    get allowsBrokerRole()      { return EUserRole[this.role] === eUserRoleBroker; }
    get allowsDispensaryRole()  { return EUserRole[this.role] === eUserRoleDispensary; }
    get allowsFeedStaffRole()   { return EUserRole[this.role] === eUserRoleFeedStaff; }

    /***
     *
     * @param {Feed} srcFeed
     * @returns {boolean}
     */
    allowsAccessToFeed(srcFeed) {
        return (this._feeds.has('*')  ||  this._feeds.has(srcFeed.alias));
    }

    get optionsHeadersApikeyAndGuid() {
        return { headers: {
                'x-portableehr-api-key': this.apiKey,
                'x-portableehr-user-guid': this.guid
            }};
    }

}
self.ApiUser = ApiUser;


class ApiUsers {
    constructor(srcJsOb, config) {
        Object.defineProperty(this, '_config', {value: config});

        for (let [username, srcSubJsOb]  of Object.entries(srcJsOb))
            this[username] = new ApiUser(srcSubJsOb, username, this);

        const errorMsgs=[];                                                   //  Validate the ApiUser guid uniqueness.
        const customCreds = Object.defineProperty(this, '_customCreds', {value:{}})._customCreds;
        // noinspection JSCheckFunctionSignatures
        for (let apiUser of Object.values(this)) {
            if (apiUser.allowsCustomAuthMethod) {
                const prevApiUser = customCreds[apiUser.guid];
                if (prevApiUser) {
                    errorMsgs.push(`Both apiUser [${prevApiUser.username}] and [${apiUser.username}] have the same guid`);
                }
                customCreds[apiUser.guid] = apiUser;
            }
        }
        if (errorMsgs.length) {
            const configLogger = config._configLogger;
            configLogger.bailOut(errorMsgs.join('\n'))
        }
    }

    get config() { return this._config; }
    [Symbol.iterator]() {
        // noinspection JSCheckFunctionSignatures
        return Object.values(this)[Symbol.iterator]();
    }

    getUser(username) {
        const apiUser = this[username];
        if (apiUser)  return apiUser;
        logger.error(`getUser :  did not find credentials [${username}] .`);
        return null;
    }

    getUserWithApiKeyAndGuid(apiKey, guid) {
        const apiUser = this._customCreds[guid];
        if (apiUser && apiUser.apiKey === apiKey) return apiUser;
        logger.error(`getUserWithApiKeyAndGuid :  did not find credentials guid [${guid}] / apiKey [${apiKey}].`);
        return null;
    }

    authenticateUser(username, password) {
        const apiUser = this[username];
        if (apiUser  &&  apiUser.password === password)  return apiUser;
        logger.error(`Login attempt with invalid credentials [${username}/${password}].`);
        return null;
    }

    get demoBearerApiUser() {
        return new ApiUser({method:eAuthBearer, password:'a bad password', role:'nobody'}, 'demoBearer', this);
    }
}
self.ApiUsers = ApiUsers;


class Credentials {

    constructor({username, password, ..._rest}, alias, errorMsgs, allCredentials) {

        Object.defineProperty(this, "_alias", {value:alias});
        Object.defineProperty(this, "_allCredentials", {value:allCredentials});

        //  Validate Credentials here.
        if (emptyField(username) || 'string' !== typeof username) {
            errorMsgs.push(`Invalid "username" [${username}] for Credentials [${name}], it MUST be a non empty string.`)
        }
        if (emptyField(password) || 'string' !== typeof password) {
            errorMsgs.push(`Invalid "password" [${password}] for Credentials [${name}], it MUST be a non empty string.`)
        }
        this.username = username;
        this.password = password;
        delete _rest.jwt;               //  just make sure a config won't override the proto.jwt getter/setter
        Object.assign(this, _rest);     //  not only comment*, extra credential stuff too !

        Object.defineProperty(this, "_apiKey", {writable:true, value:null});    //  writable non-enumerable
        Object.defineProperty(this, "_jwt", {writable:true, value:null});
    }
    get jwt() { return this._jwt; }     // Convenience for Legacy code
    set jwt(jwt) { this._jwt = jwt;}    // Convenience for Legacy code

    get sansCommentLitOb() {
        return sansCommentLitOb(this);
    }
    get sansCommentJSON() { return niceJSON(this.sansCommentLitOb); }
}
self.Credentials = Credentials;

class AllCredentials {
    constructor(srcJsOb, config) {
        Object.defineProperty(this, "_config", {value:config});

        const errorMsgs=[];
        for (let [credentialAlias, credentialJsOb] of Object.entries(srcJsOb))
            this[credentialAlias] = Object.seal(new Credentials(credentialJsOb, credentialAlias, errorMsgs, this));

        if (errorMsgs.length) {
            config._configLogger.bailOut(errorMsgs.join('\n'))
        }
    }

    [Symbol.iterator]() {
        // noinspection JSCheckFunctionSignatures
        return Object.values(this)[Symbol.iterator]();
    }
}
self.AllCredentials = AllCredentials;

logger.trace("Initialized ...");
