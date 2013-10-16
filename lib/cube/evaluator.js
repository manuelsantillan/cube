var endpoint = require("./endpoint"),
    url = require("url"),
    util = require("util");



// To avoid running out of memory, the GET endpoints have a maximum number of
// values they can return. If the limit is exceeded, only the most recent
// results are returned.
var limitMax = 1e4;

//
var headers = {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*"
};

exports.register = function(db, endpoints) {
    var event = require("./event").getter(db),
        metric = require("./metric").getter(db),
        types = require("./types").getter(db),
        analitix = require("./analitix").getter(db);


    //
    endpoints.ws.push(
        endpoint("/1.0/event/get", event),
        endpoint("/1.0/metric/get", metric),
        endpoint("/1.0/types/get", types),
        endpoint("/1.0/analitix/get", analitix)
    );

    //
    endpoints.http.push(
        endpoint("GET", "/1.0/event", eventGet),
        endpoint("GET", "/1.0/event/get", eventGet),
        endpoint("GET", "/1.0/metric", metricGet),
        endpoint("GET", "/1.0/metric/get", metricGet),
        endpoint("GET", "/1.0/types", typesGet),
        endpoint("GET", "/1.0/types/get", typesGet),
        endpoint("GET", "/1.0/analitix", analitixGet),
        endpoint("GET", "/1.0/analitix/get", analitixGet)
    );


    function analitixGet(request, response){
        request = url.parse(request.url, true).query;
        var data = {};
        data.count=0;
        data.channels=[];
        // Provide default start and stop times for recent events.
        // If the limit is not specified, or too big, use the maximum limit.
        var stream=false;
        if (!("stop" in request)) {request.stop = Date.now();stream=true}
        if (!("start" in request)) request.start = 0;
        //if()
        //if (!("channels" in request)) throw Illegal;

        if (!(request.limit <= limitMax)) request.limit = limitMax;
        //var expressions = cubeExpression(request.expression, request.channels);

        var res = {};
        if(request.expression){
            clouser(request, callback, null, request.expression);

        } else {
            _.each(request.channels.split(','), function(channelId){
                //data.count ++;
                //data.channels.push(channelId);
                request.channel=channelId;
                clouser(request, callback, channelId);
            })
        }


        function clouser(request, callback ,channelId, expression){
            var request = request;
            request.channel = channelId;
            request.expression = expression;
            var that = this;
            return analitix(request, callback);
        }

        function callback(err,d) {


            if (d == null){
                data.count--;
                if(data.count <=0){
                    var res = {};
                    _.each(data.channels, function (channelId){
                        res['CH'+channelId] = data['CH'+channelId];//.reverse();
                    });
                    response.writeHead(200, headers);
                    response.end(JSON.stringify(res));
                }

            }
            else{

                if(!data['CH'+d.body.metadata.id]){
                    data['CH'+d.body.metadata.id]=[];
                    data.channels.push(d.body.metadata.id);
                    data.count ++;
                }
                data['CH'+d.body.metadata.id].push(d);
            }

        }

    }
    function eventGet(request, response) {
        request = url.parse(request.url, true).query;

        var data = [];

        // Provide default start and stop times for recent events.
        // If the limit is not specified, or too big, use the maximum limit.
        if (!("stop" in request)) request.stop = Date.now();
        if (!("start" in request)) request.start = 0;
        if (!(+request.limit <= limitMax)) request.limit = limitMax;

        if (event(request, callback) < 0) {
            response.writeHead(400, headers);
            response.end(JSON.stringify(data[0]));
        } else {
            response.writeHead(200, headers);
        }

        function callback(d) {
            if (d == null) response.end(JSON.stringify(data));
            else data.push(d);
        }
    }

    function metricGet(request, response) {
        request = url.parse(request.url, true).query;

        var data = [],
            limit = +request.limit,
            step = +request.step;

        // Provide default start, stop and step times for recent metrics.
        // If the limit is not specified, or too big, use the maximum limit.
        if (!("step" in request)) request.step = step = 1e4;
        if (!("stop" in request)) request.stop = Math.floor(Date.now() / step) * step;
        if (!("start" in request)) request.start = 0;
        if (!(limit <= limitMax)) limit = limitMax;

        // If the time between start and stop is too long, then bring the start time
        // forward so that only the most recent results are returned. This is only
        // approximate in the case of months, but why would you want to return
        // exactly ten thousand months? Don't rely on exact limits!
        var start = new Date(request.start),
            stop = new Date(request.stop);
        if ((stop - start) / step > limit) request.start = new Date(stop - step * limit);

        if (metric(request, callback) < 0) {
            response.writeHead(400, headers);
            response.end(JSON.stringify(data[0]));
        } else {
            response.writeHead(200, headers);
        }

        function callback(d) {
            if (d.time >= stop) response.end(JSON.stringify(data.sort(chronological)));
            else data.push(d);
        }
    }

    function typesGet(request, response) {
        types(url.parse(request.url, true).query, function(data) {
            response.writeHead(200, headers);
            response.end(JSON.stringify(data));
        });
    }
    function cubeExpression(expression, channels){
// expression example --> samples(b,h).eq(b.m.id,'/1/1/1')
        var expressions=[];
        if(!expression){
            var newExpresion = "";
            _.each(channels , function(channel){
                var channelId= channel.split("/")[channel.split("/").length-1];
                newExpresion= "channel"+channelId+"(b,h).eq(b.m.id,'"+channel+"')";
                util.log(newExpresion);
                expressions.push(newExpresion);
            })
        }else{
            expressions.push(expression);
        }
        return expressions;

    }
};

function chronological(a, b) {
    return a.time - b.time;
}
