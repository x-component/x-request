# x-request

[Build Status](https://travis-ci.org/x-component/x-request.png?v1.0.0)](https://travis-ci.org/x-component/x-request)

- [./request.js](#requestjs) 

# ./request.js

  - [request](#request)

## request

  x-request
  =========
  
  This is a wrapper around the request module to create preconfigured
  backend clients
  - configurable backend parameters:
```js
-- configuration of a target url prefix
-- configurable headers with a generated request id
-- configurable retry
```

  - logging
  
  Example for a backend client
  ----------------------------
  
```js
 'use strict';
```

  
```js
 var
    config  = require('x-configs')(__dirname+'/config'),
    request = require('x-request');
```

  
```js
 module.exports = request(config);
 module.exports.config = config;
```

  
```js
 request.client(config,__filename);
```

  
  Where __dirname+'/config.js is :
  
```js
 'use strict';
 var merge=require('x-common').merge;
```

  
```js
 var generic={
     // name added to log entries for each requests
     name: 'MYSERVER',
```

  
```js
     // optional pre configured backend url prefix with protocol server, port and path prefix
     url:'http://myserver:28080/prefix',
```

  
```js
     // optional example fora get used in usage of the command line client
     example: '/',
```

  
```js
     // optional name of header wich will contain a automatic generated request id,
     // this allows to correlate a log entry here with a log entry in the backend.
     id_header: 'x-reqid',
```

  
```js
     // optionally define known options for the request module
     request: {
         timeout           : 65000,
         maxSockets        : 128,
         followRedirect    : false,
         followAllRedirects: false,
         jar               : false,
         json              : true,
         headers           : {
             'x-reqid':'' //is automatically set
             'x-powered-by : 'x-x.io'
         }
     },
```

  
```js
     retry : {
         // options as defined by node module retry: formula used var Math.min(random * minTimeout * Math.pow(factor, attempt), maxTimeout);
         retries    : 0,    // The maximum amount of times to retry the operation. Default is 10.
         factor     : 2,    // The exponential factor to use. Default is 2
         minTimeout : 300,  // The amount of time before starting the first retry. Default is 1000.
 12         maxTimeout : 6000, // The maximum amount of time between two retries. Default is Infinity.
 13         randomize  : true, // Randomizes the timeouts by multiplying with a factor between 1 to 2. Default is false.
 14         test       : function( err, mce_res, body ){ return err || (mce_res && 429 === mce_res.statusCode); }
 15     }
```

  
```js
 };
```

  
  
  Using such a client:
```js
  request = require('myserver');
```

  
  
```js
  // example: create a item by calling POST http://myserver:28080/prefix/items, with a callback next
  function create(next){
      request.post({url:'/items',json:{name:'abc'}},function(err, backend_response, backend_json){
        next && next( err || backend_response.error() || void 0, json );
      });
  };
```

  
  
  You can check the backend_response statuscodes with
  
```js
  if( backend_response.success()     ){...} //  200 <= statusCode <= 299
  if( backend_response.redirect()    ){...} //  300 <= statusCode <= 399
  if( backend_response.error()       ){...} //  400 <= statusCode
  if( backend_response.error.client()){...} //  400 <= statusCode <= 499
  if( backend_response.error.server()){...} //  500 <= statusCode <= 599
```

  
  name  : 'MCE Topup',
```js
  7     url   : 'http://localhost:48080/mce-mock',
  8     retry : { // as defined by node module retry: formula used var Math.min(random * minTimeout * Math.pow(factor, attempt), maxTimeout);
  9         retries    : 0,    // The maximum amount of times to retry the operation. Default is 10.
 10         factor     : 2,    // The exponential factor to use. Default is 2
 11         minTimeout : 300,  // The amount of time before starting the first retry. Default is 1000.
 12         maxTimeout : 6000, // The maximum amount of time between two retries. Default is Infinity.
 13         randomize  : true, // Randomizes the timeouts by multiplying with a factor between 1 to 2. Default is false.
 14         test       : function( err, mce_res, body ){ return err || (mce_res && 429 === mce_res.statusCode); }
 15     }
```

  
  module.exports={
  	development : merge({},generic,{
  		url:'http://mucprxwap01:28080' // note via varnish in front of node
  	}),
  	
  	test : merge({},generic,{
  	}),
  	
  	production : merge({},generic,{
  	})
  };
