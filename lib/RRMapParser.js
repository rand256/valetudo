const Tools = {
	DIMENSION_PIXELS: 1024,
	DIMENSION_MM: 50 * 1024
};

const RRMapParser = function() {};

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
	"FORBIDDEN_MOP_ZONES": 12,
	"DIGEST": 1024
};

RRMapParser.PARSEBLOCK = function parseBlock(buf, offset, result, pixels) {
	result = result || {};
	if (buf.length <= offset) {
		return result;
	}
	let g3offset = 0;
	var type = buf.readUInt16LE(0x00 + offset),
		hlength = buf.readUInt16LE(0x02 + offset),
		length = buf.readUInt32LE(0x04 + offset);
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
					id: [],
				},
				position: {
					top: buf.readInt32LE(0x08 + g3offset + offset),
					left: buf.readInt32LE(0x0c + g3offset + offset)
				},
				dimensions: {
					height: buf.readInt32LE(0x10 + g3offset + offset),
					width: buf.readInt32LE(0x14 + g3offset + offset)
				},
				pixels: {
					floor: [],
					obstacle: [],
					segments: []
				}
			};
			parameters.position.top = Tools.DIMENSION_PIXELS - parameters.position.top - parameters.dimensions.height;
			if(parameters.dimensions.height > 0 && parameters.dimensions.width > 0) {
				for (let s, i = 0; i < length; i++) {
					switch (buf.readUInt8(0x18 + g3offset + offset + i) & 0x07) {
						case 0:
							break;
						case 1:
							pixels && parameters.pixels.obstacle.push(i);
							break;
						default:
							pixels && parameters.pixels.floor.push(i);
							s = (buf.readUInt8(0x18 + g3offset + offset + i) & 248) >> 3;
							if (s !== 0) {
								if (!parameters.segments.id.includes(s)) parameters.segments.id.push(s);
								pixels && parameters.pixels.segments.push(i | (s << 21));
							}
							break;
					}
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
				points.push([
					buf.readUInt16LE(0x14 + offset + i),
					buf.readUInt16LE(0x14 + offset + i + 2)
				]);
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
		case RRMapParser.TYPES.FORBIDDEN_MOP_ZONES:
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

				result[type] = walls
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
	}
	return parseBlock(buf, offset + length + hlength, result);
};

/**
 *
 * @param mapBuf {Buffer} Should contain map in RRMap Format
 * @return {object}
 */
RRMapParser.PARSE = function parse(mapBuf) {
	if (mapBuf[0x00] === 0x72 && mapBuf[0x01] === 0x72) {// rr
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
		return parsedMapData;
	} else {
		return {};
	}
};

RRMapParser.PARSEDATA = function parseData(mapBuf, pixels) {
	if (!this.PARSE(mapBuf).map_index) {
		return null;
	}
	const blocks = RRMapParser.PARSEBLOCK(mapBuf, 0x14, null, pixels);
	const parsedMapData = {};
	if (blocks[RRMapParser.TYPES.IMAGE]) { //We need the image to flip everything else correctly
		parsedMapData.image = blocks[RRMapParser.TYPES.IMAGE];
		[
			{
				type: RRMapParser.TYPES.PATH,
				path: "path"
			},
			{
				type: RRMapParser.TYPES.GOTO_PREDICTED_PATH,
				path: "goto_predicted_path"
			},
		].forEach(item => {
			if (blocks[item.type]) {
				parsedMapData[item.path] = blocks[item.type];
				parsedMapData[item.path].points = parsedMapData[item.path].points.map(point => {
					point[1] = Tools.DIMENSION_MM - point[1];
					return point;
				});

				if (parsedMapData[item.path].points.length >= 2) {
					parsedMapData[item.path].current_angle =
						Math.atan2(
							parsedMapData[item.path].points[parsedMapData[item.path].points.length - 1][1] -
							parsedMapData[item.path].points[parsedMapData[item.path].points.length - 2][1],

							parsedMapData[item.path].points[parsedMapData[item.path].points.length - 1][0] -
							parsedMapData[item.path].points[parsedMapData[item.path].points.length - 2][0]

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
		if(blocks[RRMapParser.TYPES.FORBIDDEN_MOP_ZONES]) {
			parsedMapData.forbidden_mop_zones = blocks[RRMapParser.TYPES.FORBIDDEN_MOP_ZONES];
			parsedMapData.forbidden_mop_zones = parsedMapData.forbidden_mop_zones.map(zone => {
				zone[1] = Tools.DIMENSION_MM - zone[1];
				zone[3] = Tools.DIMENSION_MM - zone[3];
				zone[5] = Tools.DIMENSION_MM - zone[5];
				zone[7] = Tools.DIMENSION_MM - zone[7];

				return zone;
			})
		}
	}
	return parsedMapData;
};

module.exports = RRMapParser;
