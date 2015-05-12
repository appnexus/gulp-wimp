var wimp = require('../index');
var gulp = require('gulp');
var through = require('through2');
var expect = require('chai').expect;
var Stream = require('stream');
var path = require('path');
var _ = require('lodash');
var Forq = require('forq');
var sinon = require('sinon');

describe('Gulp WIMP when there are failures', function(){

    describe("And the tests have finished and retries are enabled", function(){

        this.timeout(120000);

        var fileStream,
            wimpStream,
            callbackArgs,
            spy,
            proxy,
            queue,
            results,
            numberOfTestFiles = 0,
            testsPath = path.join(__dirname, './fixtures/**/*.js'),
            wimpOptions = {
                concurrency: 3,
                retryTests: true,
                maxRetries: 3,
                silent: true,
                dontExit: true,
                taskTimeout: 10000,
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
            expect(queue.todo.length).to.eq(numberOfTestFiles + wimpOptions.maxRetries);
        });

        it("honors the concurrency limit in the queue passed in via options", function(){
            expect(queue.concurrencyLimit).to.eq(wimpOptions.concurrency);
        });

    });

});