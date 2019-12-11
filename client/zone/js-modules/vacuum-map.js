import { RRMapParser } from "./rr-map-parser.js";
import { FallbackMap } from "./fallback-map.js";
import { MapDrawer } from "./map-drawer.js";
import { PathDrawer } from "./path-drawer.js";
import { trackTransforms } from "./tracked-canvas.js";
import { GotoPoint, Zone, ForbiddenZone, VirtualWall, CurrentCleaningZone, GotoTarget } from "./locations.js";
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
    let coords = [];

    let parsedForbiddenMarkers = {forbidden_zones: [], virtual_walls: []};

    let ws;
    let probeTimeout;

    let options = {};

    let currentScale = 1;

    canvas.width = canvas.clientWidth;
    canvas.height = canvas.clientHeight;

    let locations = [];

    let redrawCanvas = null;

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
        coords = [];

        closeWebSocket();
        clearTimeout(probeTimeout);
        ws = new WebSocket(`${protocol}://${window.location.host}/`);
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
            } else if (event.data.slice(0,10) === '{"status":') {
                try {
                    let data = JSON.parse(event.data);
                    updateStatus(data.status);
                } catch(e) {
                    //TODO something reasonable
                    console.log(e);
                }
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
            return gzippedMap && gzippedMap.byteLength && RRMapParser.PARSE(pako.inflate(gzippedMap)) || FallbackMap.parsedData;
        } catch (e) { console.log(e); };
        return null;
    }

    function updateForbiddenZones(forbiddenZoneData) {
        locations = locations
            .filter(l => !(l instanceof ForbiddenZone))
            .concat(forbiddenZoneData.map(zone => {
                const p1 = convertFromRealCoords({x: zone[0], y: zone[1]});
                const p2 = convertFromRealCoords({x: zone[2], y: zone[3]});
                const p3 = convertFromRealCoords({x: zone[4], y: zone[5]});
                const p4 = convertFromRealCoords({x: zone[6], y: zone[7]});
                return new ForbiddenZone(
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

    function updateMapMetadata(mapData) {
        updateGotoTarget(mapData.goto_target);
        updateCurrentZones(mapData.currently_cleaned_zones || []);
        updateForbiddenZones(mapData.forbidden_zones || []);
        updateVirtualWalls(mapData.virtual_walls|| []);
    }

    /**
     * Public function to update the displayed mapdata periodically.
     * Data is distributed into the subcomponents for rendering the map / path.
     * @param {object} mapData - parsed by RRMapParser data from "/api/map/latest" route
     */
    function updateMap(mapData) {
        parsedForbiddenMarkers = {forbidden_zones: mapData.forbidden_zones, virtual_walls: mapData.virtual_walls}; // todo: move it somewhere more reasonable?
        mapDrawer.draw(mapData.image);
        if (options.noPath) {
            pathDrawer.setPath({}, mapData.robot, mapData.charger, {});
        } else {
            pathDrawer.setPath(mapData.path, mapData.robot, mapData.charger, mapData.goto_predicted_path);
        }
        pathDrawer.draw();

        switch (options.metaData) {
            case "none": break;
            case "forbidden": updateForbiddenZones(mapData.forbidden_zones || []); updateVirtualWalls(mapData.virtual_walls|| []); break;
            default: updateMapMetadata(mapData);
        }

        if (redrawCanvas) redrawCanvas();
    }

    /**
     * Private function to fire status updates onto the map page (currently got from websocket connections only)
     * @param {object} status - the json data as in dummycloud.connectedRobot.status
     */
    function updateStatus(status) {
        canvas.dispatchEvent(new CustomEvent('updateStatus', {detail: status}));
    }

    /**
     * Transforms coordinates in mapspace (1024*1024) into the millimeter format
     * accepted by the goto / zoned_cleanup api endpoints
     * @param {{x: number, y: number}} coordinatesInMapSpace
     */
    function convertToRealCoords(coordinatesInMapSpace) {
        return { x: Math.floor(coordinatesInMapSpace.x * 50), y: Math.floor(coordinatesInMapSpace.y * 50) };
    }

    /**
     * Transforms coordinates in the millimeter format into the mapspace (1024*1024)
     * @param {{x: number, y: number}} coordinatesInMillimeter
     */
    function convertFromRealCoords(coordinatesInMillimeter) {
        return { x: Math.floor(coordinatesInMillimeter.x / 50), y: Math.floor(coordinatesInMillimeter.y / 50) };
    }

    /**
     * Sets up the canvas for tracking taps / pans / zooms and redrawing the map accordingly
     * @param {object} mapData - parsed by RRMapParser data from "/api/map/latest" route
     */
    function initCanvas(gzippedMapData, opts) {
        const mapData = parseMap(gzippedMapData);
        parsedForbiddenMarkers = {forbidden_zones: mapData.forbidden_zones, virtual_walls: mapData.virtual_walls}; // todo: move it somewhere more reasonable?
        if (opts) options = opts;
        let ctx = canvas.getContext('2d');
        ctx.imageSmoothingEnabled = false;
        trackTransforms(ctx);

        window.addEventListener('resize', () => {
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

        mapDrawer.draw(mapData.image);

        switch (options.metaData) {
            case false:
            case "none": break;
            case "forbidden": updateForbiddenZones(mapData.forbidden_zones || []); updateVirtualWalls(mapData.virtual_walls|| []); break;
            default: updateMapMetadata(mapData);
        }

        const boundingBox = {
            minX: mapData.image.position.left,
            minY: mapData.image.position.top,
            maxX: mapData.image.position.left + mapData.image.dimensions.width,
            maxY: mapData.image.position.top + mapData.image.dimensions.height
        }
        const initialScalingFactor = Math.min(
            canvas.width / (boundingBox.maxX - boundingBox.minX),
            canvas.height / (boundingBox.maxY - boundingBox.minY)
        );
        currentScale = initialScalingFactor;

        if (options.noPath) {
            pathDrawer.setPath({}, mapData.robot, mapData.charger, {});
        } else {
            pathDrawer.setPath(mapData.path, mapData.robot, mapData.charger, mapData.goto_predicted_path);
        }
        pathDrawer.scale(initialScalingFactor);

        ctx.scale(initialScalingFactor, initialScalingFactor);
        ctx.translate(-boundingBox.minX, -boundingBox.minY);

        function clearContext(ctx) {
            ctx.save();
            ctx.setTransform(1, 0, 0, 1, 0, 0);
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            ctx.restore();
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
         *     Therefore the canvas is inversely scaled before drawing the path to account for this scaling.
         * - Draws the locations ( goto point or zone )
         */
        function redraw() {
            clearContext(ctx);

            ctx.drawImage(mapDrawer.canvas, 0, 0);

            let pathScale = pathDrawer.getScaleFactor();
            ctx.scale(1 / pathScale, 1 / pathScale);
            ctx.drawImage(pathDrawer.canvas, 0, 0);
            ctx.scale(pathScale, pathScale);

            usingOwnTransform(ctx, (ctx, transform) => {
                // we'll define locations drawing order (currently it's reversed) so the former location types is drawn over the latter ones
                let zoneNumber = 0;
                let activeLocation = null, locationTypes = {Zone: 2, VirtualWall: 3, ForbiddenZone: 4, CurrentCleaningZone: 5};
                locations.sort((a,b) => {return locationTypes[b.constructor.name] - locationTypes[a.constructor.name]; });
                locations.forEach(location => {
                    if (location instanceof GotoPoint) {
                        return;
                    }
                    if (location instanceof Zone) {
                        zoneNumber++;
                    }
                    // also we would like to draw currently active location wherever is it over the all other locations, so we'll do it via this ugly way
                    if (activeLocation || !location.active) {
                        location.draw(ctx, transform, Math.min(5,currentScale), zoneNumber);
                    } else {
                        activeLocation = [location,zoneNumber];
                    }
                });
                if (activeLocation) {
                    activeLocation[0].draw(ctx, transform, Math.min(5,currentScale), activeLocation[1]);
                }
            });
            // place objects above all the zones
            ctx.scale(1 / pathScale, 1 / pathScale);
            ctx.drawImage(pathDrawer.canvasObjects, 0, 0);
            ctx.scale(pathScale, pathScale);
            // place goto point above everything
            usingOwnTransform(ctx, (ctx, transform) => {
                let location = locations.filter(location => location instanceof GotoPoint);
                if (location[0]) {
                    location[0].draw(ctx, transform, Math.min(5,currentScale));
                }
            });
        }
        redraw();
        redrawCanvas = redraw;

        let lastX = canvas.width / 2, lastY = canvas.height / 2;

        let dragStart;

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
                if(typeof location.tap === "function") {
                    const result = location.tap({x: tappedX, y: tappedY}, ctx.getTransform());
                    if(result.updatedLocation) {
                        locations[i] = result.updatedLocation;
                        takenAction = true;
                    } else if (result.removeLocation) {
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
            currentScale = scaleX;
            endTranslate(evt);
        }

        function scalePinch(evt) {
            const factor = evt.scale / lastScaleFactor;
            lastScaleFactor = evt.scale;
            const pt = ctx.transformedPoint(evt.center.x, evt.center.y);
            ctx.translate(pt.x, pt.y);
            ctx.scale(factor, factor);
            ctx.translate(-pt.x, -pt.y);

            // translate
            const { x, y } = relativeCoordinates(evt.center, canvas);
            lastX = x;
            lastY = y;
            const p = ctx.transformedPoint(lastX, lastY);
            ctx.translate(p.x - dragStart.x, p.y - dragStart.y);

            [currentScale, currentScale] = ctx.getScaleFactor2d();

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
                ctx.translate(pt.x, pt.y);
                const factor = Math.pow(scaleFactor, delta);
                ctx.scale(factor, factor);
                ctx.translate(-pt.x, -pt.y);

                const [scaleX, scaleY] = ctx.getScaleFactor2d();
                pathDrawer.scale(scaleX);
                currentScale = scaleX;

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
            .filter(location => location instanceof ForbiddenZone)
            .map(prepareFobriddenZoneCoordinatesForApi);

        return {
            zones,
            gotoPoints,
            virtualWalls,
            forbiddenZones
        };
    }

    function getParsedForbiddenMarkers() {
        return parsedForbiddenMarkers;
    }

    function addZone(zoneCoordinates, addZoneInactive) {
        let newZone;
        if (zoneCoordinates) {
            const p1 = convertFromRealCoords({x: zoneCoordinates[0], y: zoneCoordinates[1]});
            const p2 = convertFromRealCoords({x: zoneCoordinates[2], y: zoneCoordinates[3]});
            newZone = new Zone(p1.x, p1.y, p2.x, p2.y, zoneCoordinates[4]);
        } else {
            newZone = new Zone(480, 480, 550, 550, 1);
        }

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

    function clearZones() {
        locations = locations.filter(l => !(l instanceof Zone));
        if (redrawCanvas) redrawCanvas();
    }

    function addVirtualWall(wallCoordinates, addWallInactive, wallEditable) {
        let newVirtualWall;
        if (wallCoordinates) {
            const p1 = convertFromRealCoords({x: wallCoordinates[0], y: wallCoordinates[1]});
            const p2 = convertFromRealCoords({x: wallCoordinates[2], y: wallCoordinates[3]});
            newVirtualWall = new VirtualWall(p1.x, p1.y, p2.x, p2.y, wallEditable);
        } else {
            newVirtualWall = new VirtualWall(460,480,460,550, wallEditable);
        }

        if(addWallInactive) {
            newVirtualWall.active = false;
        }

        locations.forEach(location => location.active = false)
        locations.push(newVirtualWall);
        if (redrawCanvas) redrawCanvas();
    }

    function addForbiddenZone(zoneCoordinates, addZoneInactive, zoneEditable) {
        let newZone;
        if (zoneCoordinates) {
            const p1 = convertFromRealCoords({x: zoneCoordinates[0], y: zoneCoordinates[1]});
            const p2 = convertFromRealCoords({x: zoneCoordinates[2], y: zoneCoordinates[3]});
            const p3 = convertFromRealCoords({x: zoneCoordinates[4], y: zoneCoordinates[5]});
            const p4 = convertFromRealCoords({x: zoneCoordinates[6], y: zoneCoordinates[7]});
            newZone = new ForbiddenZone(p1.x, p1.y, p2.x, p2.y, p3.x, p3.y, p4.x, p4.y, zoneEditable);
        } else {
            newZone = new ForbiddenZone(480, 480, 550, 480, 550, 550, 480, 550, zoneEditable);
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

    return {
        initCanvas: initCanvas,
        initWebSocket: initWebSocket,
        closeWebSocket: closeWebSocket,
        parseMap: parseMap,
        updateMap: updateMap,
        updateStatus: updateStatus,
        getLocations: getLocations,
        getParsedForbiddenMarkers: getParsedForbiddenMarkers,
        addZone: addZone,
        addSpot: addSpot,
        clearZones: clearZones,
        addVirtualWall: addVirtualWall,
        addForbiddenZone: addForbiddenZone,
        promoteCurrentZone: promoteCurrentZone,
        addIterationsToZone: addIterationsToZone
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
