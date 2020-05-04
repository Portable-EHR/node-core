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
const fileTag = __filename.replace(/(.*\/)([^.]*)(.*)/, '$2');

const logger = require('log4js').getLogger(fileTag);

const { niceJSON, Enum, EItem, html } = require('./utils.js');

const self = module.exports;

//region FeedHub and Backend ApiResponse

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
}) {  Enum.call(Object.assign(this, {OK, INTERNAL, INVALID_COMMAND, INVALID_PARAMETERS, MALFORMED, BACKEND,
AUTH, ACCESS, CRITERIA_NOT_FOUND, NOT_FOUND, UNREACHABLE, TRANSPORT})); });
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
} = EFeedHubRequestStatus;

const isStatusOk = ({status}) => EFeedHubRequestStatus[status] === eFeedHubRequestStatusOk;
const FeedHubApiRequestStatusProto = {
    get eStatus() { return EFeedHubRequestStatus[this.status]; },
};
function FeedHubApiRequestStatus({status=eFeedHubRequestStatusOk, message=''}={}) {
    const o = Object.create(FeedHubApiRequestStatusProto);
    Object.assign(o, {status, message});
    return o;
}
FeedHubApiRequestStatus.chainProto();

// const isStatusOk = status => EFeedHubRequestStatus[status] === eFeedHubRequestStatusOk;
const FeedHubApiResponseProto = {
    get status()  { return this.requestStatus.status; },
    // get eStatus() { return EFeedHubRequestStatus[this.requestStatus.status]; },
    get message() { return this.requestStatus.message; },
    get isStatusOk() { return isStatusOk(this); },
    toString()  { return niceJSON(this); },
};
function FeedHubApiResponse({status=eFeedHubRequestStatusOk, message='', responseContent={}}={}) {
    const o = Object.create(FeedHubApiResponseProto);
    Object.assign(o, {
        requestStatus:FeedHubApiRequestStatus({status, message}),
        responseContent });
    return o;
}
(self.FeedHubApiResponse = FeedHubApiResponse).chainProto();
FeedHubApiResponse.getSyntax = (response='VARIABLE', responseDetail='') => html.pre(`
API calls to the FeedHub will attempt to complete with an http status code 200. 
A code 200 garanties that the request has been processed end to end.  Any other 
http status code indicates that there was an internal error, either in the 
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

${responseDetail}`);

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

//  From Backend code base:
//
// class api_request_status
// {
//     const OK                     = 'OK';
//     const MALFORMED_REQUEST      = 'MALFORMED_REQUEST';
//     const NO_ACCESS              = "NO_ACCESS";             // privileges, read-write permissions, the like.  200 NO_ACCESS
//     const BARF_403               = 'BARF_403';              // to do : AUTH_FAILED and remove, this is on redirect only, should not be part of primary api
//     const AUTH_FAILED            = "AUTH_FAILED";           // bad apiKey, deviceGuid, userGuid 200 AUTH_FAILED
//     const INVALID_COMMAND        = 'INVALID_COMMAND';
//     const INACTIVE_USER          = 'INACTIVE_USER';         // to do : make this NOT_REACHABLE and remove
//     const INTERNAL_ERROR         = 'INTERNAL_ERROR';
//     const INVALID_PARAMETERS     = 'INVALID_PARAMETERS';
//     const INVALID_SYNTAX         = 'INVALID_SYNTAX';
//     const INVALID_API_KEY        = 'INVALID_API_KEY';       // to do : make this AUTH_FAILED and remove
//     const INVALID_USER           = 'INVALID_USER';          // to do : make this AUTH_FAILED and remove
//     const INVALID_ROLE           = 'INVALID_ROLE';          // to do : make this NO_ACCESS and remove
//     const INVALID_PIN            = 'INVALID_PIN';           //  MobileApp specific
//     const NO_MATCH_FOUND         = "NO_MATCH_FOUND";        // to do : this is for internal use only (ie strictly on redirect), should not be here
//     const MULTIPLE_MATCHES_FOUND = "MULTIPLE_MATCHES_FOUND";// to do : this is for internal use only (ie strictly on redirect), should not be here
//     const MISMATCH               = "MISMATCH";              // to do : this is for internal use only (ie strictly on redirect), should not be here
//     const CONFLICT               = "CONFLICT";
//     const DUPLICATE              = "DUPLICATE";             // cruft : just get rid of this and of the classes using it
//     const UNKNOWN_NOTIFICATION   = 'UNKNOWN_NOTIFICATION';
//     const UNKNOWN_USER           = 'UNKNOWN_USER';          // to do : AUTH_FAILED and remove
//     const NOT_FOUND              = 'NOT_FOUND';             // to do : investigate ???
//     const NOT_IMPLEMENTED        = 'NOT_IMPLEMENTED';       // cruft : pre-git , get rid of this and classes that refer this
//     const APP_VERSION            = 'APP_VERSION';           //  MobileApp specific
//     const MAINTENANCE            = "MAINTENANCE";
//     const NOT_REACHABLE          = "NOT_REACHABLE";         // a patient or user has no active device
// }

