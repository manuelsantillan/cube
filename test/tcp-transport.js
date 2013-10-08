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
        emitMsg(host);
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
var dataReceivedProcessor=function(host, buffer){
    //search for end_msg_char (0xFF)
    var found=false;
    for(var i=0;i<buffer.length;i++){
       if(buffer[i]==0xFF){
            found=true;
            var lastPart=buffer.slice(0, i); //slice(0,i) does not include byte number "i" which is 0xFF
           msgbuffers[host.host+":"+host.port].push(lastPart);
            emitMsg(host);
            if(i<buffer.length-1){
                //pending data from a new message should be stored...
                var newbuff=buffer.slice(i+1);
                msgbuffers[host.host+":"+host.port].push(newbuff);
            }
       }
    }
    if(!found) msgbuffers[host.host+":"+host.port].push(buffer);
};

/**
 * Notifies listeners
 * @param host
 */
var emitMsg=function(host){
    var msg;
    var maybeRemoveOxFF=function(buffer){
        var lastByte=buffer[buffer.length-1];
        if(lastByte==0xFF){
            return buffer.slice(0, buffer.length-1);
        } else return buffer;
    };

    var buff=msgbuffers[host.host+":"+host.port];
    console.log("number of datagrams received: ", buff.length);
    if(buff.length>0){
        try{
            var binary=maybeRemoveOxFF(Buffer.concat(buff));
            var string=binary.toString();
            var msg=JSON.parse(string);
        } catch(error){
            console.error("error", error.stack);
            console.log("binary", binary);
            console.log("string", string);
        } finally{
            //clear buffer array
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
    console.log("starting tcp transport listener on port", port);
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

