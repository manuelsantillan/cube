var _=require("underscore");
var transformUtil = require("./transformUtil"),
    util = require("util"),
    channelCfgCache= require("../analitix/channels_cfg_cache");

exports.isConfiguration=function(eventOrConfiguration){
    if(eventOrConfiguration && eventOrConfiguration.station) return true;
    if(eventOrConfiguration && eventOrConfiguration.st) return true;
    return true;
};


var mapping={
    "station":"st",
    "header.messageId":"mId",
    "body":"b",
    "body.metadata":"m",
    "body.metadata.id":"id",
    "body.metadata.timestamp":"ts",
    "body.metadata.sampleCount":"sC"
    //,    "body.y":"y"
}

var mappingInverse={
    "st":"station",
    "h.mId":"messageId",
    "b":"body",
    "b.m":"metadata",
    "b.m.id":"id",
    "b.m.ts":"timestamp",
    "b.m.sC":"sampleCount"

    //,    "body.y":"y"
}

/*
 exports.getCache=function(collection){
 if(configurationCache)
 return;
 configurationCache=[];
 var count = 3;
 var options = {sort: {_id: 1}, limit: count};

 collection("configuration").events.distinct("d.st.id", function(err, daqList){
 if(err){
 util.log('Problem in configuration query ');
 util.log(err);
 return;
 }
 var count = daqList.length;
 var options = {sort: {_id: 1}, limit: count};
 _.each(daqList, function(daqId){
 collection("configuration").events.find({"d.st.id" :daqId },options, function(err, cursor){
 cursor.each(function(error, config) {

 // If the callback is closed (i.e., if the WebSocket connection was
 // closed), then abort the query. Note that closing the cursor mid-
 // loop causes an error, which we subsequently ignore!
 configurationCache.push(config);
 console.log("configuration", config);
 });

 });
 })
 })
 }
 */

exports.formatEvent=function(configurationMsg){
    if(!configurationMsg) return configurationMsg;

    channelCfgCache.addDaqCfg(configurationMsg);
    var event ={};
    event.d={};
    event.type="configuration";
    transformUtil.copy(configurationMsg,event.d, null,mapping);

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
    // TODO FILE PROPERTIES
    return true;
};
exports.timeSeriesHasErrors=function(timeSeries){
    var event=formatEvent(timeSeries);
    return eventHasErrors(event);
};
