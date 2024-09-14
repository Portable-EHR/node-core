/*
 * Copyright © Portable EHR inc, 2019
 */


/**
 * Created by WebStorm.
 * User: yvesleborg
 * Date: 2019-03-02
 * Time: 11:14
 *
 */

'use strict';
const loggerCat = __filename.replace(/.*\/(.+?)([.]js)?$/, '$1');

const fs     = require('fs');
const logger = require('log4js').getLogger(loggerCat);
const sha256 = require('js-sha256').sha256;

const self = module.exports;

/**
 *
 * @param {object} prototype
 * @returns {Object & {prototype: Object}}
 */
Function.prototype.chainProto = function (prototype=Object.getPrototypeOf(this({}))) {
    return prototype.constructor = Object.assign(this,{prototype});         // "this" is This, the constructor
};
//  USAGE:
//
// const StuffProto = {};
// function Stuff({status=0, message=''}={}) {
//     const o = Object.create(StuffProto);
//     Object.assign(o, {status, message});
//     //  instance definitions
//     Object.defineProperty(o, 'bibi', {get(){return this.baba;}});
//     return o;
// }
// (self.Stuff = Stuff).chainProto(/*StuffProto*/); //  might need argument StuffProto if Stuff() argument can't be {}
// //  static definitions
// Object.assign(Stuff, {
//     get A() {return 33;}                     //  BEWARE !!! : getter "this" is not compatible with Object.assign.
// });

//  Object composition utility function, a.k.a incomplete-multiple-inheritance helper
//      The own props of alsoExtendedConstructor (and proto) are added to the caller's constructor (and proto) unless
//      they've been already overridden by either the caller or any other proto in the proto chain not shared by the
//      caller's (and alsoExtendedConstructor's protos). See USAGE below.
//
//  USE WITH EXTREME CARE !
//
//      Only fit for alsoExtendedConstructor which (self and prototype) properties DON'T CALL super() !
//
//      In case of conflict between multiple branches over a prop definition, the official JavaScript proto chain
//      always prevails. In all other cases of multiple definition conflict (.alsoExtends() called multiple times),
//      the props of the first alsoExtendedConstructor added props prevail.
//
Function.prototype.alsoExtends = function(alsoExtendedConstructor) {
    const extendingConstructor = this;

    const addNonOverriddenProp = (dominantPropsList, alsoExtendedProps, extendingOb) => {
        for (let extendedPropName of Object.keys(alsoExtendedProps)) {
            let foundDominant = false;
            for (let dominantProps of dominantPropsList) {  //  go through all the Props of the dominant proto chain.
                if (dominantProps[extendedPropName]) {  //  if extended prop is not overridden in dominant chain:
                    foundDominant = true;
                    break;
            }}
            if (!foundDominant) {
                Object.defineProperty(extendingOb, extendedPropName, alsoExtendedProps[extendedPropName]); // add it
            }
        }};

    const extendingProto = extendingConstructor.prototype;
    const alsoExtendedProto = alsoExtendedConstructor.prototype;

    //  The main proto chain of the extendingConstructor is dominant in precedence, up to the
    //      common proto ancestor of alsoExtendedProto in the extendingConstructor proto chain.
    //  First build the collection of dominant proto PropertyDescriptor objects in the proto chain up to common proto.
    const dominantProtoChainProps = [], dominantStaticChainProps = [];  //  For prototypes AND constructors (static)
    let upperProtoInChain = extendingProto;
    do {
        dominantProtoChainProps.push(Object.getOwnPropertyDescriptors(upperProtoInChain));
        dominantStaticChainProps.push(Object.getOwnPropertyDescriptors(upperProtoInChain.constructor));

        upperProtoInChain = Object.getPrototypeOf(upperProtoInChain);
    } while ( ! (alsoExtendedProto instanceof upperProtoInChain.constructor) );   //  until common proto ancestor is found (Object?)

    // const protoProps = Object.getOwnPropertyDescriptors(extendingProto);
    // const dominantProtoChainProps = [protoProps];
    const alsoExtendedProtoProps = Object.getOwnPropertyDescriptors(alsoExtendedProto);
    addNonOverriddenProp(dominantProtoChainProps, alsoExtendedProtoProps, extendingProto);

    // const staticExtendingProps = Object.getOwnPropertyDescriptors(extendingConstructor);
    // const dominantStaticChainProps = [staticExtendingProps];
    const alsoExtendedStaticProps = Object.getOwnPropertyDescriptors(alsoExtendedConstructor);
    addNonOverriddenProp(dominantStaticChainProps, alsoExtendedStaticProps, extendingConstructor);

    return extendingConstructor;
};
//  USAGE:
//
// class ABHJK {
//     a() { return -1; }
//     b() { return -2; }
//     h() { return 8; }
//     get j() { return -10; }
//     k() { return -11; }
//     static A() { return -1; }
//     static B() { return -2; }
//     static H() { return 8; }
//     static get J() { return -10; }
//     static K() { return -11; }
// }
// class ACDI extends ABHJK {
//     a() { return 1; }
//     c() { return -3; }
//     get d() { return 4; }
//     i() { return 9; }
//     static A() { return 1; }
//     static C() { return -3; }
//     static get D() { return 4; }
//     static I() { return 9; }
// }
// class BCEFI extends ABHJK {
//     b() { return 2; }
//     c() { return -13 }
//     e() { return -5; }               //  Note: ACDI .i() prevails because it's part of CEGJ proto chain.
//     get f() { return 6; }
//     i() { return -9; }
//     static B() { return 2; }
//     static C() { return -13; }
//     static E() { return -5; }
//     static get F() { return 6; }
//     static I() { return -9; }
// }
// class BKL extends ABHJK {
//     b() { return -22; }
//     k() { return 11 }
//     l() { return 12; }
//     static B() { return -22; }       //  Note: BCEFI .b() prevails because it was .alsoExtended() first.
//     static K() { return 11; }
//     static L() { return 12; }
// }
// class CEGJ extends ACDI {
//     c() { return 3; }
//     e() { return 5; }
//     g() { return 7; }
//     get j() { return 10; }
//     static C() { return 3 }
//     static E() { return 5; }
//     static G() { return 7; }
//     static J() { return 10; }       //  Note: Xfering props, it's possible to override a getter with a value/function.
//     log() { console.log(`a: [${this.a()}], b: [${this.b()}], c: [${this.c()}], d: [${this.d}], e: [${this.e()}], f: [${this.f}], g: [${this.g()}], h: [${this.h()}], i: [${this.i()}], j: [${this.j}], k: [${this.k()}], l: [${this.l()}]`)}
//     static Log() { console.log(`A: [${this.A()}], B: [${this.B()}], C: [${this.C()}], D: [${this.D}], E: [${this.E()}], F: [${this.F}], G: [${this.G()}], H: [${this.H()}], I: [${this.I()}], J: [${this.J()}], K: [${this.K()}], L: [${this.L()}]`)}
// }
// CEGJ.alsoExtends(BCEFI).alsoExtends(BKL);
// (new CEGJ()).log();
// CEGJ.Log();         //  a: [1], b: [2], c: [3], d: [4], e: [5], f: [6], g: [7], h: [8], i: [9], j: [10], k: [11], l: [12]
// console.log('fin'); //  A: [1], B: [2], C: [3], D: [4], E: [5], F: [6], G: [7], H: [8], I: [9], J: [10], K: [11], L: [12]

self.getGetterFunction = (o, propName) => {     //  follow object and prototype chain until we find the getter function
    let propDesc;
    do {
        propDesc = Object.getOwnPropertyDescriptor(o, propName);
        if (propDesc) {
            return propDesc.get;
        }
        o = Object.getPrototypeOf(o);
    } while (o.constructor !== Object);
};

//region itertools / generators

function* prototypesAlongTheProtoChain(o, untilClass=Object) {
    if (o.constructor.prototype === o) {
        yield o;
    }
    let proto = Object.getPrototypeOf(o);        //  get the [joinedProperty]() from all the prototypes
    while (proto.constructor !== untilClass) {
        yield proto;
        proto = Object.getPrototypeOf(proto);
    }
}
self.prototypesAlongTheProtoChain = prototypesAlongTheProtoChain;

function* collectNonOverriddenProtoFunctionsAlongTheProtoChain(o, untilClass=Object) {
    let propNamesSet = new Set(['constructor']);
    for (let proto of prototypesAlongTheProtoChain(o, untilClass)) {
        for (let propName of Object.getOwnPropertyNames(proto)) {
            if ( ! propNamesSet.has(propName)) {                //  Skip constructor.   And all overridden functions.
                const protoPropertyFnc = proto[propName];
                if  ('function' === typeof protoPropertyFnc) {
                    yield [protoPropertyFnc, propName, proto];
                }
            }
        }
    }
}
self.collectNonOverriddenProtoFunctionsAlongTheProtoChain = collectNonOverriddenProtoFunctionsAlongTheProtoChain;


//  generator:  Returns an iterator yielding an ob either a specific number of times, or ad lib if times is undefined.
self.repeat = function* (ob, times) {      //  thanks python !
    if (undefined === times) {
        while (true) {
            yield ob;
        }
    }
    else {
        for (let i=0; i < times; i++) {
            yield ob;
        }
    }
};

//  generator:  Returns an iterator returning elements from the first iterable until it is exhausted,
//              then proceeds to the next iterable, until all the iterables are exhausted.
//
//  e.g.    >>> const ints = [1, 2, 3], strs = Set(['a', 'b']);
//          >>> Array.from( chain(ints, strs) );
//          [1, 2, 3, 'a', 'b']

// const chain =
self.chain = function* (...iterables) {      //  thanks python !
    for (let iterable of iterables) {
        for (let item of iterable) {
            yield item;
        }
    }
};

//  generator:  Returns an iterator that aggregates elements from each of the iterables.
//              Stops when the shortest iterable is exhausted.
//
//  e.g.    >>> const ints = [1, 2, 3], strs = ['a', 'b'];
//          >>> Array.from( zip(ints, strs) );
//          [[1, 'a'], [2, 'b']]

/**
 *
 * @param iterables
 * @returns {Generator<*[], void, *>}
 */
self.zip = function* (...iterables) {      //  thanks python !
    const iterators = iterables.map( iterable =>
                                                  iterable[Symbol.iterator]() );
    while (iterators.length) {  //  just skip if there's no iterator
        // noinspection JSMismatchedCollectionQueryUpdate
        const result = [];
        for (let iterator of iterators) {
            const element = iterator.next();
            if (element.done) {
                return;
            }
            result.push(element.value);
        }
        yield result;
    }
};

