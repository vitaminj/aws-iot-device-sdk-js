/*
 * Copyright 2010-2015 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 *
 * Licensed under the Apache License, Version 2.0 (the "License").
 * You may not use this file except in compliance with the License.
 * A copy of the License is located at
 *
 *  http://aws.amazon.com/apache2.0
 *
 * or in the "license" file accompanying this file. This file is distributed
 * on an "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either
 * express or implied. See the License for the specific language governing
 * permissions and limitations under the License.
 */

//node.js deps

//npm deps

//app deps
var rewire = require('rewire');
var sinon = require('sinon');
var assert = require('assert');

var copyFileModule = rewire('../examples/lib/copy-file');
var downloadFileModule = rewire('../examples/lib/download-file');
var jobsAgentModule = rewire('../examples/jobs-agent');

var isUndefined = require('../common/lib/is-undefined');

// valid test codesign certificate containing public key
const codeSignCertValid = '-----BEGIN CERTIFICATE-----\n\
MIICfDCCAiKgAwIBAgIILHaXB2Gj4K0wCgYIKoZIzj0EAwIwgZgxCzAJBgNVBAYT\n\
AlVTMRAwDgYDVQQIEwdNb250YW5hMRMwEQYDVQQHEwpMaXZpbmdzdG9uMSUwIwYD\n\
VQQKExxBcGVydHVyZSBTY2llbmNlIENvcnBvcmF0aW9uMTswOQYDVQQDEzJBcGVy\n\
dHVyZSBTY2llbmNlIFBvcnRhbCBDZXJ0aWZpY2F0ZSBBdXRob3JpdHkgLSBSNDAe\n\
Fw0wODAxMDEwODAwMDFaFw0yOTAxMDEwNzU5NTlaMIGYMQswCQYDVQQGEwJVUzEQ\n\
MA4GA1UECBMHTW9udGFuYTETMBEGA1UEBxMKTGl2aW5nc3RvbjElMCMGA1UEChMc\n\
QXBlcnR1cmUgU2NpZW5jZSBDb3Jwb3JhdGlvbjE7MDkGA1UEAxMyQXBlcnR1cmUg\n\
U2NpZW5jZSBQb3J0YWwgQ2VydGlmaWNhdGUgQXV0aG9yaXR5IC0gUjQwWTATBgcq\n\
hkjOPQIBBggqhkjOPQMBBwNCAAQZQB7krlbWVeOE15wqeHinSA1FN0C3iM5+olSW\n\
j5ZtkPIBNQtyFMgeWCGvpJNUOs4mdnf6EfukXWs/jf2odydmo1QwUjAdBgNVHQ4E\n\
FgQUfRkDG64WfL5wyEsfhHGvncE2aeswDAYDVR0TAQH/BAIwADAOBgNVHQ8BAf8E\n\
BAMCB4AwEwYDVR0lBAwwCgYIKwYBBQUHAwMwCgYIKoZIzj0EAwIDSAAwRQIhAKkk\n\
CNbMSWv0vWXk2s7fCASw3IrmdgOeemWo+6S1GGK0AiBASh5CUkkZA2eCnXTD8Zf0\n\
U0CZNvEeG8eg6JkVR/BRRw==\n\
-----END CERTIFICATE-----';

// invalid codesign certificate
const codeSignCertInvalid = '-----BEGIN CERTIFICATE-----\n\
MIICfDCCAiKgAwIBAgIILHaXB2Gj4K0wCgYIKoZIzj0EAwIwgZgxCzAJBgNVBAYT\n\
InvalidInvalidInvalidInvalidInvalidInvalidInvalidInvalidInvalidI\n\
CNbMSWv0vWXk2s7fCASw3IrmdgOeemWo+6S1GGK0AiBASh5CUkkZA2eCnXTD8Zf0\n\
U0CZNvEeG8eg6JkVR/BRRw==\n\
-----END CERTIFICATE-----';

