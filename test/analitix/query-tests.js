var options = require("../cube-config"),
    cube = require("../../"),
    database = cube.database;
server = cube.server(options),
    event = cube.event,
    analitix = cube.analitix,
    generator = require("./data_generator");
var cfg = {
    "mongo-host": "127.0.0.1",
    "mongo-port": 27017,
    "mongo-database": "analitix",
    "mongo-username": null,
    "mongo-password": null,
    "http-port": 1080,
    "udp-port": 1180,
    "cube-host": "localhost"
};

var dataEvents = [];
var evt=generator.sinEvent(1,1,10,10, "1_1_1_events");
dataEvents.push(evt);
console.log("original data:", evt.d.b.y);

var emit = function (event) {
    console.log("Simulating event emission. Event time ", event.time, " length: ", event.y.length, event.y);
};
//submuestreo
database.open(cfg, function (err, db) {
    //First, we find out how many samples are available
    var maxSamples = 3;
    //1. First we count the total samples

    db.collection("1_1_1_events").insert(dataEvents, function (err) {
        db.collection("1_1_1_events").aggregate(
            //  {$match: filter},
            {$group: { _id: null, sampleCount: { $sum: "$d.b.m.sC" } }},
            function (err, result) {
                if (result && result.length > 0) var sampleCount = result[0].sampleCount;
                //2. If we should downsample, we create a decimator
                if (sampleCount > maxSamples) {
                    var decimationFactor = Math.ceil(sampleCount / maxSamples);
                    console.log("decimation factor", decimationFactor);
                    console.log("sample count", sampleCount);
                }
                var nextSample = 1;

                var cursor = db.collection("1_1_1_events").find();//TODO add filter, options and so on

                //3. We iterate all the samples retrieving only the appropriate
                //We must take into account the sampling rates and the samplingGroups
                //Just one document per samplingGroup, calculating timestamps
                var samplingGroup;
                var emittedEvent = {};
                cursor.each(function (err, event) {
                    if (err) throw err;
                    if (!event) {
                        console.log("No more data to process");
                        emit(emittedEvent);
                    } else {

                        if (!emittedEvent.time) { //first event
                            console.log("Creating n")
                            samplingGroup = event.d.b.m.sG;
                            emittedEvent.time = event.t;
                            //TODO: fill metadata: samplingRate, originalSampleRate, ...
                            emittedEvent.y = [];

                        }
                        if (!samplingGroup == event.d.b.m.sG) {
                            emit(emittedEvent);
                            //new sampling group
                            emittedEvent = {};
                            emittedEvent.time = event.t;
                            //TODO: fill metadata: samplingRate, originalSampleRate, ...

                            emittedEvent.y = [];

                        }
                        var samples = event.d.b.y;
                        //4.a If no subsampling is needed, just return all
                        if (!decimationFactor) {
                            emittedEvent.y = emittedEvent.y.concat(event.d.b.y);
                        }
                        //4.b Else, return just the corresponding samples.
                        else {
                            while (nextSample < samples.length) {
                                emittedEvent.y.push(samples[nextSample - 1]);
                                nextSample += decimationFactor;
                            }
                            nextSample -= samples.length;
                        }
                    }
                });

            });

    });
});


//callback(event || error)
//lanzador generico de cube. NO PROBADO, SOLO IDEA!!
var test = function (method, request, callback) {
    database.open(cfg, function (err, db) {

        if (err) throw err;
        methods = {};
        methods.analitix_getter = analitix.getter(db);
        methods.analitix_putter = analitix.putter(db);
        methods.getter = event.getter(db);
        methods.putter = event.putter(db);
        //invoke the method
        methods[method](request, callback);
    });

};

test(
    "getter",   //the method
    {}, //the request
    function (data) {
        //process the response
        console.log(data);
    });




