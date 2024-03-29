/**
 *
 * © Copyright Portable EHR inc, 2020
 *
 */

'use strict';
const loggerCat = __filename.replace(/.*\/(.+?)([.]js)?$/, '$1');

const logger = require('log4js').getLogger(loggerCat);

const {niceJSON, Cycling}  = require('./utils.js');
const { ExtractFeedHubApiResponse, ExtractFeedApiResponse, } = require('./api');
const { Unpacking } = require('./nao');
const node = require(process.env.PEHR_NODE_CWD+(process.env.PEHR_NODE_LIB_NODE || '/lib/node'));
const selfServerPost = node.config.selfRestServer.web.Post;
const NodeApiResponse =  node.isFeedHub  ?  ExtractFeedHubApiResponse  :  ExtractFeedApiResponse;

const self = module.exports;

const sendOnePostToSelf = self.sendOnePostToSelf = async ({path, requestObject, apiUserName="sysops"},
                                              {verbose=undefined, ...timeOutInMs_maxAttempts_extraOptions}={}) => {
    const {body, statusCode2XX, msgHead} = await selfServerPost({path, params:requestObject}, {verbose,
            headers:await selfServerPost.authHeadersForApiUser(apiUserName), ...timeOutInMs_maxAttempts_extraOptions});
    try {
        const jsOb = JSON.parse(body);
        return NodeApiResponse(jsOb);
    }
    catch (e) {
        throw Unpacking(e, msgHead, `Error parsing JSON body in sendOnePostToSelf: with parameters : ${niceJSON(requestObject)}\n`,
            `HTTP statusCode [${statusCode2XX}] and unexpected ${!body ? 'empty ' : ''}json body.`, body);
    }
};

self.filterFromSrcBundle = ({pullName, path, feedAlias, fileName, resultsFilter, cycleInterval=0.25,
                                startDate= new Date('1979-01-01'), endDate=new Date(), chunkMaxItems=1000}) => {
    let offset=0;
    const fs  = require('fs');
    const pull = Object.defineProperties(new Cycling({cycleInterval,
        doOneAction: async function () {
            const {responseContent:{hasMore, results}} = await sendOnePostToSelf({path,
                requestObject: Object.assign(node.isFeedHub ? {dispensaryId:feedAlias} : {feedAlias}, {
                    command: "pullBundle",
                    trackingId: "5c40816c-d544-461c-8df8-d39237ffb807",
                    backendApiVersion: "1.1.039",
                    parameters: { startDate, endDate, offset, chunkMaxItems }
                }),
            });
            await fs.appendFileSync(fileName, niceJSON(results.filter(resultsFilter)).slice(1,-1)+',', 'utf8');
            if (hasMore) {
                offset += results.length
            }
            else {
                this.stop();
                logger.warn(`${pullName} done filtering, lastChunk size[${results.length}]/offset[${offset}]`);
            }
        }                                           }), {Name: {value:pullName}, actionName:{value:'pull'}});
    pull.start();
};

self.runFeedHubSelfServerUnitTest = async (dispensaryId, verbose=false) => {
    const pingReq = {
        dispensaryId,
        command: "ping",
        trackingId: "5c40816c-d544-461c-8df8-d39237ffb807",
        backendApiVersion: "1.1.039",
        parameters: {
        }};

    const restartReq = {
        dispensaryId,
        command: "restart",
        trackingId: "5c40816c-d544-461c-8df8-d39237ffb807",
        backendApiVersion: "1.1.039",
        parameters: {
        }};

    const req1 = {
        dispensaryId,
        command: "pullSingle",
        trackingId: "5c40816c-d544-461c-8df8-d39237ffb807",
        backendApiVersion: "1.1.039",
        parameters: {
            id: "1",
        }};

    const reqN = {
        dispensaryId,
        command: "pullBundle",
        trackingId: "5c40816c-d544-461c-8df8-d39237ffb807",
        backendApiVersion: "1.1.039",
        parameters: {
            offset: 0,
            maxItems: 16
        }};

    const reqNT = {
        dispensaryId,
        command: "pullBundle",
        trackingId: "5c40816c-d544-461c-8df8-d39237ffb807",
        backendApiVersion: "1.1.039",
        parameters: {
            startDate : new Date('1970-01-01'),
            endDate   : new Date(),
            offset: 0,
            maxItems: 16
        }};

    const selfPost = async (path, requestObject, verbose = false, timeOutInMs = 1000 * 300) => {
        logger.info(`runFeedHubSelfServerUnitTest : sendOnePostToSelf('${path}', dispensaryId [${requestObject.dispensaryId}], command: '${requestObject.command
            }', parameters: ${JSON.stringify(requestObject.parameters)}) responded :\n${
            await (async ({requestStatus:{message}, responseContent}) => `"${message}" : ${niceJSON(responseContent)}`)
                         (await sendOnePostToSelf({path, requestObject}, {verbose, timeOutInMs}))}`);
    };

    await selfPost('/dispensary', pingReq, verbose);
    await selfPost('/dispensary', restartReq, verbose);

    const feedReq = {
        path: `/dispensary/${['practitioner', 'appointment', 'patient', 'privateMessage/pull', 'feedSpecific/appoinType', 
                        'feedSpecific/resource', 'feedSpecific/availability', 'feedSpecific/availabilityChange'][0]}`,
        requestObject: [req1, reqN, reqNT][0]
    };

    await selfPost(feedReq.path, feedReq.requestObject, verbose);

};

logger.trace("Initialized ...");