//
// Object to simulate file system operations using in memory structure
//
var fs = {
    fileStore: {},
    readEventHandlers: {},
    writeEventHandlers: {},
    reset: function() {
        this.fileStore = {};
        this.readEventHandlers = {};
        this.writeEventHandlers = {};
    },
    writeFileSync: function(fileName, contents) {
        this.fileStore[fileName] = contents;
    },
    readFileSync: function(fileName) {
        return this.fileStore[fileName];
    },
    existsSync: function(fileName) {
        return !isUndefined(this.fileStore[fileName]);
    },
    writeSync: function(fd, data){
    },
    createWriteStream: function(fileName) {
        return {
            write: function(data) {
                fs.fileStore[fileName] = data;
                if (!isUndefined(fs.writeEventHandlers[fileName + 'close'])) {
                    fs.writeEventHandlers[fileName + 'close']();
                }
            },
            end: function() {},
            on: function(eventName, handler) {
                fs.writeEventHandlers[fileName + eventName] = handler;
                return this;
            }
        };
    },
    createReadStream: function(fileName) {
        return {
            pipe: function(ws) {
                ws.write(fs.fileStore[fileName]);
            },
            end: function() {
            },
            on: function(eventName, handler) {
                fs.readEventHandlers[fileName + eventName] = handler;

                // if both 'data' and 'end' handlers added simulate stream file transfer
                if ((eventName === 'data' || eventName === 'end') &&
                    !isUndefined(fs.readEventHandlers[fileName + 'data']) && 
                    !isUndefined(fs.readEventHandlers[fileName + 'end'])) {
                    fs.readEventHandlers[fileName + 'data'](fs.fileStore[fileName]);
                    fs.readEventHandlers[fileName + 'end']();
                }
                return this;
            }
        };
    },
    unlink: function(fileName) {
        this.fileStore[fileName] = undefined;
    }
};

var pathStub = {
    resolve: function(arg1, arg2) {
        return '/' + (isUndefined(arg2) ? arg1 : arg2);
    }
};

const tempDir = '/';

copyFileModule.__set__('fs', fs);
downloadFileModule.__set__({'fs': fs, 'copyFile': copyFileModule});
jobsAgentModule.__set__({'fs': fs, 'copyFile': copyFileModule, 'downloadFile': downloadFileModule, 'path': pathStub});
jobsAgentModule.__set__('codeSignCertFileName', '/codeSignCert.pem')

