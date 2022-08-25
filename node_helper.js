/* Magic Mirror
 * Node Helper: "MMM-rtsp-simple-server"
 *
 * By Andrés Vanegas <ukab72106@gmail.com>
 * MIT Licensed.
 */

const NodeHelper = require("node_helper");
const Log = require("../../js/logger.js");
const { createProxyMiddleware } = require("http-proxy-middleware");
const axios = require("axios").default;
const nocache = require('nocache');
const { spawn } = require('child_process');
const yaml = require('js-yaml');
const fs = require('fs');
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';


module.exports = NodeHelper.create({
	name: "MMM-rtsp-simple-server",
	urlPrefix: null,
	logPrefix: "MMM-rtsp-simple-server :: ",
	allowedKeys: [
		"connected",
		"enabled",
		"firmware_ver",
		"name_uri",
		"nickname",
		"product_model",
		"status"
	],
	rtspServerDefaults: {
		logLevel: 'info',
		logDestinations: ["file", "stdout"],
		logFile: __dirname + "/bin/rtsp-simple-server.log",
		readTimeout: "10s",
		writeTimeout: "10s",
		readBufferCount: 1024,
		api: "no",
		metrics: "no",
		pprof: "no",
		rtspDisable: "yes",
		rtmpDisable: "yes",
		hlsDisable: "no",
		hlsAddress: ":8888",
		hlsAlwaysRemux: "no",
		hlsVariant: "mpegts",
		hlsSegmentCount: 10,
		hlsSegmentDuration: "1s",
		hlsPartDuration: "200ms",
		hlsSegmentMaxSize: "50M",
		hlsAllowOrigin: "*",
		hlsEncryption: "no",
		hlsTrustedProxies: [],
		paths: {}
	},
	rtspServer: null,
	index: 0,
	paths: {},
	sources: [],
	readyState: false,
	proxyReadyState: false,

	start: function () {
		this.config = null;
		this.readyState = false;
		Log.info(this.logPrefix + "Started");
		this.sendNotification("SET_MESSAGE", "LOADING");
		this.resetRtspServer();
		setInterval(() => this.sendNotification("UPDATE_SOURCES", this.sources), 1000);
	},

	processConfig: function (config) {
		this.config = config;

		var receivedConfigSources = config.sources.filter((v, i, self) => self.indexOf(v) === i);
		var payloadSources = receivedConfigSources.map((x, i) => x.replace(/[^a-z0-9]+/ig, "_"));
		var currentSources = this.sources.map(x => x.name);
		var removedSources = currentSources.filter(x => !payloadSources.includes(x));
		var newSources = payloadSources.filter(x => !currentSources.includes(x));

		if (removedSources.length + newSources.length > 0) {
			receivedConfigSources.forEach(x => this.rtspServerDefaults.paths[x.replace(/[^a-z0-9]+/ig, "_")] = { source: x, sourceProtocol: 'udp' })
			this.sources = [];
			for (var key in this.rtspServerDefaults.paths) {
				if (this.rtspServerDefaults.paths.hasOwnProperty(key)) {
					this.sources.push({
						name: key,
						video_url: '/' + this.name + '/stream/' + key + '/index.m3u8',
					});
				}
			}
			Log.info(this.logPrefix + "Sources updated", this.sources)
			this.resetRtspServer();
		}

		this.urlPrefix = "//localhost:" + config.__port + "/" + this.name;
	},

	resetRtspServer: function () {
		var self = this;
		if (self.rtspServer !== null) {
			try { self.rtspServer.kill(); } catch (_) { }
		}
		this.readyState = false;
		fs.writeFile(__dirname + '/bin/rtsp-simple-server.yml', yaml.dump(
			this.rtspServerDefaults,
			{ noCompatMode: true }),
			function (err) {
				self.rtspServer = spawn(
					__dirname + '/bin/rtsp-simple-server',
					[__dirname + '/bin/rtsp-simple-server.yml'],
					{
						stdio: 'inherit',
					}
				);
				self.readyState = self.proxyReadyState;
			}
		);
	},

	sendNotification(notification, payload) {
		this.sendSocketNotification(this.name + "-" + notification, payload);
		if (notification === 'UPDATE_SOURCES') {
			this.sendSocketNotification(this.name + "-READY", this.readyState);
		}
	},

	socketNotificationReceived: function (notification, payload) {
		notification = notification.replace(this.name + "-", "");

		switch (notification) {
			case "SET_CONFIG":
				this.processConfig(payload);
				if (!this.proxyReadyState) {
					this.setProxy();
				} else {
					this.sendNotification("UPDATE_SOURCES", this.sources);
				}
				break;
		}
	},

	// this you can create extra routes for your module
	setProxy: function () {
		var self = this;
		this.expressApp.set("etag", false);
		this.expressApp.use("/" + this.name + "/stream/*",
			nocache(),
			createProxyMiddleware({
				target: "http://localhost:8888", // target host with the same base path
				changeOrigin: true, // needed for virtual hosted sites
				pathRewrite: function (path, _) {
					return path.replace(new RegExp("^/" + self.name + "/stream/"), "/");
				},
			})
		);
		this.proxyReadyState = true;
		this.readyState = this.proxyReadyState;
	},
});
