/**
 * Created by WebStorm.
 * User: yvesleborg
 * Date: 2016-08-25
 * Time: 1:35 PM
 *
 * © Copyright Portable EHR inc, 2017
 *
 */

'use strict';
const loggerCat = __filename.replace(/.*\/(.+?)([.]js)?$/, '$1');

const logger = require('log4js').getLogger(loggerCat);

const { niceJSON, Enum, EItem, html } = require('./utils.js');

const self = module.exports;

//region Feed, FeedHub and Backend ApiResponse

const EFeedRequestStatus = (f=>{f.prototype=new Enum(f); return new f({});})(function EFeedRequestStatus({
    OK                =(f=>f(f))(function OK(f)                 { return EItem(EFeedRequestStatus, f); }),
    INTERNAL          =(f=>f(f))(function INTERNAL(f)           { return EItem(EFeedRequestStatus, f); }),
    INVALID_COMMAND   =(f=>f(f))(function INVALID_COMMAND(f)    { return EItem(EFeedRequestStatus, f); }),
    INVALID_PARAMETERS=(f=>f(f))(function INVALID_PARAMETERS(f) { return EItem(EFeedRequestStatus, f); }),
    MALFORMED         =(f=>f(f))(function MALFORMED(f)          { return EItem(EFeedRequestStatus, f); }),
    BACKEND           =(f=>f(f))(function BACKEND(f)            { return EItem(EFeedRequestStatus, f); }),
    AUTH              =(f=>f(f))(function AUTH(f)               { return EItem(EFeedRequestStatus, f); }),
    ACCESS            =(f=>f(f))(function ACCESS(f)             { return EItem(EFeedRequestStatus, f); }),
    CRITERIA_NOT_FOUND=(f=>f(f))(function CRITERIA_NOT_FOUND(f) { return EItem(EFeedRequestStatus, f); }),
    NOT_FOUND         =(f=>f(f))(function NOT_FOUND(f)          { return EItem(EFeedRequestStatus, f); }),
    UNREACHABLE       =(f=>f(f))(function UNREACHABLE(f)        { return EItem(EFeedRequestStatus, f); }),
    TRANSPORT         =(f=>f(f))(function TRANSPORT(f)          { return EItem(EFeedRequestStatus, f); }),
    FEEDHUB           =(f=>f(f))(function FEEDHUB(f)            { return EItem(EFeedRequestStatus, f); }),
}) {  Enum.call(Object.assign(this, {OK, INTERNAL, INVALID_COMMAND, INVALID_PARAMETERS, MALFORMED, BACKEND,
                                    AUTH, ACCESS, CRITERIA_NOT_FOUND, NOT_FOUND, UNREACHABLE, TRANSPORT, FEEDHUB})); });
self.EFeedRequestStatus = EFeedRequestStatus;
const {
    OK:                     eFeedRequestStatusOk,
    // INTERNAL:               eFeedRequestStatusInternal,
    // INVALID_COMMAND:        eFeedRequestStatusInvalidCommand,
    // INVALID_PARAMETERS:     eFeedRequestStatusInvalidParameters,
    // MALFORMED:              eFeedRequestStatusMalformed,
    // BACKEND:                eFeedRequestStatusBackend,
    // AUTH:                   eFeedRequestStatusAuth,
    // ACCESS:                 eFeedRequestStatusAccess,
    // CRITERIA_NOT_FOUND:     eFeedRequestStatusCriteriaNotFound,
    // NOT_FOUND:              eFeedRequestStatusNotFound,
    // UNREACHABLE:            eFeedRequestStatusUnreachable,  //  Normally for patient etc. Also used by ping here.
    // TRANSPORT:              eFeedRequestStatusTransport,
    // FEEDHUB:                eFeedRequestStatusFeedHub,
} = EFeedRequestStatus;

const isFeedStatusOk = self.isFeedStatusOk = ({status}) => EFeedRequestStatus[status] === eFeedRequestStatusOk;

class FeedApiRequestStatus {
    constructor({status, message}) {
        Object.assign(this, {status, message});
    }
    get eStatus() { return EFeedRequestStatus[this.status]; }
}

class FeedApiResponse {
    constructor({requestStatus, responseContent}) {
        Object.assign(this, {requestStatus: new FeedApiRequestStatus(requestStatus), responseContent}); }

    get status() {
                    return this.requestStatus.status; };
    get eStatus() {
                    return EFeedRequestStatus[this.requestStatus.status]; }
    get message() {
                    return this.requestStatus.message; }
    get isStatusOk() {
                    return isFeedStatusOk(this); }
    toString() {
                    return niceJSON(this); }

