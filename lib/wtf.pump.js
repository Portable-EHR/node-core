/*
 * Copyright © Portable EHR inc, 2020
 */
'use strict';

const loggerCat = __filename.replace(/.*\/(.+?)([.]js)?$/, '$1');

const logger = require('log4js').getLogger(loggerCat);

const { groupBy, dateAdd, Cycling, dbMsg } = require('./utils.js');
const node = require(process.env.PEHR_NODE_CWD+(process.env.PEHR_NODE_LIB_NODE || '/lib/node'));

const self = module.exports;


const BackendWtfProto = {};
function BackendWtf({createdOn, occurredOn:occuredOn, feedAlias, source, wtf:message}) {
    const o = Object.create(BackendWtfProto);
    Object.assign(o,{createdOn, occuredOn, feedAlias, source, message});
    return o;
}
BackendWtf.chainProto();

class WTFpump extends Cycling {
    constructor(WtfRecord, nao) {
        /**
         *
         * @type {WtfConfig}
         */
        const wtfConfig = node.config.wtf;
        const { pushInterval:cycleInterval, push:enabled } = wtfConfig;
        super({cycleInterval, enabled});
        this.config = wtfConfig;
        this.WtfRecord = WtfRecord;
        const {pushWtfs, } = nao;//  arrow functions
        Object.assign(this, {pushWtfs, });
    }

    get verbose()           {
        // noinspection JSUnresolvedVariable
        return this.config.verbose; }
    get purgeAfterInDays()  {
        // noinspection JSUnresolvedVariable
        return this.config.purgeAfterInDays; }

    deleteOldRecords() {                                    //  Not async method, the cron job running this doesn't wait.
        const {verbose, purgeAfterInDays } = this;

        if (verbose) logger.debug('flushWTFs : invoked by cron');
        if (purgeAfterInDays > 0) {
            const then = dateAdd.day(-purgeAfterInDays);    //  now - wtf.purgeAfterInDays days
            if (verbose) logger.debug(`flushWTFs : will flush records older than ${then}`);

            //  this async method is run in a cron job that don't know how to await, so just spawn it with .then().
            require('./my-dao').dbDelete("DELETE from WTF WHERE created_on < ?", [then],
                                        results => results.affectedRows
            ).then(delCount => {
                if (delCount && verbose) {
                    logger.debug(`flushWTFs : did flush [${delCount}] records older than [${then}].`);
                }
            }).catch(e => {
                logger.error(`flushWTFs : flushing WTFs older than ${then}\n` + dbMsg(e));
            });
        }
        else if (verbose) logger.warn("flushWTFs : not configured for purging old WTFs, will skip.");
        return true;
    }

    start(inPausedState=false) {
        if (this.enabled)   logger.info(`[WTF]                        : push to backend enabled, every ${this.cycleInterval} s. `);
        else                logger.warn(`[WTF]                        : push to backend disabled`);
        super.start();
    }

    async doOneCycleAction() {
        const { verbose, purgeAfterInDays:daysKept } = this;

        const wtfRecs= await this.WtfRecord.wtfsWithCriteria(
            `WHERE tx_status='queued' ORDER BY feed_alias, created_on ASC limit 0,10`
        ).catch(e => {
            logger.error(`selecting 'queued' WTF records :\n` + dbMsg(e));
        });

        if (wtfRecs && wtfRecs.length > 0) {
            if (verbose) logger.info(`WTFpump : Will push ${wtfRecs.length} WTFs to backend.`);
            /**
             *
             * @param {WtfRecord} wtfRec
             */
            const persistAccepted =  wtfRec => {
                wtfRec.txStatus = 'accepted';
                wtfRec.update().catch(e => {                        //  span best effort, don't await.
                    logger.error(`updating WTF[${wtfRec.id}] record as [accepted] :\n` + dbMsg(e));
                })
            };
            try {
                for (let [feedAlias, groupedWtfIterator] of groupBy(wtfRecs, wtfRec => wtfRec.feedAlias)) {
                    const groupedWtfRecs = Array.from(groupedWtfIterator);
                    await this.pushWtfs(groupedWtfRecs.map(wtfRec =>                        // pushWtfs is an arrow fnc
                                                                    BackendWtf(wtfRec)),
                                        feedAlias, verbose);

                    const now = new Date();
                    for (let wtfRec of groupedWtfRecs) {
                        if (dateAdd.day(daysKept, wtfRec.createdOn) < now) {        //  time to flush this guy
                            wtfRec.delete().catch(e => {                            //  span best effort, don't await.
                                logger.error(`deleting wtf[${wtfRec.id}] record after sending to EHR :\n` + dbMsg(e));
                                persistAccepted(wtfRec);    //  an .update() attempt to fix a failed .delete() ? Good luck!
                            });
                        }
                        else persistAccepted(wtfRec);
                    }
                }
                return true;
            }
            catch (e) {       // if BackendError
                const logMsg = 'Error while sending WTFs to backend, MAJOR WTF :\n';

                if (e.isExpected) {
                    logger.error(logMsg + e.logMessage(this));

                    if (e.isTransportError || e.isBackendMaintenanceError) {
                        await this.postpone();
                    }
                }
                else {
                    logger.error(logMsg + e.stack);
                }
            }
        }
    }
}
self.WTFpump = WTFpump;

logger.trace("Initialized ...");