describe( "jobs agent unit tests", function() {
    function buildJobObject(operation, status, jobDocument, inProgress, failed, succeeded) {
        var job = {};

        job.id = '1234';
        job.document = jobDocument;
        job.operation = operation;
        job.status = status;
        job.inProgress = inProgress;
        job.failed = failed;
        job.succeeded = succeeded;

        return job;
    }
    describe( "install handler tests", function() {
        var installHandler = jobsAgentModule.__get__('installHandler');
        var fakeCallbackInProgress = sinon.spy();
        var fakeCallbackFailed = sinon.spy();
        var fakeCallbackSucceeded = sinon.spy();

        it("invalid status calls failed callback", function() { 
            fakeCallbackInProgress.reset();
            fakeCallbackFailed.reset();
            fakeCallbackSucceeded.reset();
            var job = buildJobObject('install', { status: 'INVALID' }, null, fakeCallbackInProgress, function (statusDetails) {
                fakeCallbackFailed();
                console.log(statusDetails);
                assert.equal(statusDetails.errorCode, 'ERR_UNEXPECTED');
            }, fakeCallbackSucceeded);
            installHandler(job);
            sinon.assert.notCalled(fakeCallbackInProgress);
            assert(fakeCallbackFailed.calledOnce);
            sinon.assert.notCalled(fakeCallbackSucceeded);
        }); 

        it("missing packageName calls failed callback", function() { 
            fakeCallbackInProgress.reset();
            fakeCallbackFailed.reset();
            fakeCallbackSucceeded.reset();
            var job = buildJobObject('install', { status: 'QUEUED' }, { files: [ { fileName: 'testFileName' } ] }, fakeCallbackInProgress, function (statusDetails) {
                fakeCallbackFailed();
                console.log(statusDetails);
                assert.equal(statusDetails.errorCode, 'ERR_UNNAMED_PACKAGE');
            }, fakeCallbackSucceeded);
            installHandler(job);
            sinon.assert.notCalled(fakeCallbackInProgress);
            assert(fakeCallbackFailed.calledOnce);
            sinon.assert.notCalled(fakeCallbackSucceeded);
        }); 

        it("missing files list calls failed callback", function() { 
            fakeCallbackInProgress.reset();
            fakeCallbackFailed.reset();
            fakeCallbackSucceeded.reset();
            var job = buildJobObject('install', { status: 'QUEUED' }, { packageName: 'testPackageName' }, fakeCallbackInProgress, function (statusDetails) {
                fakeCallbackFailed();
                console.log(statusDetails);
                assert.equal(statusDetails.errorCode, 'ERR_FILE_COPY_FAILED');
            }, fakeCallbackSucceeded);
            installHandler(job);
            sinon.assert.notCalled(fakeCallbackInProgress);
            assert(fakeCallbackFailed.calledOnce);
            sinon.assert.notCalled(fakeCallbackSucceeded);
        }); 

        it("empty files list calls failed callback", function() { 
            fakeCallbackInProgress.reset();
            fakeCallbackFailed.reset();
            fakeCallbackSucceeded.reset();
            var job = buildJobObject('install', { status: 'QUEUED' }, { packageName: 'testPackageName', files: [] }, fakeCallbackInProgress, function (statusDetails) {
                fakeCallbackFailed();
                console.log(statusDetails);
                assert.equal(statusDetails.errorCode, 'ERR_FILE_COPY_FAILED');
            }, fakeCallbackSucceeded);
            installHandler(job);
            sinon.assert.notCalled(fakeCallbackInProgress);
            assert(fakeCallbackFailed.calledOnce);
            sinon.assert.notCalled(fakeCallbackSucceeded);
        }); 

        it("invalid file in files list calls failed callback", function() { 
            fakeCallbackInProgress.reset();
            fakeCallbackFailed.reset();
            fakeCallbackSucceeded.reset();
            var job = buildJobObject('install', { status: 'QUEUED' }, { 
                    packageName: 'testPackageName', 
                    files: [ null, { fileName: 'testFileName.txt' } ] }, 
                fakeCallbackInProgress, 
                function (statusDetails, cb) {
                    fakeCallbackFailed();
                    console.log(statusDetails);
                    assert.equal(statusDetails.errorCode, 'ERR_FILE_COPY_FAILED');
                    cb();
                }, 
                fakeCallbackSucceeded
            );
            installHandler(job);
            sinon.assert.notCalled(fakeCallbackInProgress);
            assert(fakeCallbackFailed.calledOnce);
            sinon.assert.notCalled(fakeCallbackSucceeded);
        }); 

        it("missing url in file in files calls failed callback, rolls back", function(done) { 
            fs.reset();
            fs.writeFileSync('/testFileName.txt', 'This is a test.');
            fakeCallbackInProgress.reset();
            fakeCallbackFailed.reset();
            fakeCallbackSucceeded.reset();
            var job = buildJobObject('install', { status: 'QUEUED' }, { 
                    packageName: 'testPackageName', workingDirectory: tempDir, 
                    files: [ { fileName: 'testFileName.txt' } ] }, 
                function(statusDetails, cb) {
                    fakeCallbackInProgress();
                    console.log(statusDetails);
                    cb();
                }, 
                function(statusDetails, cb) {
                    console.log(statusDetails);
                    cb();
                    assert(fakeCallbackInProgress.calledThrice);
                    sinon.assert.notCalled(fakeCallbackSucceeded);
                    done();
                }, 
                fakeCallbackSucceeded
            );
            installHandler(job);
        }); 

        it("invalid url in file in files calls failed callback, rolls back", function(done) { 
            fs.reset();
            fs.writeFileSync('/testFileName.txt', 'This is a test.');
            fakeCallbackInProgress.reset();
            fakeCallbackFailed.reset();
            fakeCallbackSucceeded.reset();
            var job = buildJobObject('install', { status: 'QUEUED' }, { 
                    packageName: 'testPackageName', workingDirectory: tempDir, 
                    files: [ { fileName: 'testFileName.txt', fileSource: { url: 'https://bogus.not.a.url' } } ] }, 
                function(statusDetails, cb) {
                    fakeCallbackInProgress();
                    console.log(statusDetails);
                    cb();
                }, 
                function(statusDetails, cb) {
                    console.log(statusDetails);
                    cb();
                    assert(fakeCallbackInProgress.calledThrice);
                    sinon.assert.notCalled(fakeCallbackSucceeded);
                    done();
                }, 
                fakeCallbackSucceeded
            );
            installHandler(job);
        }); 

        it("valid url, calls succeed callback", function(done) { 
            fs.reset();
            fs.writeFileSync('/testFileName.txt', 'This is a test.');
            fs.writeFileSync('/testNewFile.txt', 'This is an updated test.');
            fakeCallbackInProgress.reset();
            fakeCallbackFailed.reset();
            fakeCallbackSucceeded.reset();
            var job = buildJobObject('install', { status: 'QUEUED' }, { 
                    packageName: 'testPackageName', workingDirectory: tempDir, 
                    files: [ { fileName: 'testFileName.txt', fileSource: { url: 'file:///testNewFile.txt' } } ] }, 
                function(statusDetails, cb) {
                    fakeCallbackInProgress();
                    console.log(statusDetails);
                    cb();
                }, 
                fakeCallbackFailed, 
                function(statusDetails, cb) {
                    console.log(statusDetails);
                    cb();
                    assert(fakeCallbackInProgress.calledTwice);
                    sinon.assert.notCalled(fakeCallbackFailed);
                    assert(fs.readFileSync('/testFileName.txt').toString() === 'This is an updated test.');
                    done();
                }
            );
            installHandler(job);
        }); 

        it("valid signature, valid cert, valid file, called succeeded callback", function(done) {
            fs.reset();
            fs.writeFileSync('/testNewFile.txt', '0123456789');
            fs.writeFileSync('/codeSignCert.pem', codeSignCertValid);

            fakeCallbackInProgress.reset();
            fakeCallbackFailed.reset();
            fakeCallbackSucceeded.reset();
            var job = buildJobObject('install', { status: 'QUEUED' }, {
                    packageName: 'testPackageName', workingDirectory: tempDir,
                    files: [ { fileName: 'testFileName.txt', fileSource: { url: 'file:///testNewFile.txt' },
                    signature: { codesign: { rawPayloadSize: 10, signatureAlgorithm: 'SHA256withECDSA',
                                 signature: 'MEUCIQD8asLn+RmOqjD8YgUhNR/gobfvbN5av0J0jOvDQAWOLgIgGIERU0FKmrL3Es1P1dOCcovfjGUUuGb8KHSc8+D4380='} } } ] },
                function(statusDetails, cb) {
                    fakeCallbackInProgress();
                    console.log(statusDetails);
                    cb();
                },
                fakeCallbackFailed,
                function(statusDetails, cb) {
                    console.log(statusDetails);
                    cb();
                    assert(fakeCallbackInProgress.calledOnce);
                    sinon.assert.notCalled(fakeCallbackFailed);
                    assert(fs.readFileSync('/testFileName.txt').toString() === '0123456789');
                    done();
                }
            );
            installHandler(job);
        });

        it("valid signature, valid cert, bad file, called failed callback", function(done) {
            fs.reset();
            fs.writeFileSync('/testNewFile.txt', 'invalid');
            fs.writeFileSync('/codeSignCert.pem', codeSignCertValid);

            fakeCallbackInProgress.reset();
            fakeCallbackFailed.reset();
            fakeCallbackSucceeded.reset();
            var job = buildJobObject('install', { status: 'QUEUED' }, {
                    packageName: 'testPackageName', workingDirectory: tempDir,
                    files: [ { fileName: 'testFileName.txt', fileSource: { url: 'file:///testNewFile.txt' },
                    signature: { codesign: { rawPayloadSize: 10, signatureAlgorithm: 'SHA256withECDSA',
                                 signature: 'MEUCIQD8asLn+RmOqjD8YgUhNR/gobfvbN5av0J0jOvDQAWOLgIgGIERU0FKmrL3Es1P1dOCcovfjGUUuGb8KHSc8+D4380='} } } ] },
                function(statusDetails, cb) {
                    fakeCallbackInProgress();
                    console.log(statusDetails);
                    cb();
                },
                function(statusDetails, cb) {
                    console.log(statusDetails);
                    cb();
                    assert(fakeCallbackInProgress.calledOnce);
                    sinon.assert.notCalled(fakeCallbackSucceeded);
                    assert(fs.readFileSync('/testFileName.txt').toString() === 'invalid');
                    done();
                },
                fakeCallbackSucceeded
            );
            installHandler(job);
        });

        it("valid signature, invalid cert, valid file, called failed callback", function(done) {
            fs.reset();
            fs.writeFileSync('/testNewFile.txt', '0123456789');
            fs.writeFileSync('/codeSignCert.pem', codeSignCertInvalid);

            fakeCallbackInProgress.reset();
            fakeCallbackFailed.reset();
            fakeCallbackSucceeded.reset();
            var job = buildJobObject('install', { status: 'QUEUED' }, {
                    packageName: 'testPackageName', workingDirectory: tempDir,
                    files: [ { fileName: 'testFileName.txt', fileSource: { url: 'file:///testNewFile.txt' },
                    signature: { codesign: { rawPayloadSize: 10, signatureAlgorithm: 'SHA256withECDSA',
                                 signature: 'MEUCIQD8asLn+RmOqjD8YgUhNR/gobfvbN5av0J0jOvDQAWOLgIgGIERU0FKmrL3Es1P1dOCcovfjGUUuGb8KHSc8+D4380='} } } ] },
                function(statusDetails, cb) {
                    fakeCallbackInProgress();
                    console.log(statusDetails);
                    cb();
                },
                function(statusDetails, cb) {
                    console.log(statusDetails);
                    cb();
                    assert(fakeCallbackInProgress.calledOnce);
                    sinon.assert.notCalled(fakeCallbackSucceeded);
                    assert(fs.readFileSync('/testFileName.txt').toString() === '0123456789');
                    done();
                },
                fakeCallbackSucceeded
            );
            installHandler(job);
        });

        it("invalid signature, valid cert, valid file, called failed callback", function(done) {
            fs.reset();
            fs.writeFileSync('/testNewFile.txt', '0123456789');
            fs.writeFileSync('/codeSignCert.pem', codeSignCertValid);

            fakeCallbackInProgress.reset();
            fakeCallbackFailed.reset();
            fakeCallbackSucceeded.reset();
            var job = buildJobObject('install', { status: 'QUEUED' }, {
                    packageName: 'testPackageName', workingDirectory: tempDir,
                    files: [ { fileName: 'testFileName.txt', fileSource: { url: 'file:///testNewFile.txt' },
                    signature: { codesign: { rawPayloadSize: 10, signatureAlgorithm: 'SHA256withECDSA',
                                 signature: 'MEUCIQD8asLn+RmOqjD8YgUhINVALIDvbN5av0J0jOvDQAWOLgIgGIERU0FKmrL3Es1P1dOCcovfjGUUuGb8KHSc8+D4380='} } } ] },
                function(statusDetails, cb) {
                    fakeCallbackInProgress();
                    console.log(statusDetails);
                    cb();
                },
                function(statusDetails, cb) {
                    console.log(statusDetails);
                    cb();
                    assert(fakeCallbackInProgress.calledOnce);
                    sinon.assert.notCalled(fakeCallbackSucceeded);
                    assert(fs.readFileSync('/testFileName.txt').toString() === '0123456789');
                    done();
                },
                fakeCallbackSucceeded
            );
            installHandler(job);
        });

        it("valid url, invalid checksum hash algorithm, called failed callback", function(done) { 
            fs.reset();
            fs.writeFileSync('/testFileName.txt', 'This is a test.');
            fs.writeFileSync('/testNewFile.txt', 'This is an updated test.');
            fakeCallbackInProgress.reset();
            fakeCallbackFailed.reset();
            fakeCallbackSucceeded.reset();
            var job = buildJobObject('install', { status: 'QUEUED' }, { 
                    packageName: 'testPackageName', workingDirectory: tempDir, 
                    files: [ { fileName: 'testFileName.txt', fileSource: { url: 'file:///testNewFile.txt' },
                    checksum: { inline: { value: '1234567890' }, hashAlgorithm: 'invalid' } } ] }, 
                function(statusDetails, cb) {
                    fakeCallbackInProgress();
                    console.log(statusDetails);
                    cb();
                }, 
                function(statusDetails, cb) {
                    console.log(statusDetails);
                    cb();
                    assert(fakeCallbackInProgress.calledThrice);
                    sinon.assert.notCalled(fakeCallbackSucceeded);
                    assert(fs.readFileSync('/testFileName.txt').toString() === 'This is a test.');
                    done();
                },
                fakeCallbackSucceeded
            );
            installHandler(job);
        }); 

        it("valid url, invalid checksum value, called failed callback", function(done) { 
            fs.reset();
            fs.writeFileSync('/testFileName.txt', 'This is a test.');
            fs.writeFileSync('/testNewFile.txt', 'This is an updated test.');
            fakeCallbackInProgress.reset();
            fakeCallbackFailed.reset();
            fakeCallbackSucceeded.reset();
            var job = buildJobObject('install', { status: 'QUEUED' }, { 
                    packageName: 'testPackageName', workingDirectory: tempDir, 
                    files: [ { fileName: 'testFileName.txt', fileSource: { url: 'file:///testNewFile.txt' },
                    checksum: { inline: { value: '1234567890' }, hashAlgorithm: 'md5' } } ] }, 
                function(statusDetails, cb) {
                    fakeCallbackInProgress();
                    console.log(statusDetails);
                    cb();
                }, 
                function(statusDetails, cb) {
                    console.log(statusDetails);
                    cb();
                    assert(fakeCallbackInProgress.calledThrice);
                    sinon.assert.notCalled(fakeCallbackSucceeded);
                    assert(fs.readFileSync('/testFileName.txt').toString() === 'This is a test.');
                    done();
                },
                fakeCallbackSucceeded
            );
            installHandler(job);
        }); 

        it("valid url, valid checksum value, called succeeded callback", function(done) {
            fs.reset();
            fs.writeFileSync('/testFileName.txt', 'This is a test.');
            fs.writeFileSync('/testNewFile.txt', 'This is an updated test.');
            fakeCallbackInProgress.reset();
            fakeCallbackFailed.reset();
            fakeCallbackSucceeded.reset();
            var job = buildJobObject('install', { status: 'QUEUED' }, { 
                    packageName: 'testPackageName', workingDirectory: tempDir, 
                    files: [ { fileName: 'testFileName.txt', fileSource: { url: 'file:///testNewFile.txt' },
                    checksum: { inline: { value: 'f51ecee397f3a4247c4e927ee9dad03b' }, hashAlgorithm: 'md5' } } ] }, 
                function(statusDetails, cb) {
                    fakeCallbackInProgress();
                    console.log(statusDetails);
                    cb();
                }, 
                fakeCallbackFailed,
                function(statusDetails, cb) {
                    console.log(statusDetails);
                    cb();
                    assert(fakeCallbackInProgress.calledTwice);
                    sinon.assert.notCalled(fakeCallbackFailed);
                    assert(fs.readFileSync('/testFileName.txt').toString() === 'This is an updated test.');
                    done();
                }
            );
            installHandler(job);
        }); 

        it("multiple file download, fails checksum on second file, both files rolled back, called failed callback", function(done) { 
            fs.reset();
            fs.writeFileSync('/testFileName1.txt', 'This is a test 1.');
            fs.writeFileSync('/testNewFile1.txt', 'This is an updated test 1.');
            fs.writeFileSync('/testFileName2.txt', 'This is a test 2.');
            fs.writeFileSync('/testNewFile2.txt', 'This is an updated test 2.');
            fakeCallbackInProgress.reset();
            fakeCallbackFailed.reset();
            fakeCallbackSucceeded.reset();
            var job = buildJobObject('install', { status: 'QUEUED' }, { 
                    packageName: 'testPackageName', workingDirectory: tempDir, 
                    files: [ { fileName: 'testFileName1.txt', fileSource: { url: 'file:///testNewFile1.txt' } },
                    { fileName: 'testFileName2.txt', fileSource: { url: 'file:///testNewFile2.txt' },
                    checksum: { inline: { value: 'notavalidchecksum' }, hashAlgorithm: 'md5' } } ] }, 
                function(statusDetails, cb) {
                    fakeCallbackInProgress();
                    console.log(statusDetails);
                    cb();
                }, 
                function(statusDetails, cb) {
                    console.log(statusDetails);
                    cb();
                    assert(fakeCallbackInProgress.callCount === 6);
                    sinon.assert.notCalled(fakeCallbackSucceeded);
                    assert(fs.readFileSync('/testFileName1.txt').toString() === 'This is a test 1.');
                    assert(fs.readFileSync('/testFileName2.txt').toString() === 'This is a test 2.');
                    done();
                },
                fakeCallbackSucceeded
            );
            installHandler(job);
        }); 

        it("multiple file download, called succeeded callback", function(done) {
            fs.reset();
            fs.writeFileSync('/testFileName1.txt', 'This is a test 1.');
            fs.writeFileSync('/testNewFile1.txt', 'This is an updated test 1.');
            fs.writeFileSync('/testFileName2.txt', 'This is a test 2.');
            fs.writeFileSync('/testNewFile2.txt', 'This is an updated test 2.');
            fakeCallbackInProgress.reset();
            fakeCallbackFailed.reset();
            fakeCallbackSucceeded.reset();
            var job = buildJobObject('install', { status: 'QUEUED' }, { 
                    packageName: 'testPackageName', workingDirectory: tempDir, 
                    files: [ { fileName: 'testFileName1.txt', fileSource: { url: 'file:///testNewFile1.txt' } },
                    { fileName: 'testFileName2.txt', fileSource: { url: 'file:///testNewFile2.txt' },
                    checksum: { inline: { value: '074a905b4855d78cb883a46191189f0e' }, hashAlgorithm: 'md5' } } ] }, 
                function(statusDetails, cb) {
                    fakeCallbackInProgress();
                    console.log(statusDetails);
                    cb();
                },
                fakeCallbackFailed, 
                function(statusDetails, cb) {
                    console.log(statusDetails);
                    cb();
                    assert(fakeCallbackInProgress.callCount === 4);
                    sinon.assert.notCalled(fakeCallbackFailed);
                    assert(fs.readFileSync('/testFileName1.txt').toString() === 'This is an updated test 1.');
                    assert(fs.readFileSync('/testFileName2.txt').toString() === 'This is an updated test 2.');
                    done();
                }
            );
            installHandler(job);
        }); 

        it("valid url to invalid program file, calls failed callback", function(done) { 
            fs.reset();
            fs.writeFileSync('/program.js', 'previous program version');
            fs.writeFileSync('/badNewProgram.js', 'this is an invalid node program to install');
            fakeCallbackInProgress.reset();
            fakeCallbackFailed.reset();
            fakeCallbackSucceeded.reset();
            var job = buildJobObject('install', { status: 'QUEUED' }, { 
                    packageName: 'testPackageName', workingDirectory: tempDir,
                    launchCommand: 'node -e "this is an invalid node program to install"', autoStart: true,
                    files: [ { fileName: 'program.js', fileSource: { url: 'file:///badNewProgram.js' } } ] }, 
                function(statusDetails, cb) {
                    fakeCallbackInProgress();
                    cb();
                }, 
                function(statusDetails, cb) {
                    cb();
                    assert(fakeCallbackInProgress.callCount === 4);
                    sinon.assert.notCalled(fakeCallbackSucceeded);
                    assert(fs.readFileSync('/program.js').toString() === 'previous program version');
                    assert(fs.readFileSync('/badNewProgram.js').toString() === 'this is an invalid node program to install');
                    done();
                },
                fakeCallbackSucceeded
            );
            installHandler(job);
        }); 

        it("valid url to valid program file, calls inProgress callback", function(done) { 
            fs.reset();
            fs.writeFileSync('/program.js', 'previous program version');
            fs.writeFileSync('/newProgram.js', 'function done() {}; setTimeout(done, 3000);');
            fakeCallbackInProgress.reset();
            fakeCallbackFailed.reset();
            fakeCallbackSucceeded.reset();
            var job = buildJobObject('install', { status: 'QUEUED' }, { 
                    packageName: 'testPackageName', workingDirectory: tempDir,
                    launchCommand: 'node -e "function done() {}; setTimeout(done, 3000);"', autoStart: true,
                    files: [ { fileName: 'program.js', fileSource: { url: 'file:///newProgram.js' } } ] }, 
                function(statusDetails, cb) {
                    fakeCallbackInProgress();
                    console.log(statusDetails);
                    cb();
                    if (statusDetails.step === 'restarting package') {
                        assert(fakeCallbackInProgress.callCount === 3);
                        assert(fs.readFileSync('/program.js').toString() === 'function done() {}; setTimeout(done, 3000);');
                        done();
                    }
                }, 
                fakeCallbackFailed,
                fakeCallbackSucceeded
            );
            installHandler(job);
        });
    });
});