    static getSyntax(response = 'VARIABLE', responseDetail = '') {
        return html.pre(`
API calls to a Feed will attempt to complete with an HTTP status code 200. 
A code 200 guaranties that the request has been processed end to end.  Any other 
HTTP status code indicates that there was an internal error, either in the 
Feed itself, or in the backend.

${html.h3("Class : FeedApiResponse")}
{
    "requestStatus" : {
        "status"      :  ${html.bold('EFeedRequestStatus')},
        "message"     :  "human readable message"
     }, 
     "responseContent" : ${response}
}

where : 

${html.bold('EFeedRequestStatus')} : ${EFeedRequestStatus.join('|')}

${responseDetail}`); }
}
self.FeedApiResponse = FeedApiResponse;
self.BuildFeedApiResponse = ({status=eFeedRequestStatusOk, message='', responseContent={}}={}) =>
                                new FeedApiResponse({requestStatus:{status, message}, responseContent});
self.ExtractFeedApiResponse = ({requestStatus, responseContent}) =>
                                new FeedApiResponse({requestStatus, responseContent});

//region ApiRequest(s)

const FeedApiLoginRequestProto = {};
function FeedApiLoginRequest({username, password}={}) {
    const o = Object.create(FeedApiLoginRequestProto);
    Object.assign(o, {username, password});
    return o;
}
(self.FeedApiLoginRequest = FeedApiLoginRequest).chainProto();
FeedApiLoginRequest.getSyntax = () => html.pre(`
${html.h3('Class : FeedApiLoginRequest')}
{
    "username" : string, not null,
    "password" : string, not null
}

where

- username : The username that was provided to the Feed client's owner
- password : The corresponding password provided by the Feed for the above username

`);

//endregion


const EFeedHubRequestStatus = (f=>{f.prototype=new Enum(f); return new f({});})(function EFeedHubRequestStatus({
    OK                =(f=>f(f))(function OK(f)                 { return EItem(EFeedHubRequestStatus, f); }),
    INTERNAL          =(f=>f(f))(function INTERNAL(f)           { return EItem(EFeedHubRequestStatus, f); }),
    INVALID_COMMAND   =(f=>f(f))(function INVALID_COMMAND(f)    { return EItem(EFeedHubRequestStatus, f); }),
    INVALID_PARAMETERS=(f=>f(f))(function INVALID_PARAMETERS(f) { return EItem(EFeedHubRequestStatus, f); }),
    MALFORMED         =(f=>f(f))(function MALFORMED(f)          { return EItem(EFeedHubRequestStatus, f); }),
    BACKEND           =(f=>f(f))(function BACKEND(f)            { return EItem(EFeedHubRequestStatus, f); }),
    AUTH              =(f=>f(f))(function AUTH(f)               { return EItem(EFeedHubRequestStatus, f); }),
    ACCESS            =(f=>f(f))(function ACCESS(f)             { return EItem(EFeedHubRequestStatus, f); }),
    CRITERIA_NOT_FOUND=(f=>f(f))(function CRITERIA_NOT_FOUND(f) { return EItem(EFeedHubRequestStatus, f); }),
    NOT_FOUND         =(f=>f(f))(function NOT_FOUND(f)          { return EItem(EFeedHubRequestStatus, f); }),
    UNREACHABLE       =(f=>f(f))(function UNREACHABLE(f)        { return EItem(EFeedHubRequestStatus, f); }),
    TRANSPORT         =(f=>f(f))(function TRANSPORT(f)          { return EItem(EFeedHubRequestStatus, f); }),
    FEED              =(f=>f(f))(function FEED(f)          { return EItem(EFeedHubRequestStatus, f); }),
}) {  Enum.call(Object.assign(this, {OK, INTERNAL, INVALID_COMMAND, INVALID_PARAMETERS, MALFORMED, BACKEND,
                                            AUTH, ACCESS, CRITERIA_NOT_FOUND, NOT_FOUND, UNREACHABLE, TRANSPORT, FEED})); });
