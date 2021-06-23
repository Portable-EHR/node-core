#### nodeCore librairies

This module include multiple libraries that are likely to be required in any Portable EHR node implementation.

- lib/utils : a gazillion of utilitary functions and classes including : 
    - function.prototype .chainProto() and .alsoExtends() methods and getGetterFunction() function
    - python-itertools-inspired generators : zip(), chain(), repeat() and groupBy(), plus
    - prototypesAlongTheProtoChain() and collectNonOverriddenProtoFunctionsAlongTheProtoChain() generators
    - time related now(), dateAdd(), minIntervalInMs(), isInvalidDate(), toDate(), strToDate() and onlyDate() functions
    - string, JSON, html, B64, and sha utility functions
    - showJwt(), jwtBody() and jwtExpiry() functions, plus Jwt() constructor
    - cleanUrlPath(), makeDirIfNeeded() and buildFromFile() file helper functions
    - dbMsg(), bailOut(), expectedErrorProtoDefaultProps(), DeclareExpectedError() and isInstanceOfError() functions, plus
    - ErrorExtender() and ErrorWrapper() Error constructors
    - Enum and EItem constructors
    - LaunchParams class
    - tons of isInvalid*(), isProvided(), isNotProvided(), isFunction(), RamqNamUpTo10th(), validateRamqNam() validation functions
    - ECyclingStatus enum, Cycling.TimerInterrupted() Error constructor and Cycling class

- lib/api.auth : provides :
    - AuthError contructor
    - jwtHoursOfValidity constant
    - createJwt() and verifyJwt() functions
    - authenticateAndAllowUser() function
    - getFeed() function 
    - authorizeApiRequest() function
    - bearerLogin() function

- lib/api : provides :
    - EFeedRequestStatus enum
    - FeedApiResponse() and 
    - FeedApiLoginRequest() constructors,
    - EFeedHubRequestStatus enum
    - FeedHubApiResponse(), 
    - FeedHubApiLoginRequest() and 
    - FeedHubApiDispensaryRequest() constructors
    
- lib/config.auth : provides :
    - EAuthMethod and EUserRole enums
    - ApiUser and ApiUsers classes
    - Credentials and AllCredentials classes
    
- lib/config : provides :
    - NodeConfig class
    - nodeConfig() and nodeReloadConfig() functions
     
- lib/config.nao : provides :
    - EWebScheme enum
    - Endpoint class
    - WsSelfServer class
    
- lib/dao : provides :
    - noRow() Error constructor
    - CURRENT_TIMESTAMP() and CURRENT_TIMESTAMP_3() functions
    - dbInsert()
    - dbUpdate()
    - dbDelete() and
    - fetchFromDb() functions
    - doInTransaction() context function
    - isoDateStrToDbDate() and dbDateToIsoDateStr() functions
    - EDbJsType enum 
    - parseTableSchema() function
    
- lib/nao : provides :
    - IpSocketError(), StatusError(), Unpacking(), BackendError(), FeedHubError() and FeedError() Error constructors
    - EWebMethod and EWebStatusCode enums
    - WebRequest class 
    - SelfStatusErrorBody() and SelfWebRequestMethods() constructors
    - FeedHubStatusErrorBody() and FeedHubWebRequestMethods() constructors

- lib/nao.self : provides :
    - sendOnePostToSelf() function
    - filterFromSrcBundle() function
    - runFeedHubSelfServerUnitTest() function

- lib/node : provides NodeState and Node classes.

- lib/wtf.pump : provides WTFpump class.