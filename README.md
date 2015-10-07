![aws-iot-thing-sdk.js](./IoT.png)
=======

The aws-iot-thing-sdk.js package allows developers to write JavaScript 
applications which participate in the AWS IoT service; it is intended for 
use in embedded devices which support Node.js, but it can be used in other 
Node.js environments as well.

* [Installation](#install)
* [Background](#background)
* [Examples](#examples)
* [API](#api)
* [Example Programs](#programs)
* [License](#license)

<a name="install"></a>
## Installation

```sh
npm install aws-iot-thing-sdk
```
<a name="background"></a>
## Background

This package is built on top of mqtt.js and provides two classes: 'device'
and 'thingShadow'.  The 'device' class loosely wraps mqtt.js to provide a
secure connection to the AWS IoT service and expose the mqtt.js interfaces
upward via an instance of the mqtt client.  The 'thingShadow' class implements 
additional functionality for accessing thing shadows via the AWS IoT 
API; the thingShadow class allows devices to update, be notified of changes to,
get the current state of, or delete thing shadows from the service.  Thing
shadows allow applications and devices to collaborate via the AWS IoT service.
For example, a remote device can update its thing shadow in AWS IoT, allowing
a user to view the device's last reported state via a mobile app.  The user
can also update the device's thing shadow in AWS IoT and the remote device 
will synchronize with the new state.  The 'thingShadow' class supports multiple 
thing shadows per mqtt connection and allows pass-through of non-thing-shadow
topics and mqtt events.

<a name="examples"></a>
## Examples

### Device Class
```js
var awsIot = require('aws-iot-thing-sdk');

var device = awsIot.device({
   keyPath: '~/awsCerts/privkey.pem',
  certPath: '~/awsCerts/cert.pem',
    caPath: '~/awsCerts/ca.crt',
  clientId: 'myAwsClientId',
    region: 'us-east-1'
});

//
// Device is an instance returned by mqtt.Client(), see mqtt.js for full
// documentation.
//
device
  .on('connect', function() {
    console.log('connect');
    device.subscribe('topic_1');
    device.publish('topic_2', JSON.stringify({ test_data: 1}));
    });

device
  .on('message', function(topic, payload) {
    console.log('message', topic, payload.toString());
  });
```
### Thing Shadow Class
```js
var awsIot = require('aws-iot-thing-sdk');

var thingShadows = awsIot.thingShadow({
   keyPath: '~/awsCerts/privkey.pem',
  certPath: '~/awsCerts/cert.pem',
    caPath: '~/awsCerts/ca.crt',
  clientId: 'myAwsClientId',
    region: 'us-east-1'
});

//
// Thing shadow state
//
var rgbLedLampState = {"state":{"desired":{"red":187,"green":114,"blue":222}}};

//
// Client token value returned from thingShadows.update() operation
//
var clientTokenUpdate;

thingShadows.on('connect', function() {
//
// After connecting to the AWS IoT service, register interest in the
// thing shadow named 'RGBLedLamp'.
//
    thingShadows.register( 'RGBLedLamp' );

//
// Update the thing shadow named 'RGBLedLamp' with the latest device state;
// save the clientToken so that we can correlate it with status or timeout
// events.
//
    clientTokenUpdate = thingShadows.update('RGBLedLamp', rgbLedLampState  );
    });

thingShadows.on('status', 
    function(thingName, stat, clientToken, stateObject) {
       console.log('received '+stat+' on '+thingName+': '+
                   JSON.stringify(stateObject));
    });

thingShadows.on('delta', 
    function(thingName, stateObject) {
       console.log('received delta '+' on '+thingName+': '+
                   JSON.stringify(stateObject));
    });

thingShadows.on('timeout',
    function(thingName, clientToken) {
       console.log('received timeout '+' on '+operation+': '+
                   clientToken);
    });
```

<a name="api"></a>
## API

  * <a href="#device"><code>awsIot.<b>device()</b></code></a>
  * <a href="#thingShadow"><code>awsIot.<b>thingShadow()</b></code></a>
  * <a href="#register"><code>awsIot.thingShadow#<b>register()</b></code></a>
  * <a href="#unregister"><code>awsIot.thingShadow#<b>unregister()</b></code></a>
  * <a href="#update"><code>awsIot.thingShadow#<b>update()</b></code></a>
  * <a href="#get"><code>awsIot.thingShadow#<b>get()</b></code></a>
  * <a href="#delete"><code>awsIot.thingShadow#<b>delete()</b></code></a>
  * <a href="#publish"><code>awsIot.thingShadow#<b>publish()</b></code></a>
  * <a href="#subscribe"><code>awsIot.thingShadow#<b>subscribe()</b></code></a>
  * <a href="#unsubscribe"><code>awsIot.thingShadow#<b>unsubscribe()</b></code></a>

-------------------------------------------------------
<a name="device"></a>
### awsIot.device(options)

Returns an instance of the [mqtt.Client()](https://github.com/mqttjs/MQTT.js/blob/master/README.md#client) 
class, configured for a TLS connection with the AWS IoT service and with 
arguments as specified in `options`.  The awsIot-specific arguments are as 
follows:

  * `region`: the AWS IoT region you will operate in (default 'us-east-1')
  * `clientId`: the client ID you will use to connect to AWS IoT
  * `certPath`: path of the client certificate associated with your AWS account
  * `keyPath`: path of the private key file for your client certificate
  * `caPath`: path of your CA certificate

`options` also contains arguments specific to mqtt.  See [the mqtt client documentation]
(https://github.com/mqttjs/MQTT.js/blob/master/README.md#client) for details 
of these arguments.

Supports all events emitted by the [mqtt.Client()](https://github.com/mqttjs/MQTT.js/blob/master/README.md#client) class.

-------------------------------------------------------
<a name="thingShadow"></a>
### awsIot.thingShadow(options)

The `thingShadow` class wraps an instance of the `device` class with additional
functionality to operate on thing shadows via the AWS IoT API.  The
arguments in `options` include all those in the [device class](#device), with 
the addition of the following arguments specific to the `thingShadow` class:

* `operationTimeout`: the timeout for thing operations (default 30 seconds)
* `postSubscribeTimeout`: the time to wait after subscribing to an operation's sub-topics prior to publishing on the operation's topic (default 2 seconds)

Supports all events emitted by the [mqtt.Client()](https://github.com/mqttjs/MQTT.js/blob/master/README.md#client) class; however, the semantics for the 
`message` event are slightly different and additional events are available
as described below:

### Event `'message'`

`function(topic, message) {}`

Emitted when a message is received on a topic not related to any thing shadows:
* `topic` topic of the received packet
* `message` payload of the received packet

### Event `'status'`

`function(thingName, stat, clientToken, stateObject) {}`

Emitted when an operation `update|get|delete` completes.
* `thingName` name of the thing shadow for which the operation has completed
* `stat` status of the operation `accepted|rejected`
* `clientToken` the operation's clientToken
* `stateObject` the stateObject returned for the operation

Applications can use clientToken values to correlate status events with the
operations that they are associated with by saving the clientTokens returned
from each operation.

### Event `'delta'`

`function(thingName, stateObject) {}`

Emitted when a delta has been received for a registered thing shadow.
* `thingName` name of the thing shadow that has received a delta
* `stateObject` the stateObject returned for the operation

### Event `'timeout'`

`function(thingName, clientToken) {}`

Emitted when an operation `update|get|delete` has timed out.
* `thingName` name of the thing shadow that has received a timeout
* `clientToken` the operation's clientToken

Applications can use clientToken values to correlate status events with the
operations that they are associated with by saving the clientTokens returned
from each operation.

-------------------------------------------------------
<a name="register"></a>
### awsIot.thingShadow#register(thingName, [options] )

Register interest in the thing shadow named `thingName`.  The thingShadow class will
subscribe to any applicable topics, and will fire events for the thing shadow
until [awsIot.thingShadow#unregister()](#unregister) is called with `thingName`.  `options`
can contain the following arguments to modify how this thing shadow is processed:

* `ignoreDeltas`: set to `true` to not subscribe to the `delta` sub-topic for this thing shadow; used in cases where the application is not interested in changes (e.g. update only.) (default `false`)
* `persistentSubscribe`: set to `false` to unsubscribe from all operation sub-topics while not performing an operation (default `true`)
* `discardStale`: set to `false` to allow receiving messages with old version numbers (default `true`)

The `persistentSubscribe` argument allows an application to get faster operation
responses at the expense of potentially receiving more irrelevant response
traffic (i.e., response traffic for other clients who have registered interest
in the same thing shadow).  When `persistentSubscribe` is set to `true` (the default),
`postSubscribeTimeout` is forced to 0 and the `thingShadow` class will publish
immediately on any update, get, or delete operation for this registered thing shadow.
When set to `false`, operation sub-topics are only subscribed to during the scope
of that operation; note that in this mode, update, get, and delete operations will 
be much slower; however, the application will be less likely to receive irrelevant
response traffic.

The `discardStale` argument allows applications to receive messages which have
obsolete version numbers.  This can happen when messages are received out-of-order;
applications which set this argument to `false` should use other methods to
determine how to treat the data (e.g. use a time stamp property to know how old/stale
it is).

-------------------------------------------------------
<a name="unregister"></a>
### awsIot.thingShadow#unregister(thingName)

Unregister interest in the thing shadow named `thingName`.  The thingShadow class
will unsubscribe from all applicable topics and no more events will be fired
for `thingName`.

-------------------------------------------------------
<a name="update"></a>
### awsIot.thingShadow#update(thingName, stateObject)

Update the thing shadow named `thingName` with the state specified in the 
JavaScript object `stateObject`.  `thingName` must have been previously 
registered
using [awsIot.thingShadow#register()](#register).  The thingShadow class will subscribe
to all applicable topics and publish `stateObject` on the <b>update</b> sub-topic.

This function returns a `clientToken`, which is a unique value associated with
the update operation.  When a 'status' or 'timeout' event is emitted, 
the `clientToken` will be supplied as one of the parameters, allowing the 
application to keep track of the status of each operation.  The caller may
create their own `clientToken` value; if `stateObject` contains a `clientToken`
property, that will be used rather than the internally generated value.  Note
that it should be of atomic type (i.e. numeric or string).

-------------------------------------------------------
<a name="get"></a>
### awsIot.thingShadow#get(thingName, [clientToken])

Get the current state of the thing shadow named `thingName`, which must have
been previously registered using [awsIot.thingShadow#register()](#register).  The 
thingShadow class will subscribe to all applicable topics and publish on the 
<b>get</b> sub-topic.

This function returns a `clientToken`, which is a unique value associated with
the get operation.  When a 'status or 'timeout' event is emitted, 
the `clientToken` will be supplied as one of the parameters, allowing the 
application to keep track of the status of each operation.  The caller may
supply their own `clientToken` value (optional); if supplied, the value of
`clientToken` will be used rather than the internally generated value.  Note
that this value should be of atomic type (i.e. numeric or string).

-------------------------------------------------------
<a name="delete"></a>
### awsIot.thingShadow#delete(thingName, [clientToken])

Delete the thing shadow named `thingName`, which must have been previously
registered using [awsIot.thingShadow#register()](#register).  The thingShadow class
will subscribe to all applicable topics and publish on the <b>delete</b>
sub-topic.

This function returns a `clientToken`, which is a unique value associated with
the delete operation.  When a 'status' or 'timeout' event is emitted, 
the `clientToken` will be supplied as one of the parameters, allowing the 
application to keep track of the status of each operation.  The caller may
supply their own `clientToken` value (optional); if supplied, the value of
`clientToken` will be used rather than the internally generated value.  Note
that this value should be of atomic type (i.e. numeric or string).

-------------------------------------------------------
<a name="publish"></a>
### awsIot.thingShadow#publish(topic, message, [options], [callback])

Identical to the [mqtt.Client#publish()](https://github.com/mqttjs/MQTT.js/blob/master/README.md#publish) 
method, with the restriction that the topic may not represent a thing shadow.
This method allows the user to publish messages to topics on the same connection
used to access thing shadows.

-------------------------------------------------------
<a name="subscribe"></a>
### awsIot.thingShadow#subscribe(topic, [options], [callback])

Identical to the [mqtt.Client#subscribe()](https://github.com/mqttjs/MQTT.js/blob/master/README.md#subscribe) 
method, with the restriction that the topic may not represent a thing shadow.
This method allows the user to subscribe to messages from topics on the same 
connection used to access thing shadows.

-------------------------------------------------------
<a name="unsubscribe"></a>
### awsIot.thingShadow#unsubscribe(topic, [options], [callback])

Identical to the [mqtt.Client#unsubscribe()](https://github.com/mqttjs/MQTT.js/blob/master/README.md#unsubscribe) 
method, with the restriction that the topic may not represent a thing shadow.
This method allows the user to unsubscribe from topics on the same 
used to access thing shadows.

<a name="programs"></a>
## Example Programs

This package includes two example programs which demonstrate usage of the APIs:
`examples/device-example.js` and `examples/thing-example.js`.  Both are
configured with command line parameters, and are designed to be run in pairs
(i.e., two copies of the same program run simultaneously and cooperate with
one another).  Run the example programs as follows:

```sh
#
# Each example runs as two processes, one using --test-mode=1 and the
# other using --test-mode=2
#
# DEVICE CLASS EXAMPLE PROGRAM
#
node ./examples/device-example.js -f=$CERTS_DIR -t 1 &

node ./examples/device-example.js -f=$CERTS_DIR -t 2 &

#
# THING SHADOW CLASS EXAMPLE PROGRAM
#
node ./examples/thing-example.js -f=$CERTS_DIR -t 1 &

node ./examples/thing-example.js -f=$CERTS_DIR -t 2 &
```

Environment variables and parameters in the above examples are as follows:
* `CERTS_DIR` location of the certificates and private keys, contains
    privkey.pem (the private key associated with your AWS IoT certificate), 
    cert.pem (your AWS IoT certificate), and aws-iot-rootCA.crt (the AWS 
    IoT root CA certificate).
* `-t` test mode, 1 to simulate mobile application or 2 to simulate device


<a name="license"></a>
## License

This SDK is distributed under the [Apache License, Version 2.0](http://www.apache.org/licenses/LICENSE-2.0), see LICENSE.txt and NOTICE.txt for more information.