//  Iterable which iterator returns consecutive keys and group iterators from the iterable first argument.
//  The keyFnc argument returns the key value, for each element of the iterable argument, used to group.
//      If undefined, it defaults to the identity function : x => x;
//  Because groupBy() generates a new group each time the key value changes, the first argument iterable
//      elements MUST be sorted by key value for it to behave as expected (contrarily to SQL GROUP BY).
//  Since it's a key and a temporary iterator that's yielded at each change of key, the yielded grouped
//      elements must be stored e.g. in an Array before the next group iterator is yielded, or be lost.
//
//  e.g.
//      const src = [{key:'a', val: 4}, {key:'a', val: 13}, {key:'b', val: 7}, {key:'c', val: 1}, {key:'c', value: 2}];
//
//      for (let [k, groupIterator] of groupBy(src, o=>o.key)) {
//          console.log(` key : ${k}, group :`, Array.from(groupIterator));
//
//  >>  key : a, group : [ {key: 'a', val: 4}, {key: 'a', val: 13} ]
//  >>  key : b, group : [ {key: 'b', val: 7} ]
//  >>  key : c, group : [ {key: 'a', val: 1}, {key: 'a', value: 2} ]
//
const groupByProto = {
    [Symbol.iterator] : function () {
        return this;
    },
    next() {
        while (this.targetKey === this.currentKey) {
            const {done, value} = this.iterator.next();
            if (done) {
                return {done, value};
            }
            this.currentValue = value;
            // noinspection JSUnresolvedFunction
            this.currentKey = this.keyFnc(value);
        }
        this.targetKey = this.currentKey;
        return {done:false, value:[this.currentKey, this._groupIterator(this.targetKey)]}
    },
    *_groupIterator(targetKey) {
        while (this.currentKey === targetKey) {
            yield this.currentValue;
            const {done, value} = this.iterator.next();
            if (done) {
                return;     //  equivalent of .next() returning {done: true, value: undefined}
            }
            this.currentValue = value;
            // noinspection JSUnresolvedFunction
            this.currentKey = this.keyFnc(value);
        }
    },
};      //  thanks again python!
function groupBy(iterable, keyFnc=k=>k) {
    const currentValue = {};
    return {
        __proto__ : groupByProto,
        keyFnc,
        iterator: iterable[Symbol.iterator](),
        targetKey:currentValue,
        currentKey:currentValue,
        currentValue,
    };
}
(self.groupBy = groupBy).chainProto(groupByProto);
// for (let [k, groupIterator] of groupBy([{key:'a', val: 4}, {key:'a', val: 13}, {key:'b', val: 7}, {key:'c', val: 1}, {key:'c', value: 2}], o=>o.key)) console.log(` key : ${k}, group :`, Array.from(groupIterator));
// console.log('fin');

//endregion

//region time

self.now = () => new Date();

// From https://stackoverflow.com/questions/17415579/how-to-iso-8601-format-a-date-with-timezone-offset-in-javascript
// Date.prototype.toLocalIsoString = function() {
//     let tzo = -this.getTimezoneOffset(),        // Must recalculate each time due to daylight savings (and mobility ?)
//         dif = tzo >= 0 ? '+' : '-',
//         pad = function(num) {
//             let norm = Math.floor(Math.abs(num));
//             return (norm < 10 ? '0' : '') + norm;
//         };
//     return this.getFullYear() +
//         '-' + pad(this.getMonth() + 1) +
//         '-' + pad(this.getDate()) +
//         'T' + pad(this.getHours()) +
//         ':' + pad(this.getMinutes()) +
//         ':' + pad(this.getSeconds()) +
//         dif + pad(tzo / 60) +
//         ':' + pad(tzo % 60);
// };

const minIntervalInMs = (intervalInMs, minInMs=10) => (0 <= intervalInMs  &&  intervalInMs < minInMs)  ?  minInMs  :  intervalInMs;
self.minIntervalInMs = minIntervalInMs;

const isInvalidDate = date => ( !(date instanceof Date)  ||  isNaN(date.getTime()));
self.isInvalidDate = isInvalidDate;

//  return a new Date from the argument if the Date is valid, else return the non-Date argument itself.
const toDate = v => (date => isNaN(date.getTime())  ?  v  :  date)( new Date(v) );
self.toDate = toDate;

//  If argument is a string, return the Date from it if it is valid, else return argument (including already a Date).
const strToDate = v => ('string' !== typeof v)  ?  v  :  toDate(v);
self.strToDate = strToDate;

//  If argument is a Date, return it directly; if a valid Date string, return the Date from it; else return undefined.
//  NOTE :  onlyDate() doesn't consider a Unix 32b integer timestamps as Date, only Date and valid js date strings.
const onlyDate = v => (vDate => (vDate instanceof Date)  ?  vDate  :  undefined)( strToDate(v) );
self.onlyDate = onlyDate;

self.dateAdd = Object.freeze({      //  Write if flat so that IDE can follow. It can't when .reduce() is used.
    milli:  (quantity, origDate=undefined) => { const newDate = origDate ? new Date(origDate) : new Date();
            newDate.setTime(newDate.getTime() + quantity);                                          return newDate; },

    second: (quantity, origDate=undefined) => { const newDate = origDate ? new Date(origDate) : new Date();
            newDate.setTime(newDate.getTime() + quantity * 1000);                                   return newDate; },

    minute: (quantity, origDate=undefined) => { const newDate = origDate ? new Date(origDate) : new Date();
            newDate.setTime(newDate.getTime() + quantity * 60000);                                  return newDate; },

    hour:   (quantity, origDate=undefined) => { const newDate = origDate ? new Date(origDate) : new Date();
            newDate.setTime(newDate.getTime() + quantity * 3600000);                                return newDate; },

    day:    (quantity, origDate=undefined) => { const newDate = origDate ? new Date(origDate) : new Date();
            newDate.setDate(newDate.getDate() + quantity);                                          return newDate; },

    week:   (quantity, origDate=undefined) => { const newDate = origDate ? new Date(origDate) : new Date();
            newDate.setDate(newDate.getDate() + 7 * quantity);                                      return newDate; },

    month:  (quantity, origDate=undefined) => { const newDate = origDate ? new Date(origDate) : new Date();
            newDate.setMonth(newDate.getMonth() + quantity);                                 return newDate; },

    quarter:(quantity, origDate=undefined) => { const newDate = origDate ? new Date(origDate) : new Date();
            newDate.setMonth(newDate.getMonth() + 3 * quantity);                             return newDate; },

    year:   (quantity, origDate=undefined) => { const newDate = origDate ? new Date(origDate) : new Date();
            newDate.setFullYear(newDate.getFullYear() + quantity);                             return newDate; },
});

//endregion

//region string, JSON, html, B64, sha

self.repr = v => typeof v === 'function'                 ?  v.name              :
                 typeof v ===  'object'  &&  v !== null  ?  v.constructor.name  : JSON.stringify(v);

self.emptyField = field => (undefined === field  ||  null === field  ||  // Objects, boolean, numbers are always non-empty
                                 ((typeof field === "string"  ||  field instanceof String)  &&  '' === field.trim()));

self.capitalizeName = name => name.charAt(0).toUpperCase() + name.slice(1);
self.decapitalizeName = name => name.charAt(0).toLowerCase() + name.slice(1);

// Ligatures such as 'ﬁ' are decomposed by .normalize('NFKD') but not the following glyphs, considered official letters.
const expendedLettersMapOb = {
    ['ø'] : 'oe',
    ['œ'] : 'oe',
    ['æ'] : 'ae',
    ['ß'] : 'ss',
    ['đ'] : 'dj',
    ['ð'] : 'dh',
    ['þ'] : 'dh',
};
const normalizeString = self.normalizeString = s => {
    s = s.toLowerCase();
    let expendedS = '';
    for (let letter of s) {
        expendedS += ((xLetter=letter) =>           //  undefined defaults to letter (if not in expendedLettersMapOb)
                                          xLetter
                     )(expendedLettersMapOb[letter]);
    }
    s = expendedS.normalize('NFKD').replace(/[^a-z]/g, '');
    return s;
};
// const s =          'bÉbéĐßﬁẞçüŔÆñœýþŠšĐđŽžČčĆćÀÁÂÃÄÅÆÇÈÉÊËÌÍÎÏÑÒÓÔÕÖØÙÚÛÜÝÞßàáâãäåæçèéêëếìíîïðñòóôõöøùúûýþÿŔŕ';
// // bebedjssfisscuraenoeydhssdjdjzzccccaaaaaaaeceeeeiiiinooooooeuuuuydhssaaaaaaaeceeeeeiiiidhnooooooeuuuydhyrr
// const normS = normalizeString(s);
// console.log(s+'\n'+normS);
// console.log('fin');

self.normalizeName = (lastName, firstName, middleName) =>
    [ lastName, firstName, middleName ? middleName : ''].map( w =>
                         /*      undefined or null : '' */          normalizeString(w)
                                                            ).join('.');
// console.log(self.normalizeName('Bébế', 'ẞœþòñý', ['Æçðïđå', null, undefined][ 0 ]));
// console.log('fin');

