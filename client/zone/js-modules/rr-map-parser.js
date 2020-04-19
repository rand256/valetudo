const Tools = {
	DIMENSION_PIXELS: 1024,
	MAX_BLOCKS: 32,
	DIMENSION_MM: 50 * 1024
};

function RRDataView(arrayBuffer) {
	this._dataView = new DataView(arrayBuffer, 0);
};
RRDataView.prototype.readUInt8 = function(offset) {
	return this._dataView.getUint8(offset);
}
RRDataView.prototype.readUInt16LE = function(offset) {
	return this._dataView.getUint16(offset, true);
}
RRDataView.prototype.readUInt32LE = function(offset) {
	return this._dataView.getUint32(offset, true);
}
RRDataView.prototype.readInt32LE = function(offset) {
	return this._dataView.getInt32(offset, true);
}
Object.defineProperty(RRDataView.prototype, "length", {
	get: function getLength() {
		return this._dataView.byteLength;
	}
});

export function RRMapParser() {};

RRMapParser.TYPES = {
	"CHARGER_LOCATION": 1,
	"IMAGE": 2,
	"PATH": 3,
	"GOTO_PATH": 4,
	"GOTO_PREDICTED_PATH": 5,
	"CURRENTLY_CLEANED_ZONES": 6,
	"GOTO_TARGET": 7,
	"ROBOT_POSITION": 8,
	"FORBIDDEN_ZONES": 9,
	"VIRTUAL_WALLS": 10,
	"CURRENTLY_CLEANED_BLOCKS": 11,
	"DIGEST": 1024
};

