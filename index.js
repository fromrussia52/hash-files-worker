function worker_function() {
    importScripts(['file:///D:/work/javascript/self/hashfilereader/crypto-js/crypto-js.js']);

    var chunkSize = 0; // bytes
    var timeout = 10; // millisec
    var lastOffset = 0;
    var chunkReorder = 0;
    var chunkTotal = 0;
    var switchMode = true;

    function handleFiles(file) {
        var SHA256 = CryptoJS.algo.SHA256.create();
        var counter = 0;
        var self = this;

        var timeStart = new Date().getTime();
        var timeEnd = 0;

        loading(file,
            function (data) {
                var wordBuffer = CryptoJS.lib.WordArray.create(data);
                SHA256.update(wordBuffer);
                counter += data.byteLength;
                console.log((( counter / file.size)*100).toFixed(0) + '%');
                self.postMessage({
                    type: 'percent',
                    data: (( counter / file.size)*100).toFixed(0) + '%'
                });
            }, function (data) {
                console.log('100%');
                var encrypted = SHA256.finalize().toString();
                //$("#hash").val(encrypted);
                timeEnd = new Date().getTime();

                //$("#timeStart").val(new Date(timeStart));
                //$("#timeEnd").val(new Date(timeEnd));
                //$("#timeDelta").val((timeEnd - timeStart) / 1000 + ' sec');
                //$("#chunkTotal").val(chunkTotal);
                //$("#chunkReorder").val(chunkReorder);

                self.postMessage({
                    type: 'completed',
                    data:{ 
                        hash: encrypted,
                        timeStart: timeStart,
                        timeEnd: timeEnd,
                        timeDelta: (timeEnd - timeStart) / 1000 + ' sec',
                        chunkTotal: chunkTotal,
                        chunkReorder: chunkReorder
                    }
                });
            });

    };

    function loading(file, callbackProgress, callbackFinal) {
        //var chunkSize  = 1024*1024; // bytes
        var offset = 0;
        var size = chunkSize;
        var partial;
        var index = 0;

        if (file.size === 0) {
            callbackFinal();
        }
        while (offset < file.size) {
            partial = file.slice(offset, offset + size);
            var reader = new FileReader;
            reader.size = chunkSize;
            reader.offset = offset;
            reader.index = index;
            reader.onload = function (evt) {
                callbackRead(this, file, evt, callbackProgress, callbackFinal);
            };
            reader.readAsArrayBuffer(partial);
            offset += chunkSize;
            index += 1;
        }
    }

    function callbackRead(obj, file, evt, callbackProgress, callbackFinal) {
        var checked = switchMode;
        if (checked) {
            callbackRead_buffered(obj, file, evt, callbackProgress, callbackFinal);
        } else {
            callbackRead_waiting(obj, file, evt, callbackProgress, callbackFinal);
        }
    }

    // time reordering
    function callbackRead_waiting(reader, file, evt, callbackProgress, callbackFinal) {
        if (lastOffset === reader.offset) {
            console.log("[", reader.size, "]", reader.offset, '->', reader.offset + reader.size, "");
            lastOffset = reader.offset + reader.size;
            callbackProgress(evt.target.result);
            if (reader.offset + reader.size >= file.size) {
                lastOffset = 0;
                callbackFinal();
            }
            chunkTotal++;
        } else {
            console.log("[", reader.size, "]", reader.offset, '->', reader.offset + reader.size, "wait");
            setTimeout(function () {
                callbackRead_waiting(reader, file, evt, callbackProgress, callbackFinal);
            }, timeout);
            chunkReorder++;
        }
    }
    // memory reordering
    var previous = [];
    function callbackRead_buffered(reader, file, evt, callbackProgress, callbackFinal) {
        chunkTotal++;

        if (lastOffset !== reader.offset) {
            // out of order
            console.log("[", reader.size, "]", reader.offset, '->', reader.offset + reader.size, ">>buffer");
            previous.push({ offset: reader.offset, size: reader.size, result: reader.result });
            chunkReorder++;
            return;
        }

        function parseResult(offset, size, result) {
            lastOffset = offset + size;
            callbackProgress(result);
            if (offset + size >= file.size) {
                lastOffset = 0;
                callbackFinal();
            }
        }

        // in order
        console.log("[", reader.size, "]", reader.offset, '->', reader.offset + reader.size, "");
        parseResult(reader.offset, reader.size, reader.result);

        // resolve previous buffered
        var buffered = [{}]
        while (buffered.length > 0) {
            buffered = previous.filter(function (item) {
                return item.offset === lastOffset;
            });
            buffered.forEach(function (item) {
                console.log("[", item.size, "]", item.offset, '->', item.offset + item.size, "<<buffer");
                parseResult(item.offset, item.size, item.result);
                previous.remove(item);
            })
        }

    }

    Array.prototype.remove = Array.prototype.remove || function (val) {
        var i = this.length;
        while (i--) {
            if (this[i] === val) {
                this.splice(i, 1);
            }
        }
    };

    self.addEventListener('message', function (e) {
        var file = e.data.file;
        chunkSize = Number(e.data.chunkSize);
        switchMode = e.data.switchMode;
        lastOffset = 0;
        chunkReorder = 0;
        chunkTotal = 0;
        handleFiles(file);
    }, false);
}
if (window != self) {
    worker_function();
}
let worker = new Worker(URL.createObjectURL(new Blob(["(" + worker_function.toString() + ")()"], { type: 'text/javascript' })));
//new Worker('file:///D:/work/javascript/self/hashfilereader/worker.js?' + Math.random());

var inputElement = document.getElementById("document");
inputElement.addEventListener("change", function () {
    var file = this.files[0];
    if (file === undefined) {
        return;
    }
    $("#fileSize").val(humanFileSize(file.size));
    worker.postMessage({file: file, chunkSize: $("#chunkSize").val(), switchMode: $("#switchMode").prop('checked')});
    return;
}, false);

$("#document").click(function (event) {
    clear();
});

function clear() {
    $("#document").val('');
    $("#timeStart").val('');
    $("#timeEnd").val('');
    $("#timeDelta").val('');
    $("#hash").val('');
    $("#fileSize").val('');
    $("#chunkTotal").val('');
    $("#chunkReorder").val('');
    $("#progress").text('');        
    $("#progress").css('width', 0);
}

// Human file size
function humanFileSize(bytes, si) {
    var thresh = si ? 1000 : 1024;
    if (Math.abs(bytes) < thresh) {
        return bytes + ' B';
    }
    var units = si
        ? ['kB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB']
        : ['KiB', 'MiB', 'GiB', 'TiB', 'PiB', 'EiB', 'ZiB', 'YiB'];
    var u = -1;
    do {
        bytes /= thresh;
        ++u;
    } while (Math.abs(bytes) >= thresh && u < units.length - 1);
    return bytes.toFixed(1) + ' ' + units[u];
}

worker.addEventListener('message', function(e){
    var data = e.data;
    if(data.type === 'completed'){
        var data = data.data;
        $("#hash").val(data.hash);
        $("#timeStart").val(data.timeStart);
        $("#timeEnd").val(data.timeEnd);
        $("#timeDelta").val(data.timeDelta);
        $("#chunkTotal").val(data.chunkTotal);
        $("#chunkReorder").val(data.chunkReorder);
    }
    if(data.type === 'percent'){
        var data = data.data;
        $("#progress").text('# ' + data);        
        $("#progress").css('width', data);
    }
});