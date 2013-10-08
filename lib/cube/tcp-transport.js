var net = require('net');
var _=require("underscore");

var endbuf=new Buffer(1);
var connpool={};
var listeners={};
var msgbuffers={};



/**
 *
 * * Configures both server and client to receive messages.
 * It:
 * 1. Sets keepalive to the connection
 * 2. On data, buffers the received data and checks if a new message has been received (by looking for the escape char).
 * 3. On end, tries to emit a message with the buffered data. This means that
 * if the connection is closed, the escape char 0xFF is not needed, so a simple client
 * can just open the connection and send the JSON without escape char if it creates a new conn for each message.
 *
 * @param conn the connection to configure
 * @param host the host it belongs to.
 */
var configureConnection=function(conn, host){
    conn.setKeepAlive(true, 100000); //100 seconds
    conn.on("data", function(binarydata){
        console.log("data received (bytes)", binarydata.length);
        dataReceivedProcessor(host, binarydata);
    });
    conn.on("end", function(){
        console.log("connection ended. Dispatching pending message...");
        dataReceivedProcessor(host);
        //we delete the connection and buffer but not the listeners.
        delete  connpool[host.host+":"+host.port];
        delete   msgbuffers[host.host+":"+host.port];
    });
    conn.on("error", function(error){
       console.log("error in connection to host", host, error.stack);
        delete  connpool[host.host+":"+host.port];
        delete   msgbuffers[host.host+":"+host.port];

    });

    connpool[host.host+":"+host.port]=conn;
    msgbuffers[host.host+":"+host.port]=[];

};
/**
 * Processes a chunk of data. It checks for the end char, and emits a message if found.
 * Otherwise it buffers it.
 * @param host
 * @param buffer
 */
var dataReceivedProcessor=function(host, chunk){
    var buffer=msgbuffers[host.host+":"+host.port];
    if(!chunk){
        //if it looks like well-formed JSON, lets try to send it
        emitMsg(host);
        return;
    }
    for(var i=0;i<chunk.length;i++){
        if(chunk[i]==exports.endchar){
            emitMsg(host);
            buffer=msgbuffers[host.host+":"+host.port]=[];
        } else buffer.push(String.fromCharCode(chunk[i]));
    }
};

/**
 * Notifies listeners
 * @param host
 */
var emitMsg=function(host){
    var msg;
    var maybeRemoveEndChar=function(buffer){
        var lastByte=buffer[buffer.length-1];
        if(lastByte==exports.endchar){
            return buffer.slice(0, buffer.length-1);
        } else return buffer;
    };

    var buffer=msgbuffers[host.host+":"+host.port];
    console.log("number of bytes received for this message: ", buffer.length);
    if(buffer.length>0){
        try{
            var binary=maybeRemoveEndChar(buffer);
            var string=binary.join("");


            console.log("String message: ", string);
            var msg=JSON.parse(string);
        } catch(error){
            console.error("error", error.stack);
            console.log("binary", binary);
            console.log("string", string);
        } finally{
            //clear buffer array
            console.log("Clearing buffer");
            msgbuffers[host.host+":"+host.port]=[];
        }
    }
    var hostlisteners=listeners[host.host+":"+host.port];
    if(!msg) console.log("no message to dispatch");
    if(msg && !hostlisteners) console.log("pending message not delivered (no listeners)", host, msg);
    if(hostlisteners && msg){
        if(hostlisteners.length==0) console.log("pending message not delivered (no listeners)", host, msg);
        _.each(hostlisteners, function(listener){
            console.log("Found listener. dispatching message from host", host, msg);
            listener(msg, host);
        });
    }
};

//module API

//sends a message to the defined host
exports.send=function(host, json){
    var conn=connpool[host.host+":"+host.port];
    var sendMsg=function(conn){
        var msg=JSON.stringify(json);
        var buf=new Buffer(msg);
        buf=Buffer.concat([buf, endbuf]);
        conn.write(buf);
    };
    if(!conn){
        conn=net.connect(host, function(){
            sendMsg(conn);
        });
        configureConnection(conn, host);
    } else {
        sendMsg(conn);
    }
};

//register a listener. The transport will notify the listener on incoming messages from host
exports.onmsg=function(host, listener){
    var hostlisteners=listeners[host.host+":"+host.port];
    if(!hostlisteners){
        listeners[host.host+":"+host.port]=[];
    }
    listeners[host.host+":"+host.port].push(listener);
};

/**
 * Starts a server and notifies callback function of incoming connections so that a listener
 *can be registered for that connection.
 * @param port
 * @param onconnection callback function called on new incoming connection
 * Sample usage:
 *
 var tcp = require('../lib/tcp-transport');

 tcp.listen(3000, function(host){//on connection register listener
    tcp.onmsg(host, function(msg, host){//on message process
        console.log("SERVER: received message from host:", host, msg);
    });

});

 */
exports.listen=function(port, onconnection){
    var server = net.createServer(function(conn) { //'connection' listener
        console.log('server connected');
        var host={host: conn.remoteAddress, port: conn.remotePort};
        configureConnection(conn, host);

        onconnection(host);
    });
    server.listen(port, function() { //'listening' listener
        console.log('server listening for tcp connections on port ', port);
    });

};
//TODO: possibly change to EOT -> 0x04 or to ETX -> 0x03
exports.endchar=0xFF;
/**
 * Just-in-case a user wants to change the end char
 * @param endChar
 */
exports.setEndChar=function(endChar){
    exports.endchar=endChar;
    endbuf[0]=endChar;
};
exports.setEndChar(0xFF);

