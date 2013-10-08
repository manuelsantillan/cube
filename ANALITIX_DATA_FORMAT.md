SOLVVIEW - Especificaciones de protocolo
========================================

1.  Protocolos fisicos / transportes
---------------------------------

Los protocolos soportados serán http(s), tcp, udp, websockets y ftp. 

A futuro es probable que incorporemos protocolos tipo-middleware (MQTT, rabbitMQ, ActiveMQ, etc.)
así como que incluyamos soporte para protocolos específicos de instrumentación (modbus, CAN, etc.).

Los transportes actuales funcionan todos sobre IP por lo que cuando sea necesario integrar motas
u otros equipos que no soporten IP será necesario implementar un servicio de pasarela.


###http / https
Soportaremos HTTP como protocolo fisico. Siempre que sea HTTP, el formato del mensaje será JSON. Desde fuera del sistema,
solo se soportará HTTP y Websockets.

Se utilizarán cabeceras de compresión gzip (http://en.wikipedia.org/wiki/HTTP_compression) siempre que sea posible.

Se utilizarán conexiones persistentes (keepAlive) siempre que sea posible. 

En el caso de https, se podrán incluir mecanismos de autenticación, pendiente de definir.
Las opciones son: certificado SSL de cliente, autenticación Basic o Digest, o bien oAuth2.

Las posibles comunicaciones son:

- El middleware soportará conexiones HTTP entrantes desde el navegador (consultas datos). 
- El middleware soportará conexiones HTTP entrantes desde los DAQ (envíos de datos). 
- Los DAQ podrán soportar conexiones HTTP entrantes, pero no es obligatorio.
Si las soportan, podrán recibir mensajes de solicitud o de acción (ver protocolo lógico).
Durante el proceso de envío de información de configuración, deberán indicar los protocolos que soportan.
    
El encapsulado de los mensajes JSON podrá ser tanto de tipo array como de tipo objeto.
El middleware podrá interpretar la cabecera "Accept" para generar respuestas de tipo text/plain. En ese caso,
se devolverá un formateo CSV. A futuro, se incorporará soporte para Excel.
El array se interpretará como una lista de 1 o más mensajes independientes, lo que permite agrupar mensajes en una sola petición HTTP.

TBD: definir patrones de URL.

##tcp
El formato del mensaje podrá ser JSON o BSON, siendo responsabilidad de ambos extremos detectar si se trata de uno u otro.
Por el momento, solo implementaremos JSON. A futuro se podrán incorporar otros encapsulados binarios si tiene sentido. Cuando se haga (si se hace) habrá que incorporar un byte inicial de tipo de encapsulado (JSON / BSON / otros).

Se utilizará el caracter de fin de mensaje 0x03 (caracter EOT de ASCII), dado que el caracter 0xFF se utiliza
en el protocolo BSON como separador.

El encapsulado de los mensajes JSON podrá ser tanto de tipo array como de tipo objeto.
El array se interpretará como una lista de 1 o más mensajes independientes, pero es opcional dado que TCP está orientado a streaming.


- El middleware soportará conexiones tcp entrantes desde los DAQ (envíos de datos). 
- Los DAQ podrán soportar conexiones tcp entrantes, pero no es obligatorio. Si las soportan,
podrán recibir mensajes de solicitud o de acción (ver protocolo lógico).
Durante el proceso de envío de información de configuración, deberán indicar los protocolos que soportan.

La correlación entre petición-respuesta cuando aplique se realizará mediante cabeceras
y será por tanto responsabilidad del protocolo lógico, y no dependerá por tanto del orden de entrega.
Esto permite que varios subprocesos estén enviando diferentes mensajes por el mismo stream TCP (multiplexión de conexiones lógicas).

###udp
UDP será protocolo válido para el envío de datos al middleware. Se podrá utilizar BSON o JSON en el envío UDP.
Por el momento sólo se implementará JSON sobre UDP. A futuro se valorará la incorporación de mensajes comprimidos sobre UDP.

- El middleware soportará conexiones UDP entrantes desde los DAQ (envío de datos). No habrá en principio mecanismos de reenvío
(será fire & forget) por lo que se podrán perder datos. Por ello, se combinará con FTP siempre que sea importante no perder datos.
- Los DAQ podrán soportar conexiones UDP entrantes, pudiendo recibir mensajes de acción, pero no de solicitud.
(REVISAR: puede no tener mucho sentido que los DAQ soporten UDP entrante).

###Websockets:
Se podrá utilizar para streaming tiempo real tanto desde el DAQ (opcional) como desde el middleware (obligatorio).
Cuando haya varios mensajes, se podrán agrupar en un array para mejorar el rendimiento. El encapsulado será siempre JSON.
Aplican las mismas consideraciones de seguridad que en el caso de http.
Formato de URLs: TBD. En todo caso, el mismo que para HTTP.

###ftp / scp
Los protocolos FTP y SCP se utilizarán como mecanismos de envío offline (patrón coche-escoba) desde el DAQ hasta el
 middleware. Se usarán asimismo para la recogida de logs y para los cambios de configuración. No se podrá usar
 para mensajes de solicitud ni de acción (excepto cambio de configuración).

Cada tipo de mensaje se alojará en una carpeta independiente. Cada fichero podrá contener un número arbitrario de mensajes.
En caso de haber más de un mensaje dentro del fichero, el contenido será un array JSON.

Las carpetas definidas inicialmente serán:
- config/
- status/
- logs/
- channels/ -> ¿Tiene sentido subcarpetas para cada canal?
- alarms/
- events/

El nombre de fichero será: TBD
TBD: definir qué ficheros se borrarán y cuáles no.


2.  Protocolo lógico:
---------------------
    Mensajes generados en DAQ: muestras, alarma, evento, configuración de DAQ, status de DAQ, error.
    Mensajes generados en solvview:
     Solicitudes: solicitud de muestras, solicitud de status, solicitud de configuración,
     Acciones: cambio de configuración, reinicio.
    No todos los mensajes tienen sentido para todos los transportes.
    2.1. Muestras
        Pueden ser de lecturas puntuales o de lecturas periódicas

        Formato: {headers: {}, samples: []}, donde las cabeceras son las siguientes:
        2.1.0 Lecturas puntuales:
        - headers:
            - id: channel id, formato: INSTALLATION_ID.DAQ_ID.CHANNEL_ID
            - messageId: identificador unico de msg. CHANNEL_ID.TIMESTAMP_MILLIS o lo que es lo mismo INSTALLATION_ID.DAQ_ID.CHANNEL_ID.TIMESTAMP_MILLIS
            - timestamp: TIMESTAMP_MILLIS. ¿En formato fecha?
        - samples: Puede venir en array o no.

        2.1.1 Lecturas periódicas
            - id: channel id, formato: INSTALLATION_ID.DAQ_ID.CHANNEL_ID
            - messageId: identificador unico de msg. CHANNEL_ID.TIMESTAMP_MILLIS o lo que es lo mismo INSTALLATION_ID.DAQ_ID.CHANNEL_ID.TIMESTAMP_MILLIS
            - sampleRate: frecuencia de muestreo, en hercios.
            - originalSampleRate: frecuencia de muestreo original, en el caso de que se haya hecho submuestreo. Calculado en servidor
            - originalSampleCount: numero de muestras original. Calculado en servidor.
            - sampleCount: numero de muestras del mensaje. Calculado en servidor.
            - samplingGroup: identificador de ráfaga de muestreo. Puede ser comun a varios canales (cuando se muestrean en simultaneo). Formato: INSTALLATION_ID.DAQ_ID.TIMESTAMP_MILLIS
            - timestamp: TIMESTAMP_MILLIS. ¿En formato fecha?
            - eventId: identificador de evento, si el paquete está asociado a un evento. Formato igual que el sampling group: INSTALLATION_ID.DAQ_ID.TIMESTAMP_MILLIS

        2.1.2 Abreviaturas:
            - header: h
            - samples: s
            - messageId: mId
            - id: id;
            - sampleRate: sR
            - originalSampleRate: oSR
            - originalSampleCount: oSC
            - sampleCount: sC
            - samplingGroup: sG
            - timestamp: ts
            - eventId: eId
    2.2. Configuración:
        metadata: {
        - installationId: id
        - daqId: installationId.daqId
        - location: {lat: $lat, long: $long, z: $cota_z} //optional
        - family: labview | opensource   //optional
        - model: el modelo //optional
        - sensors: [{ //array of sensors
            - id: FULL_DAQ_ID.SENSORID
            - model //optional
            - features //optional, TBD: JSON con las caracteristicas del aparato (maxSampleRate, maxBandwidth, precision, ...)
            - location: {lat: $lat, long: $long, z: $cota_z} //optional
            - channels: [{ //array of channels
                - id:  formato: INSTALLATION_ID.DAQ_ID.CHANNEL_ID
                - name: nombre. Etiqueta internacionalizable (a futuro).
                - unit: RAW | unidades de ingenieria (estandarizar!!!!!)
                - shortDesc: descripcion. Etiqueta internacionalizable (a futuro).
                - minValue: //optional
                - maxValue: //optional
                - virtual: //optional
                - defaultSampleRate
                - calibration: {
                    - method
                    - properties: offset, gain.
                }

            }]
            },
        config: {//model-specific and project specific config data. Valorar si meter algunas cosas dentro del canal.
            - alarms: configuracion de alarmas. //¿Dentro de channel?
            - events: config de eventos //¿Dentro de channel?
            - channels: [{array of channels
                - samplingRate
        }

    }
    2.3. Alarma:
            header:
            - id: channel id, formato: INSTALLATION_ID.DAQ_ID.CHANNEL_ID
            - messageId: identificador unico de msg. CHANNEL_ID.TIMESTAMP_MILLIS o lo que es lo mismo INSTALLATION_ID.DAQ_ID.CHANNEL_ID.TIMESTAMP_MILLIS
            - timestamp: TIMESTAMP_MILLIS. ¿En formato fecha?. Fecha de inicio de la alarma
            - timestampEnd: TIMESTAMP_MILLIS de fecha de fin de la alarma. Solo si la alarma ya se ha apagado
            alarm:
            - threshold: umbral de la alarma
            - values: array de lecturas que superan el umbral.  ¿Meter un mensaje entero de muestras??¿¿Dejar simplemente los datos en
            la coleccion de muestras??
    2.4. Evento:
            header:
            - id: channel id, formato: INSTALLATION_ID.DAQ_ID.CHANNEL_ID
            - messageId: identificador unico de msg. CHANNEL_ID.TIMESTAMP_MILLIS o lo que es lo mismo INSTALLATION_ID.DAQ_ID.CHANNEL_ID.TIMESTAMP_MILLIS
            - timestamp: TIMESTAMP_MILLIS. ¿En formato fecha?. Fecha de inicio de la alarma
            - timestampEnd: TIMESTAMP_MILLIS de fecha de fin de la alarma. Solo si la alarma ya se ha apagado

    2.5. Status:
    2.6. Error:



3. Protocolo de intercambio de mensajes:
    - SOLVVIEW: SOLICITUD(muestras|alarma|evento|config) - DAQ: MENSAJE(muestras|alarma|evento|config) // modo reply-response
    - SOLVVIEW: SOLICITUD(muestras|alarma|evento|config) - DAQ: STREAM DE MENSAJE(muestras|alarma|evento|config) //modo suscripción
    - DAQ: STREAM DE MENSAJE(muestras|alarma|evento) //modo autónomo
    - SOLVVIEW: ACCION(CAMBIO DE CONFIG | RESET)         - DAQ: ACK(CAMBIO DE CONFIG | RESET) //modo comando

