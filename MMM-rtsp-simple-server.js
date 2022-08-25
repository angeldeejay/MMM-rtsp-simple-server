/* global Module */

/* Magic Mirror
 * Module: MMM-rtsp-simple-server
 *
 * By Andrés Vanegas <ukab72106@gmail.com>
 * MIT Licensed.
 */
Module.register("MMM-rtsp-simple-server", {
	/**
	 * @member {Object} defaults - Defines the default config values.
	 * @property {int} updateInterval Default time to show next source (in milliseconds). Defaults to 30000.
	 * @property {int} retryDelay Time to wait to refresh DOM when server and feeds are alive (in milliseconds). Defaults to 5000.
	 * @property {boolean} controls If video player should show its controls. Defaults to false.
	 * @property {int} height video player height. Defaults to 350.
	 * @property {int} width video player width. Defaults to 700.
	 * @property {int} animationSpeed Animation speed to update DOM. Defaults to 400.
	 * @property {str[]} sources sources list (rtsp urls to proxy. e.g rtsp://x.x.x.x:8554/live).
	*/
	defaults: {
		updateInterval: 30000,
		retryDelay: 5000,
		controls: false,
		height: 350,
		width: 700,
		animationSpeed: 400,
		sources: [],
	},
	logPrefix: "MMM-rtsp-simple-server :: ",

	// Required version of MagicMirror
	requiresVersion: "2.1.0",

	// Placeholders
	wrapper: null,
	message: null,
	messageWrapper: null,
	playerWrapper: null,
	player: null,
	sources: [],
	readyState: false,
	currentIndex: 0,

	// Overrides start method
	start: function () {
		this.config = {
			...this.defaults,
			...this.config,
		};
		this.rotateSource();
		this.sendNotification("SET_CONFIG", {
			...this.config,
			__protocol: window.location.protocol,
			__port: window.location.port,
		});
	},

	updateSources: function (sources) {
		const validSources = this.config.sources.map(x => x.replace(/[^a-z0-9]+/ig, "_"));
		var currentSources = this.sources.map(x => x.name);
		var payloadSources = sources.filter(x => validSources.indexOf(x.name) !== -1).map(x => x.name);

		var removedSources = currentSources.filter(x => !payloadSources.includes(x));
		var newSources = payloadSources.filter(x => !currentSources.includes(x));

		if (removedSources.length + newSources.length > 0) {
			this.currentIndex = 0;
			this.sources = sources.filter(x => validSources.indexOf(x.name) !== -1);
			Log.info(this.logPrefix + "Sources updated", this.sources)
			this.updateDom(this.config.animationSpeed);
		}
	},

	/**
	 * Notification send helper method
	 * @param {string} notification notification type
	 * @param {any} payload notification payload
	 */
	sendNotification(notification, payload) {
		this.sendSocketNotification(this.name + "-" + notification, payload);
	},

	// Override socket notification received method
	socketNotificationReceived: function (notification, payload) {
		switch (notification.replace(this.name + "-", "")) {
			case "UPDATE_SOURCES":
				this.updateSources(payload);
				break;
			case "READY":
				this.readyState = payload;
				break;
		}
	},

	/**
	 * Change current source and activate player
	 * @param {object} source source data to be show
	 */
	rotateSource: function () {
		var self = this;
		var nextWaitTime = 0;
		if (!this.readyState) {
			this.currentIndex = 0;
			this.message = this.translate("LOADING");
			this.updateDom(this.config.animationSpeed);
			nextWaitTime = this.config.retryDelay;
		} else if (this.sources.length == 0) {
			this.currentIndex = 0;
			this.message = this.translate("NO_SOURCES");
			this.updateDom(this.config.animationSpeed);
			nextWaitTime = this.config.retryDelay;
		} else {
			if (this.currentIndex > this.sources.length - 1) {
				this.currentIndex = 0;
				nextWaitTime = this.config.retryDelay;
			} else if (this.player === null) {
				this.showPlayer();
				nextWaitTime = this.config.animationSpeed;
			} else {
				const source = this.sources[this.currentIndex];
				nextWaitTime = this.config.updateInterval;
				Log.log("Showing source " + source.name);
				// this.player.poster("/" + this.name + source.image_url);
				this.player.src({
					src: source.video_url,
					type: 'application/x-mpegURL',
				});
				this.player.play();
				this.currentIndex = this.currentIndex < this.sources.length - 1 ? this.currentIndex + 1 : 0;
			}
		}
		setTimeout(function () { self.rotateSource(); }, nextWaitTime);
	},

	/**
	 * Clears an attribute from this instance
	 * @param {string} nodename attribute to be clear
	 */
	clearNode(nodename) {
		try {
			switch (nodename) {
				case 'player':
					if (this.player !== null) {
						this.player.dispose();
					}
					break;
				default:
					if (this[nodename] !== null) {
						this[nodename].parentNode.removeChild(this[nodename])
					}
			}
		} catch (e) { }

		if (this.hasOwnProperty(nodename)) {
			this[nodename] = null;
		}
	},

	/**
	 * Show message in wrapper and hide the player
	 */
	showMessage() {
		this.clearNode('player');
		this.clearNode('playerWrapper');

		if (this.messageWrapper === null) {
			this.messageWrapper = document.createElement("div");
			this.messageWrapper.classList.add("message-container");
			this.messageWrapper.style.width = this.config.width + "px";
			this.messageWrapper.style.height = this.config.height + "px";
			this.wrapper.appendChild(this.messageWrapper);
		}
		this.messageWrapper.innerHTML = this.message;
	},

	/**
	 * Show player and hide the message
	 */
	showPlayer() {
		var self = this;
		this.clearNode('messageWrapper');

		if (this.playerWrapper === null) {
			this.playerWrapper = document.createElement("video-js");
			this.playerWrapper.classList.add("player_" + this.name);
			this.playerWrapper.setAttribute("id", "player_" + this.identifier);
			this.wrapper.appendChild(this.playerWrapper);
		}

		if (this.player === null && this.playerWrapper.offsetParent !== null) {
			try {
				var player = videojs(this.playerWrapper, {
					autoplay: false,
					controls: this.config.controls,
					muted: "muted",
					preload: "none",
					width: this.config.width,
					height: this.config.height,
					fluid: true,
					liveui: true,
					loadingSpinner: false,
				});
				this.player = player;
			} catch (e) {
				this.clearNode('player');
				Log.error(e);
			}
		}
	},

	// Override function to retrieve DOM elements
	getDom: function () {
		if (this.wrapper === null) {
			this.wrapper = document.createElement("div");
			this.wrapper.classList.add("wrapper_" + this.name);
			this.wrapper.style.width = this.config.width + "px";
			this.wrapper.style.height = this.config.height + "px";
		}

		if (this.message !== null) {
			this.showMessage();
		} else {
			this.showPlayer();
		}

		return this.wrapper;
	},

	// Load scripts
	getScripts: function () {
		const __lang = this.config.lang || this.language || "en";
		return [
			this.file("js/video.min.js"),
			this.file("js/lang/" + (__lang) + ".js"),
			this.file("js/videojs-http-streaming.min.js"),
		];
	},

	// Load stylesheets
	getStyles: function () {
		return [
			this.file("css/video-js.css"),
			this.name + ".css",
		];
	},

	// Load translations files
	getTranslations: function () {
		//FIXME: This can be load a one file javascript definition
		return {
			en: "translations/en.json",
			es: "translations/es.json"
		};
	},
});
