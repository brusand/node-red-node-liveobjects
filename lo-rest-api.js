"use strict";




module.exports = function (RED) {
    var url = require('url');
    var https = require('https');
    var HttpsProxyAgent = require('https-proxy-agent');

    function HTTPSRequest(n) {
        RED.nodes.createNode(this, n);

        var node = this;
        var nodeUrl = n.url;
        var method = n.method || "GET";

        this.ret = n.ret || "txt";
        if (RED.settings.httpRequestTimeout) { this.reqTimeout = parseInt(RED.settings.httpRequestTimeout) || 120000; }
        else { this.reqTimeout = 120000; }
        var payload = null;

        var prox, noprox;
        if (process.env.http_proxy != null) { prox = process.env.http_proxy; }
        if (process.env.HTTP_PROXY != null) { prox = process.env.HTTP_PROXY; }
        if (process.env.no_proxy != null) { noprox = process.env.no_proxy.split(","); }
        if (process.env.NO_PROXY != null) { noprox = process.env.NO_PROXY.split(","); }

        this.on("input",function(msg) {
            var opts = url.parse(nodeUrl);
            opts.method = method;
            opts.headers = {};

            var payload = null;
            if (msg.headers['X-API-KEY'])
                opts.headers['X-API-KEY'] = msg.headers['X-API-KEY'];
            if (msg.payload && (method == "POST" || method == "PUT" || method == "PATCH" ) ) {
                if (typeof msg.payload === "string" || Buffer.isBuffer(msg.payload)) {
                    payload = msg.payload;
                } else if (typeof msg.payload == "number") {
                    payload = msg.payload+"";
                } else {
                    if (opts.headers['content-type'] == 'application/x-www-form-urlencoded') {
                        payload = querystring.stringify(msg.payload);
                    } else {
                        payload = JSON.stringify(msg.payload);
                        if (opts.headers['content-type'] == null) {
                            opts.headers['content-type'] = "application/json";
                        }
                    }
                }
            }
            var noproxy;
            if (noprox) {
                for (var i in noprox) {
                    if (url.indexOf(noprox[i]) !== -1) { noproxy=true; }
                }
            }
            if (prox && !noproxy) {
                var match = prox.match(/^(http:\/\/)?(.+)?:([0-9]+)?/i);
                if (match) {
                    //opts.protocol = "http:";
                    //opts.host = opts.hostname = match[2];
                    //opts.port = (match[3] != null ? match[3] : 80);


                    //opts.headers['Host'] = opts.host;
                    //var heads = opts.headers;
                    //var path = opts.pathname = opts.href;
                    //opts = urllib.parse(prox);
                    //opts.path = opts.pathname = path;
                    //opts.headers = heads;
                    //opts.method = method;
                    //urltotest = match[0];
                    // add agent(proxy) to opt

                    var agent = new HttpsProxyAgent(prox);
                    opts.agent = agent;
                }
                else { node.warn("Bad proxy url: "+process.env.http_proxy); }
            }
            var postreq = https.request(opts, function (res) {
                msg.statusCode = res.statusCode;
                msg.headers = res.headers;
                msg.responseUrl = res.responseUrl;
                msg.payload = "";

                res.on('data', function (chunk) {
                    msg.payload += chunk;
                });
                res.on('end', function () {
                    if (node.metric()) {
                        // Calculate request time
                        var diff = process.hrtime(preRequestTimestamp);
                        var ms = diff[0] * 1e3 + diff[1] * 1e-6;
                        var metricRequestDurationMillis = ms.toFixed(3);
                        node.metric("duration.millis", msg, metricRequestDurationMillis);
                        if (res.client && res.client.bytesRead) {
                            node.metric("size.bytes", msg, res.client.bytesRead);
                        }
                    }
                    if (node.ret === "bin") {
                        msg.payload = new Buffer(msg.payload,"binary");
                    }
                    else if (node.ret === "obj") {
                        try { msg.payload = JSON.parse(msg.payload); }
                        catch(e) { node.warn(RED._("httpin.errors.json-error")); }
                    }
                    node.send(msg);
                    node.status({});
                });
                res.on('error', function (err) {
                    node.error(err,msg);
                    msg.payload = err.toString() + " : " + url;
                    msg.statusCode = err.code;
                    node.send(msg);
                    node.status({fill:"red",shape:"ring",text:err.code});
                })
            });

            if (payload) {
                postreq.write(payload);
            }
            postreq.end();
        });

        this.on("close",function() {
            node.status({});
        });
    }

    RED.nodes.registerType("lo-rest-api", HTTPSRequest);
}
