var _=require("underscore");
var transformUtil = require("./transformUtil"),
    util = require("util"),
    channelCfgCache= require("../analitix/channels_cfg_cache");

exports.isTimeSeries=function(eventOrTimeSeries){
    if(eventOrTimeSeries && eventOrTimeSeries.body && eventOrTimeSeries.body.y ) return true;
    if(eventOrTimeSeries && eventOrTimeSeries.b && eventOrTimeSeries.b.y ) return true;

    return false;
} ;

/**
 * Converts a time series event to a cube event for saving
 */


var msg ={
    header:{
        messageId:1
    },
    body:{
        metadata:{
            id:undefined,
            sampleRate:undefined,
            timestamp:undefined,
            samplingGroup:undefined
        },
        y:[]
    }
}

var msgCube ={
    h:{
        mId:1
    },
    b:{
        m:{
            cId:undefined,
            sR:undefined,
            ts:undefined,
            sG:undefined


        },
        y:[]
    }
}

var mapping={
    "header":"h",
    "header.messageId":"mId",
    "body":"b",
    "body.metadata":"m",
    "body.metadata.id":"id",
    "body.metadata.timestamp":"ts",
    "body.metadata.sampleCount":"sC"
    //,    "body.y":"y"
}
var mappingInverse={
    "h":"header",
    "h.mId":"messageId",
    "b":"body",
    "b.m":"metadata",
    "b.m.id":"id",
    "b.m.ts":"timestamp",
    "b.m.sC":"sampleCount"

    //,    "body.y":"y"
}


exports.formatEvent=function(timeSeries){
    if(!timeSeries) return timeSeries;


    // If an id is specified, promote it to Mongo's primary key

    var event ={};

    var newTimeSeries ={};
    transformUtil.copy(timeSeries,newTimeSeries, null,mapping);

    event.d=newTimeSeries;


    var channelId = newTimeSeries.b.m.id.split("/")[newTimeSeries.b.m.id.split("/").length-1];

    //event.type="channel"+channelId;

    channelId= newTimeSeries.b.m.id.replace(/\//gi,"_");


    event.type="channel"+channelId;
    if((timeSeries.body && timeSeries.body.metadata && timeSeries.body.metadata.timestamp)){
        event.t=timeSeries.body.metadata.timestamp;
        event.d.b.m.sC=timeSeries.body.y.length;
    }

    if(timeSeries.b && timeSeries.b.m && timeSeries.b.m.ts){
        event.t=timeSeries.b.m.ts;
        event.d.b.m.sC=timeSeries.b.y.length;
    }


    return event;

};
/**
 * format event to time series format
 * @param event
 * @returns time series object:
 * {header: {sampleRate: _aSampleRate_, etc.},
 * samples: [_sample_array]}
 */
exports.formatSeries=function(event){
    if(!event) return event;
    var series ={};
    transformUtil.copy(event,series, null,mappingInverse);
    return series;
};

/**
 * Subsampling algorithm
 * @param timeseries
 * @param maxSamples
 */
exports.subsample=function(timeseries, maxSamples){
    if(!maxSamples) maxSamples=5000;
    var series={};
    series.header={};
    series.data.y=[];
    var samples=timeseries.data.y;
    if(samples.length>maxSamples){
        var subsample=Math.round(samples.length/maxSamples);
        series.header.originalSampleRate=series.header.sampleRate;
        series.header.subsamplingFactor=subsample;
        series.header.originalSamplesLength=samples.length;
        series.header.sampleRate=series.header.sampleRate/subsample;
        for(var i=0;i*subsample<event.data.samples.length; i++){
            series.data.y.push(event.data.samples[i*subsample]);
        }
    }

};
/**
 * Adds necessary fields to time series event in cube format
 * @param event
 */
exports.enrichEvent=function(event){
    if(!event)return event;
    var channelCfg = channelCfgCache.findChannelCfg(event.body.metadata.id);
    if (channelCfg)
        event.body.metadata.channelCfg = channelCfg.identification;
};
/**
 * Validates an event and returns an string with error messages
 * @param event
 * @returns {string|Array|Array}
 */
exports.eventHasErrors=function(event){
    return;
    var errors=[];
    console.log("event", event);
    if(!event.data) {
        errors.push("No data field in event");
        return errors.join(";");
    }
    if(!event.data.header) {
        errors.push("No header field in event");
    } else { //check key headers
        var mandatoryHeaders=['id', 'sampleRate', 'timestamp'];
        _.each(mandatoryHeaders, function(header){
            if(!event.data.header[header])
                errors.push("No header '"+header+"'");
        });
    }
    if(!event.data.samples) errors.push("No samples field in event");
    if(errors.length>0) {
        return errors.join(";");
    } else return;
};

exports.isSaveEnabled=function(){
    return true;
};
exports.timeSeriesHasErrors=function(timeSeries){
    var event=formatEvent(timeSeries);
    return eventHasErrors(event);
};

exports.fullSubsampledQuery=function(collection, filter, start, stop, callback){
    collection(expression.type).count(filter, function(err, n){
        var docNumber=n;
        //in aggregate, we should group by samplingGroup to create
        //a document for each group of contiguous samples with the same sampling rate.
        collection(expression.type).events.aggregate(
            {$match: filter},
            {$group: { _id: {id: "$d.header.id", samplingGroup: "$d.header.samplingGroup"}, sampleCount: { $sum: "$d.header.sampleCount" } }},
            function(err, result){
                if(result && result.length>0) var sampleCount=result[0].sampleCount;
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
                var timeSeries={};
                cursor.each(function(error, event) {
                    sampleNo=
                        handle(error);

                    // If the callback is closed (i.e., if the WebSocket connection was
                    // closed), then abort the query. Note that closing the cursor mid-
                    // loop causes an error, which we subsequently ignore!
                    if (callback.closed) return cursor.close();
                    handle(error);
                    if(!event) return callback(event), -1;
                    var cube_event={id: event._id instanceof ObjectID ? undefined : event._id, time: event.t, data: event.d};
                    timeSeries.enrichEvent(cube_event); //we can enrich the events when saving and when retrieving
                    var timeSeriesEvt=timeSeries.formatSeries(cube_event);
                    // A null event indicates that there are no more results.
                    if (event) callback(timeSeriesEvt);
                    else callback(null);
                });
            });
    });

};