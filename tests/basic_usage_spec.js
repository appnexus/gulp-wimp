var wimp = require('../index');
var gulp = require('gulp');
var through = require('through2');
var expect = require('chai').expect;
var Stream = require('stream');
var path = require('path');
var _ = require('lodash');
var Forq = require('forq');
var sinon = require('sinon');

describe('Gulp WIMP', function(){

    describe('When there are no failed tests', function(){
        
        this.timeout(60000);

        var fileStream,
            wimpStream,
            callbackArgs,
            spy,
            proxy,
            queue,
            error,
            numberOfTestFiles = 0,
            testsPath = path.join(__dirname, './fixtures/*.js'),
            wimpOptions = {
                concurrency: 3,
                silent: true,
                dontExit: true,
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
                wimpOptions.callback = function(err, fork) {
                    if (err) { return done(err); }
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

        it('the first argument of the wimp callback should be "null" when there is no error', function(){
            error = callbackArgs[0];
            expect(error).to.eq(null);
        });

        it('the second argument is an instance of a Forq queue', function(){
            queue = callbackArgs[1];
            expect(queue).to.be.instanceof(Forq);
        });

        it('calls the callback only once', function(){
            expect(spy.calledOnce).to.eq(true);
        });

        it('creates one task in the queue for each test file', function(){
            expect(queue.todo.length).to.eq(numberOfTestFiles);
        });

        it("honors the concurrency limit in the queue passed in via options", function(){
            expect(queue.concurrencyLimit).to.eq(wimpOptions.concurrency);
        });

        xit("should")

    });

    xdescribe('Options', function(){

        xit('runs with default options when no parameters are passed in', function(done){



        });

    });

});