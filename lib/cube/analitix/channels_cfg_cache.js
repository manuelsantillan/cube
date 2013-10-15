var _=require("underscore");
var util = require("util"),
    types = require("../types");

var configurationCache;

exports.initCache=function(db){
    var collection = types(db);
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

        var options = {sort: {_id: 1}, limit: 1};
        _.each(daqList, function(daqId){
            collection("configuration").events.find({"d.st.id" :daqId },options, function(err, cursor){
                cursor.each(function(error, config) {

                    // If the callback is closed (i.e., if the WebSocket connection was
                    // closed), then abort the query. Note that closing the cursor mid-
                    // loop causes an error, which we subsequently ignore!
                    if(config)
                        configurationCache.push(config.d);

                });

            });

        })
    });
}
exports.getCache = function(){
    return configurationCache;
}

exports.findChannelCfg=function(channelId){
    if(!channelId)return channelId;
    var channelCfg;
    _.each(exports.getCache(), function(daqCfg){
        var channelKeys = channelId.split('_');
        var installationId = channelKeys[0];
        var daqId = channelKeys[1];
        daqId = installationId + '_' +daqId;

        if(daqCfg.st.id == daqId){
            channelCfg = _.find(daqCfg.st.channels, function(channel){
                if(channel.identification.id == channelId){
                    return channel;
                }
            });
            return channelCfg;
        }
    });
    return channelCfg;
};

exports.replace=function(daqCfg){
    if(!daqCfg)return daqCfg;
    var found=false;
    _.each(exports.getCache(), function(daqCfgOld, index){
        if(daqCfgOld.st.id == daqCfg.st.id){
            found=true;
            configurationCache[index]= daqCfg;

            return daqCfg;
        }
    });
    if(!found)
        configurationCache.push(daqCfg);
};

exports.addDaqCfg = function(daqCfg){
    exports.replace(daqCfg);
};