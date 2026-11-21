/* Runs inside the payslip reader's background worker, before the reader itself.
   The Portuguese reading data is stored as "por-traineddata.gz.wasm" (so every host, including
   claude.ai artifacts, serves it as plain binary); requests for "por.traineddata.gz" go there. */
(function () {
  var realFetch = self.fetch.bind(self);
  self.fetch = function (input, init) {
    var url = typeof input === 'string' ? input : input.url;
    if (/\/por\.traineddata(\.gz)?$/.test(url)) url = url.replace(/\/por\.traineddata(\.gz)?$/, '/por-traineddata.gz.wasm');
    return realFetch(url, init);
  };
})();
importScripts('worker.min.js');
