'use strict';

/*
 * x-request
 * =========
 *
 * This is a wrapper around the request module to create preconfigured
 * backend clients
 * - configurable backend parameters:
 *   -- configuration of a target url prefix
 *   -- configurable headers with a generated request id
 *   -- configurable retry
 * - logging
 *
 * Example for a backend client
 * ----------------------------
 *
 *    'use strict';
 *
 *    var
 *       config  = require('x-configs')(__dirname+'/config'),
 *       request = require('x-request');
 *
 *    module.exports = request(config);
 *    module.exports.config = config;
 *
 *    request.client(config,__filename);
 *
 * Where __dirname+'/config.js is :
 *
 *    'use strict';
 *    var merge=require('x-common').merge;
 *
 *    var generic={
 *        // name added to log entries for each requests
 *        name: 'MYSERVER',
 *
 *        // optional pre configured backend url prefix with protocol server, port and path prefix
 *        url:'http://myserver:28080/prefix',
 *
 *        // optional example fora get used in usage of the command line client
 *        example: '/', 
 *
 *        // optional name of header wich will contain a automatic generated request id,
 *        // this allows to correlate a log entry here with a log entry in the backend.
 *        id_header: 'x-reqid',
 *
 *        // optionally define known options for the request module
 *        request: {
 *            timeout           : 65000,
 *            maxSockets        : 128,
 *            followRedirect    : false,
 *            followAllRedirects: false,
 *            jar               : false,
 *            json              : true,
 *            headers           : {
 *                'x-reqid':'' //is automatically set
 *                'x-powered-by : 'x-x.io'
 *            }
 *        },
 *
 *        retry : {
 *            // options as defined by node module retry: formula used var Math.min(random * minTimeout * Math.pow(factor, attempt), maxTimeout);
 *            retries    : 0,    // The maximum amount of times to retry the operation. Default is 10.
 *            factor     : 2,    // The exponential factor to use. Default is 2
 *            minTimeout : 300,  // The amount of time before starting the first retry. Default is 1000.
   12         maxTimeout : 6000, // The maximum amount of time between two retries. Default is Infinity.
   13         randomize  : true, // Randomizes the timeouts by multiplying with a factor between 1 to 2. Default is false.
   14         test       : function( err, mce_res, body ){ return err || (mce_res && 429 === mce_res.statusCode); }
   15     }

 *    };
 *
 *
 * Using such a client:
 *     request = require('myserver');
 *
 *
 *     // example: create a item by calling POST http://myserver:28080/prefix/items, with a callback next
 *     function create(next){
 *         request.post({url:'/items',json:{name:'abc'}},function(err, backend_response, backend_json){
 *           next && next( err || backend_response.error() || void 0, json );
 *         });
 *     };
 *
 * 
 * You can check the backend_response statuscodes with
 *
 *     if( backend_response.success()     ){...} //  200 <= statusCode <= 299
 *     if( backend_response.redirect()    ){...} //  300 <= statusCode <= 399
 *     if( backend_response.error()       ){...} //  400 <= statusCode
 *     if( backend_response.error.client()){...} //  400 <= statusCode <= 499
 *     if( backend_response.error.server()){...} //  500 <= statusCode <= 599
 *
 * name  : 'MCE Topup',
    7     url   : 'http://localhost:48080/mce-mock',
    8     retry : { // as defined by node module retry: formula used var Math.min(random * minTimeout * Math.pow(factor, attempt), maxTimeout);
    9         retries    : 0,    // The maximum amount of times to retry the operation. Default is 10.
   10         factor     : 2,    // The exponential factor to use. Default is 2
   11         minTimeout : 300,  // The amount of time before starting the first retry. Default is 1000.
   12         maxTimeout : 6000, // The maximum amount of time between two retries. Default is Infinity.
   13         randomize  : true, // Randomizes the timeouts by multiplying with a factor between 1 to 2. Default is false.
   14         test       : function( err, mce_res, body ){ return err || (mce_res && 429 === mce_res.statusCode); }
   15     }

module.exports={
	development : merge({},generic,{
		url:'http://mucprxwap01:28080' // note via varnish in front of node
	}),
	
	test : merge({},generic,{
	}),
	
	production : merge({},generic,{
	})
};
 
*/


var
	request    = require('request'),
	url        = require('url'),
	util       = require('util'),
	global_log = require('x-log'),
	extend     = require('x-common').extend,
	merge      = require('x-common').merge,
	filter     = require('x-common').filter,
	retry      = require('retry');

var client_factory;

/*!
 * generates a unique request ID and stores it optionally in a header if given. The current header value is used as value prefix
 */
function set_id(options,header) {
	var
		date_base_36 = (+new Date()).toString(36),
		fill         = '000000000000000',
		id           = fill.substring(0, fill.length - date_base_36.length) + date_base_36;
	
	if (header) options.headers[header] = (options.headers[header] ? '' + options.headers[header] : '') + id;
	return id;
}

