var cube_config={};
cube_config['cube-host']="localhost";
cube_config['http-port']=1080;

var cube = require("../../"),
    server = cube.server(cube_config),
    tcp=require("../../lib/cube/tcp-transport"),
    http=require("http"),
    WebSocket=require("ws");
var log={};
log.debug=console.log;
log.verbose=console.log;
var CubeSocket=function(path, closeOnSend) {

    var cubeSocket={

        send: function(msg, callback){

            var url="ws://"+cube_config['cube-host']+":"+cube_config['http-port']+path;//"/1.0/event/put"
            log.debug("Url is ", url);
            var socket=new WebSocket(url);
            socket.onopen=function(){

                socket.send(JSON.stringify(msg));

                if(closeOnSend) socket.close();
            };

            socket.onmessage=function(message){
                if(message.data==null){
                    log.debug("No more events found from ", path, " for request: ", msg);
                    if(message.stop){
                        log.debug("Closing socket since last message has been received and streaming is disabled for this query");
                        socket.close();
                    }
                } else{
                    log.verbose("Received response from "+path+" for request: ", msg, "\n Response: ", message.data);
                }
                var parsed=JSON.parse(message.data);
                callback(null, parsed);
            };
            socket.onerror=function(error){
                log.debug("Socket error on socket: ",path, error);
            };
            return socket;
        }
    };
    return cubeSocket;
}

var querySocket=CubeSocket("/1.0/analitix/get");


server.register = function(db, endpoints) {
  cube.collector.register(db, endpoints);
  cube.evaluator.register(db, endpoints);

};
console.log("Starting cube daemon...");
server.start();
console.log("Cube daemon launched");

var test=function(){
   var now=new Date();
   var limit=10000;
   var channel1="1/1/1";
   var channel2="1/1/2";

   var query1={start: now, limit: limit, channel: channel1};
   var query2={start: now, limit: limit, channels: channel2};
    console.log("Sending query 1: ", query1);
    querySocket.send(query1, function(err, event){
        if(err) console.log("ERROR IN QUERY 1", err, err.stack);
        else console.log("Received event for query 1", event);
    });
    querySocket.send(query2, function(err, event){
        if(err) console.log("ERROR IN QUERY 2", err, err.stack);
        else console.log("Received event for query 2", event);
    });


};
setTimeout(test
, 1000);



