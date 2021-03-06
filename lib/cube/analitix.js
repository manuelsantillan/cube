// TODO include the event._id (and define a JSON encoding for ObjectId?)
// TODO allow the event time to change when updating (fix invalidation)

var mongodb = require("mongodb"),
    parser = require("./event-expression"),
    tiers = require("./tiers"),
    types = require("./types"),
    bisect = require("./bisect"),
    ObjectID = mongodb.ObjectID,
    msgDispatcher=require("./transformers/analitix_msg"),
    timeSeries=require("./transformers/analitix_time_series"),

    util = require("util");

var type_re = /^[a-z][a-zA-Z0-9_]+$/,
    invalidate = {$set: {i: true}},
    multi = {multi: true},
    metric_options = {capped: true, size: 1e7, autoIndexId: true};

// When streaming events, we should allow a delay for events to arrive, or else
// we risk skipping events that arrive after their event.time. This delay can be
// customized by specifying a `delay` property as part of the request.
var streamDelayDefault = 5000,
    streamInterval = 1000;

// How frequently to invalidate metrics after receiving events.
var invalidateInterval = 5000;

exports.putter = function(db) {
    channelCfgCache=require("./analitix/channels_cfg_cache").initCache(db);
    var collection = types(db),
        knownByType = {},
        eventsToSaveByType = {},
        timesToInvalidateByTierByType = {};

    function putter(request, callback) {

        // define transformer data for message type
        // timeSeris, event, alarms, configuration, etc
        var event={};
        var msgTransformer = msgDispatcher.initTransformer(request);

        event=msgTransformer.formatEvent(request);

        // PROCESS EVENT
        if(!msgTransformer.isSaveEnabled())return callback(null, null);

        if(request.time) event.time=request.time;
        if(request.id) event.id=request.id;


        // transform message to event

        var time = "time" in event ? new Date(request.time) : new Date(),
            type = event.type;
        if(!event.t)event.t=time;
        // Validate the date and type.
        if (!type_re.test(type)) {
            util.log("bad type: ", type);
            return callback({error: "invalid type"}), -1;
        }
        if (isNaN(time)) {
            util.log("bad time: ", time);
            return callback({error: "invalid time"}), -1;
        }

        var errors=msgTransformer.eventHasErrors(event);
        //add sampleCount
        //


        if ("id" in event) event._id = event.id;
        if(errors) {
            var errorMsg="Invalid time series event: "+ errors;
            return callback({error: errorMsg}), -1;
        }
        // If this is a known event type, save immediately.
        if (type in knownByType) return save(type, event);

        // If someone is already creating the event collection for this new type,
        // then append this event to the queue for later save.
        if (type in eventsToSaveByType) return eventsToSaveByType[type].push(event);

        // Otherwise, it's up to us to see if the collection exists, verify the
        // associated indexes, create the corresponding metrics collection, and save
        // any events that have queued up in the interim!

        // First add the new event to the queue.
        eventsToSaveByType[type] = [event];

        // If the events collection exists, then we assume the metrics & indexes do
        // too. Otherwise, we must create the required collections and indexes. Note
        // that if you want to customize the size of the capped metrics collection,
        // or add custom indexes, you can still do all that by hand.

        db.collectionNames(type + "_events", function(error, names) {
            var events = collection(type).events;
            if (names.length) return saveEvents();

            // Events are indexed by time.
            events.ensureIndex({"t": 1}, handle);

            // Create a capped collection for metrics. Three indexes are required: one
            // for finding metrics, one (_id) for updating, and one for invalidation.
            db.createCollection(type + "_metrics", metric_options, function(error, metrics) {
                handle(error);
                metrics.ensureIndex({"i": 1, "_id.e": 1, "_id.l": 1, "_id.t": 1}, handle);
                metrics.ensureIndex({"i": 1, "_id.l": 1, "_id.t": 1}, handle);
                saveEvents();
            });

            // Save any pending events to the new collection.
            function saveEvents() {
                knownByType[type] = true;
                eventsToSaveByType[type].forEach(function(event) { save(type, event); });
                delete eventsToSaveByType[type];
            }
        });
    }

    // Save the event of the specified type, and queue invalidation of any cached
    // metrics associated with this event type and time.
    //
    // We don't invalidate the events immediately. This would cause many redundant
    // updates when many events are received simultaneously. Also, having a short
    // delay between saving the event and invalidating the metrics reduces the
    // likelihood of a race condition between when the events are read by the
    // evaluator and when the newly-computed metrics are saved.
    function save(type, event) {
        collection(type).events.save(event, handle);
        queueInvalidation(type, event);
    }

    // Schedule deferred invalidation of metrics for this type.
    // For each type and tier, track the metric times to invalidate.
    // The times are kept in sorted order for bisection.
    function queueInvalidation(type, event) {
        var timesToInvalidateByTier = timesToInvalidateByTierByType[type],
            time = event.t;
        if (timesToInvalidateByTier) {
            for (var tier in tiers) {
                var tierTimes = timesToInvalidateByTier[tier],
                    tierTime = tiers[tier].floor(time),
                    i = bisect(tierTimes, tierTime);
                if (i >= tierTimes.length) tierTimes.push(tierTime);
                else if (tierTimes[i] > tierTime) tierTimes.splice(i, 0, tierTime);
            }
        } else {
            timesToInvalidateByTier = timesToInvalidateByTierByType[type] = {};
            for (var tier in tiers) {
                timesToInvalidateByTier[tier] = [tiers[tier].floor(time)];
            }
        }
    }

    // Process any deferred metric invalidations, flushing the queues. Note that
    // the queue (timesToInvalidateByTierByType) is copied-on-write, so while the
    // previous batch of events are being invalidated, new events can arrive.
    setInterval(function() {
        for (var type in timesToInvalidateByTierByType) {
            var metrics = collection(type).metrics,
                timesToInvalidateByTier = timesToInvalidateByTierByType[type];
            for (var tier in tiers) {
                metrics.update({
                    i: false,
                    "_id.l": +tier,
                    "_id.t": {$in: timesToInvalidateByTier[tier]}
                }, invalidate, multi, handle);
            }
            flushed = true;
        }
        timesToInvalidateByTierByType = {}; // copy-on-write
    }, invalidateInterval);

    return putter;
};


