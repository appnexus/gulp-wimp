var wimp = require('../index');
var through = require('through2');
var expect = require('chai').expect;
var Stream = require('stream');
var path = require('path');
var _ = require('lodash');
var Forq = require('forq');
var sinon = require('sinon');
var util = require('util');
var fs = require('fs');

var exampleTestsPath = path.join(__dirname, './fixtures/');
var numberOfTestsExpectedToFail = fs.readdirSync(path.join(exampleTestsPath, 'error_raisers')).length;

describe('Gulp WIMP when some tests fail', function(){

    describe("And test retrying is enabled", function(){

        this.timeout(120000);

        var fileStream,
            wimpStream,
            callbackArgs,
            spy,
            proxy,
            queue,
            results,
            numberOfTestFiles = 0,
            gulp = require('gulp'),
            testsPath = path.join(__dirname, './fixtures/**/*.js'),
            wimpOptions = {
                concurrency: 3,
                retryTests: true,
                maxRetries: 3,
                silent: true,
                dontExit: true,
                taskTimeout: 20000,
                configPath: path.join(__dirname, '../example-wimp-config.js')
            };

        function callbackFunc (fn) {
            var returnValue, called = false;
            return function(err, fork) {
                if (!called) {
                    called = true;
                    returnValue = fn.apply(this, arguments);
                }
                return returnValue;
            };
        }

        before(function(done){
            try {
                spy = sinon.spy();
                proxy = callbackFunc(spy);
                fileStream = gulp.src(testsPath, { buffer: false } );
                fileStream.addListener('data', function(){
                    numberOfTestFiles += 1;
                });
                wimpOptions.callback = function(resultsByFile, forq) {
                    results = resultsByFile;
                    queue = forq;
                    callbackArgs = arguments;
                    proxy();
                    done();
                };
                wimpStream = fileStream.pipe(wimp(wimpOptions));
            } catch (e) {
                done(e);
            }
        });

        it('calls the wimp callback with correct number arguments when tests finish', function(){
            expect(callbackArgs.length).to.eq(2);
        });

        it('the first argument of the wimp callback should not be "null" when there are errors', function(){
            results = callbackArgs[0];
            expect(results).to.not.eq(null);
        });

        it('the second argument is an instance of a Forq queue', function(){
            queue = callbackArgs[1];
            expect(queue).to.be.instanceof(Forq);
        });

        it('calls the callback only once', function(){
            expect(spy.calledOnce).to.eq(true);
        });

        it('creates one task in the queue todo list for each test file and one for each retry', function(){
            expect(queue.tasks.length).to.eq( numberOfTestFiles + wimpOptions.maxRetries );
        });

        it('honors the concurrency limit in the queue passed in via options', function(){
            expect(queue.concurrencyLimit).to.eq(wimpOptions.concurrency);
        });

    });

    describe("And test retrying is disabled", function(){

        this.timeout(120000);

        var fileStream,
            wimpStream,
            callbackArgs,
            spy,
            proxy,
            queue,
            results,
            gulp = require('gulp'),
            numberOfTestFiles = 0,
            testsPath = path.join(__dirname, './fixtures/**/*.js'),
            wimpOptions = {
                concurrency: 3,
                retryTests: false,
                silent: true,
                dontExit: true,
                taskTimeout: 20000,
                configPath: path.join(__dirname, '../example-wimp-config.js')
            };

        function callbackFunc (fn) {
            var returnValue, called = false;
            return function(err, fork) {
                if (!called) {
                    called = true;
                    returnValue = fn.apply(this, arguments);
                }
                return returnValue;
            };
        }

        before(function(done){
            try {
                spy = sinon.spy();
                proxy = callbackFunc(spy);
                fileStream = gulp.src(testsPath, { buffer: false } );
                fileStream.addListener('data', function(){
                    numberOfTestFiles += 1;
                });
                wimpOptions.callback = function(resultsByFile, forq) {
                    results = resultsByFile;
                    queue = forq;
                    callbackArgs = arguments;
                    proxy();
                    done();
                    
                };
                wimpStream = fileStream.pipe(wimp(wimpOptions));
            } catch (e) {
                done(e);
            }
        });

        after(function(done){
            try {
                wimpStream.end();
                done();
            } catch (e) {
                done(e);
            }
        });

        it('calls the wimp callback with correct number arguments when tests finish', function(){
            expect(callbackArgs.length).to.eq(2);
        });

        it('the first argument of the wimp callback should not be "null" when there are errors', function(){
            results = callbackArgs[0];
            expect(results).to.not.eq(null);
        });

        it('the second argument is an instance of a Forq queue', function(){
            queue = callbackArgs[1];
            expect(queue).to.be.instanceof(Forq);
        });

        it('calls the callback only once', function(){
            expect(spy.calledOnce).to.eq(true);
        });

        it('creates one task in the queue todo list for each test file and one for each retry', function(){
            expect(queue.tasks.length).to.eq(numberOfTestFiles);
        });

        it('honors the concurrency limit in the queue passed in via options', function(){
            expect(queue.concurrencyLimit).to.eq(wimpOptions.concurrency);
        });

        it('results object has one key for every failing test', function(){
            expect(Object.keys(results).length).to.eq(numberOfTestsExpectedToFail);
        });

    });

});