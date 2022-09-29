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

module.exports = NodeHelper.create({
	name: "MMM-rtsp-simple-server",
	logPrefix: "MMM-rtsp-simple-server :: ",
	rtspServerDefaults: {
		logLevel: 'info',
		logDestinations: ["file", "stdout"],
		logFile: __dirname + "/bin/rtsp-simple-server.log",
		readTimeout: "2s",
		writeTimeout: "2s",
		readBufferCount: 1024,
		api: "no",
		metrics: "no",
		pprof: "no",
		rtspDisable: "yes",
		rtmpDisable: "yes",
		hlsDisable: "no",
		hlsAddress: ":8888",
		hlsAlwaysRemux: "yes",
		hlsVariant: "lowLatency",
		hlsSegmentCount: 10,
		hlsSegmentDuration: "1s",
		hlsPartDuration: "500ms",
		hlsSegmentMaxSize: "100M",
		hlsAllowOrigin: "*",
		hlsEncryption: "yes",
		hlsServerKey: __dirname + "/bin/rtsp-key.pem",
		hlsServerCert: __dirname + "/bin/rtsp.pem",
		hlsTrustedProxies: [],
		paths: {}
	},
	rtspServer: null,
	index: 0,
	paths: {},
	sources: {},
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

	cleanName: function (x) {
		return x.replace(/[^a-z0-9]+/ig, "_");
	},

	processConfig: function (config) {
		this.config = config;

		var receivedConfigSources = config.sources.filter((v, i, self) => self.indexOf(v) === i);
		var payloadSources = receivedConfigSources.map(this.cleanName);
		var currentSources = Object.keys(this.sources);
		var newSources = payloadSources.filter(x => !currentSources.includes(x));
		this.rtspServerDefaults.readTimeout = Math.max(2, Math.round(config.updateInterval / 4000)) + "s";
		this.rtspServerDefaults.writeTimeout = Math.max(2, Math.round(config.updateInterval / 4000)) + "s";

		if (newSources.length > 0) {
			receivedConfigSources.forEach(x => {
				const key = this.cleanName(x);
				this.rtspServerDefaults.paths[key] = {
					source: x,
					sourceProtocol: 'udp'
				};
				this.sources[key] = '/' + this.name + '/stream/' + key + '/index.m3u8';
			})
			Log.info(this.logPrefix + "Sources updated", this.sources)
			this.resetRtspServer();
		}
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
				if (err) {
					setTimeout(function () {
						self.resetRtspServer();
					}, 1000);
				} else {
					self.rtspServer = spawn(
						__dirname + '/bin/rtsp-simple-server',
						[__dirname + '/bin/rtsp-simple-server.yml'],
						{
							stdio: 'inherit',
						}
					);
					self.readyState = self.proxyReadyState;
				}
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
				target: "https://127.0.0.1:8888", // target host with the same base path
				// proxyTimeout: this.config.retryDelay,
				// timeout: this.config.retryDelay,
				changeOrigin: true, // needed for virtual hosted sites
				secure: false,
				hostRewrite: true,
				protocolRewrite: true,
				followRedirects: true,
				pathRewrite: function (path, _) {
					return path.replace(new RegExp("^/" + self.name + "/stream/"), "/");
				},
			})
		);
		this.proxyReadyState = true;
		this.readyState = this.proxyReadyState;
	},
});