self.normalizePhoneNumber = phoneNumber =>
                                            ('string' !== typeof phoneNumber)   ?   phoneNumber
                                                                                :   phoneNumber.replace(/[^0-9#]/g, '');
// console.log(self.normalizePhoneNumber(['(635) 753-1073 #234', null, undefined][ 0 ]));
// console.log('fin');

/**
 *
 * @param {number} number
 * @return {string}
 * @private
 */
self.hex = (number) => number.toString(16);

const niceJSON =
 self.niceJSON = (ob)  =>
                            JSON.stringify(ob, null, 4);
self.tryDeJSON = v =>
                        'string' === typeof v  ?  (()=>{try{return JSON.parse(v);}catch{return v;}})()  :  v;
self.jsonOfJsOb = v =>
                        'object' === typeof v  &&  null !== v  ?  JSON.stringify(v)  :  v;


// const commentsLitOb =
 self.commentsLitOb = ob => {
        const { ...allEnumerables } = ob;
        for (let key of Object.keys(allEnumerables)) {
            if (! key.startsWith('comment')) {
                delete allEnumerables[key];
            }
        }
        return allEnumerables;
    };
const sansCommentLitOb =
 self.sansCommentLitOb = ob => {
     const { ...allEnumerables } = ob;
     for (let key of Object.keys(allEnumerables)) {
         if (key.startsWith('comment')) {
             delete allEnumerables[key];
         }
     }
     return allEnumerables;
 };
// const sansCommentJSON =
 self.sansCommentJSON = ob  =>
                                niceJSON(sansCommentLitOb(ob));

self.html = {
    pre : text => `<pre>${text}</pre>`,
    h1  : text => `<h1>${text}</h1>`,
    h2  : text => `<h2>${text}</h2>`,
    h3  : text => `<h3>${text}</h3>`,
    h4  : text => `<h4>${text}</h4>`,
    bold: text => `<strong>${text}</strong>`,
    small:text => `<small>${text}</small>`,
};


self.getSha = (ob) => sha256(JSON.stringify(ob));

/**
 *
 * @param {Buffer} buffer
 * @returns {string}
 */
self.toUrlB64 = buffer => buffer.toString('base64').replace(/\+/g, '-'
                                ).replace(/\//g, '_') .replace(/=/g, '');
/**
 *
 * @param {string} urlB64String
 * @returns {Buffer}
 */
const fromUrlB64 = self.fromUrlB64 = urlB64String => Buffer.from(urlB64String.replace(/-/g, '+').replace(
    /_/g, '/') + ['','==='/* broken urlB64*/, '==', '='][urlB64String.length%4],'base64');

/**
 *
 * @param {string} urlB64String
 * @returns {string} utf8
 */
const fromUrlB64ToString = self.fromUrlB64ToString = urlB64String => fromUrlB64(urlB64String).toString();     //  utf8

//endregion

//region Jwt

self.showJwt = jwToken => jwToken.split('.').map((sub, i)=> i<2 ? niceJSON(JSON.parse(fromUrlB64ToString(sub))) : sub).join('.');

const jwtBody = self.jwtBody = jwToken => JSON.parse(fromUrlB64ToString(jwToken.split('.')[1]));

self.jwtExpiry = jwToken => new Date(jwtBody(jwToken).exp * 1000);      //  from seconds to ms since Unix Epoch.

const JwtProto = {
    get expiry() { return new Date(this.body.exp*1000); },// jwt.body.exp is seconds since 1970-01-01 00:00:00 UTC
    toString() { return `${niceJSON(this.header)}.${niceJSON(this.body)}.${this.signature}${
                        this.body.exp ? `,  expiring ${this.expiry}.` : ''}`; },
    willBeExpiredIn({seconds}) { return (exp => undefined===exp ? false : exp - (new Date()).getTime()/1000 < seconds
                                        )(this.body.exp) },     //  .getTime() is millisec since 1970-01-01 00:00:00 UTC
};
const Jwt = function Jwt(jwToken) {
    const [header, body, signature] = jwToken.split('.');

    const o = Object.create(JwtProto);
    Object.assign(o, { header: JSON.parse(fromUrlB64ToString(header)),
                              body: JSON.parse(fromUrlB64ToString(body)),
                              signature });
    Object.defineProperty(o, 'jwToken', {value:jwToken});   //  non-[configurable, enumerable, writable]
    return o;
    // noinspection UnreachableCodeJS
    this.jwToken = jwToken;                                             //  Fooling IntelliSense ;-)
};
(self.Jwt = Jwt).chainProto(JwtProto);

//endregion

//region File helpers

//  Replace all heading and trailing any-spaces and / with ''. If the result is non-empty, prepend with '/'.
//  Note that the *? in the middle group () makes the * non-greedy.
self.cleanUrlPath = path => (p => p ? '/'+p : p)(path.replace(/^[\s/]*(.*?)[\s/]*$/,'$1'));

self.makeDirIfNeeded = (path, logger) => {
    if (path  &&  ! fs.existsSync(path)) {
        const pathSegments = path.split('\/'),
              maxI = pathSegments.length + 1;

        //  for .. of, in javascript, stupidly close() the iterator on "break", so we can't use a generator. :-(

        //  For path "/mnt/media/mypath",   getsubPath(i) with "i" going from 1 to maxT returns subPaths :
        //   -  ""
        //   -  "/mnt/media"
        //   -  "/mnt/media/mypath"
        //  For path "also/my/path",        getsubPath(i) with "i" going from 1 to maxT returns subPaths :
        //   -  "also"
        //   -  "also/my"
        //   -  "also/my/path"
        const getSubPath =  i => pathSegments.slice(0, i).join('\/');

        const addSubPath = subPath => {
            fs.mkdirSync(subPath);
            if (logger) logger.info(`${logger === console ? '[INFO] - ' : ''}Added directory ${subPath}`);
        };

        let handleSubPath = /* skipSubPath = */ subPath => {        //  Note the "let" rather than "const"

            //  At first, skip any already existing subPath (plus subPath "" if path starts with a "/");
            if (subPath  &&  ! fs.existsSync(subPath)) {
                handleSubPath = addSubPath;                         //  then, switch from skipping to adding subPath.
                handleSubPath(subPath);
            }
            // else if (logger) logger.info('skipped subPath : ', subPath);
        };

        for (let i = 1; i < maxI; i++) {
            handleSubPath(getSubPath(i));
        }
    }
};

self.buildFromFile = (logger, configFullFileName, classToBuild, otherParamsOfClassToBuild=[], isEncrypted=false) => {

    if (!fs.existsSync(configFullFileName))
        return logger.bailOut(`Could not find configuration file [${configFullFileName}] to build [${classToBuild.name}].`);

    let jsOb;
    if (isEncrypted) {                                    //  directory prefix extension
        const [, directory, prefix ] = configFullFileName.match(/^(.*\/)?(.*?)([.][^.]*)?$/);
        try {
            jsOb = require('@tsmx/secure-config')({
                hmacValidation: (process.launchParams || {}).environment !== 'local',   //  false only in local environment
                directory,          //  .launchParams property attached in LaunchParams constructor, below.
                prefix,
            });
        }
        catch (e) {
            return logger.bailOut(`Caught error while reading|decrypting [${configFullFileName}] to build [${classToBuild.name}].`, e); }
    }
    else {
        let json;
        try {
            json = fs.readFileSync(configFullFileName, 'utf8'); }
        catch (e) {
            return logger.bailOut(`Caught error while reading [${configFullFileName}] to build [${classToBuild.name}].`, e); }

        if ( ! json) {
            return logger.bailOut(`Empty JSON read from [${configFullFileName}]. Could not build [${classToBuild.name}].`); }

        try {
            jsOb = JSON.parse(json); }
        catch (e) {
            return logger.bailOut(`Caught error while parsing JSON from [${configFullFileName}] to build [${classToBuild.name}].`, e); }
    }

    try {
        return new classToBuild(jsOb, ...otherParamsOfClassToBuild); }
    catch (e) {
        return logger.bailOut(`Caught error while constructing [${classToBuild.name}] with JSON from [${configFullFileName}].`, e); }
};

//endregion


//region Error

self.dbMsg = e => `${e.sql ? (e.message+'\n'+ e.sql) : e.stack}`;

self.bailOut = (logger, msg, e) => {
    if (e) logger.fatal(`${msg}\n${e.bailOutMsg ? e.bailOutMsg+'\n' : ''}`, e, '\n');
    else   logger.fatal(msg, '\n');

    setTimeout(() => {
        logger.fatal("bailing out.");
        process.exit(1);
    }, 2000);
};

const expectedErrorProtoDefaultProps = self.expectedErrorProtoDefaultProps = (createdConstructor)=>({
            constructor:  {value: createdConstructor, configurable:true, enumerable:true},
            isExpected:   {value: true},
            shortMessage: {writable:true, value: function() { return `${createdConstructor.name}: ${this.message}`; }},
            logMessage:   {writable:true, value: function(/*{verbose}*/) { return this.verboseMsg; }},
            toString:     {value: function() { return `${createdConstructor.name}: ${this.message}`; }},

});

const DeclareExpectedError = self.DeclareExpectedError = (constructor, expectedErrorAssignedProto={}) => {
    constructor.BuildErrorProtoProps = expectedErrorProtoDefaultProps;
    constructor.ErrorAssignedProto = expectedErrorAssignedProto;
};


//  This allows to have a WrappedError wrapping error of many different protos and still operate almost* as expected.
//  * The exception being that an Error based on WrappedError CAN'T be used as the right-hand side of the JavaScript
//    "instanceof" operator. The isInstanceOfError() function (defined below) MUST be used instead.
//
//  For the record, it started at an attempt of having a multi proto ErrorWrapper based on "instanceof".
//  It doesn't work in the end because of a sorry limitation of the js object model, where Function .prototype
//  is a NON-CONFIGURABLE writable value property. It can be set to undefined, so configurable:false is not to
//  prevent delete, but to prevent getter like the one we'd require here. A very sorry situation... :-(
//
//  We ended up having to write our own isInstanceOfError(), based on Error constructors' name (see below) because even
//  a chainProto on EACH INSTANCE of wrapped error would end up with only the last wrapped Error proto be part of the
//  prototype chain. Concurrent errors wrapping error of different prototype might then cause the "instanceof" operator
//  to wrongly return false instead of true.
const errorProtos = (constructor, error) => (({prototype:errorProto, name:errorName}, _errorProtos  ) =>
    _errorProtos[errorName]
        ? _errorProtos[errorName]
        : _errorProtos[errorName] = ((    createdConstructor    ) => {
                const proto = Object.create(errorProto, constructor.BuildErrorProtoProps(createdConstructor));
                //      The next line throws, because Function .prototype is a NON-CONFIGURABLE writable value property.
                //      It would have really solved the case for good.
                // return Object.defineProperty(createdConstructor, 'prototype', {configurable:true, get(){ return proto;}}).prototype;
                //      So instead we have to write our own isInstanceOfError(errorConstructor, e)
                //      In the single proto case, assigning constructor.prototype makes "instanceof" work too.
                return createdConstructor.prototype = constructor.prototype = Object.assign(proto, constructor.ErrorAssignedProto);
            }                       )(Object.create(constructor))   //  This one is extended from constructor, so we can set different prototypes.
                                           )(error ? error.constructor : Error,    (({_errorProtos}) => _errorProtos
    ? _errorProtos
    : Object.defineProperty(constructor                 //  this.prototype is the createdConstructor returned proto.
      // Object.defineProperty(constructor, 'prototype', {configurable:true, get(){ return this.prototype;}})
                                       , '_errorProtos', {value:{}}    )._errorProtos)
                                                                                    ( constructor  )                );

self.isInstanceOfError = (errorConstructor, e)=>{   //  follow prototype chain until the errorConstructor.name is found.
    const {name} = errorConstructor;
    do {
        if (name === e.constructor.name) return true;
        else if (e.constructor === Object) return false;
        e = Object.getPrototypeOf(e);
    } while (true);
};


/**
 *
 * @param {string} message
 * @param {function} ErrorSelfConstructor
 * @param {Object} extra extra properties to be assigned to the error.
 * @param {function(): string} msgHead : extra message that might be prepended to message in verboseMsg.
 * @returns {Error}
 * @constructor
 */
self.ErrorExtender = (message, ErrorSelfConstructor= ()=>ErrorExtender(message, ErrorSelfConstructor, extra, msgHead), extra={},msgHead=()=>'')=>{
    const name = ErrorSelfConstructor.name;
    const prototype = errorProtos(ErrorSelfConstructor);

    // This might seem complicated for nothing , but it *exactly* replicates the behavior of Error() if
    // its .message, .stack, and .prototype.name properties are changed or deleted.

    const { stack } = new Error();
    //  It used to be error.stack.replace(/[^\n]*/,'') until we start wrapping errors with multiline message
    //  m is the multiline flag: "When using the multiline flag, ^ also matches immediately after a line break character."
    //  The following search for the first instance of '\n    at X' and return the stack trace, with its preceding '\n'.
    const errStackPerSe = stack.slice(stack.search(/^\s+at\s\w/m) -1);
    let stackStr = undefined;

    const e = Object.create(prototype);     //  defineProperty individually so that IDE follows.

    //Object.defineProperty(e, 'name', {value:name });
    Object.defineProperty(e, 'message', {configurable:true, set(msg) { message = msg; }, get(){return message} });
    Object.defineProperty(e, 'stack',   {configurable:true, set(stack) { stackStr = stack;},
                                get() { // noinspection JSPotentiallyInvalidUsageOfThis
                                    return stackStr ? stackStr :`${name}: ${this.verboseMsg}${errStackPerSe}`}});
    Object.defineProperty(e, 'verboseMsg', {configurable:true, get() { return `${msgHead()}${message}`; }});
    Object.defineProperty(e, 'msgHead', {configurable:true, get() { return msgHead; }});
    Object.assign(e, extra);
    return e;

    // noinspection UnreachableCodeJS, JSUnusedAssignment
    this.verboseMsg = e.verboseMsg;                                 //  Fooling IntelliSense ;-)
    // noinspection JSUnusedAssignment
    this.msgHead = e.msgHead;                                       //  Fooling IntelliSense ;-)
};
//  USAGE:
//      const AuthError = function AuthError(message) { return ErrorExtender(message, AuthError); };
//      self.AuthError = AuthError;
//
//  then:
//      self.AuthError('An error message'); creates a new object extending Error, _WITHOUT_ using operator "new".

//  WARNING
//
//  Any Error made of ErrorWrapper MUST NOT be used as a right-hand expression of the JavaScript "instanceof" operator.
//  The lib/utils function isInstanceOfError() MUST be used instead.
//  Wrapping errors of potentially multiple different prototypes can cause "instanceof" to wrongly return false.
/**
 *
 * @param {Error} error
 * @param {function(Error): Error} ErrorSelfConstructor
 * @param {function(): string} msgHead : message that should be prepended to that of the wrapped error.
 * @param {string} context
 * @param {object} extra
 * @returns {Error}
 * @constructor
 */
self.ErrorWrapper =function ErrorWrapper(error, ErrorSelfConstructor=(error, msgHead=()=>'', context)=>ErrorWrapper(
                                error, ErrorSelfConstructor, msgHead, context, extra), msgHead=()=>'', context='', extra={}) {
    if ( !(error instanceof Error)) throw Error(`ErrorWrapper [${error}] error argument must be an instance of some Error`);
    const name = ErrorSelfConstructor.name;
    const prototype = errorProtos(ErrorSelfConstructor, error);

    // This might seem complicated for nothing , but it replicates the behavior of the encapsulated error if
    // their .message, .stack, and .prototype.name properties are changed or deleted.

    const { message, verboseMsg, stack, constructor:{name:wrappedErrorName}, ..._rest} = error;

    //  It used to be error.stack.replace(/[^\n]*/,'') until we start wrapping errors with multiline message
    //  m is the multiline flag: "When using the multiline flag, ^ also matches immediately after a line break character."
    //  The following search for the first instance of '\n    at X' and return the stack trace, with its preceding '\n'.
    const errStackPerSe = stack.slice(stack.search(/^\s+at\s\w/m) -1);
    let stackStr = undefined;

    const e = Object.create(prototype);     //  defineProperty individually so that IDE follows.
    const extraStr = ('object' !== typeof extra)  ?  ''  : (xStr => xStr ? `\n${xStr}` : '')(
                    Object.entries(extra).map(([key, value])=>`${key}: ${JSON.stringify(value)}`).join('\n'));

    Object.defineProperty(e, 'message', {configurable:true, set(msg) { error.message = msg; },
        get() { return error.message===message? `${context}${wrappedErrorName}: ${message}${extraStr}` :error.message; }});
    Object.defineProperty(e, 'stack', {configurable:true, set(stack) { stackStr = stack;},
        get() { // noinspection JSPotentiallyInvalidUsageOfThis
            return stackStr ? stackStr : `${name}: ${this.verboseMsg}${errStackPerSe}`; }});
    Object.defineProperty(e, 'verboseMsg', {configurable:true,
        get() { return `${msgHead()}${context}${wrappedErrorName}: ${verboseMsg?verboseMsg:message}${extraStr}`; }});
    Object.defineProperty(e, 'msgHead', {configurable:true,
        get() { return ()=>(error.msgHead ? error.msgHead() : '')+msgHead(); }});
    Object.defineProperty(e, 'extraStr', {configurable:true,get() { return extraStr; }});
    Object.defineProperty(e, 'wrappedError', {configurable:true,get() { return error; }});

    Object.assign(e, _rest, extra);
    return e;

    // noinspection UnreachableCodeJS,JSUnusedAssignment
    this.verboseMsg = e.verboseMsg;                                 //  Fooling IntelliSense ;-)
    // noinspection JSUnusedAssignment
    this.msgHead = e.msgHead;                                       //  Fooling IntelliSense ;-)
};
//  USAGE:
//      const IpSocketError = function IpSocketError(error, msgHead=()=>'') { return ErrorWrapper(error, IpSocketError, msgHead); };
//      self.IpSocketError = IpSocketError;
//
//  then:
//      catch (e) {
//          self.IpSocketError(e, msgHead); creates a new object extending e.constructor, (_WITHOUT_ using operator "new").
//      }

//endregion


//region Enum generator, conversion

/**
 *
 * @returns {function(undefined|number): number}
 * @constructor
 */
const EnumIndexer = () => {
    let index = 0;
    return  i => {
        index = i === undefined ? index : i;
        return index++;
    };
};
//  USAGE
//
//  This enumIndexer allows to have the same behavior as in a C/C++ enum with index auto incrementing as enumItems
//  are added to the enum, but also forcing value where it pleases.
//  This enumIndexer therefore starts with index 0 and receive the index (i) parameter from EItemSelfConstructor.
//  If it's undefined, it returns index++, if it's defined, it sets index to that new value and return index++.


/**
 *
 * @param {function(Array<EItem>):Enum} EnumConstructor
 * @param {function(function, int): EItem} EItemSelfConstructor
 * @param {int} index : must be left undefined to be assigned the auto-incremented value
 * @returns {EItem}
 * @constructor
 */
self.EItem = function EItem(EnumConstructor, EItemSelfConstructor=(EItemSelfConstructor, index=undefined)=>EItem(EnumConstructor, EItemSelfConstructor, index), index=undefined) {
    /*
        BIG HACK ALERT

        At the early time ETime is called, when the default arguments of theEnum-being-defined are being defined, by
        executing an EItemSelfConstructor function for each eItem of theEnum-being-defined object-destructuring-assigment
        argument list, the body of the EItemSelfConstructor function hasn't been executed by the compiler yet. So the
        function doesn't exist per se yet, and therefore the EItemSelfConstructor has no .prototype property assigned to
        it yet. We will thus attach the created-as-needed _indexer, directly on the EnumConstructor, for the short time
        the eItems will be created.

        The indexer allows to have the same behavior as in a C/C++ enum with index auto incrementing as enumItems
        are added to the enum, but also forcing value where it pleases.
        This indexer therefore starts with index 0 and receive the index (i) parameter from EItemSelfConstructor.
        If it's undefined, it returns index++, if it's defined, it sets index to that new value and return index++.
     */
    try {
        index = EnumConstructor._indexer(index);
    }                   //  We exploit the fact that ._indexer is undefined on the first EItem call of a new Enum
    catch (e) {         //  definition, to define ._indexer on the fly as a new instance of self.EnumIndexer().
        if  (e instanceof TypeError  &&  e.message.endsWith(`is not a function`)) {
            EnumConstructor._indexer = EnumIndexer();
            index = EnumConstructor._indexer(index);
        }
        else {
            throw e;
        }
    }

    const name = EItemSelfConstructor.name;
    const EName =  EnumConstructor.name;
    const fullName = EName + '.' + name;
    const fullField = fullName + '=' + index;

    //  Use {} directly rather than Object.create(EnumField.prototype), it's OK with just one (frozen) instance of EItem.
    const itemPrototype = EItemSelfConstructor.prototype = {
        constructor:EItemSelfConstructor,
        //  Doc says: The hint argument can be one of "number", "string", and "default".  We default to fullName.
        [Symbol.toPrimitive](hint) { return hint==="number" ? index : hint==="string" ? name : fullName; },
        [Symbol.toStringTag]() { return fullName; },
        toString() { return name; },
        valueOf() { return index; },
        toJSON() { return name; },
    };
    Object.freeze(EItemSelfConstructor);                         //  HA!

    const item = Object.create(itemPrototype);     //  defineProperty individually so that IDE follows.  All frozen
    Object.defineProperty(item, 'index',    {value: index });
    Object.defineProperty(item, 'name' ,    {value: name});
    Object.defineProperty(item, 'fullField',{value: fullField});
    Object.defineProperty(item, 'fullName', {value: fullName});

    //  Attach the EnumConstructor instance .Enum, provided just-in-time by the calling EnumConstructor factory
    Object.defineProperty(item, 'Enum',    {get() {return EnumConstructor.Enum}}); //  late binding
    Object.defineProperty(item, EName,  {get() {return EnumConstructor.Enum}}); //  and re late-bind it under its own EName

    // noinspection JSValidateTypes
    return Object.freeze(item);    //  This freezes the prototype too!
};

/**
 *
 * @param {undefined|function(object):Enum} EnumConstructor
 * @constructor
 */
self.Enum = function Enum(EnumConstructor=undefined) {

    //  The Enum function is called twice par Enum definition:
    //
    //  - The first time, with "new" as a constructor, the resulting instance is assigned to theEnum-being-defined
    //      .prototype. The EnumConstructor argument is then that of theEnum-being-defined, (therefore not undefined)
    //      and is assigned to this prototype constructor property. That's all. "this" won't have any enumerable own
    //      properties set yet.
    //
    //  - The second time, with Enum.call(this) from within theEnum-being-defined constructor. Then, the EnumConstructor
    //      argument will be undefined and "this" will already have been Object.assign-ed the eItems as enumerable own
    //      properties. So it's then treated as the equivalent of a call to super() constructor and the rest of the Enum
    //      properties and inner struct are set up.
    //
    //  Note that though in the second call we use it as a super() constructor, it CAN'T be made as a formal Enum class,
    //  which theEnum-being-defined would "extends". If it was made a class, super() would have to be called first for
    //  "this" to be available for theEnum-being-defined to perform Object.assign(this, {itemA, itemB... }, but that
    //  Object.assign MUST be performed *before* we Enum.call this constructor, so we use that extra flexibility that
    //  functions have over classes, which allows to perform the Enum.call(this) *after* the Object.assign.
    //
    //  And we MUST have Object.assign performed in clear at first level of definition for Webstorm to work its magic.

    if (undefined !== EnumConstructor)
        this.constructor = EnumConstructor;
    else {
        const eConstructor = this.constructor;
        delete eConstructor._indexer;                   //  Not needed anymore.
        Object.defineProperty(this, `_name`, {value: eConstructor.name} ); //  Attach the Enum._name non-enumerable.
        Object.defineProperty(eConstructor, `Enum`, {value: this} ); // second instance attempt would throw TypeError.

        //  Fill this._item with the enumItems in index order. It will be used to iterate the whole Enum
        const eItems = Object.defineProperty(this, '_items',   {value:[]})._items;

        // Sort theEnum-being-defined own enumerable properties (the eItems that were just Object.assign-ed to "this")
        // according to the value of their index, that's how they'll be setup for eItems iteration in this._items.
        for (let [i, item] of Object.values(this).sort((a,b)=>a.index-b.index ).entries()) {
            eItems[i] = this[item.name];
        }                                   //  take the enumItem by name on the enum and assign it to this._items array

        for (let item of eItems) {   //  finally reassign the instances of enumItems to theEnum, as a non-enumerable index property
            Object.defineProperty(this, `${item.index}`, {value: item} );    //  the item.index is the one from enumIndexer()
        }
        return Object.freeze(this);
    }
};
self.Enum.prototype = {
    constructor: self.Enum,
    get length() { return this._items.length; },
    [Symbol.iterator]() { return this._items[Symbol.iterator](); },
    toString() {return `[Enum ${this.constructor.name}]`;},
    join(separator=', ') { let s=''; for (let v of this._items) s+= v.name+separator; return s.slice(0,-separator.length);}
};
//  USAGE:
//
//  const enm = self.EName = (f=>{f.prototype=new self.Enum(f); return new f({});})(function EName({
//     a=(f=>f(f))(function a(f)      { return self.EItem(EName, f); }),
//     b=(f=>f(f))(function b(f)      { return self.EItem(EName, f); }),
//     c=(f=>f(f))(function c(f, i=5) { return self.EItem(EName, f, i); }),
//     d=(f=>f(f))(function d(f)      { return self.EItem(EName, f); }),
//  }) {  self.Enum.call(Object.assign(this, {a,b,c,d})); });
//
//  console.log(enm);    //  "EName { a: [Number: 0], b: [Number: 1], c: [Number: 5], d: [Number: 6] }"
//  console.log(`enm : ${enm}`);                 //  [Enum EName]
//  console.log(enm.a);                          //  [Number: 0]
//  console.log(enm.a+'');                       //  EName.a         //  get the EnumField by .fullName
//  console.log(`${enm.a}`);                     //  a
//  console.log(`${''+enm['0'].index}`);         //  0               //  get the EnumField by .index
//  console.log(`${''+enm[0]['name']}`);         //  a               //  get the EnumField by .name
//  console.log(`${''+enm['a'].fullField}`);     //  EName.a=0       //  get the EnumField by .fullField
//  console.log({b:"B", a:"A"}[enm.b]);          //  B
//  console.log(["A", "B"][enm.a]);          //  undefined   //  Array index coerce with toString(), like Object index
//  console.log(["A", "B"][+enm.a]);         //  A           //  +field is coerced to number. :-))
//  console.log(+enm.d);                     //  6           //  +field or any math coerces to number. :-))
//  console.log(`Object.values(enm): ${Object.values(enm)}`);//  Object.values(enm): a,b,c,d
//  console.log(Object.entries(enm));        // [ [ 'a', [Number: 0] ], [ 'b', [Number: 1] ], ...]   // Only the named properties are enumerable
//  for (let field of enm)                     //  for : 0:a
//  console.log(`for : ${+field}:${field}`);   //  for : 1:b ...
//  console.log(`enm._name:`, enm._name);      //  enm._name: EName
//  console.log(`enm.c.Enum: `, enm.c.Enum);   //  enm.c.Enum:  EName { a: [Number: 0], b: [Number: 1], c: [Number: 5], d: [Number: 6] }
//  console.log(`enm.c.EName:`, enm.c.EName);  //  enm.c.EName: EName { a: [Number: 0], b: [Number: 1], c: [Number: 5], d: [Number: 6] }
//  console.log(`enm.join('|'):`, enm.join('|'));
//  console.log('fin');

//  If argument is a string, return the Enum EItem from it (undefined when none found), else return undefined.
self.strToEnum = (Enm, v) => ("string" === typeof v)  &&  ! Number.isInteger(Number(v)) ?  Enm[v]  :   undefined;

//  If argument is an integer, return the Enum EItem from it (undefined when none found), else return undefined.
self.intToEnum = (Enm, v) => Number.isInteger(v)  ?  Enm[v]  :   undefined;

//endregion

const { ErrorExtender, Enum, EItem, getGetterFunction } = self;

function ExpectedError(msg){ return ErrorExtender(msg, ExpectedError); }
DeclareExpectedError(self.ExpectedError = ExpectedError);

class LaunchParams {
    constructor({e:environment, a:application, i:instance, p:proc, n:netFlavor, f:feedFlavor, r:rootPath, c:configFileName}) {
        Object.assign(this, { environment, application, instance, process:proc, netFlavor, feedFlavor, rootPath, configFileName });
        process.launchParams = this;
    }

    ensureLogPath() { self.makeDirIfNeeded(this.logPath, console);  }

    /**
     *
     * @param {function} msgLoggingFnc  ex: msg=>{console.info(msg);}
     */
    log(msgLoggingFnc=msg=>{console.info(msg);}) {
        for (let msg of [   `PARAMS : Starting with (e)nvironment     [${this.environment}]`,
                            `PARAMS : Starting with (a)pplication     [${this.application}]`,
                            `PARAMS : Starting with (i)nstance        [${this.instance}]`,
                            `PARAMS : Starting with (p)rocess         [${this.process}]`,
                            `PARAMS : Starting with (n)et flavor      [${this.netFlavor}]`,
                            `PARAMS : Starting with (f)eed flavor     [${this.feedFlavor}]`,
                            `PARAMS : Starting with (r)oot path       [${this.rootPath}]`,
                            `PARAMS : Starting with (c)onfig filename [${this.configFileName}]`, ])
            msgLoggingFnc(msg);
    }

    logLoading(msgLoggingFnc) {
        for (let msg of[`Loading from path [${this.processResourcesPath}]`,
                        `Loading with      [${this.configFileName}]`        ])
            msgLoggingFnc(msg);
    }

    get instancePath() { return `${this.rootPath}/${this.environment}/${this.instance}`; }
    get processPath() { return `${this.instancePath}/${this.application}.${this.process}`; }
    get logPath()   { return `${this.processPath}/log`; }
    get instanceResourcesPath() { return `${this.instancePath}/resources`; }
    get processResourcesPath() { return `${this.processPath}/resources`; }
    get configFQN() { return `${this.processResourcesPath}/${this.configFileName}`; }

    get log4jsConfig() {                            //  ALL < TRACE < DEBUG < INFO < WARN < ERROR < FATAL < MARK < OFF
        const logBaseFQN = `${this.logPath}/${this.environment}`;
        return {
            "appenders" : {
                "out"       : {
                    "type" : "stdout",
                    "level": "trace"
                },
                "config" : {
                    "type"                : "fileSync",
                    "filename"            : `${logBaseFQN}.config.log`,
                    "level"               : "warn"
                },
                "info-file" : {
                    "type"                : "dateFile",
                    "filename"            : `${logBaseFQN}.log`,
                    "pattern"             : "-yyyy-MM-dd",
                    "alwaysIncludePattern": false,
                    "level"               : "info"
                },
                "error-file": {
                    "type"                : "dateFile",
                    "filename"            : `${logBaseFQN}.error.log`,
                    "pattern"             : "-yyyy-MM-dd",
                    "alwaysIncludePattern": false,
                    "level"               : "error"
                },
                "just-info" : {
                    "type"    : "logLevelFilter",
                    "appender": "info-file",
                    "level"   : "info"
                },
                "just-error": {
                    "type"    : "logLevelFilter",
                    "appender": "error-file",
                    "level"   : "error"
                }
            },
            "categories": {
                "default": {
                    "appenders": [
                        "out",
                        "just-info",
                        "just-error"
                    ],
                    "level"    : "trace"
                },
                "CONFIG" : {
                    "appenders": ["config", "out", "just-info"], "level": "trace"
                }
            }
        };
    }
}
self.LaunchParams = LaunchParams;

// region Validation

//  From https://fightingforalostcause.net/content/misc/2006/compare-email-regex.php     This doesn't support unicode
//  We change the top most regex from the link above to support orphan dots on the left side before the @.
//  The   7E]+   after the   (?:\.   becomes a   7E]*
//  Was: ^(?!(?:(?:\x22?\x5C[\x00-\x7E]\x22?)|(?:\x22?[^\x5C\x22]\x22?)){255,})(?!(?:(?:\x22?\x5C[\x00-\x7E]\x22?)|(?:\x22?[^\x5C\x22]\x22?)){65,}@)(?:(?:[\x21\x23-\x27\x2A\x2B\x2D\x2F-\x39\x3D\x3F\x5E-\x7E]+)|(?:\x22(?:[\x01-\x08\x0B\x0C\x0E-\x1F\x21\x23-\x5B\x5D-\x7F]|(?:\x5C[\x00-\x7F]))*\x22))(?:\.(?:(?:[\x21\x23-\x27\x2A\x2B\x2D\x2F-\x39\x3D\x3F\x5E-\x7E]*)|(?:\x22(?:[\x01-\x08\x0B\x0C\x0E-\x1F\x21\x23-\x5B\x5D-\x7F]|(?:\x5C[\x00-\x7F]))*\x22)))*@(?:(?:(?!.*[^.]{64,})(?:(?:(?:xn--)?[a-z0-9]+(?:-[a-z0-9]+)*\.){1,126}){1,}(?:(?:[a-z][a-z0-9]*)|(?:(?:xn--)[a-z0-9]+))(?:-[a-z0-9]+)*)|(?:\[(?:(?:IPv6:(?:(?:[a-f0-9]{1,4}(?::[a-f0-9]{1,4}){7})|(?:(?!(?:.*[a-f0-9][:\]]){7,})(?:[a-f0-9]{1,4}(?::[a-f0-9]{1,4}){0,5})?::(?:[a-f0-9]{1,4}(?::[a-f0-9]{1,4}){0,5})?)))|(?:(?:IPv6:(?:(?:[a-f0-9]{1,4}(?::[a-f0-9]{1,4}){5}:)|(?:(?!(?:.*[a-f0-9]:){5,})(?:[a-f0-9]{1,4}(?::[a-f0-9]{1,4}){0,3})?::(?:[a-f0-9]{1,4}(?::[a-f0-9]{1,4}){0,3}:)?)))?(?:(?:25[0-5])|(?:2[0-4][0-9])|(?:1[0-9]{2})|(?:[1-9]?[0-9]))(?:\.(?:(?:25[0-5])|(?:2[0-4][0-9])|(?:1[0-9]{2})|(?:[1-9]?[0-9]))){3}))\]))$
//  Then we decided to just check that there's anything at the left of @, and that the mail server name format is OK.
const validateEmailServerNameFormat =  email => /^[^@]+@(?:(?:(?!.*[^.]{64,})(?:(?:(?:xn--)?[a-z0-9]+(?:-[a-z0-9]+)*\.){1,126}){1,}(?:(?:[a-z][a-z0-9]*)|(?:(?:xn--)[a-z0-9]+))(?:-[a-z0-9]+)*)|(?:\[(?:(?:IPv6:(?:(?:[a-f0-9]{1,4}(?::[a-f0-9]{1,4}){7})|(?:(?!(?:.*[a-f0-9][:\]]){7,})(?:[a-f0-9]{1,4}(?::[a-f0-9]{1,4}){0,5})?::(?:[a-f0-9]{1,4}(?::[a-f0-9]{1,4}){0,5})?)))|(?:(?:IPv6:(?:(?:[a-f0-9]{1,4}(?::[a-f0-9]{1,4}){5}:)|(?:(?!(?:.*[a-f0-9]:){5,})(?:[a-f0-9]{1,4}(?::[a-f0-9]{1,4}){0,3})?::(?:[a-f0-9]{1,4}(?::[a-f0-9]{1,4}){0,3}:)?)))?(?:(?:25[0-5])|(?:2[0-4][0-9])|(?:1[0-9]{2})|(?:[1-9]?[0-9]))(?:\.(?:(?:25[0-5])|(?:2[0-4][0-9])|(?:1[0-9]{2})|(?:[1-9]?[0-9]))){3}))\]))$/i.test(email);
// self.validateEmail = require('email-validator').validate;
if ([false, true][ 0 ]) {
    ( email =>  console.debug(`validateEmail( ${email} ) => ${validateEmailServerNameFormat(email)}`))('r.d.@hotmail.com');
    console.debug('end');
}    //  Test with email cases

//  Provided means neither null nor undefined.

const isFunction = v => 'function' === typeof v;

const isProvided = v =>
                        (undefined !== v  &&  null !== v);                              //  if null or undefined: false
const isNotProvided = v =>
                        (undefined === v  ||  null === v);                              //  if null or undefined: true

const isInvalidProvidedDate = date  =>                                                  //  if null or undefined: false
                                        isProvided(date)  &&  isInvalidDate(date);

const isInvalidNumber = v =>
                            ("number" !== typeof v);
const isInvalidProvidedNumber =  v  =>                                                  //  if null or undefined: false
                                        isProvided(v)  &&  isInvalidNumber(v);

const isInvalidInteger = v =>
                                ! Number.isInteger(v);
const isInvalidProvidedInteger =  v  =>                                                 //  if null or undefined: false
                                        isProvided(v)  &&  isInvalidInteger(v);

const isInvalidString = v =>
                             ("string" !== typeof v);
const isInvalidProvidedString =  v  =>                                                  //  if null or undefined: false
                                        isProvided(v)  &&  isInvalidString(v);
const isInvalidOrEmptyString = v =>                                                     //  if null or undefined: false
                                    isInvalidString(v)  ||  ! v;
const isInvalidOrEmptyProvidedString =  v  =>                                           //  if null or undefined: false
                                        isProvided(v)  &&  isInvalidOrEmptyString(v);

const isInvalidDurationString = v =>
                                    isInvalidString(v)  ||  ! v.match(/^P(?!$)((\d+Y)|(\d+\.\d+Y$))?((\d+M)|(\d+\.\d+M$))?((\d+W)|(\d+\.\d+W$))?((\d+D)|(\d+\.\d+D$))?(T(?=\d)((\d+H)|(\d+\.\d+H$))?((\d+M)|(\d+\.\d+M$))?(\d+(\.\d+)?S)?)??$/i);
const isInvalidProvidedDurationString = v =>                                            //  if null or undefined: false
                                             isProvided(v) && isInvalidDurationString(v);

const isInvalidEmail = v =>                                                         //  if '', null or undefined:  true
                            isInvalidString(v)  ||  ! validateEmailServerNameFormat(v);

const isInvalidProvidedEmail = v =>                                                 //  if '', null or undefined: false
        isProvided(v) && (isInvalidString(v) || (v && !validateEmailServerNameFormat(v)));

const isInvalidUuid = v =>
                        ("string" !== typeof v  ||  ! v.match(/^[A-Fa-f0-9]{8}-([A-Fa-f0-9]{4}-){3}[A-Fa-f0-9]{12}$/));
const isInvalidProvidedUuid = v =>                                                      //  if null or undefined: false
                                        isProvided(v)  &&  isInvalidUuid(v);

const isInvalidBool = v =>
                            ("boolean" !== typeof v);
const isInvalidProvidedBool =  v  =>                                                    //  if null or undefined: false
                                        isProvided(v)  &&  isInvalidBool(v);

const isInvalidEnum = (Enm, eV) =>
                                    ("object" !== typeof eV)  ||  eV !== Enm[eV];
const isInvalidProvidedEnum =  (enm, eV, v)  =>                                         //  if null or undefined: false
                                        isProvided(v)  &&  isInvalidEnum(enm, eV);

const isInvalidObject = v =>
                            ("object" !== typeof v  ||  Array.isArray(v)  ||  null === v);
const isInvalidArray = v =>
                            ! Array.isArray(v);

Object.assign(self, { isFunction, isProvided, isNotProvided, isInvalidProvidedDate,
    validateEmailServerNameFormat, isInvalidEmail, isInvalidProvidedEmail, isInvalidUuid, isInvalidProvidedUuid,
    isInvalidNumber, isInvalidProvidedNumber, isInvalidInteger, isInvalidProvidedInteger,
    isInvalidString, isInvalidProvidedString, isInvalidOrEmptyString, isInvalidOrEmptyProvidedString,
    isInvalidDurationString, isInvalidProvidedDurationString,
    isInvalidBool, isInvalidProvidedBool, isInvalidEnum, isInvalidProvidedEnum, isInvalidObject, isInvalidArray, });

const RamqNamUpTo10th = (lastName, firstName, genderAsMF, birthdate) => {
    //                                   remove all accents                 only keep alphabetical
    const strict = s => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().replace(/[^-0-9A-Z]/g, '');
    const intToStrPad00 =  n => n.toString().padStart(2, '0');
    try {
        lastName = strict(lastName);
        if ( ! lastName) return undefined;      //  At least one char in string

        const St_X = lastName.match(/(ST|STE|SAINT|SAINTE)-+([A-Z])/);      //  e.g. ['SAINT-M', 'SAINT', 'M']  if match
                                                                            //       null                   if not match
        lastName = St_X  ?  ('ST' + St_X[2])
                         :  lastName.replace(/-/g, '').slice(0, 3).padEnd(3, 'X');

        firstName = strict(firstName).replace(/-/g, '').slice(0, 1);
        if ( ! firstName) return undefined;     //  At least one char in string

        const yy = intToStrPad00(birthdate.getFullYear() % 100);
        const month = birthdate.getMonth() + {'M':1, 'F':51}[genderAsMF];                    // 0-based Month
        if (isNaN(month)) { // noinspection ExceptionCaughtLocallyJS
            throw Error(`genderAsMF must be M or F.`);
        }
        const mm = intToStrPad00(month);
        const dd = intToStrPad00(birthdate.getDate());
        return `${lastName}${firstName}${yy}${mm}${dd}`;    //  With last two digits missing.
    }
    catch (e) {
        return undefined;
    }
};
self.RamqNamUpTo10th = RamqNamUpTo10th;
// console.log(RamqNamUpTo10th('Saint-Jacques', 'Sylvie', 'F', new Date()));
// console.log(RamqNamUpTo10th('Ste-Marie', 'Alain', 'M', new Date()));
// console.log(RamqNamUpTo10th('Le-Borgne', 'Yves', 'M', new Date()));
// console.log('fin');

const validateRamqNam = (nam, lastName, firstName, genderAsMF, birthDate, areAllDemographicsValid) => {
    if (isInvalidString(nam)) {
        return `[${nam}] string`;
    }
    else if (12 !== nam.length) {
        return `[${nam}] string has length [${nam.length}], must be 12`;
    }
    else if ( ! Number.isInteger(Number(nam.slice(10)))) {
        return `[${nam}] invalid, RAMQ NAM must end with two digits`;
    }
    else if (areAllDemographicsValid) {
        const ramqNamUpTo10th = RamqNamUpTo10th(lastName, firstName, genderAsMF, birthDate);
        if (nam.slice(0,10) !== ramqNamUpTo10th) {
            return `[${nam}] inconsistent with demographics for RAMQ NAM, should start with [${ramqNamUpTo10th}]`;
        }
        return '';      //     <=== This means a Valid RAMQ NAM !
    }
    return `[${nam}]: some invalid {firstName, lastName, gender or birthday} prevents RAMQ NAM complete validation`;
};
self.validateRamqNam = validateRamqNam;

//endregion

//region Cycling

const ECyclingStatus = (f=>{f.prototype=new Enum(f); return new f({});})(function ECyclingStatus({
   stopped=(f=>f(f))(function stopped(f)       { return EItem(ECyclingStatus, f); }),
   paused =(f=>f(f))(function paused( f)       { return EItem(ECyclingStatus, f); }),
   running=(f=>f(f))(function running(f, i=3)  { return EItem(ECyclingStatus, f, i); }),
}) { Enum.call(Object.assign(this, {stopped, paused, running})); });
self.ECyclingStatus = ECyclingStatus;
const {
    stopped :eStopped,
    paused  :ePaused,
    running :eRunning
} = ECyclingStatus;

const ECyclingTransitState = (f=>{f.prototype=new Enum(f); return new f({});})(function ECyclingTransitState({
    notInTransit       =(f=>f(f))(function notInTransit(f)       { return EItem(ECyclingTransitState, f); }),
    startPostponed     =(f=>f(f))(function startPostponed(f)     { return EItem(ECyclingTransitState, f); }),
    restartingPostError=(f=>f(f))(function restartingPostError(f){ return EItem(ECyclingTransitState, f); }),
}) { Enum.call(Object.assign(this, {notInTransit, startPostponed, restartingPostError})); });
const {
    notInTransit        :eNotInTransit,
    startPostponed      :eStartPostponed,
    restartingPostError :eRestartingPostError
} = ECyclingTransitState;

function TimerInterrupted(message='') { return ErrorExtender(message, TimerInterrupted); }
DeclareExpectedError(TimerInterrupted);

class Cycling {

    constructor({doOneAction=()=>true, log=logger, cycleInterval=Infinity, enabled=true, postponedActionDelayGenerator =
            // call with postponedActionDelayGenerator null or false for no postponed restart
            (delayInMs=-312.5, minDelayInMs=625, maxDelayInMs=40000) =>  //  delayInMs growing from 0 to 39375 ms.
                                                (() => (delayInMs = (delayInMs * 2 + minDelayInMs) % maxDelayInMs))}) {

        //  By extending Cycling, .doOneCycleAction() can simply be overridden and doOneAction constructor argument ignored.
        Object.defineProperty(this, '_doOneAction', {value: doOneAction});
        Object.defineProperty(this, '_log',    {value: log});

        //  NOTE 1: if cycleInterval is undefined or null in config, it defaults to Infinity.
        //  When it ends up being set to Infinity, the pump performs the action ONCE on start and that's it.
        //  To cycle the pump, it will have to be re-started again and again.

        //  NOTE 2: if cycleInterval is negative, it disables the cycling, exactly like enabled being false.
        //  This provides a quick way to control Cycling with a single parameter.
        this.setCycleIntervalInSecond(cycleInterval);
        this.setEnabled(enabled);

        //  When performing .start() and stop(), .running and .stopped status are always double-checked with
        //  ._runningPromise, which is the real live thing.                 //  non-writable by accident.
        Object.defineProperty(this, 'status', {configurable:true, enumerable:true, value:eStopped});
        //  _runningPromise is null when the cycling is stopped, holds the active cycling Promise otherwise
        Object.defineProperty(this, '_runningPromise', {writable: true, value: null});
        //  _eTransitState is used by this.start() to both postpone a start after an ongoing stop has completed,
        //                                          and to restart after an error in doOneCycleAction().
        Object.defineProperty(this, '_eTransitState', {writable: true, value: eNotInTransit});

        Object.defineProperty(this, '_postponedActionDelayGenerator', {writable: true, value: postponedActionDelayGenerator});
        Object.defineProperty(this, '_postponedActionDelay', {writable: true, value: null});

        //  Cache these 3 properties of the critical path at the instance level for top efficiency
        Object.defineProperty(this, 'cycleTimeout', {configurable: true, get: getGetterFunction(this, 'cycleTimeout')});
        Object.defineProperty(this, 'isActionAllowed', {configurable: true, get: getGetterFunction(this, 'isActionAllowed')});
        //  SMALL HACK : find the function wherever it is on the prototype chain and assign it to this.
        Object.defineProperty(this, 'doOneCycleAction', {configurable: true, value: this.doOneCycleAction});

    }

    //  Non-enumerable non-writable properties expected to potentially change live.
    setEnabled(enabled) {
        Object.defineProperty(this, '_enabled', {configurable: true, value: enabled});
    };
    setCycleIntervalInMs(intervalInMs) {
        Object.defineProperty(this, '_cycleIntervalInMs', {configurable: true, value: minIntervalInMs(intervalInMs)});
    };
    setCycleIntervalInSecond(intervalInSecond) { this.setCycleIntervalInMs(intervalInSecond*1000); }

    get enabled() { return this._enabled; }
    get runnable() { return this._enabled  &&  this._cycleIntervalInMs >= 0; }
    get cycleInterval() { return this._cycleIntervalInMs/1000; }

    //region Cycling Overridable "interface"

    _updateStatus(eStatus) {                                //  non-writable                //  Candidate for Overriding
        Object.defineProperty(this, 'status', {configurable:true, enumerable:true, value:eStatus});
    }

    //  Cache these 3 properties of the critical path at the instance level for top efficiency

    get cycleTimeout() { return this._cycleIntervalInMs; }                                  //  Candidate for Overriding
    //  get cycleTimeout() { return this.hasMore ? this._bundleChunkIntervalInMs: this._cycleIntervalInMs; }
    get isActionAllowed() { return true; }                                                  //  Candidate for Overriding
    //  get isActionAllowed() { return this._owner.allowsAction(this._eKind)); }

    //  By extending Cycling, .doOneCycleAction() can simply be overridden and doOneAction constructor argument ignored.
    /**
     *
     * @returns {Promise<boolean>}
     */
    async doOneCycleAction() {                                                              //  Candidate for Overriding
        return await this._doOneAction();
    }   //  Can be overridden, for instance to provide a cycle of cycles.

    //region Reporting

    get log()   { return this._log; }                                                       //  Candidate for Overriding

    get _debug()  { return false; }                                                         //  Candidate for Overriding
    get mute()    { return false; }                                                         //  Candidate for Overriding
    get verbose() { return false; }                                                         //  Candidate for Overriding

    get Name() { return this.constructor.name; }                                            //  Candidate for Overriding
    get infoTag() { return this.Name; }                                                     //  Candidate for Overriding
    get errorTag() { return this.Name; }                                                    //  Candidate for Overriding
    get actionName() { return 'push'; }                                                     //  Candidate for Overriding


    reportCommandFeedback(msg) { if ( ! this.mute) this.log.info( this.infoTag+' '+msg); }  //  Candidate for Overriding
    reportTraceMessage(msg)    { if (this.verbose) this.log.trace(this.infoTag+' '+msg); }  //  Candidate for Overriding
    reportDebugMessage(msg)    { if (this._debug)  this.log.debug(this.infoTag+' '+msg); }  //  Candidate for Overriding
    reportError(msg) { this.log.error(this.errorTag+' '+msg); }                             //  Candidate for Overriding


    handleCyclingActionError(e) {                                                           //  Candidate for Overriding
        // When _runCycle Promise rejects, both cycleTimer and this._interruptTimer are already cleaned up.
        this.reportError(`.doOneCycleAction() handling Error : ${e.stack}`); }

    reportRestartingAfterError() {                                                          //  Candidate for Overriding
        this.reportDebugMessage(`restarting after error.`); }
    reportPostponedRestartingAfterError() {                                                 //  Candidate for Overriding
        this.reportDebugMessage(`postponed-restarting after stop completed.`); }

    reportStartedNotRunningError() {                                                        //  Candidate for Overriding
        this.reportError(`Start Error: ECyclingStatus:[${this.status}] but no ._runningPromise !`);    }
    reportPostponedStartInterruptedUnexpectedly(e) {                                        //  Candidate for Overriding
        this.reportError(`: unexpected error postponing start:\n${e.message}`); }

    reportSkippingAction() {                                                                //  Candidate for Overriding
        this.reportTraceMessage(`${this.status}: ${this.actionName} skipped.`); }
    reportCycleInterruption() {                                                             //  Candidate for Overriding
        this.reportTraceMessage(`interrupting ${this.actionName} cycle by interrupting its timer.`); }


    reportStarting() {                                                                      //  Candidate for Overriding
        this.reportCommandFeedback(`started ${this.actionName}ing at [${this._cycleIntervalInMs}] ms interval.`); }
    reportStartingOnce() {                                                                  //  Candidate for Overriding
        this.reportCommandFeedback(`started ${this.actionName}ing once (${this.actionName} interval is Infinity).`); }
    reportNotStarting() {                                                                   //  Candidate for Overriding
        this.reportCommandFeedback(`already ${this.actionName}ing, start command ignored.`); }
    reportResumingRatherThanStart() {                                                       //  Candidate for Overriding
        this.reportCommandFeedback(`already ${this.actionName}ing but paused, performing resume command rather than start.`); }
    reportPostponingStart() {                                                               //  Candidate for Overriding
        this.reportCommandFeedback(`${this.actionName} start command postponed after stop completion.`); }
    reportPostponedStartDelay(delayInMs) {                                                  //  Candidate for Overriding
        this.reportCommandFeedback(`post Error restart postponed [${delayInMs}] ms.`); }


    reportStopping() {                                                                      //  Candidate for Overriding
        this.reportCommandFeedback(`stopped ${this.actionName}ing.`); }
    reportNotStopping() {                                                                   //  Candidate for Overriding
        this.reportCommandFeedback(`already stopped ${this.actionName}ing, stop command ignored.`); }
    reportCancellingPostponedStart() {                                                      //  Candidate for Overriding
        this.reportCommandFeedback(`${this.actionName} stop : cancelling start command postponed after stop completion.`); }


    reportResuming() {                                                                      //  Candidate for Overriding
        this.reportCommandFeedback(`resuming ${this.actionName}.`); }
    reportNotResuming() {                                                                   //  Candidate for Overriding
        this.reportCommandFeedback(`not paused ${this.actionName}ing, resume command ignored.`); }


    reportPausing() {                                                                       //  Candidate for Overriding
        this.reportCommandFeedback(`pausing ${this.actionName}.`); }
    reportNotPausing() {                                                                    //  Candidate for Overriding
        this.reportCommandFeedback(`not ${this.actionName}ing, pause command ignored.`); }

    //endregion

    //endregion

    //region Cycling core methods

    async _runCycleOnlyOnce() {
        this._updateStatus(eRunning);
        await this.doOneCycleAction();
        this._updateStatus(eStopped);
    }

    async _runCycle(inPausedState=false) {
        this._updateStatus(inPausedState ? ePaused : eRunning);

        while (true) {

            if (eRunning === this.status) {      //  if .status === paused:  skip doOneAction()
                if (this.isActionAllowed) {
                    //  Both cycleTimer and this._interruptTimer are undefined at this point.
                    //  If await this._doOneAction() throws an Error toward this._runCycle().catch(), in start(),
                    //  cycleTimer and this._interruptTimer won't have to be cleaned up.
                    if (await this.doOneCycleAction()) {
                        this._postponedActionDelay = null; //  reset the _postponedActionDelay: not in a loop of doOneCycleAction errors.
                    }
                }
            }
            else this.reportSkippingAction();

            if (eStopped === this.status) {      //  status can have changed async while ._doOneAction()
                break;
            }

            if (await this._interruptiblePostponedAction(this.cycleTimeout,()=>false,e=>{
                                            //  if e is indeed the one reject-ed() by .stop() ._interruptCycle(), then:
                                                if (e instanceof TimerInterrupted) return true;     throw e;})) {
                break;                                          //  just interrupt the pump cycle by breaking the while.
            }                   //  Otherwise, (however unlikely!), rethrow e toward this._runCycle().catch() in .start().
        }
    }

    /**
     *
     * @param {number} delayInMs
     * @param {function} onTimeout
     * @param {function} onTimerInterruptedOrError
     * @returns {Promise}
     * @private
     */
    async _interruptiblePostponedAction(delayInMs, onTimeout, onTimerInterruptedOrError) {
        //  cycleTimer and this._interruptTimer are both defined and cleaned up in the following try-catch-finally.
        //  While await-ing for the cycleTimer to timeout and its Promise to resolve, this._interruptTimer is
        //  available for some async process to call it via stop() _interruptCycle(). This will call the below
        //  Promise reject(), and the while loop to break.
        let cycleTimer;
        const onFinally = () => {   //  In all cases, cleanup local cycleTimer and this._interruptTimer :
            cycleTimer = undefined;
            Object.defineProperty(this, '_interruptTimer', {configurable: true, value: undefined});
        };
        const postponedAction = new Promise((fulfill, reject) => {
            //  Using something like this._doOneAction() directly as callback to setTimeout would be unsafe:
            //  any thrown Error would be lost. So we use this interruptible-timer core mechanism instead.
            cycleTimer = setTimeout(fulfill, delayInMs);
            Object.defineProperty(this, '_interruptTimer', {configurable: true, value: () => {
                    reject(TimerInterrupted())     //  TimerInterrupted() instance extends Error
                }});
        });
        const settledPostponedAction = postponedAction.then(
            onTimeout,                                                                              //  try {}
            e => {                                                                        //  catch {}
                //  Most likely due to postponedAction Promise reject(TimerInterrupted()) being called by a
                //  ._interruptCycle() call to this._interruptTimer() in .stop(). In which case, the above reject()
                //  call is not immediate, it runs "as soon as possible" down the microTaskQueue holding all the Promise
                //  handlers to be run, but before any timeout callback is called, in the lower priority eventLoop.
                //  Therefore, clearTimeout WILL be called before setTimeout has any chance to call fulfill().
                //  Anyway, once a Promise's fulfill() or reject() has been called, the Promise is not pending anymore,
                //  and trying to call fulfill() or reject() result in a noop().
                if (cycleTimer) {
                    clearTimeout(cycleTimer);
                }
                return onTimerInterruptedOrError(e);
            }
        );
        settledPostponedAction.then(onFinally, onFinally);                                          //  finally {}
        return settledPostponedAction;
    }

    _interruptCycle() {           //  Only stop() calls _interruptCycle(), async to the _runCycle() while loop.

        //  Either the ._runCycle() while loop is await-ing the completion of .doOneAction()
        //  or it is await-ing for the cycleTimer to timeOut.

        //  If ._runCycle() is await-ing the completion of ._doOneAction(), setting .status to stopped will break
        //  the while loop right after ._doOneAction() completes, causing ._runCycle() to return before setting a
        //  new local cycleTimer and ._interruptTimer, which will remain undefined.
        this._updateStatus(eStopped);
        this._postponedActionDelay = null; //  reset the _postponedActionDelay: not in a loop of doOneCycleAction errors.

        //  Only if ._runCycle() is await-ing for a cycleTimer to timeOut, is this._interruptTimer defined (it is
        //  not otherwise). So if ._interruptTimer, calls it to cause ._runCycle() cycleTimer Promise to reject().
        if (this._interruptTimer) {
            this.reportCycleInterruption();
            //  this._interruptTimer() calls reject() of the cycleTimer Promise in _runCycle(), breaking the while
            this._interruptTimer(); //  by raising a TimerInterrupted Error which clearTimeout(cycleTimer), undefines
        }                           //  cycleTimer and this._interruptTimer, and causes _runCycle() to return.
    }

    _nextPostponedActionDelayInMs() {         //  Clogs the log more lightly in case of infinite loop of error.
        const { _postponedActionDelayGenerator } = this;
        if (! _postponedActionDelayGenerator ) {
            return undefined
        }
        //  Because ._postponedActionDelay is set to null at init, after stop, and each successful .doOneCycleAction(),
        //  on a first .doOneCycleAction() error, ._postponedActionDelay is null, which cause it to be defined here.
        //  On many successive .doOneCycleAction() errors, ._postponedActionDelay is not reset, and generates delayInMs
        if ( ! this._postponedActionDelay) {                                //  growing from 0 to 39375 ms (by default).
            this._postponedActionDelay = _postponedActionDelayGenerator();
        }
        if (Infinity === this.cycleInterval) {
            return (2**31)-1;                   //  Max delay value: ~24.8 days. Anything larger results in a delay of 0
        }
        return this._postponedActionDelay();  //  { 0, 625, 1875, 4375, 9375, 19375, 39375, 39375... } by default
    }

    async postpone() {
        const delayInMs = this._nextPostponedActionDelayInMs();
        if (undefined !== delayInMs) {                                              //  undefined: with no delay.
            this.reportCommandFeedback(`${this.actionName} postponed [${delayInMs}] ms.`);

            await this._interruptiblePostponedAction(delayInMs,()=>{}, e => {
                if ( ! e instanceof TimerInterrupted) {
                    this.reportError(`: unexpected error postponing ${this.actionName}:\n${e.message}`);
                }
            });
        }
    }

    //  Perform a postponed post-error .start(), interruptible by a .stop().
    _postponedPostErrorStart(inPausedState) {
        const delayInMs = this._nextPostponedActionDelayInMs();
        if (undefined === delayInMs) {
            return this.start(inPausedState);                                   //  Start with no delay and return
        }
        this.reportPostponedStartDelay(delayInMs);
        this._interruptiblePostponedAction(delayInMs,                           //  no await, spawn it.
            ()=> { this.start(inPausedState); },
            e=> {
                if (! e instanceof TimerInterrupted) this.reportPostponedStartInterruptedUnexpectedly(e);
            //  even if _interruptiblePostponedAction() postponedAction supplies some, omitting the following then/catch
            }).then(()=>null,()=>null); //  caused an unhandledRejection event at the process level.
    }   //  Having _interruptiblePostponedAction() return settledPostponedAction fixes this, but it's safer with .then().

    //endregion

    //region Cycling Operation "interface": { start(), stop(), pause(), resume() }

    start(inPausedState=false) {
        const { status } = this;
        // A successful .start() results in a spawn (non-awaited) promise stored in ._runningPromise.
        if (this._runningPromise) {         //  if there's an activated pumpCycle still operating as a ._runningPromise.
            if (eRunning === status) {
                this.reportNotStarting();
            }
            else if (ePaused === status) {
                this.reportResumingRatherThanStart();
                this.resume();
            }
            else {  //  eStopped
                //  Between the moment ._interruptCycle() is called and status set to eStopped, and the moment either
                //  .doOneCycleAction() or the ._interruptTimer() completes, there could be a delay where a .start()
                //  command is performed. In that case, status will be eStopped but the cleanPromise not performed yet
                //  that sets ._runningPromise to null. In that case, we should signal to cleanPromise to perform the
                //  .start() command once the stop() has completed.
                this._eTransitState = eStartPostponed;
                this.reportPostponingStart();
            }
        }   //  no ._runningPromise, yet .started or .paused and not eRestartingPostError: not good
        else if (eStopped !== status  &&  eRestartingPostError !== this._eTransitState) {
            this.reportStartedNotRunningError();
        }   //  no ._runningPromise and either .stopped or eRestartingPostError: doStart if configured to.
        else if (this.runnable) {

            const handleCycleError = e => this.handleCyclingActionError(e);

            const cleanPromise = () => {                   //  used 2x in final .then(), as a .finally()
                this._runningPromise = null;
                const cleanupStatus = this.status;
                //  Either here because the pumpAction was stopped or because an error was thrown.
                //  If eRunning or ePaused (!eStopped), an error was thrown. We must restart (maybe in paused state).
                if (eStopped !== cleanupStatus) {                       //  eRunning or ePaused
                    this.reportRestartingAfterError();
                    this._eTransitState = eRestartingPostError;         //  signal to start() even if not eStopped.
                    this._postponedPostErrorStart(ePaused === cleanupStatus);
                }
                else if (eStartPostponed === this._eTransitState) {     //  eStopped and eStartPostponed
                    this.reportPostponedRestartingAfterError();
                    this.start();
                }
                //  else just stop.
            };

            this._eTransitState = eNotInTransit;
            if (Infinity === this._cycleIntervalInMs) {     //  Just do one cycle when interval is Infinity
                this.reportStartingOnce();

                //  DON'T await async _runCycleOnlyOnce(), though it returns a Promise: spawn it and complete start().
                //  It will run its .doOneAction's WebRequests and DbOps in Node eventLoop, until it completes (its
                //  Promise resolve(undefined) is not handled), or it throws and the below attached .catch() handles
                //  its Promise thrown Error.
                this._runningPromise = this._runCycleOnlyOnce().catch(handleCycleError).then(cleanPromise, cleanPromise);
            }
            else {
                this.reportStarting();

                //  DON'T await async _runCycle(), though it returns a Promise: spawn it and complete start(). It
                //  will run its while loop, await-ing both cycleTimer timeouts and .doOneAction's WebRequests and
                //  DbOps in Node eventLoop, until either: stop() _interruptCycle() breaks the _runCycle() while
                //  loop and return (its Promise resolve(undefined) is not handled), or .doOneAction throws and the
                //  below attached .catch() handles its Promise thrown Error.
                this._runningPromise = this._runCycle(inPausedState).catch(handleCycleError).then(cleanPromise, cleanPromise);
            }
        }
    }

    stop() {
        if (eStopped === this.status) {
            //  Between the moment ._interruptCycle() is called and status set to eStopped, and the moment either
            //  .doOneCycleAction() or the ._interruptTimer() completes, there could be a delay where a .start() or
            //  .stop() command is performed. In that case, status will be eStopped but the cleanPromise not performed
            //  yet that sets ._runningPromise to null. In that case, a .start() signals to cleanPromise to perform
            //  the .start() command once the stop() has completed by setting this._eTransitState = eStartPostponed.
            if (this._runningPromise) {
                if (eStartPostponed === this._eTransitState) {  //  if there's a postponedStart in place, cancel it.
                    this._eTransitState = eNotInTransit;
                    this.reportCancellingPostponedStart();
                    return;
                }
            }   //  Either if ! ._runningPromise  or  ( ._runningPromise  and  ! .eStartPostponed )
            this.reportNotStopping();
            //  Note if ! ._runningPromise, it can't be eStartPostponed because the .start is done in the same chunk of
            //  work that ._runningPromise is set to null in start() cleanPromise(), without yielding to the event loop.
            //  And it's never eRestartingPostError if eStopped, regardless of ._runningPromise.
        }
        else {
            this._interruptCycle();   //  either interrupt the ._runCycle() loop or the ._postponedPostErrorStart()
            this.reportStopping();
        }
    }

    pause() {
        if (eRunning === this.status) {
            //  This will only cause this.doOneAction() to be skipped in ._runCycle() uninterrupted cycle.
            this.reportPausing();
            this._updateStatus(ePaused);
        }
        else this.reportNotPausing();
    }

    resume() {
        if (ePaused === this.status) {
            //  This will only cause this.doOneAction() to stop being skipped in ._runCycle() uninterrupted cycle.
            this.reportResuming();
            this._updateStatus(eRunning);
        }
        else this.reportNotResuming();
    }

    //endregion
}
self.Cycling = Cycling;
Cycling.TimerInterrupted = TimerInterrupted;

//endregion