var _=require("underscore");

exports.copy = function (origin, destinity, path,mapping){
    var keys = Object.keys(origin);
    _.each(keys, function(property){
        console.log(property);
        var newPath=path;
        var element = origin[property];
        if(!newPath)
            newPath=property;
        else
            newPath+='.'+property;
        var propertyName;
        if(mapping[newPath]){
            propertyName = mapping[newPath];
        } else{
            propertyName= property;
        }
        Object.defineProperty(destinity,propertyName,{enumerable: true,configurable: true,writable: true, value:{}}) ;
        if(_.isObject(element)){
            if(_.isArray(element)){
                destinity[propertyName]=new Array();
                _.each(element, function(elementArray){
                    var newDestinityElement={};
                    if(_.isObject(elementArray)){
                        exports.copy(elementArray,newDestinityElement, newPath, mapping);
                        destinity[propertyName].push(newDestinityElement);
                    }else{
                        destinity[propertyName].push(elementArray);
                    }
                });

            }
            exports.copy(origin[property],destinity[propertyName], newPath, mapping);

        } else if(_.isFunction(element)){
            console.log('********function');
        } else{
            //Object.defineProperty(destinity,propertyName,{enumerable: true,configurable: true,writable: true}) ;
            destinity[propertyName]=element;

        }
    });
}

var test = function(){
    var newMsg = Object.create(msgReverse);
    console.log('newMsg :', newMsg);
    console.log('descriptor', Object.getOwnPropertyNames(msg));
    console.log('keys newMsg : ', Object.keys(newMsg));
    console.log('keys msg : ', Object.keys(msg));
    //Object.keys(msg), msg, newMsg);
    copy(Object.keys(msg), msg, newMsg, null,mappingInverse);

    console.log('++++++++++++++++++++++++++++++ New object is  ',newMsg);
};


var testDefineProperty = function(){
    var newProperty={};
    Object.defineProperty(newProperty,"hola", {
            enumerable: true,
            configurable: true,
            writable: true, value:{}
        }
    ) ;
    console.log(newProperty.hola);
};

var test = function(){
    var newMsg = Object.create(msg);
    console.log('newMsg :', newMsg);
    console.log('descriptor', Object.getOwnPropertyNames(msg));
    console.log('keys newMsg : ', Object.keys(newMsg));
    console.log('keys msg : ', Object.keys(msg));
    //Object.keys(msg), msg, newMsg);
    copy(Object.keys(msg), msg, newMsg,null,mapping);

    console.log('++++++++++++++++++++++++++++++ New object is  ',newMsg);
};
