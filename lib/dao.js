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
const loggerCat = __filename.replace(/.*\/(.+?)([.]js)?$/, '$1');

const logger   = require('log4js').getLogger(loggerCat);

const{ DeclareExpectedError, ErrorExtender, Enum:Enum_, EItem, }= require('./utils');

const self = module.exports;

const NoRow = function NoRow(message='', results) { return ErrorExtender(message, NoRow, {results}); };
DeclareExpectedError(self.NoRow = NoRow);


const EDbJsType = (f=>{f.prototype=new Enum_(f); return new f({});})(function EDbJsType({
    number =(f=>f(f))(function number(f) { return EItem(EDbJsType, f); }),
    boolean=(f=>f(f))(function boolean(f){ return EItem(EDbJsType, f); }),
    string =(f=>f(f))(function string(f) { return EItem(EDbJsType, f); }),
    binary =(f=>f(f))(function binary(f) { return EItem(EDbJsType, f); }),
    date   =(f=>f(f))(function date(f)   { return EItem(EDbJsType, f); }),
    Enum   =(f=>f(f))(function Enum(f)   { return EItem(EDbJsType, f); }),
    uuid   =(f=>f(f))(function uuid(f)   { return EItem(EDbJsType, f); }),
    sha    =(f=>f(f))(function sha(f)    { return EItem(EDbJsType, f); }),
}) {  Enum_.call(Object.assign(this, {number, boolean, string, binary, date, Enum, uuid, sha})); });
self.EDbJsType = EDbJsType;
const {
    number: eNumberDbJsType,
    boolean:eBooleanDbJsType,
    string: eStringDbJsType,
    binary: eBinaryDbJsType,
    date:   eDateDbJsType,
    Enum:   eEnumDbJsType,
    uuid:   eUuidDbJsType,
    sha:    eShaDbJsType,
} = EDbJsType;
[eNumberDbJsType, eBooleanDbJsType, eStringDbJsType, eBinaryDbJsType, eDateDbJsType,
 eEnumDbJsType, eUuidDbJsType, eShaDbJsType, ].join();              //  Kludge to prevent stupid 'unused' warnings.


logger.trace("Initialized ...");

