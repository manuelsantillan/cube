

var samples1=[];
    for(var j=0;j<10;j++){
		if(j%5==0){
        	samples1.push(Math.random()*50);			
		}
		else{
			samples1.push(Math.random());
		}
    };
var samples2=[];
	for(var i=0;i<20;i++){
		samples2.push(Math.sin(2.5*(i+1)));
	}
	
var samples3=[];
	for(var i=0;i<10;i++){
		samples3.push((Math.random()*10)+20);
	}



var sinGenerator=function(amplitude, freq, samplingRate, samples){
    var result=[];
    for(var i=0;i<samples;i++){
        result.push(amplitude*Math.sin(2*Math.PI*freq*i/samplingRate));
    }
    return result;
}

var createEvent=function(samples, channelId, sampleRate){
    var event={
        t: new Date(),
        d:{
            h:{mId: channelId+new Date().getTime()},
            b: {
                m:{
                    sC: samples.length,
                    sR: sampleRate,
                    sG: 1
                    },
                y: samples}
        }
    };
    return event;
};
console.log(JSON.stringify(createEvent(sinGenerator(1,1,10,100), "1_1_1", 10)));

exports.sinGenerator=sinGenerator;
exports.createEvent=createEvent;
exports.sinEvent=function(amplitude, freq, samplingRate, samples, channelId){
  if(!channelId) var channelId="1_1_1";
  if(!amplitude) var amplitude=1;
  if(!samplingRate) var samplingRate=10;
  if(!samples) var samples=100;
  if(!freq) var freq=1;
  var samples=sinGenerator(amplitude, freq, samplingRate, samples);
  var event=createEvent(samples, channelId, samplingRate);
    return event;
};