RRMapParser.PARSE_BLOCK = function parseBlock(buf, offset, result) {
	result = result || {};
	if (buf.length <= offset) {
		return result;
	}
	let g3offset = 0;
	var type = buf.readUInt16LE(0x00 + offset),
		hlength = buf.readUInt16LE(0x02 + offset),
		length = buf.readUInt32LE(0x04 + offset);
	//console.log('v3type=',type,'v3hdrlen=',hlength,'v3len=',length)
	//TODO: Check if more values are in fact signed
	switch (type) {
		case RRMapParser.TYPES.ROBOT_POSITION:
		case RRMapParser.TYPES.CHARGER_LOCATION:
			result[type] = {
				position: [
					buf.readUInt16LE(0x08 + offset),
					buf.readUInt16LE(0x0c + offset)
				],
				angle: length >= 12 ? buf.readInt32LE(0x10 + offset) : 0 // gen3+
			};
			break;
		case RRMapParser.TYPES.IMAGE:
			if (hlength > 24) { // gen3+
				g3offset = 4;
			}
			const parameters = {
				segments: {
					count: g3offset ? buf.readInt32LE(0x08 + offset) : 0,
					center: {},
					borders: [],
					neighbours: {}
				},
				position: {
					top: buf.readInt32LE(0x08 + g3offset + offset),
					left: buf.readInt32LE(0x0c + g3offset + offset)
				},
				dimensions: {
					height: buf.readInt32LE(0x10 + g3offset + offset),
					width: buf.readInt32LE(0x14 + g3offset + offset)
				},
				box: {
					minX: Infinity,
					minY: Infinity,
					maxX: -Infinity,
					maxY: -Infinity
				},
				pixels: {}
			};

			// position.left has to be position right for supporting the flipped map
			parameters.position.top = Tools.DIMENSION_PIXELS - parameters.position.top - parameters.dimensions.height;

			//There can only be pixels if there is an image
			if(parameters.dimensions.height > 0 && parameters.dimensions.width > 0) {
				for (let x, y, v, s, k, m, n, i = 0; i < length; i++) {
					x = (i % parameters.dimensions.width) + parameters.position.left;
					y = (parameters.dimensions.height - 1 - Math.floor(i / parameters.dimensions.width)) + parameters.position.top;
					k = y*Tools.DIMENSION_PIXELS + x;
					switch (buf.readUInt8(0x18 + g3offset + offset + i) & 0x07) {
						case 0:
							v = -1; // empty
							break;
						case 1:
							v = 0; // obstacle
							break;
						default:
							v = 1; // floor
							s = (buf.readUInt8(0x18 + g3offset + offset + i) & 248) >> 3;
							if (s !== 0) {
								v = (s << 1); // segment
								// centers
								if (parameters.segments.center[s] === undefined) {
									parameters.segments.center[s] = {x: 0, y: 0, count: 0};
								}
								parameters.segments.center[s].x += x;
								parameters.segments.center[s].y += y;
								parameters.segments.center[s].count++;
								// borders
								n = m = false;
								if (parameters.pixels[k-1] > 1 && parameters.pixels[k-1] !== v) {
									n = true;
									parameters.segments.neighbours[s*Tools.MAX_BLOCKS + parameters.pixels[k-1]/2] = true;
									parameters.segments.neighbours[parameters.pixels[k-1]/2*Tools.MAX_BLOCKS + s] = true;
								}
								if (parameters.pixels[k+Tools.DIMENSION_PIXELS] > 1 && parameters.pixels[k+Tools.DIMENSION_PIXELS] !== v) {
									m = true;
									parameters.segments.neighbours[s*Tools.MAX_BLOCKS + (parameters.pixels[k+Tools.DIMENSION_PIXELS]/2)] = true;
									parameters.segments.neighbours[(parameters.pixels[k+Tools.DIMENSION_PIXELS]/2)*Tools.MAX_BLOCKS + s] = true;
								}
								if (n || m) {
									parameters.segments.borders.push(k);
								}
							}
							break;
					}
					if (v < 0) continue;
					if (parameters.box.minX > x) parameters.box.minX = x;
					if (parameters.box.maxX < x) parameters.box.maxX = x;
					if (parameters.box.minY > y) parameters.box.minY = y;
					if (parameters.box.maxY < y) parameters.box.maxY = y;
					parameters.pixels[k] = v;
				}
			}
			result[type] = parameters;
			break;
		case RRMapParser.TYPES.PATH:
		case RRMapParser.TYPES.GOTO_PATH:
		case RRMapParser.TYPES.GOTO_PREDICTED_PATH:
			const points = [];
			for (let i = 0; i < length; i = i + 4) {
				//to draw these coordinates onto the map pixels, they have to be divided by 50
				points.push(
					buf.readUInt16LE(0x14 + offset + i),
					buf.readUInt16LE(0x14 + offset + i + 2)
				);
			}

			result[type] = {
				//point_count: buf.readUInt32LE(0x08 + offset),
				//point_size: buf.readUInt32LE(0x0c + offset),
				current_angle: buf.readUInt32LE(0x10 + offset), //This is always 0. Roborock didn't bother
				points: points
			};
			break;
		case RRMapParser.TYPES.GOTO_TARGET:
			result[type] = {
				position: [
					buf.readUInt16LE(0x08 + offset),
					buf.readUInt16LE(0x0a + offset)
				]
			};
			break;
		case RRMapParser.TYPES.CURRENTLY_CLEANED_ZONES:
			const zoneCount = buf.readUInt32LE(0x08 + offset);
			const zones = [];

			if(zoneCount > 0) {
				for (let i = 0; i < length; i = i + 8) {
					zones.push([
						buf.readUInt16LE(0x0c + offset + i),
						buf.readUInt16LE(0x0c + offset + i + 2),
						buf.readUInt16LE(0x0c + offset + i + 4),
						buf.readUInt16LE(0x0c + offset + i + 6)
					]);
				}

				result[type] = zones;
			}
			break;
		case RRMapParser.TYPES.FORBIDDEN_ZONES:
			const forbiddenZoneCount = buf.readUInt32LE(0x08 + offset);
			const forbiddenZones = [];

			if(forbiddenZoneCount > 0) {
				for (let i = 0; i < length; i = i + 16) {
					forbiddenZones.push([
						buf.readUInt16LE(0x0c + offset + i),
						buf.readUInt16LE(0x0c + offset + i + 2),
						buf.readUInt16LE(0x0c + offset + i + 4),
						buf.readUInt16LE(0x0c + offset + i + 6),
						buf.readUInt16LE(0x0c + offset + i + 8),
						buf.readUInt16LE(0x0c + offset + i + 10),
						buf.readUInt16LE(0x0c + offset + i + 12),
						buf.readUInt16LE(0x0c + offset + i + 14)
					]);
				}

				result[type] = forbiddenZones;
			}
			break;
		case RRMapParser.TYPES.VIRTUAL_WALLS:
			const wallCount = buf.readUInt32LE(0x08 + offset);
			const walls = [];

			if(wallCount > 0) {
				for (let i = 0; i < length; i = i + 8) {
					walls.push([
						buf.readUInt16LE(0x0c + offset + i),
						buf.readUInt16LE(0x0c + offset + i + 2),
						buf.readUInt16LE(0x0c + offset + i + 4),
						buf.readUInt16LE(0x0c + offset + i + 6)
					]);
				}

				result[type] = walls;
			}
			break;
		case RRMapParser.TYPES.CURRENTLY_CLEANED_BLOCKS:
			const blockCount = buf.readUInt32LE(0x08 + offset);
			const blocks = [];

			if(blockCount > 0) {
				for (let i = 0; i < length; i++) {
					blocks.push(buf.readUInt8(0x0c + offset + i));
				}

				result[type] = blocks;
			}
			break;
		case RRMapParser.TYPES.DIGEST:
			break;
		default: //TODO: Only enable for development since it will spam the log
			console.error("Unknown Data Block of type " + type + " at offset " + offset + " with length " + length);
	}

	return parseBlock(buf, offset + length + hlength, result);
};

/**
 *
 * @param inputMapBuf {UInt8Array} Should contain map in RRMap Format
 * @return {null|object}
 */