/*!
 * Compose the url based on the url in the config.
 * options.url='/y' and config.uri='http://x' becomes options.uri='http://x/y'
 */
function set_url(options,config) {
	
	// always use uri
	if (options.url){
		options.uri = options.url;
		delete options.url;
	}
	
	// compose using a string
	var u = options.uri;
	if (typeof u === 'object') {
		try {
			u = url.format(u);
		} catch (e) { options.log.error && options.log.error(config.name+' request: could not convert url object:' + u + ' to url'); }
	}
	
	// prepend default base url
	if (u && typeof u === 'string' && 0 !== u.indexOf('http')) {
		var
			base      = config.uri || config.url || '',
			first_u   = u.charAt(0),
			last_base = base.charAt(base.length - 1);
		
		options.uri = base + (  ~base.indexOf('?') ? ( '&' !==first_u ? '&' + u : u ) // ? already in base, now only params can follow
		    : ( '?' === first_u || '?' === last_base  ? ( '?' === first_u  && '?' === last_base ? u.substring(1) : u ) // ? then assure a single ?
		    : ( '/' === first_u || '/' === last_base  ? ( '/' === first_u  && '/' === last_base ? u.substring(1) : u ) // assure a single /
		    : '/' + u )));
	}
	
	// now parse final url
	if (typeof options.uri === 'string') options.uri = url.parse(options.uri);
	
	// add default basic auth info name:password
	if (!options.uri.auth && config.auth) options.uri.auth = config.auth;
}

/*!
 * Prevent double headers: remove those headers which are defined in request config
 */
function cleanup_headers(options,config){
	
	// *ignoring case* which is why merge doens't work
	if(options && options.headers && config.request && config.request.headers) {
		var names = {},h; // lower case names
		for(h in config.request.headers ) {
			names[ h.toLowerCase() ] = true;
		}
		for(h in options.headers ){ // remove existing
			if( names[ h.toLowerCase() ] ){
				delete options.headers[ h ];
			}
		}
	}
}

/*!
 * Handle json request
 * extra own json handling to prevent *wrong* content-type handling of the request module (case sensitive content-type)
 */
function json_request(options){
	if(!options) {
		return false;
	}
	var json = 'undefined' === typeof(options.json) ? true : options.json;
	
	if ( json ) {
		if (typeof json === 'boolean') {
			if (typeof options.body === 'object') options.body = JSON.stringify(options.body);
		} else {
			options.body = JSON.stringify(json);
		}
		options.headers = options.headers || {};
		options.headers.Accept = 'application/json';
		if(options.body) options.headers['Content-Type']='application/json';
	}
	options.json = false;
	
	return !!json; // return as boolean
}

/*!
 * Handle json response
 * Note: for now we do NOT look at the content-type as some (MCE, Gap/Amobee) send XML if saying they send json and send json wihtout correct content type
 */
