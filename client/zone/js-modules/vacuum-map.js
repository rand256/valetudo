import { RRMapParser } from "./rr-map-parser.js";
import { FallbackMap } from "./fallback-map.js";
import { MapDrawer } from "./map-drawer.js";
import { PathDrawer } from "./path-drawer.js";
import { trackTransforms } from "./tracked-canvas.js";
import { GotoPoint, Zone, Segment, ForbiddenZone, VirtualWall, CurrentCleaningZone, ForbiddenMopZone, GotoTarget } from "./locations.js";
import { TouchHandler } from "./touch-handling.js";

/**
 * Represents the map and handles all the userinteractions
 * as panning / zooming into the map.
 * @constructor
 * @param {HTMLCanvasElement} canvasElement - the canvas used to display the map on
 */
export function VacuumMap(canvasElement) {
	const canvas = canvasElement;

	const mapDrawer = new MapDrawer();
	const pathDrawer = new PathDrawer();

	const img_charger_scaled = document.createElement('canvas');
	const img_rocky_scaled = document.createElement('canvas');

	let ws;
	let probeTimeout;

	let options = {};

	let currentScale = 1;

	canvas.width = canvas.clientWidth;
	canvas.height = canvas.clientHeight;

	let parsedMap = {}, defaultMap = false, deviceStatus = {};
	let locations = [], storedLocations = {zones: [], segments: []};

	let robotPosition = [25600, 25600];
	let chargerPosition = [25600, 25600];
	let robotAngle = 0;

	let redrawCanvas = null;

	let lastTap = {x: null, y: null, d: 0};

	function probeWebSocket() {
		clearTimeout(probeTimeout);
		probeTimeout = setTimeout(() => {
			if (ws.isAlive === false || ws.readyState !== 1) {
				initWebSocket();
				return;
			}
			ws.isAlive = false;
			ws.send("p");
			probeWebSocket();
		}, 5e3);
	};

	function initWebSocket() {
		const protocol = location.protocol === "https:" ? "wss" : "ws";

		closeWebSocket();
		clearTimeout(probeTimeout);

		let url = window.location.host + window.location.pathname;
		if ('urlOverride' in localStorage) {
			url = localStorage['urlOverride'].replace(/^.+:\/\/(.*?)\/?$/,"$1") + '/'
		}
		
		ws = new WebSocket(protocol + '://' + url);
		ws.binaryType = "arraybuffer";

		ws.onerror = function() {
			setTimeout(() => { initWebSocket() },5e3);
		};

		ws.onmessage = function(event) {
			ws.isAlive = true;
			probeWebSocket();
			if (event.data.constructor === ArrayBuffer) {
				let data = parseMap(event.data);
				updateMap(data);
			} else if (event.data.startsWith('{"status":')) {
				try {
					let data = JSON.parse(event.data);
					deviceStatus = data.status;
					canvas.dispatchEvent(new CustomEvent('updateStatus', {detail: deviceStatus}));
				} catch(e) {}
			} else if (event.data.startsWith('{"restoreLocations":')) {
				restoreLocations();
			}
		};

		ws.onopen = function(event) {
			probeWebSocket();
		}
	}

	function closeWebSocket() {
		if (ws) {
			ws.close();
		}
		clearTimeout(probeTimeout);
	}

	function parseMap(gzippedMap) {
		try {
			defaultMap = false;
			return gzippedMap && gzippedMap.byteLength && RRMapParser.PARSE(pako.inflate(gzippedMap)) || (defaultMap = true, FallbackMap.parsedData());
		} catch (e) { console.log(e); };
		return null;
	}

	function getSegmentPoints(idx) {
		idx = idx << 1;
		let pixels = [];
		for (let i in parsedMap.image.pixels) {
			if (parsedMap.image.pixels[i] === idx) {
				pixels.push(i);
			}
		}
		return pixels;
	}

	function updateSegments() {
		let segment, newSegments = [];
		let zonesPresent = locations.some(l => l instanceof Zone);
		if (parsedMap.image && parsedMap.image.segments.count > 1)
		for (let idx in parsedMap.image.segments.center) {
			idx = +idx;
			let existing, highlighted, sequence;
			let center = {
				x: parsedMap.image.segments.center[idx].x/parsedMap.image.segments.center[idx].count,
				y: parsedMap.image.segments.center[idx].y/parsedMap.image.segments.center[idx].count
			};
			highlighted = false;
			sequence = 0;
			existing = locations.find(l => (l instanceof Segment) && l.idx === idx);
			if (existing) {
				highlighted = existing.highlighted;
				sequence = existing.sequence;
			}
			segment = new Segment(idx, getSegmentPoints(idx), center);
			segment.hidden = zonesPresent;
			if (highlighted) {
				segment.highlighted = true;
				segment.changed = true;
				segment.sequence = sequence;
			}
			if (options.segmentNames) {
				segment.name = options.segmentNames[idx] || "#" + idx;
			}
			if ((deviceStatus.in_cleaning === 3) && parsedMap.currently_cleaned_blocks && parsedMap.currently_cleaned_blocks.includes(idx)) {
				segment.current = true;
				segment.changed = true;
			}
			newSegments.push(segment);
		}
		locations = locations.filter(l => !(l instanceof Segment)).concat(newSegments);
	}

    function updateForbiddenZones(forbiddenZoneData, mop) {
        locations = locations
            .filter(l => !(l instanceof (mop ? ForbiddenMopZone : ForbiddenZone)))
            .concat(forbiddenZoneData.map(zone => {
                const p1 = convertFromRealCoords({x: zone[0], y: zone[1]});
                const p2 = convertFromRealCoords({x: zone[2], y: zone[3]});
                const p3 = convertFromRealCoords({x: zone[4], y: zone[5]});
                const p4 = convertFromRealCoords({x: zone[6], y: zone[7]});
                return new (mop ? ForbiddenMopZone : ForbiddenZone)(
                    p1.x, p1.y,
                    p2.x, p2.y,
                    p3.x, p3.y,
                    p4.x, p4.y
                );
            }));
    }

	function updateGotoTarget(gotoTarget) {
		locations = locations
			.filter(l => !(l instanceof GotoTarget))
		if(gotoTarget) {
			const p1 = convertFromRealCoords({x: gotoTarget[0], y: gotoTarget[1]});
			locations.push(new GotoTarget(p1.x, p1.y));
		}
	}

	function updateCurrentZones(currentZoneData) {
		locations = locations
			.filter(l => !(l instanceof CurrentCleaningZone))
			.concat(currentZoneData.map(zone => {
				const p1 = convertFromRealCoords({x: zone[0], y: zone[1]});
				const p2 = convertFromRealCoords({x: zone[2], y: zone[3]});
				return new CurrentCleaningZone(new DOMPoint(p1.x, p1.y), new DOMPoint(p2.x, p2.y));
			}));
	}

	function updateVirtualWalls(virtualWallData) {
		locations = locations
			.filter(l => !(l instanceof VirtualWall))
			.concat(virtualWallData.map(wall => {
				const p1 = convertFromRealCoords({x: wall[0], y: wall[1]});
				const p2 = convertFromRealCoords({x: wall[2], y: wall[3]});
				return new VirtualWall(p1.x, p1.y, p2.x, p2.y);
			}));
	}

	function updateMapMetadata() {
		updateGotoTarget(parsedMap.goto_target);
		updateForbiddenZones(parsedMap.forbidden_zones || []);
		updateForbiddenZones(parsedMap.forbidden_mop_zones || [], true);
		updateVirtualWalls(parsedMap.virtual_walls|| []);
		updateCurrentZones((deviceStatus.in_cleaning === 2) && parsedMap.currently_cleaned_zones || []);
	}

	/**
	 * Public function to update mapdata and call internal update to redraw it.
	 * Data is distributed into the subcomponents for rendering the map / path.
	 * @param {object} mapData - parsed by RRMapParser data from "/api/map/latest" route
	 * @param {bool} initial - should be set to true when user reopens the map
	 */
	function updateMap(mapData,initial) {
		parsedMap = mapData;
		checkTranslatePosition();
		updateMapInt();
	}

	// makes sure map is still visible on canvas and fixes that if it's not
	function checkTranslatePosition(forced) {
		const ctx = canvas.getContext('2d'), tmatrix = ctx.getTransform();
		if (forced || !(-tmatrix.e < (parsedMap.image.box.maxX - 50)*currentScale && -tmatrix.e > (parsedMap.image.box.minX + 50)*currentScale - canvas.width)) {
			tmatrix.e = (-parsedMap.image.box.minX + 25)*currentScale;
		}
		if (forced || !(-tmatrix.f < (parsedMap.image.box.maxY - 50)*currentScale && -tmatrix.f > (parsedMap.image.box.minY + 50)*currentScale - canvas.height)) {
			tmatrix.f = (-parsedMap.image.box.minY + 25)*currentScale;
		}
		ctx.setTransform(tmatrix.a,tmatrix.b,tmatrix.c,tmatrix.d,tmatrix.e,tmatrix.f);
	}

	/**
	 * Private function to update the displayed mapdata periodically.
	 */
	function updateMapInt() {
		mapDrawer.draw(parsedMap.image);
		if (options.noPath) {
			pathDrawer.setPath({},{});
		} else {
			pathDrawer.setPath(parsedMap.path, parsedMap.goto_predicted_path);
		}
		pathDrawer.draw();

		robotPosition = parsedMap.robot || robotPosition;
		robotAngle = parsedMap.robot_angle || robotAngle;
		chargerPosition = parsedMap.charger || chargerPosition;

		if (options.showSegments) {
			updateSegments();
		}

		switch (options.metaData) {
			case false:
			case "none": break;
			case "forbidden":
				updateForbiddenZones(parsedMap.forbidden_zones || []);
				updateForbiddenZones(parsedMap.forbidden_mop_zones || [], true);
				updateVirtualWalls(parsedMap.virtual_walls|| []);
				break;
			default: updateMapMetadata();
		}

		if (redrawCanvas) redrawCanvas();
	}

	/**
	 * Transforms coordinates in mapspace (1024*1024) into the millimeter format
	 * accepted by the goto / zoned_cleanup api endpoints
	 * @param {{x: number, y: number}} coordinatesInMapSpace
	 */
	function convertToRealCoords(coordinatesInMapSpace) {
		return { x: Math.round(coordinatesInMapSpace.x * 50), y: Math.round(coordinatesInMapSpace.y * 50) };
	}

	/**
	 * Transforms coordinates in the millimeter format into the mapspace (1024*1024)
	 * @param {{x: number, y: number}} coordinatesInMillimeter
	 */
	function convertFromRealCoords(coordinatesInMillimeter) {
		return { x: coordinatesInMillimeter.x / 50, y: coordinatesInMillimeter.y / 50 };
	}

	/**
	 * Sets up the canvas for tracking taps / pans / zooms and redrawing the map accordingly
	 * @param {object} mapData - parsed by RRMapParser data from "/api/map/latest" route
	 */
	function initCanvas(gzippedMapData, opts) {
		const mapData = parseMap(gzippedMapData);
		parsedMap = mapData;
		if (opts) options = opts;
		let ctx = canvas.getContext('2d');
		ctx.imageSmoothingEnabled = false;
		trackTransforms(ctx);

		canvas.addEventListener('resizeCanvas', () => {
			// Save the current transformation and recreate it
			// as the transformation state is lost when changing canvas size
			// https://stackoverflow.com/questions/48044951/canvas-state-lost-after-changing-size
			const {a, b, c, d, e, f} = ctx.getTransform();

			canvas.height = canvas.clientHeight;
			canvas.width = canvas.clientWidth;

			ctx.setTransform(a, b, c, d, e, f);
			ctx.imageSmoothingEnabled = false;

			redraw();
		});

		const boundingBox = parsedMap.image.box;
		const initialScalingFactor = Math.max(Math.min(Math.min(
			canvas.width / (boundingBox.maxX - boundingBox.minX + 50),
			canvas.height / (boundingBox.maxY - boundingBox.minY + 50)
		),6.5),0.7);
		if (options.controlMap) {
			currentScale = Math.min(5.4, canvas.width / 80);
		} else if (!defaultMap) {
			const sst = fetchScaleTranslate();
			currentScale = sst.z >= 0.7 && sst.z <= 6.5 ? sst.z : initialScalingFactor;
			ctx.scale(currentScale, currentScale);
			if (!isNaN(sst.x) && !isNaN(sst.y)) {
				ctx.translate(-sst.x,-sst.y);
			}
			checkTranslatePosition();
		} else {
			currentScale = initialScalingFactor;
			ctx.scale(currentScale, currentScale);
			checkTranslatePosition(true);
		}

		function clearContext(ctx) {
			ctx.save();
			ctx.setTransform(1, 0, 0, 1, 0, 0);
			ctx.clearRect(0, 0, canvas.width, canvas.height);
			ctx.restore();
		}

		function scaleIcons(multiplier) {
			multiplier = Math.max(10/fn.chargerImg.width,10/fn.chargerImg.width * multiplier);
			let ctx, dim = fn.chargerImg.width*multiplier;
			[[fn.chargerImg,img_charger_scaled],[fn.robotImg,img_rocky_scaled]].forEach(images => {
				const [image,image_scaled] = images;
				image_scaled.width = dim;
				image_scaled.height = dim;
				ctx = image_scaled.getContext('2d');
				ctx.imageSmoothingQuality = 'high';
				ctx.clearRect(0, 0, image_scaled.width, image_scaled.height);
				ctx.drawImage(image, 0, 0, image_scaled.width, image_scaled.height);
			});
		}

		function drawCharger(ctx, transformMapToScreenSpace) {
			const chargerPositionInPixels = new DOMPoint(chargerPosition[0] / 50, chargerPosition[1] / 50).matrixTransform(transformMapToScreenSpace);
			ctx.drawImage(
				img_charger_scaled,
				chargerPositionInPixels.x - img_charger_scaled.width / 2,
				chargerPositionInPixels.y - img_charger_scaled.height / 2
			);
		}

		function drawRobot(ctx, transformMapToScreenSpace) {
			function rotateRobot(img, angle) {
				var canvasimg = document.createElement("canvas");
				canvasimg.width = img.width + 4;
				canvasimg.height = img.height + 4
				var ctximg = canvasimg.getContext('2d');
				ctximg.imageSmoothingQuality = 'high';
				ctximg.clearRect(0, 0, canvasimg.width, canvasimg.height);
				ctximg.translate(canvasimg.width / 2, canvasimg.height / 2);
				ctximg.rotate(angle * Math.PI / 180);
				ctximg.drawImage(img, -img.width / 2, -img.height / 2);
				return canvasimg;
			}
			const robotPositionInPixels = new DOMPoint(robotPosition[0] / 50, robotPosition[1] / 50).matrixTransform(transformMapToScreenSpace);
			const robotIcon = robotAngle && !options.controlMap ? rotateRobot(img_rocky_scaled, robotAngle) : img_rocky_scaled;
			ctx.drawImage(
				robotIcon,
				robotPositionInPixels.x - robotIcon.width / 2,
				robotPositionInPixels.y - robotIcon.height / 2,
			);
			if (options.controlMap) {
				ctx.save();
				ctx.lineWidth = Math.max(2,currentScale*0.7);
				ctx.strokeStyle = 'rgba(255,0,0,0.8)';
				ctx.setLineDash([Math.max(6,currentScale*3), Math.max(2,currentScale*1)]);
				ctx.beginPath();
				ctx.moveTo(robotPositionInPixels.x, robotPositionInPixels.y + img_rocky_scaled.height/1.2);
				ctx.lineTo(robotPositionInPixels.x, robotPositionInPixels.y + img_rocky_scaled.height*4);
				ctx.moveTo(robotPositionInPixels.x, robotPositionInPixels.y - img_rocky_scaled.height/1.2);
				ctx.lineTo(robotPositionInPixels.x, robotPositionInPixels.y - img_rocky_scaled.height*4);
				ctx.moveTo(robotPositionInPixels.x + img_rocky_scaled.height/1.2, robotPositionInPixels.y);
				ctx.lineTo(robotPositionInPixels.x + img_rocky_scaled.height*4,   robotPositionInPixels.y);
				ctx.moveTo(robotPositionInPixels.x - img_rocky_scaled.height/1.2, robotPositionInPixels.y);
				ctx.lineTo(robotPositionInPixels.x - img_rocky_scaled.height*4,   robotPositionInPixels.y);
				ctx.stroke();
				ctx.restore();
			}
		}

		/**
		 * Carries out a drawing routine on the canvas with resetting the scaling / translation of the canvas
		 * and restoring it afterwards.
		 * This allows for drawing equally thick lines no matter what the zoomlevel of the canvas currently is.
		 * @param {CanvasRenderingContext2D} ctx - the rendering context to draw on (needs to have "trackTransforms" applied)
		 * @param {function} f - the drawing routine to carry out on the rendering context
		 */
		function usingOwnTransform(ctx, f) {
			const transform = ctx.getTransform();
			ctx.save();
			ctx.setTransform(1, 0, 0, 1, 0, 0);
			f(ctx, transform);
			ctx.restore();
		}

		/**
		 * The function for rendering everything
		 * - Applies the map image from a seperate canvas inside the mapDrawer
		 * - Applies the path image from a seperate canvas inside the pathDrawer
		 *   - The path is redrawn in different zoom levels to enable a smoother image.
		 *	 Therefore the canvas is inversely scaled before drawing the path to account for this scaling.
		 * - Draws the locations ( goto point or zone )
		 */
		function redraw() {
			clearContext(ctx);
			if (options.controlMap) {
				ctx.setTransform(currentScale, 0, 0, currentScale, 0, 0);
				if (robotAngle) ctx.rotate((-robotAngle % 360)*Math.PI / 180);
				const transformedPoint = new DOMPoint(robotPosition[0] / 50, robotPosition[1] / 50).matrixTransform(ctx.getTransform());
				const {a, b, c, d, e, f} = ctx.getTransform();
				ctx.setTransform(a, b, c, d, Math.floor(canvas.width/2 - e - transformedPoint.x), Math.floor(canvas.height/2 - f - transformedPoint.y)); // there should be a better way, obviously
			}
			// place map
			ctx.drawImage(mapDrawer.canvas, 0, 0);

			// place segments
			locations.filter(location => location instanceof Segment).forEach(segment => {
				segment.drawPixels(ctx);
			});

			// place path
			let pathScale = pathDrawer.getScaleFactor();
			ctx.scale(1 / pathScale, 1 / pathScale);
			ctx.drawImage(pathDrawer.canvas, 0, 0);

			// place locations
			ctx.scale(pathScale, pathScale);
			usingOwnTransform(ctx, (ctx, transform) => {
				let zoneNumber = 0;
				// we'll define locations drawing order (currently it's reversed) so the former location types is drawn over the latter ones
				let activeLocation = null, locationTypes = {GotoPoint: 0, Segment: 1, Zone: 2, VirtualWall: 3, ForbiddenZone: 4, ForbiddenMopZone: 5, CurrentCleaningZone: 6};
				locations.sort((a,b) => {return locationTypes[b.constructor.name] - locationTypes[a.constructor.name]; });
				locations.forEach(location => {
					if (location instanceof GotoPoint) {
						return;
					}
					if (location instanceof Zone) {
						location.sequence = ++zoneNumber;
					}
					// also we would like to draw currently active location wherever is it over the all other locations, so we'll do it via this ugly way
					if (activeLocation || !location.active) {
						location.draw(ctx, transform, Math.min(5,currentScale));
					} else {
						activeLocation = location;
					}
				});
				if (activeLocation) {
					activeLocation.draw(ctx, transform, Math.min(5,currentScale));
				}
				// place objects above locations
				drawCharger(ctx, transform);
				drawRobot(ctx, transform);
				// place goto point above everything
				let location = locations.filter(location => location instanceof GotoPoint);
				if (location[0]) {
					location[0].draw(ctx, transform, Math.min(5,currentScale));
				}
			});
		}
		redrawCanvas = redraw;

		pathDrawer.scale(currentScale, {noDraw: true});
		scaleIcons(currentScale);

		updateMapInt();

		function storeScaleTranslate() {
			if (defaultMap) return
			const { x, y } = ctx.transformedPoint(0,0);
			localStorage.setItem('scaleTranslate', JSON.stringify({x: x, y: y, z: currentScale}));
		}

		function fetchScaleTranslate() {
			try {
				return JSON.parse(localStorage.getItem('scaleTranslate')) || {};
			} catch (e) { return {}; }
		}

		let lastX = canvas.width / 2, lastY = canvas.height / 2,
			dragStart;

		function startTranslate(evt) {
			const { x, y } = relativeCoordinates(evt.coordinates, canvas);
			lastX = x
			lastY = y;
			dragStart = ctx.transformedPoint(lastX, lastY);
		}

		function moveTranslate(evt) {
			const { x, y } = relativeCoordinates(evt.currentCoordinates, canvas);
			const oldX = lastX;
			const oldY = lastY;
			lastX = x;
			lastY = y;

			if (dragStart) {
				// Let each location handle the panning event
				// the location can return a stopPropagation bool which
				// stops the event handling by other locations / the main canvas
				for(let i = 0; i < locations.length; ++i) {
					const location = locations[i];
					if(typeof location.translate === "function") {
						const result = location.translate(
							dragStart.matrixTransform(ctx.getTransform().inverse()),
							{x: oldX, y: oldY},
							{x, y},
							ctx.getTransform()
						);
						if(result.updatedLocation) {
							locations[i] = result.updatedLocation;
						}
						if(result.stopPropagation === true) {
							redraw();
							return;
						}
					}
				}
				// locations could be removed
				// not quite nice to handle with the for loop
				locations = locations.filter(location => location !== null);

				// If no location stopped event handling -> pan the whole map
				const pt = ctx.transformedPoint(lastX, lastY);
				ctx.translate(pt.x - dragStart.x, pt.y - dragStart.y);
				redraw();
			}
		}

		function endTranslate(evt) {
			dragStart = null;
			locations.forEach(location => location.isResizing && (location.isResizing = false));
			storeScaleTranslate();
			redraw();
		}

		function tap(evt) {
			const { x, y } = relativeCoordinates(evt.tappedCoordinates, canvas);
			const tappedX = x;
			const tappedY = y;
			const tappedPoint = ctx.transformedPoint(tappedX, tappedY);

			// Let each location handle the tapping event
			// the location can return a stopPropagation bool which
			// stops the event handling by other locations / the main canvas
			// first process active location, rest process later. TODO: try to do it less stupid way
			var currentlyActive = -1, takenAction = false;
			var processTap = function(i,locations) {
				const location = locations[i];
				if(typeof location.tap === "function" && !(location instanceof Segment && locations.some(l => l instanceof Zone))) {
					const result = location.tap({x: tappedX, y: tappedY}, ctx.getTransform()) || {};
					if(result.updatedLocation) {
						locations[i] = result.updatedLocation;
						takenAction = true;
					} else if (result.removeLocation) {
						if (locations[i] instanceof Zone && locations.filter(l => l instanceof Zone).length < 2) {
							locations.filter(l => l instanceof Segment).forEach(l => {
								l.hidden = false;
							});
						}
						locations.splice(i, 1);
						emitZoneSelection(false);
						takenAction = true;
					} else if (result.selectLocation) {
						locations.forEach(l => l === locations[i] && (l.active = true) || (l.active = false));
						if (locations[i] instanceof Zone) {
							emitZoneSelection(true, locations.filter(location => location instanceof Zone).indexOf(locations[i]) > 0);
						}
						takenAction = true;
					} else if (result.deselectLocation) {
						locations.forEach(l => l === locations[i] && (l.active = false));
						emitZoneSelection(false);
						takenAction = true;
					} else if (result.highlightChanged !== undefined) {
						emitSegmentSelection();
						if (result.highlightChanged) {
							location.sequence = locations.filter(l => l instanceof Segment && l.highlighted).length;
						} else {
							location.sequence = 0;
							let i = 1; locations.filter(l => l instanceof Segment && l.highlighted).sort((a,b) => a.sequence - b.sequence).forEach(l => {l.sequence = i++});
						}
					}
					if(result.stopPropagation === true) {
						redraw();
						return true;
					}
				}
				return false;
			}
			for(let i = locations.length - 1; i >= 0; i--) {
				if (!locations[i].active) continue;
				currentlyActive = i;
				if (processTap(i,locations)) return;
			}
			for(let i = locations.length - 1; i >= 0; i--) {
				if (i === currentlyActive) continue;
				if (processTap(i,locations)) return;
			}

			// setting points if allowed
			locations = locations.filter(l => !(l instanceof GotoPoint));
			if(!takenAction && !options.noGotoPoints) {
				locations.push(new GotoPoint(tappedPoint.x, tappedPoint.y));
				// show current coordinates in alert message by double tap (but only when allowed to set a new point on the map)
				if ((Date.now() - lastTap.d < 5e2) && Math.abs(lastTap.x - tappedPoint.x) < 10 && Math.abs(lastTap.y - tappedPoint.y) < 10) {
					window.alert(JSON.stringify(convertToRealCoords(lastTap)));
					lastTap = {x: null, y: null, d: 0};
				} else {
					lastTap = {x: tappedPoint.x, y: tappedPoint.y, d: Date.now()};
				}

			}

			redraw();
		}

		const touchHandler = new TouchHandler(canvas);

		canvas.addEventListener("tap", tap);
		canvas.addEventListener('panstart', startTranslate);
		canvas.addEventListener('panmove', moveTranslate);
		canvas.addEventListener('panend', endTranslate);
		canvas.addEventListener('pinchstart', startPinch);
		canvas.addEventListener('pinchmove', scalePinch);
		canvas.addEventListener('pinchend', endPinch);


		let lastScaleFactor = 1;
		function startPinch(evt) {
			lastScaleFactor = 1;

			// translate
			const { x, y } = relativeCoordinates(evt.center, canvas);
			lastX = x
			lastY = y;
			dragStart = ctx.transformedPoint(lastX, lastY);
		}

		function endPinch(evt) {
			const [scaleX, scaleY] = ctx.getScaleFactor2d();
			pathDrawer.scale(scaleX);
			scaleIcons(scaleX);
			currentScale = scaleX;
			endTranslate(evt);
		}

		function scalePinch(evt) {
			const factor = evt.scale / lastScaleFactor;
			lastScaleFactor = evt.scale;
			const pt = ctx.transformedPoint(evt.center.x, evt.center.y);
			ctx.save();
			ctx.translate(pt.x, pt.y);
			ctx.scale(factor, factor);
			ctx.translate(-pt.x, -pt.y);

			const [scaleX, scaleY] = ctx.getScaleFactor2d();

			if (scaleX > 6.5 || scaleX < 0.7) {
				ctx.restore();
				return evt.preventDefault() && false;
			}

			// translate
			const { x, y } = relativeCoordinates(evt.center, canvas);
			lastX = x;
			lastY = y;
			const p = ctx.transformedPoint(lastX, lastY);
			ctx.translate(p.x - dragStart.x, p.y - dragStart.y);

			currentScale = scaleX;

			redraw();
		}

		const scaleFactor = 1.1;
		/**
		 * Handles zooming by using the mousewheel.
		 * @param {MouseWheelEvent} evt
		 */
		const handleScroll = function (evt) {
			const delta = evt.wheelDelta ? evt.wheelDelta / 40 : evt.detail ? -evt.detail : 0;
			if (delta) {
				const pt = ctx.transformedPoint(evt.offsetX, evt.offsetY);
				ctx.save();
				ctx.translate(pt.x, pt.y);
				const factor = Math.pow(scaleFactor, delta);
				ctx.scale(factor, factor);
				ctx.translate(-pt.x, -pt.y);

				const [scaleX, scaleY] = ctx.getScaleFactor2d();
				if (scaleX > 6.5 || scaleX < 0.7) {
					ctx.restore();
					return evt.preventDefault() && false;
				}
				pathDrawer.scale(scaleX);
				scaleIcons(scaleX);
				currentScale = scaleX;
				storeScaleTranslate();
				redraw();
			}
			return evt.preventDefault() && false;
		};

		canvas.addEventListener('DOMMouseScroll', handleScroll, false);
		canvas.addEventListener('mousewheel', handleScroll, false);
	};

	const prepareGotoCoordinatesForApi = (gotoPoint) => {
		const point = convertToRealCoords(gotoPoint);
		return {
			x: point.x,
			y: point.y
		};
	};

	const prepareZoneCoordinatesForApi = (zone) => {
		const p1Real = convertToRealCoords({x: zone.x1, y: zone.y1});
		const p2Real = convertToRealCoords({x: zone.x2, y: zone.y2});

		return [
			Math.min(p1Real.x, p2Real.x),
			Math.min(p1Real.y, p2Real.y),
			Math.max(p1Real.x, p2Real.x),
			Math.max(p1Real.y, p2Real.y),
			zone.iterations
		];
	};

	const prepareWallCoordinatesForApi = (virtualWall) => {
		const p1Real = convertToRealCoords({x: virtualWall.x1, y: virtualWall.y1});
		const p2Real = convertToRealCoords({x: virtualWall.x2, y: virtualWall.y2});
		return [
			p1Real.x,
			p1Real.y,
			p2Real.x,
			p2Real.y
		];
	};

	const prepareFobriddenZoneCoordinatesForApi = (Zone) => {
		const p1Real = convertToRealCoords({x: Zone.x1, y: Zone.y1});
		const p2Real = convertToRealCoords({x: Zone.x2, y: Zone.y2});
		const p3Real = convertToRealCoords({x: Zone.x3, y: Zone.y3});
		const p4Real = convertToRealCoords({x: Zone.x4, y: Zone.y4});
		return [p1Real.x,p1Real.y,p2Real.x,p2Real.y,p3Real.x,p3Real.y,p4Real.x,p4Real.y];
	};

	function getLocations() {
		const segments = locations
			.filter(location => location instanceof Segment && location.highlighted)
			.sort((a,b) => a.sequence - b.sequence).map(l => l.idx);

		const zones = locations
			.filter(location => location instanceof Zone)
			.map(prepareZoneCoordinatesForApi);

		const gotoPoints = locations
			.filter(location => location instanceof GotoPoint)
			.map(prepareGotoCoordinatesForApi);

		const virtualWalls = locations
			.filter(location => location instanceof VirtualWall)
			.map(prepareWallCoordinatesForApi);

		const forbiddenZones = locations
			.filter(location => location instanceof ForbiddenZone && !(location instanceof ForbiddenMopZone))
			.map(prepareFobriddenZoneCoordinatesForApi);

		const forbiddenMopZones = locations
			.filter(location => location instanceof ForbiddenMopZone)
			.map(prepareFobriddenZoneCoordinatesForApi);

		return {
			segments,
			zones,
			gotoPoints,
			virtualWalls,
			forbiddenZones,
            forbiddenMopZones
		};
	}

	function getParsedMap() {
		return parsedMap;
	}

	function addZone(zoneCoordinates, addZoneInactive) {
		let newZone;
		if (zoneCoordinates) {
			const p1 = convertFromRealCoords({x: zoneCoordinates[0], y: zoneCoordinates[1]});
			const p2 = convertFromRealCoords({x: zoneCoordinates[2], y: zoneCoordinates[3]});
			newZone = new Zone(p1.x, p1.y, p2.x, p2.y, zoneCoordinates[4]);
		} else {
			newZone = new Zone(480, 480, 555, 550, 1);
		}

		// check whether this zone has nearly the same left top position as some other zone
		while (locations.some(l => l instanceof Zone && Math.abs(l.x1 - newZone.x1) < 4 && Math.abs(l.y1 - newZone.y1) < 4)) {
			newZone.x1 += 5; newZone.y1 += 5;
			newZone.x2 += 5; newZone.y2 += 5;
		}

		// if there's a zone, hide all segments
		locations.filter(l => l instanceof Segment).forEach(l => {
			l.hidden = true;
			l.highlighted = false;
		});

		locations.forEach(location => location.active = false)
		locations.push(newZone);

		if(addZoneInactive) {
			newZone.active = false;
		} else {
			emitZoneSelection(true, locations.filter(location => location instanceof Zone).length > 1);
		}

		if (redrawCanvas) redrawCanvas();
	}

	function addSpot(spotCoordinates = [25600, 25600]) {
		const p = convertFromRealCoords({x: spotCoordinates[0], y: spotCoordinates[1]});
		const newSpot = new GotoPoint(p.x, p.y);

		locations = locations.filter(l => !(l instanceof GotoPoint));
		locations.forEach(location => location.active = false)
		locations.push(newSpot);
		if (redrawCanvas) redrawCanvas();
	}

	function selectSegment(idx,sequence) {
		let segment = locations.find(l => l instanceof Segment && l.idx === idx);
		if (segment) {
			segment.highlighted = true;
			segment.changed = true;
			segment.sequence = sequence;
			if (redrawCanvas) redrawCanvas();
		}
	}

	function clearLocations() {
		// saving
		storedLocations = {zones: [], segments: []};
		locations.filter(l => l instanceof Zone).forEach(l => {
			storedLocations.zones.push([l.x1,l.y1,l.x2,l.y2,l.iterations,l.sequence]);
		});
		locations.filter(l => l instanceof Segment && !isNaN(l.sequence)).forEach(l => {
			storedLocations.segments.push([l.idx,l.sequence]);
		});
		// clearing
		locations = locations.filter(l => l.editable !== true && !(l instanceof GotoPoint));
		locations.filter(l => l instanceof Segment && !isNaN(l.sequence)).forEach(segment => {
			delete segment.sequence;
			segment.highlighted = false;
			segment.changed = true;
		});
		emitZoneSelection(false);
		if (redrawCanvas) redrawCanvas();
	}

	function restoreLocations() {
		if (!locations.some(l => l instanceof Zone)) {
			storedLocations.zones.forEach(z => {
				let l = new Zone(...z.slice(0,5));
				l.active = false;
				l.sequence = z[5];
				locations.push(l);
			});
		}
		if (!locations.some(l => l instanceof Segment && l.highlighted === true)) {
			let found;
			storedLocations.segments.forEach(segment => {
				if (found = locations.find(l => l instanceof Segment && l.idx === segment[0])) {
					found.highlighted = true;
					found.changed = true;
					found.sequence = segment[1];
				}
			});
		}
		if (redrawCanvas) redrawCanvas();
	}

	function addVirtualWall(wallCoordinates, addWallInactive, wallEditable, isOrthogonal) {
		let newVirtualWall;
		if (wallCoordinates) {
			const p1 = convertFromRealCoords({x: wallCoordinates[0], y: wallCoordinates[1]});
			const p2 = convertFromRealCoords({x: wallCoordinates[2], y: wallCoordinates[3]});
			newVirtualWall = new VirtualWall(p1.x, p1.y, p2.x, p2.y, wallEditable);
		} else {
			newVirtualWall = new VirtualWall(460,480,460,550, wallEditable, isOrthogonal);
		}

		if(addWallInactive) {
			newVirtualWall.active = false;
		}

		locations.forEach(location => location.active = false)
		locations.push(newVirtualWall);
		if (redrawCanvas) redrawCanvas();
	}

	function addForbiddenZone(zoneCoordinates, addZoneInactive, zoneEditable, mop) {
		let newZone;
		if (zoneCoordinates) {
			const p1 = convertFromRealCoords({x: zoneCoordinates[0], y: zoneCoordinates[1]});
			const p2 = convertFromRealCoords({x: zoneCoordinates[2], y: zoneCoordinates[3]});
			const p3 = convertFromRealCoords({x: zoneCoordinates[4], y: zoneCoordinates[5]});
			const p4 = convertFromRealCoords({x: zoneCoordinates[6], y: zoneCoordinates[7]});
			newZone = new (mop ? ForbiddenMopZone : ForbiddenZone)(p1.x, p1.y, p2.x, p2.y, p3.x, p3.y, p4.x, p4.y, zoneEditable);
		} else {
			newZone = new (mop ? ForbiddenMopZone : ForbiddenZone)(480, 480, 550, 480, 550, 550, 480, 550, zoneEditable);
		}

		if(addZoneInactive) {
			newZone.active = false;
		}

		locations.forEach(location => location.active = false)
		locations.push(newZone);
		if (redrawCanvas) redrawCanvas();
	}

	// enabled = any zone is selected,
	// nf = current zone is non-first
	function emitZoneSelection(enabled, nf) {
		canvas.dispatchEvent(new CustomEvent('zoneSelection', {detail: { state: enabled, nf: nf || false }}));
	}

	function emitSegmentSelection() {
		canvas.dispatchEvent(new CustomEvent('segmentSelection', {detail: {}}));
	}

	function promoteCurrentZone() {
		let index, activeLocation = locations.filter(location => location.active)[0];
		if (!(activeLocation instanceof Zone)) {
			return;
		}
		index = locations.indexOf(activeLocation);
		for (let i = index - 1; i >= 0; i--) {
			if (locations[i] instanceof Zone) {
				locations[index] = locations[i];
				locations[i] = activeLocation;
				if (redrawCanvas) redrawCanvas();
				break;
			}
		}
		emitZoneSelection(true, locations.filter(location => location instanceof Zone).indexOf(activeLocation) > 0);
	}

	function addIterationsToZone() {
		let index, activeLocation = locations.filter(location => location.active)[0];
		if (!(activeLocation instanceof Zone)) {
			return;
		}
		if (++activeLocation.iterations > 3) {
			activeLocation.iterations = 1;
		};
		if (redrawCanvas) redrawCanvas();
	}

	function getZoneIterations() {
		let index, activeLocation = locations.filter(location => location.active)[0];
		if (!(activeLocation instanceof Zone)) {
			return 0;
		}
		return activeLocation.iterations;
	}

	function updateSegmentNames(names) {
		options.segmentNames = names;
	}

	return {
		initCanvas: initCanvas,
		initWebSocket: initWebSocket,
		closeWebSocket: closeWebSocket,
		parseMap: parseMap,
		updateMap: updateMap,
		getLocations: getLocations,
		getParsedMap: getParsedMap,
		addZone: addZone,
		addSpot: addSpot,
		selectSegment: selectSegment,
		clearLocations: clearLocations,
		addVirtualWall: addVirtualWall,
		addForbiddenZone: addForbiddenZone,
		promoteCurrentZone: promoteCurrentZone,
		addIterationsToZone: addIterationsToZone,
		getZoneIterations: getZoneIterations,
		updateSegmentNames: updateSegmentNames
	};
}

/**
 * Helper function for calculating coordinates relative to an HTML Element
 * @param {{x: number, y: number}} "{x, y}" - the absolute screen coordinates (clicked)
 * @param {*} referenceElement - the element (e.g. a canvas) to which
 * relative coordinates should be calculated
 * @returns {{x: number, y: number}} coordinates relative to the referenceElement
 */
function relativeCoordinates({ x, y }, referenceElement) {
	var rect = referenceElement.getBoundingClientRect();
	return {
		x: x - rect.left,
		y: y - rect.top
	};
}