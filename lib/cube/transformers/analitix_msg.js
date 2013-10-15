var _=require("underscore");
var util = require("util"),
    timeSeriesMsg=require("./analitix_time_series"),
    configMsg=require("./analitix_configuration_msg");


exports.initTransformer=function(event){
    if(timeSeriesMsg.isTimeSeries(event)){
        return timeSeriesMsg;
    }
    if(configMsg.isConfiguration(event)){
        return  configMsg;
    }
    return timeSeriesMsg;

};