RRMapParser.PARSE = function parse(inputMapBuf) {
	if (inputMapBuf[0x00] === 0x72 && inputMapBuf[0x01] === 0x72) {// rr
		const mapBuf = new RRDataView(inputMapBuf.buffer);
		const blocks = RRMapParser.PARSE_BLOCK(mapBuf, 0x14);
		const parsedMapData = {
			header_length: mapBuf.readUInt16LE(0x02),
			data_length: mapBuf.readUInt16LE(0x04),
			version: {
				major: mapBuf.readUInt16LE(0x08),
				minor: mapBuf.readUInt16LE(0x0A)
			},
			map_index: mapBuf.readUInt16LE(0x0C),
			map_sequence: mapBuf.readUInt16LE(0x10)
		};
		if (blocks[RRMapParser.TYPES.IMAGE]) { //We need the image to flip everything else correctly
			parsedMapData.image = blocks[RRMapParser.TYPES.IMAGE];
			[
				{
					type: RRMapParser.TYPES.PATH,
					path: "path"
				},
				{
					type: RRMapParser.TYPES.GOTO_PATH,
					path: "goto_path"
				},
				{
					type: RRMapParser.TYPES.GOTO_PREDICTED_PATH,
					path: "goto_predicted_path"
				},
			].forEach(item => {
				if (blocks[item.type]) {
					parsedMapData[item.path] = blocks[item.type];
					let len = parsedMapData[item.path].points.length;
					for (let i = 0; i < len; i += 2) {
						parsedMapData[item.path].points[i+1] = Tools.DIMENSION_MM - parsedMapData[item.path].points[i+1];
					}
					if (len >= 4) {
						parsedMapData[item.path].current_angle =
							Math.atan2(
								parsedMapData[item.path].points[len - 1] - parsedMapData[item.path].points[len - 3],
								parsedMapData[item.path].points[len - 2] - parsedMapData[item.path].points[len - 4],
							) * 180 / Math.PI;
					}
				}
			});
			if (blocks[RRMapParser.TYPES.CHARGER_LOCATION]) {
				parsedMapData.charger = blocks[RRMapParser.TYPES.CHARGER_LOCATION].position;
				parsedMapData.charger[1] = Tools.DIMENSION_MM - parsedMapData.charger[1];
			}
			if (blocks[RRMapParser.TYPES.ROBOT_POSITION]) {
				parsedMapData.robot = blocks[RRMapParser.TYPES.ROBOT_POSITION].position;
				parsedMapData.robot[1] = Tools.DIMENSION_MM - parsedMapData.robot[1];
			}
			parsedMapData.robot_angle = parsedMapData.robot && parsedMapData.robot.angle || parsedMapData.path && parsedMapData.path.current_angle || 0;
			if(blocks[RRMapParser.TYPES.GOTO_TARGET]) {
				parsedMapData.goto_target = blocks[RRMapParser.TYPES.GOTO_TARGET].position;
				parsedMapData.goto_target[1] = Tools.DIMENSION_MM - parsedMapData.goto_target[1];
			}
			if(blocks[RRMapParser.TYPES.CURRENTLY_CLEANED_ZONES]) {
				parsedMapData.currently_cleaned_zones = blocks[RRMapParser.TYPES.CURRENTLY_CLEANED_ZONES];
				parsedMapData.currently_cleaned_zones = parsedMapData.currently_cleaned_zones.map(zone => {
					zone[1] = Tools.DIMENSION_MM - zone[1];
					zone[3] = Tools.DIMENSION_MM - zone[3];

					return zone;
				});
			}
			if(blocks[RRMapParser.TYPES.FORBIDDEN_ZONES]) {
				parsedMapData.forbidden_zones = blocks[RRMapParser.TYPES.FORBIDDEN_ZONES];
				parsedMapData.forbidden_zones = parsedMapData.forbidden_zones.map(zone => {
					zone[1] = Tools.DIMENSION_MM - zone[1];
					zone[3] = Tools.DIMENSION_MM - zone[3];
					zone[5] = Tools.DIMENSION_MM - zone[5];
					zone[7] = Tools.DIMENSION_MM - zone[7];

					return zone;
				})
			}
			if(blocks[RRMapParser.TYPES.VIRTUAL_WALLS]) {
				parsedMapData.virtual_walls = blocks[RRMapParser.TYPES.VIRTUAL_WALLS];
				parsedMapData.virtual_walls = parsedMapData.virtual_walls.map(wall => {
					wall[1] = Tools.DIMENSION_MM - wall[1];
					wall[3] = Tools.DIMENSION_MM - wall[3];

					return wall;
				});
			}
			if(blocks[RRMapParser.TYPES.CURRENTLY_CLEANED_BLOCKS]) {
				parsedMapData.currently_cleaned_blocks = blocks[RRMapParser.TYPES.CURRENTLY_CLEANED_BLOCKS];
			}
			return parsedMapData;
		} else {
			return null;
		}
	} else {
		return null;
	}
};
