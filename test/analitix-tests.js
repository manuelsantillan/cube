var options = require("./cube-config"),
    cube = require("../"),
    server = cube.server(options),
    tcp=require("./tcp-transport"),
    http=require("http");


server.register = function(db, endpoints) {
  cube.collector.register(db, endpoints);
  cube.evaluator.register(db, endpoints);

};
console.log("Starting cube daemon...");
server.start();
console.log("Cube daemon launched");
setTimeout(function(){
    var host={host:"localhost", port: 1180};
    var msg=
        {type: 'tests', data: {
            header: { id:1, sampleRate: 2, timestamp: new Date()}, samples: [1,2,3,4]}};
    var ts=
    {
        header: { id:1, sampleRate: 2, timestamp: new Date()}, samples: [1,2,3,4]};

    tcp.send(host, msg);
    var queryString=encodeURI("?expression=tests(header,samples)&start="+new Date("01/01/2012")+"&stop="+new Date());
    var path="/1.0/event"+queryString;

        setTimeout(function(){
        http.request({
            host: "localhost",
            port: 1080,
            path: "/1.0/analitix"+queryString,
            method: "GET",
            headers: {
                "Content-Type": "application/json"
            }
        }, function(response) {
            console.log(path, response.statusCode);
            response.on("data", function(data){console.log("response data", data.toString())});
        }).on("error", function(e) {
                console.log(e.message);
            }).on("data", function(data){
                console.log("result data: ", data);
            }).end();

    });

}, 1000);



