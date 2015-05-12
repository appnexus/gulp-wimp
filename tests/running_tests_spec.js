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

    describe('Using the "callback"', function(){


        describe('when there are no failed tests', function(){
            
            this.timeout(60000);

            var fileStream;
            var wimpStream;
            var callbackArgs;
            var spy;
            var wimpOptions = {
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
                }
            } 

            it('calls the wimp callback with correct number arguments when tests finish', function(done){
                var fileStream = gulp.src(path.join(__dirname, './fixtures/examples/**/*.js'), { buffer: false } );
                spy = sinon.spy();
                
                var proxy = callbackFunc(spy);
                
                wimpOptions.callback = function(err, fork) {
                    if (err) { return done(err); }
                    callbackArgs = arguments;
                    expect(arguments.length).to.eq(2);
                    proxy();
                    done();
                };
                
                wimpStream = fileStream.pipe(wimp(wimpOptions));
            });

            it('the first argument of the wimp callback should be "null" when there is no error', function(){
                expect(callbackArgs[0]).to.eq(null);
            });

            it('calls the callback only one time', function(){
                expect(spy.calledOnce).to.eq(true);
            });
        
        });

    });

    xdescribe('Options', function(){

        xit('runs with default options when no parameters are passed in', function(done){



        });

    });

});