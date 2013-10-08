var _=require("underscore");

exports.isTimeSeries=function(eventOrTimeSeries){
  if(!eventOrTimeSeries) return;
  if(!eventOrTimeSeries.header) return;
} ;

/**
 * Converts a time series event to a cube event for saving
 */
exports.formatEvent=function(timeSeries){
    if(!timeSeries) return timeSeries;
    var event={};
    event.data={};
    event.data.header=timeSeries.header;
    event.data.samples=timeSeries.samples;
    event.type="samples";
    if(timeSeries.header)
        event.time=timeSeries.header.timestamp;
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
    var series={};
    series.header=event.data.header;
    var samples=event.data.samples;
    series.data={};
    series.data.y=samples;
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
  if(!event.data) throw "no data field in event";
  if(!event.data.header) throw "no header in event";
  if(!event.data.samples) throw "no samples in event";
 // if(!event.data.header.samplesCount)
   // event.data.header.samplesCount=event.data.samples.length;
};
/**
 * Validates an event and returns an string with error messages
 * @param event
 * @returns {string|Array|Array}
 */
exports.eventHasErrors=function(event){
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