function json_response(res,options,backend) {
	var body = res && res.body ? res.body : null;
	
	// try parsing if string is json thus begins with whitspace and { or [
	if ( body && typeof body === 'string' && /\s*(\{|\[)/.test(body) ){
		try {
			res.body = JSON.parse(body);
		} catch(e) {
			var log = options.log || global_log;
			log.error && log.error('Backend request: could not parse response as JSON', {body:body, error:e, backend:backend});
		}
	}
}

/*!
 * helpers for evaluating the statusCode.
 * they are used to extend the response, therefore they use
 * this.statusCode
 *
 * for a more extnsive list see: http://en.wikipedia.org/wiki/List_of_HTTP_status_codes
 * we use only RFC related ones
 *
 * if(res.success()) ..
 * if(res.error())
 * if(res.error.server()) ...
 */
var status_helpers = {
	success  : function () { var sc=this.statusCode; return 200 <= sc && 299 >= sc ? sc : false; },
	redirect : function () { var sc=this.statusCode; return 300 <= sc && 399 >= sc ? sc : false; },
	error    : extend( function () { var sc=this.statusCode; return 400 <= sc ? sc : false; },{
		client : function () { var sc=this.statusCode; return 400 <= sc && 499 >= sc ? sc : false; },
		server : function () { var sc=this.statusCode; return 500 <= sc && 599 >= sc ? sc : false; }
	}),
	
	// deprecated:
	too_many  : function () { var sc=this.statusCode; return 429 === sc ? sc : false; },
	not_found : function () { var sc=this.statusCode; return 404 === sc ? sc : false; },
	gone      : function () { var sc=this.statusCode; return 410 === sc ? sc : false; }
};

module.exports = extend(client_factory = function (config, default_options) {
	
	config = config || {};
	
	var backend = config.name || 'BACKEND';
	
	/*!
	 * wraps the method in a fault tolerant version of the method
	 * if options.retry is defined, otherwise keep method behavior as is
	 */
	var retrying = function(method){
		return function(opts, cb){
			
			var log = opts.log || global_log;
			
			if( opts.retry || config.retry ) {
				delete opts.log; // this would cause a stack overflow if not deleted
				opts.retry = merge({}, config.retry, opts.retry);
				extend(opts,{log:log});
			}
			
			if(!opts.retry) return method(opts,cb);
			
			var
				operation = retry.operation(opts.retry),
				test      = opts.retry.test && typeof(opts.retry.test)==='function' ? opts.retry.test : null;
			
			operation.attempt(function(currentAttempt) {
				currentAttempt>1 && log.debug && log.debug('attempt',{attempt:currentAttempt});
				method(opts, function(err, mce_res, body) {
					if (operation.retry( test ? test( err, mce_res, body ) : err )) return;
					cb && cb(operation.mainError(), mce_res, body);
				});
			});
		};
	};
	
	/*!
	 * Helper to wrap a request function method with a logging and configurable option handling version
	 */
	var def = function (method) {
		
		return retrying(function (opts, callback){
			
			var log = opts.log = opts.log || global_log; // use log from options if available
			
			if ('string' === typeof opts) opts = {uri:opts}; // if just passed an url as string
			
			cleanup_headers(opts,config); // before merge as it compares config headers with opts headers
			
			opts = extend(merge({}, config.request || {}, default_options || {}, filter(opts,'log')),{log:log});
			
			set_url(opts,config);
			
			var id = set_id(opts,config.id_header);
			
			// preserve info for logging before json request (as this can stringify the body)
			var log_req = extend({ id: id, backend : backend, options : merge({},filter(opts,'log'))});
			
			var json = json_request(opts);
			
			//jar: Set to false if you don't want cookies to be remembered for future use or define your custom cookie jar
			if('undefined' === typeof(opts.jar)) {
				opts.jar = false;
			}
			
			// record the BEGIN
			var begin = +new Date();
			extend(log_req,{begin:begin});
			
			log.debug && log.debug(backend + ' request begin',{ internal_request: log_req });
			
			// call the original request module function
			return method(opts, function (err, res) {
				
				// record the END, DURATION
				var end = +new Date();
				extend(log_req,{ end: end, duration: end - begin});
				
				if(res) extend(res,status_helpers);
				
				if(json) json_response(res,opts,backend);
				
				// add response info to log info
				if(res){
					log_req.response={statusCode:res.statusCode};
					// only on debug log the response body
					if(log.debug && res.body) log_req.response.body    = (Buffer.isBuffer(res.body) ? '[Buffer][length:' + res.body.length + ']' : res.body);
					if(res.headers          ) log_req.response.headers = res.headers;
				}
				
				if (err || (res && res.statusCode >= 400)){
					if(err){
						if( err.code === 'ETIMEDOUT') err.timeout = true; // this makes it easier in call backs to check for timeouts
						extend(log_req,{ error: err } );
					}
					
					log.error && log.error( backend + ' request',{ internal_request: log_req });
				} else {
					              log.debug && log.debug( backend + ' request end', { internal_request: log_req });
					!log.debug && log.info  && log.info ( backend + ' request'    , { internal_request: log_req });
				}
				callback.call(this, err, res, res && res.body ? res.body : '' );
			});
		});
	};
	return extend(def(request), { // wrap normal request API
		get   :def(request.get),
		post  :def(request.post),
		put   :def(request.put),
		head  :def(request.head),
		del   :def(request.del),
		cookie:def(request.cookie),
		jar   :def(request.jar)
	});
},{
	
	client:function (config, filename) { // current __filename is required to check if the procces was called with the current file node __filename.js
		
		// command line interface
		(function (client) {
			if (require('fs').realpathSync(require('path').resolve(process.argv[1])) === filename){//started stand alone
				var url = process.argv[2];
				if (!url) console.log('usage: NODE_ENV=development; node ' + filename + ' /url\n' +
					(config.example ? 'example: ' + config.example : ''));
				else {
					console.log('process.env.NODE_ENV=' + process.env.NODE_ENV);
					console.log('using settings:' + util.inspect(config));
					client({method:process.argv[3] || 'GET', url:url}, function (err, res, data) {
						if (err){
							console.log('ERROR status:' + res.statusCode);
							console.log('headers:' + util.inspect(res.headers));
							console.log('body:' + util.inspect(data, false, null));
							console.log('err:' + util.inspect(err));
							return;
						}
						console.log('OK status:' + res.statusCode);
						console.log('headers:' + util.inspect(res.headers));
						console.log('body:' + util.inspect(data, false, null));
					});
				}
			}
		}(client_factory(config)));
	}
});
