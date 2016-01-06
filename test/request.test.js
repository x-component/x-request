'use strict';

var
	vows      = require('vows'),
	util      = require('util'),
	assert    = require('assert'),
	request   = require('../request')({name:'BACKEND'}),
	extend    = require('x-common').extend,
	log       = require('x-log'),
	express   = require('express'),
	http      = require('http');

var port = 29393;

var verbose = false;

log.console(verbose);

// helper to wrap a function in a recording variant
var recording = function(f){ return extend( function F(){
	F.called.push(Array.prototype.slice.call(arguments));
	return f.apply(this,arguments);
},{called:[]}); };

function test(level,url,middleware){
	return function(){
		
		log.level=level;
		
		var self = this;
		
		var log_mock=extend({},log);
		for(var p in log ) {
			var prop=log[p];
			if( typeof(prop)=='function' ) log_mock[p]=recording(prop);
		}
		
		request.put({body:{test:'input'}, url:'http://127.0.0.1:' + port + ( url || '/test' ),log:log_mock},function(err,res,data){
			self.callback(log_mock);
		});
	};
}

var assert_exists = function(level,exists){ return function(log_mock){ assert.equal(!!log_mock[level],exists); }; };
var assert_called = function(level,count){ return function(log_mock){ assert.equal(log_mock[level].called.length, typeof(count)=='number' ? count : 1 ); }; };
var assert_contains = function(level,regexp,count){
	return function(log_mock){
		var msg = log_mock[level].called[ typeof(count)=='number' ? count-1 : 0 ];
		msg = msg ? msg[0]: '';
		assert(regexp.test(msg));
	};
};

var suite = vows.describe('request');
suite.addBatch({
	'test request to server':{
		topic : function(){
			var self = this;
			var app = express();
			app.all('/test', function(req,res){ res.status(200).send({test:'output'}); });
			
			var server = http.createServer(app);
			server.listen(port,function(){
				self.callback(server);
			});
		},
		teardown:function(server){
			server.close();
		},
		'correct call in level info':{ topic:test('info','/test'),
			'log debug does not exist': assert_exists('debug',false),
			'log info called once'    : assert_called('info',1),
			'log info called message contains BACKEND': assert_contains('info',/BACKEND/),
			'log error never called'  : assert_called('error',0)
		},
		'wrong call in level info':{ topic:test('info','/test_error'),
			'log debug does not exist': assert_exists('debug',false),
			'log info never called'   : assert_called('info' ,0),
			'log error called once'   : assert_called('error',1),
			'log error called message contains BACKEND':assert_contains('error',/BACKEND/)
		},
		'correct call in level debug':{ topic:test('debug','/test'),
			'log debug called twice begin and end': assert_called('debug',2),
			'log debug begin called message contains BACKEND':assert_contains('debug',/BACKEND/,1),
			'log debug end   called message contains BACKEND':assert_contains('debug',/BACKEND/,2),
			'log info  never called': assert_called('info',0),
			'log error never called': assert_called('error',0)
		},
		'wrong call in level debug':{ topic:test('debug','/test_error'),
			'log debug called once begin': assert_called('debug',1),
			'log debug begin called message contains BACKEND':assert_contains('debug',/BACKEND/,1),
			'log info  never called': assert_called('info',0),
			'log error called once' : assert_called('error',1),
			'log error called message contains BACKEND':assert_contains('error',/BACKEND/)
		},
		'correct call in level error':{ topic:test('error','/test'),
			'log debug does not exist':assert_exists('debug',false),
			'log info  does not exist':assert_exists('info',false),
			'log error never called'  :assert_called('error',0)
		},
		'wrong call in level error':{ topic:test('error','/test_error'),
			'log debug does not exist':assert_exists('debug',false),
			'log info  does not exist':assert_exists('info',false),
			'log error called once'   :assert_called('error',1),
			'log error called message contains BACKEND':assert_contains('error',/BACKEND/)
		}
	}
}).exportTo(module,{error:false});
