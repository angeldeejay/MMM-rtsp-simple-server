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
		mode: 'rotate',
		sources: [],
	},
	logPrefix: "MMM-rtsp-simple-server :: ",
	uuid: null,

	// Required version of MagicMirror
	requiresVersion: "2.1.0",

	// Placeholders
	wrapper: null,
	message: null,
	messageWrapper: null,
	playerWrappers: [],
	players: [],
	sources: [],
	sourcesOrder: [],
	readyState: false,
	currentIndex: 0,

	// Overrides start method
	start: function () {
		this.config = {
			...this.defaults,
			...this.config,
		};
		this.uuid = new UUID(4).toString();
		for (var i in this.config.sources) {
			this.playerWrappers[i] = null;
			this.players[i] = null;
		}
		if (this.config.mode === 'rotate') {
			this.rotateSource();
		} else if (this.config.mode === 'tiles') {
			this.tileSources();
		}
		this.sendNotification("SET_CONFIG", {
			...this.config,
			__uuid: this.uuid,
		});
	},

	cleanName: function (x) {
		return x.replace(/[^a-z0-9]+/ig, "_");
	},

	updateSources: function (sources) {
		const validSources = this.config.sources.map(this.cleanName);
		var currentSources = Object.keys(this.sources);
		var payloadSources = Object.keys(sources).filter(x => validSources.indexOf(x) !== -1);

		var removedSources = currentSources.filter(x => !payloadSources.includes(x));
		var newSources = payloadSources.filter(x => !currentSources.includes(x));

		if (removedSources.length + newSources.length > 0) {
			this.currentIndex = 0;
			for (const [key, value] of Object.entries(sources)) {
				if (validSources.indexOf(key) !== -1) {
					this.sources[key] = value;
				}
			}
			this.sourcesOrder = Object.keys(this.sources);
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
		var self = this;
		switch (notification.replace(this.name + "-", "")) {
			case "WAIT_CONFIG":
				setTimeout(function() {
					self.sendNotification("SET_CONFIG", {
						...self.config,
						__uuid: self.uuid,
					});		
				}, 1000);
			case "UPDATE_SOURCES":
				this.updateSources(payload);
				break;
			case "READY":
				this.readyState = payload;
				break;
		}
	},

	rotateSourcesOrder: function () {
		this.sourcesOrder.unshift(this.sourcesOrder.pop());
	},

	tileSources: function () {
		var self = this;
		var nextWaitTime = 0;
		if (this.config.mode !== 'tiles') {
			this.updateDom(this.config.animationSpeed);
		} else if (!this.readyState) {
			this.message = this.translate("LOADING");
			this.updateDom(this.config.animationSpeed);
			nextWaitTime = this.config.retryDelay;
		} else if (Object.keys(this.sources).length == 0) {
			this.message = this.translate("NO_SOURCES");
			this.updateDom(this.config.animationSpeed);
			nextWaitTime = this.config.retryDelay;
		} else {
			this.message = null;
			if (!this.players.every((_, i) => {
				return this.elementReady('playerWrappers', i) &&
					this.playerWrappers[i].offsetParent !== null &&
					this.elementReady('players', i);
			})) {
				this.showPlayers();
				nextWaitTime = this.config.animationSpeed;
			} else {
				nextWaitTime = this.config.updateInterval;
			}
		}
		setTimeout(function () { self.tileSources(); }, Math.max(nextWaitTime, 1000));
	},

	/**
	 * Change current source and activate player
	 * @param {object} source source data to be show
	 */
	rotateSource: function () {
		var self = this;
		var nextWaitTime = 0;
		if (this.config.mode !== 'rotate') {
			this.updateDom(this.config.animationSpeed);
		} else if (!this.readyState) {
			this.message = this.translate("LOADING");
			this.updateDom(this.config.animationSpeed);
			nextWaitTime = this.config.retryDelay;
		} else if (Object.keys(this.sources) == 0) {
			this.message = this.translate("NO_SOURCES");
			this.updateDom(this.config.animationSpeed);
			nextWaitTime = this.config.retryDelay;
		} else {
			if (!this.elementReady('players', 0)) {
				this.showPlayers();
				nextWaitTime = this.config.animationSpeed;
			} else {
				this.message = null;
				const key = this.sourcesOrder[0];
				const source = this.sources[key];
				nextWaitTime = this.config.updateInterval;
				Log.log("Showing source " + key);
				// this.player.poster("/" + this.name + source.image_url);
				this.players[0].src({
					src: source,
					type: 'application/x-mpegURL',
				});
				this.players[0].play();
				this.rotateSourcesOrder();
			}
		}
		setTimeout(function () { self.rotateSource(); }, Math.max(nextWaitTime, 1000));
	},

	/**
	 * Clears an attribute from this instance
	 * @param {string} nodename attribute to be clear
	 */
	clearNode(nodename) {
		switch (nodename) {
			case 'players':
				for (const [i, p] of this.players.entries()) {
					if (p !== null) {
						try { p.dispose(); } catch (_) { }
					}
					this.players[i] = null;
				}
				break;
			case 'playerWrappers':
				for (const [i, p] of this.playerWrappers.entries()) {
					if (p !== null) {
						try { p.parentNode.removeChild(p) } catch (_) { }
					}
					this.playerWrappers[i] = null;
				}
				break;
			default:
				if (this[nodename] !== null) {
					try { this[nodename].parentNode.removeChild(this[nodename]) } catch (_) { }
				}
				if (this.hasOwnProperty(nodename)) {
					this[nodename] = null;
				}
		}
	},

	elementReady: function (attribute, index = null) {
		return this[attribute] !== null &&
			(index === null || this[attribute][index] !== null);
	},

	/**
	 * Show message in wrapper and hide the player
	 */
	showMessage() {
		this.clearNode('players');
		this.clearNode('playerWrappers');

		if (!this.elementReady('messageWrapper')) {
			this.messageWrapper = document.createElement("div");
			this.messageWrapper.classList.add("message-container");
			this.messageWrapper.style.width = this.config.width + "px";
			this.messageWrapper.style.height = this.config.height + "px";
			this.wrapper.appendChild(this.messageWrapper);
		}
		this.messageWrapper.innerHTML = this.message;
	},

	resetPlayer: function (index) {
		try { this.players[index].dispose(); } catch (e) { Log.error(e); }
		this.players[index] = null;
		try { this.playerWrappers[index].parentNode.removeChild(this.playerWrappers[index]) } catch (_) { }
		this.playerWrappers[index] = null;
		this.createPlayer(index);
	},

	createPlayer(index) {
		var self = this;
		if (!this.elementReady('playerWrappers', index)) {
			var playerWrapper = document.createElement("video-js");
			playerWrapper.classList.add("player_" + this.name);
			playerWrapper.setAttribute("id", "player_" + this.identifier + "-0");
			this.playerWrappers[index] = playerWrapper;
			this.wrapper.appendChild(this.playerWrappers[index]);
		}

		if (!this.elementReady('players', index) &&
			this.elementReady('playerWrappers', index) &&
			this.playerWrappers[index].offsetParent !== null) {
			try {
				var options = {
					autoplay: false,
					controls: this.config.controls,
					muted: "muted",
					preload: "none",
					width: this.config.width,
					height: this.config.height,
					fluid: true,
					liveui: true,
					loadingSpinner: false,
					enableSourceset: true,
					html5: {
						vhs: {
							overrideNative: true,
							experimentalBufferBasedABR: true,
							experimentalLLHLS: true,
							nativeAudioTracks: false,
							nativeVideoTracks: false,
						},
					},
				}
				if (this.config.mode === 'tiles') {
					options.autoplay = true;
					options.sources = { src: Object.values(this.sources).at(index) };
				}
				const resetPlayerInterval = () => {
					(this.players[index].readyState() <= 2) ?
						this.resetPlayer(index) :
						null;
				};
				this.players[index] = videojs(this.playerWrappers[index], options);
				this.players[index].setTimeout(resetPlayerInterval, this.defaults.retryDelay);
				this.players[index].on('pause', () => this.resetPlayer(index));
				this.players[index].on('stalled', () => this.resetPlayer(index));
				this.players[index].on('error', () => this.resetPlayer(index));
				// reset programmatically
				this.players[index].setInterval(() => this.resetPlayer(index), 600 * 1000);
			} catch (e) {
				if (this.players[index] !== null) {
					try { this.players[index].dispose(); } catch (e) { }
				}
				this.players[index] = null;
				Log.error(e);
			}
		}
	},

	/**
	 * Show player and hide the message
	 */
	showPlayers() {
		this.clearNode('messageWrapper');
		if (this.config.mode === "rotate") {
			this.createPlayer(0);
		} else if (this.config.mode === "tiles") {
			for (var i = 0; i < Object.values(this.sources).length; i++) {
				this.createPlayer(i);
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
			this.showPlayers();
		}

		return this.wrapper;
	},

	// Load scripts
	getScripts: function () {
		const __lang = this.config.lang || this.language || "en";
		return [
			this.file("js/uuid.js"),
			this.file("js/videojs.min.js"),
			this.file("js/videojs-errors.min.js"),
			this.file("js/lang/" + (__lang) + ".js"),
			this.file("js/videojs-http-streaming-sync-workers.js"),
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