self.EFeedHubRequestStatus = EFeedHubRequestStatus;
const {
    OK:                     eFeedHubRequestStatusOk,
    // INTERNAL:               eFeedHubRequestStatusInternal,
    // INVALID_COMMAND:        eFeedHubRequestStatusInvalidCommand,
    // INVALID_PARAMETERS:     eFeedHubRequestStatusInvalidParameters,
    // MALFORMED:              eFeedHubRequestStatusMalformed,
    // BACKEND:                eFeedHubRequestStatusBackend,
    // AUTH:                   eFeedHubRequestStatusAuth,
    // ACCESS:                 eFeedHubRequestStatusAccess,
    // CRITERIA_NOT_FOUND:     eFeedHubRequestStatusCriteriaNotFound,
    // NOT_FOUND:              eFeedHubRequestStatusNotFound,
    // UNREACHABLE:            eFeedHubRequestStatusUnreachable,  //  Normally for patient etc. Also used by ping here.
    // TRANSPORT:              eFeedHubRequestStatusTransport,
    // FEED:                   eFeedHubRequestStatusFeed,
} = EFeedHubRequestStatus;

const isFeedHubStatusOk = self.isFeedHubStatusOk = ({status}) => EFeedHubRequestStatus[status] === eFeedHubRequestStatusOk;
class FeedHubApiRequestStatus {
    constructor({status, message}) {
        Object.assign(this, {status, message});
    }
    get eStatus() {
                    return EFeedHubRequestStatus[this.status]; }
}

class FeedHubApiResponse {
    constructor({requestStatus, responseContent}) {
        Object.assign(this, {requestStatus: new FeedHubApiRequestStatus(requestStatus), responseContent}); }

    get status() {
                    return this.requestStatus.status; };
    get eStatus() {
                    return EFeedHubRequestStatus[this.requestStatus.status]; }
    get message() {
                    return this.requestStatus.message; }
    get isStatusOk() {
                    return isFeedHubStatusOk(this); }
    toString() {
                    return niceJSON(this); }

    static getSyntax(response = 'VARIABLE', responseDetail = '') {
        return html.pre(`
API calls to the FeedHub will attempt to complete with an HTTP status code 200. 
A code 200 guaranties that the request has been processed end to end.  Any other 
HTTP status code indicates that there was an internal error, either in the 
FeedHub itself, or in the backend.

${html.h3("Class : FeedHubApiResponse")}
{
    "requestStatus" : {
        "status"      :  ${html.bold('EFeedHubRequestStatus')},
        "message"     :  "human readable message"
     }, 
     "responseContent" : ${response}
}

where : 

${html.bold('EFeedHubRequestStatus')} : ${EFeedHubRequestStatus.join('|')}

${responseDetail}`); }
}
self.FeedHubApiResponse = FeedHubApiResponse;
self.BuildFeedHubApiResponse = ({status=eFeedRequestStatusOk, message='', responseContent={}}={}) =>
                                new FeedHubApiResponse({requestStatus:{status, message}, responseContent});
self.ExtractFeedHubApiResponse = ({requestStatus, responseContent}) =>
                                new FeedHubApiResponse({requestStatus, responseContent});

//region ApiRequest(s)

const FeedHubApiLoginRequestProto = {};
function FeedHubApiLoginRequest({username, password}={}) {
    const o = Object.create(FeedHubApiLoginRequestProto);
    Object.assign(o, {username, password});
    return o;
}
(self.FeedHubApiLoginRequest = FeedHubApiLoginRequest).chainProto();
FeedHubApiLoginRequest.getSyntax = () => html.pre(`
${html.h3('Class : FeedHubApiLoginRequest')}
{
    "username" : string, not null,
    "password" : string, not null
}

where

- username : The username that was provided to the FeedHub client's owner when activating a clinic
- password : The corresponding password provided by Portable EHR at the clinic's activation

`);


const FeedHubApiRequestDispensaryProto = {};
function FeedHubApiDispensaryRequest({parameters={}, dispensaryId=parameters.dispensaryId, command, trackingId, }={}) {
    const o = Object.create(FeedHubApiRequestDispensaryProto);
    Object.assign(o, {dispensaryId, command, trackingId, parameters});
    return o;
}
(self.FeedHubApiDispensaryRequest = FeedHubApiDispensaryRequest).chainProto();
FeedHubApiDispensaryRequest.getSyntax = () => `${html.pre(
    `Every active FeedHub API call on /dispensary is a post, with a ${FeedHubApiDispensaryRequest.name} as the body of the post. 

`)}
${html.pre(html.h3(`Class : ${FeedHubApiDispensaryRequest.name}`))}
${html.pre(`{
    "dispensaryId" : "a string identifying a dispensary, target of this ${FeedHubApiDispensaryRequest.name} command",
    "command"      : "a command to be executed at the url",
    "trackingId"   : "your tracking ID, a GUID",
    "parameters"   : PARAMETERS json object
}

`)}`;

//endregion


//endregion

logger.trace("Initialized .... ");