const ERequestToBackendStatus = (f=>{f.prototype=new Enum(f); return new f({});})(function ERequestToBackendStatus({
    OK                  =(f=>f(f))(function OK(f)                   { return EItem(ERequestToBackendStatus, f); }),
    MALFORMED_REQUEST   =(f=>f(f))(function MALFORMED_REQUEST(f)    { return EItem(ERequestToBackendStatus, f); }),
    NO_ACCESS           =(f=>f(f))(function NO_ACCESS(f)            { return EItem(ERequestToBackendStatus, f); }),
    AUTH_FAILED         =(f=>f(f))(function AUTH_FAILED(f)          { return EItem(ERequestToBackendStatus, f); }),
    INVALID_COMMAND     =(f=>f(f))(function INVALID_COMMAND(f)      { return EItem(ERequestToBackendStatus, f); }),
    INTERNAL_ERROR      =(f=>f(f))(function INTERNAL_ERROR(f)       { return EItem(ERequestToBackendStatus, f); }),
    INVALID_PARAMETERS  =(f=>f(f))(function INVALID_PARAMETERS(f)   { return EItem(ERequestToBackendStatus, f); }),
    INVALID_SYNTAX      =(f=>f(f))(function INVALID_SYNTAX(f)       { return EItem(ERequestToBackendStatus, f); }),
    CONFLICT            =(f=>f(f))(function CONFLICT(f)             { return EItem(ERequestToBackendStatus, f); }),
    UNKNOWN_NOTIFICATION=(f=>f(f))(function UNKNOWN_NOTIFICATION(f) { return EItem(ERequestToBackendStatus, f); }),
    NOT_FOUND           =(f=>f(f))(function NOT_FOUND(f)            { return EItem(ERequestToBackendStatus, f); }),
    MAINTENANCE         =(f=>f(f))(function MAINTENANCE(f)          { return EItem(ERequestToBackendStatus, f); }),
    NOT_REACHABLE       =(f=>f(f))(function NOT_REACHABLE(f)        { return EItem(ERequestToBackendStatus, f); }),
}) {  Enum.call(Object.assign(this, {OK, MALFORMED_REQUEST, NO_ACCESS, AUTH_FAILED, INVALID_COMMAND,
INTERNAL_ERROR, INVALID_PARAMETERS, INVALID_SYNTAX, CONFLICT,
UNKNOWN_NOTIFICATION, NOT_FOUND, MAINTENANCE, NOT_REACHABLE}));});
self.ERequestToBackendStatus = ERequestToBackendStatus;
const {
    OK:                     eRequestToBackendStatusOk,
    MALFORMED_REQUEST:      eRequestToBackendStatusMalformedRequest,// JSON.parse error or missing parameter (trackingId)
    NO_ACCESS:              eRequestToBackendStatusNoAccess,        // privileges, read-write permissions, the like.  200 NO_ACCESS
    AUTH_FAILED:            eRequestToBackendStatusAuthFailed,      // bad apiKey, deviceGuid, userGuid 200 AUTH_FAILED
    INVALID_COMMAND:        eRequestToBackendStatusInvalidCommand,
    INTERNAL_ERROR:         eRequestToBackendStatusInternalError,
    INVALID_PARAMETERS:     eRequestToBackendStatusInvalidParameters,
    INVALID_SYNTAX:         eRequestToBackendStatusInvalidSyntax,
    CONFLICT:               eRequestToBackendStatusConflict,       // if a person ID data is in confict with that of another,
    UNKNOWN_NOTIFICATION:   eRequestToBackendStatusUnknownNotification,  //  received a notification from unblessed source.
    NOT_FOUND:              eRequestToBackendStatusNotFound,
    MAINTENANCE:            eRequestToBackendStatusMaintenance,
    NOT_REACHABLE:          eRequestToBackendStatusNotReachable,    // a patient or user has no active device
} = ERequestToBackendStatus;
[
    eRequestToBackendStatusMalformedRequest,
    eRequestToBackendStatusNoAccess,        // privileges, read-write permissions, the like.  200 NO_ACCESS
    eRequestToBackendStatusAuthFailed,      // bad apiKey, deviceGuid, userGuid 200 AUTH_FAILED
    eRequestToBackendStatusInvalidCommand,
    eRequestToBackendStatusInternalError,
    eRequestToBackendStatusInvalidParameters,
    eRequestToBackendStatusInvalidSyntax,
    eRequestToBackendStatusConflict,       // if a person ID data is in confict with that of another,
    eRequestToBackendStatusUnknownNotification,  //  received a notification from unblessed source.
    eRequestToBackendStatusNotFound,
    eRequestToBackendStatusMaintenance,
    eRequestToBackendStatusNotReachable
].join();                                           //  Kludge to avoid stupid 'unused' warnings.

const isBackendStatusOk =  self.isBackendStatusOk = ({status}) => ERequestToBackendStatus[status] === eRequestToBackendStatusOk;
const BackendApiRequestStatusProto = {
    // get eStatus()   { return ERequestToBackendStatus[this.status]; },
    // get isStatusOk(){ return isBackendStatusOk(this); },
};
function BackendApiRequestStatus({status, message, trackingId, route, apiVersion}) {
    const o = Object.create(BackendApiRequestStatusProto);
    Object.assign(o, {status, message, trackingId, route, apiVersion});
    return o;
}
BackendApiRequestStatus.chainProto();

const BackendApiResponseProto = {
    // get eStatus()   { return this.requestStatus.eStatus; },                     //  Unused for now.
    get isStatusOk(){ return isBackendStatusOk(this.requestStatus); },
    get message ()  { return this.requestStatus.message; },
    toString()  { return niceJSON(this); },
};
function BackendApiResponse ({requestStatus={}, responseContent}) {
    const o = Object.create(BackendApiResponseProto);
    Object.assign(o, {
        requestStatus:BackendApiRequestStatus(requestStatus),
        responseContent });
    return o;
}
(self.BackendApiResponse = BackendApiResponse).chainProto();

//endregion

logger.trace("Initialized .... ");
