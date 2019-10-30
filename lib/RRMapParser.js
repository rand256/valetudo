const Tools = {
    DIMENSION_PIXELS: 1024,
    DIMENSION_MM: 50 * 1024
};

const RRMapParser = function() {};

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

module.exports = RRMapParser;