exports.getter = function(db) {
    var collection = types(db),
        streamsBySource = {};
    channelCfgCache=require("./analitix/channels_cfg_cache").initCache(db);

    function getter(request, callback) {

        if(util.isArray(request.channels)){
            for(var i = 0; i < request.channels.length; i++) {

                (function(i) {
                    getterChannel(request,request.channels[i], callback);
                })(i);

            }
        }else{
            getterChannel(request,request.channels, callback);
        }
    }

    getter.close = function(callback) {
        callback.closed = true;
    };

    function getterChannel(request,channelId, callback){
        var stream = !("stop" in request),
            delay = "delay" in request ? +request.delay : streamDelayDefault,
            start = new Date(request.start),
            stop = stream ? new Date(Date.now() - delay) : new Date(request.stop);

        // Validate the dates.
        if (isNaN(start)) return callback({error: "invalid start"}), -1;
        if (isNaN(stop)) return callback({error: "invalid stop"}), -1;

        // Parse the expression.
        var expression;
        try {
            if(!request.expression){
                var newExpression = "channel%s(b,h).eq(b.m.id,'%s')";
                var channelEventType=  channelId.replace(/\//gi,"_").replace(/\'/gi, '');
                newExpression=util.format(newExpression, channelEventType, channelId);


                util.log('Expression ');
                util.log(newExpression);
                console.log('expression ',newExpression);

                expression = parser.parse(newExpression);
            }else
                expression = parser.parse(request.expression);
        } catch (error) {
            return callback({error: "invalid expression"}), -1;
        }

        // Set an optional limit on the number of events to return.
        var options = {sort: {t: 1}, batchSize: 1000};
        if ("limit" in request) options.limit = +request.limit;

        // Copy any expression filters into the query object.
        var filter = {t: {$gte: start, $lt: stop}};
        expression.filter(filter);

        // Request any needed fields.
        var fields = {t: 1};
        expression.fields(fields);

        // Query for the desired events.
        function query(callback) {


            console.log("fields", fields);
            console.log("filters", filter);

            collection(expression.type).events.count(filter, function(err, n){
                var docNumber=n;
                collection(expression.type).events.aggregate(
                    {$match: filter},
                    {$group: { _id: null, sampleCount: { $sum: "$d.b.m.sC" } }},
                    function(err, result){
                        if(!result) throw "no result!";
                        console.log("result", result);
                        if    (result && result.length>0) var sampleCount=result[0].sampleCount;
                        else var sampleCount=0;
                        console.log("Docs: ", docNumber, "samples", sampleCount);
                        //TODO: subsample: calculate the documents. We can recover a map reduce with doc and samples
                        //to calculate the iterations, but it seems overkill
                        var cursor=collection(expression.type).events.find(filter, fields, options);
                        var maxSamples=2048;
                        var sampleNo=0;
                        var subsamplingRate;
                        if(sampleCount>maxSamples){
                            var subsamplingRate=sampleCount/maxSamples;

                        }
                        cursor.each(function(error, event) {

                            handle(error);

                            // If the callback is closed (i.e., if the WebSocket connection was
                            // closed), then abort the query. Note that closing the cursor mid-
                            // loop causes an error, which we subsequently ignore!
                            if (callback.closed) return cursor.close();
                            handle(error);
                            if(!event) return callback(event), -1;
                            //var cube_event={id: event._id instanceof ObjectID ? undefined : event._id, time: event.t, data: event.d};
                            var timeSeriesEvt=timeSeries.formatSeries(event.d);
                            timeSeries.enrichEvent(timeSeriesEvt);
                            //timeSeries.enrichEvent(timeSeriesEvt); //we can enrich the events when saving and when retrieving
                            // A null event indicates that there are no more results.
                            if (event) callback(timeSeriesEvt);
                            else callback(null);

                        });
                    });
            });

        }

        // For streaming queries, share streams for efficient polling.
        if (stream) {
            var streams = streamsBySource[expression.source];

            // If there is an existing stream to attach to, backfill the initial set
            // of results to catch the client up to the stream. Add the new callback
            // to a queue, so that when the shared stream finishes its current poll,
            // it begins notifying the new client. Note that we don't pass the null
            // (end terminator) to the callback, because more results are to come!
            if (streams) {
                if(filter.t.$lt)
                    delete filter.t.$lt;
                streams.waiting.push(callback);
                query(function(event) { if (event) callback(event); });
            }

            // Otherwise, we're creating a new stream, so we're responsible for
            // starting the polling loop. This means notifying active callbacks,
            // detecting when active callbacks are closed, advancing the time window,
            // and moving waiting clients to active clients.
            else {
                streams = streamsBySource[expression.source] = {time: stop, waiting: [], active: [callback]};
                (function poll() {
                    query(function(event) {

                        // If there's an event, send it to all active, open clients.
                        if (event) {
                            streams.active.forEach(function(callback) {
                                if (!callback.closed) callback(event);
                            });
                            streams.lastEvent = event.body.metadata.timestamp;
                        }

                        // Otherwise, we've reached the end of a poll, and it's time to
                        // merge the waiting callbacks into the active callbacks. Advance
                        // the time range, and set a timeout for the next poll.
                        else {
                            streams.waiting = [];

                            // If no clients remain, then it's safe to delete the shared
                            // stream, and we'll no longer be responsible for polling.
                            if (!streams.active.length) {
                                delete streamsBySource[expression.source];
                                return;
                            }

                            if(streams.lastEvent){
                                streams.lastEvent.setMilliseconds(streams.lastEvent.getMilliseconds() +1);

                                filter.t.$gte = streams.lastEvent;
                                streams.lastEvent=null;
                            }

                            delete filter.t.$lt;
                            var closed=false;

                            streams.active.forEach(function(callback) {
                                if (callback.closed) closed=true;
                            });
                            if(!closed){
                                setTimeout(poll, streamInterval);
                            } else delete streamsBySource[expression.source];
                        }
                    });
                })();
            }
        }

        // For non-streaming queries, just send the single batch!
        else query(function(event){
            callback(null, event);

            console.log('Http ', event);


        });
    }
    return getter;
};

function handle(error) {
    if (error) throw error;
}

function open(callback) {
    return !callback.closed;
}
