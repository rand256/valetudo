const fs = require("fs");
const path = require("path");
const PNG = require("pngjs").PNG;
const PImage = require('pureimage');

const SimpleMapDrawer = function() {};

SimpleMapDrawer.drawMap = function(options,callback) {
    const settings = Object.assign({
        drawPath: true,
        useGradient: true,
        scale: 2
    }, options);

    const colors = {
        floor: 0x56affcff,
        obstacle: 0xa1dbffff,
        background: 0x33a1f5ff,
        background2: 0x046cd4ff,
        path: 0xffffffff,
        forbidden_marker: 0xff0000ff,
        forbidden_zone: 0xff000060,
        cleaned_marker: 0x357d2eff,
        cleaned_zone: 0x6bf44260
    };

    const intToRgba = function(color) {
        return {r: (color >> 24) & 0xff, g: (color >> 16) & 0xff, b: (color >> 8) & 0xff, a: color & 0xff};
    };

    const rgbaToInt = function(color) {
        return (color.r << 24) + (color.g << 16) + (color.b << 8) + color.a;
    };

    const calcOverlayColor = function(background, overlay) {
        return {
            r: Math.min(255,Math.max(0,Math.round(overlay.a*overlay.r/255 + (1 - overlay.a/255)*background.r))),
            g: Math.min(255,Math.max(0,Math.round(overlay.a*overlay.g/255 + (1 - overlay.a/255)*background.g))),
            b: Math.min(255,Math.max(0,Math.round(overlay.a*overlay.b/255 + (1 - overlay.a/255)*background.b))),
            a: Math.min(255,Math.max(0,Math.round(overlay.a/255 + (1 - overlay.a/255)*background.a)*255)),
        };
    };

    const drawLineByPoints = function(image,points,color) {
        let first = true;
        let oldPathX, oldPathY; // old Coordinates
        let dx, dy; //delta x and y
        let step, x, y, i;
        points.forEach(function (coord) {
            if (!first) {
                dx = (coord[0] - oldPathX);
                dy = (coord[1] - oldPathY);
                if (Math.abs(dx) >= Math.abs(dy)) {
                    step = Math.abs(dx);
                } else {
                    step = Math.abs(dy);
                }
                dx = dx / step;
                dy = dy / step;
                x = oldPathX;
                y = oldPathY;
                i = 1;
                while (i <= step) {
                    image.setPixelRGBA(x, y, color);
                    x = x + dx;
                    y = y + dy;
                    i = i + 1;
                }
            }
            oldPathX = coord[0];
            oldPathY = coord[1];
            first = false;
        });
    };

    const pointInsideQuadrilateral = function(p,p1,p2,p3,p4) {
        let intersects = 0,
           a = [p4,p1,p2,p3],
           b = [p1,p2,p3,p4];
        for (let i = 0; i < 4; ++i) {
           intersects += intersectsRight(p[0], p[1], a[i][0], a[i][1], b[i][0], b[i][1]);
        }
        return intersects % 2 !== 0;
    };

    const intersectsRight = function(px, py, x1, y1, x2, y2) {
        let tmp;
        if (y1 === y2) return 0;
        if (y1 > y2) {
            tmp = x1; x1 = x2; x2 = tmp;
            tmp = y1; y1 = y2; y2 = tmp;
        }
        if (py < y1 || py >= y2) return 0;
        if (x1 === x2) return px <= x1 ? 1 : 0;
        return px <= x1 + (py - y1) * (x2 - x1) / (y2 - y1) ? 1 : 0;
    };

    // alpha-aware drawImage function: bitmap1 = source (overlay), bitmap2 = target (background)
    const drawImageTransparent = function(bitmap1, bitmap2, sx, sy, sw, sh, dx, dy, dw, dh) {
        // two argument form
        if(typeof sw === 'undefined') return drawImage(bitmap1, bitmap2, 0, 0, bitmap1.width, bitmap1.height, sx, sy, bitmap1.width, bitmap1.height)
        // four argument form
        if(typeof dx === 'undefined') return drawImage(bitmap1, bitmap2, 0, 0, bitmap1.width, bitmap1.height, sx, sy, sw, sh)
        for(var i=0; i<dw; i++) {
            var tx = i/dw;
            var ssx = Math.floor(tx*sw)+sx;
            for(var j=0; j<dh; j++) {
                var ty = j/dh;
                var ssy = sy+Math.floor(ty * sh);
                var rgba = bitmap1.getPixelRGBA(ssx,ssy);
                if ((rgba & 0xff) > 0) {
                    bitmap2.setPixelRGBA(dx+i, dy+j, rgbaToInt(calcOverlayColor(intToRgba(bitmap2.getPixelRGBA(dx+i, dy+j)),intToRgba(rgba))));
                }
            }
        }
    }

    // rotate square image by 90 degs
    const rotateImageOrthogonally = function(image,angle) {
        angle = Math.round((angle+720)/90) % 4;
        if (!angle) {
            return image;
        }
        const bitmap = image.getContext('2d').bitmap;
        const image2 = PImage.make(bitmap.width, bitmap.height);
        let pixel, bitmap2 = image2.getContext('2d').bitmap;
        for (let i = 0, len = bitmap.width; i < len; i++) {
            for (let j = 0, len2 = bitmap.height; j < len2; j++) {
                pixel = bitmap.getPixelRGBA(i,j);
                switch (angle) {
                    case 1:
                        bitmap2.setPixelRGBA(bitmap.width-j,i,pixel); 
                        break;
                    case 2:
                        bitmap2.setPixelRGBA(bitmap.width-i,bitmap.height-j,pixel);
                        break;
                    case 3:
                        bitmap2.setPixelRGBA(j,i,pixel);
                        break;
                }
            }
        }
        return image2;
    }

    // direct PNG encode without any streaming mess
    const encodePNGToBuffer = function(bitmap,options) {
        return new Promise((res,rej)=>{
            if (!bitmap.hasOwnProperty('data') || !bitmap.hasOwnProperty('width') || !bitmap.hasOwnProperty('height')) {
                rej(new TypeError('Invalid bitmap image provided'));
            }
            var png = new PNG({
                width:bitmap.width,
                height:bitmap.height
            });
            for (let i=0; i<bitmap.width; i++) {
                for (let j=0; j<bitmap.height; j++) {
                    var rgba = bitmap.getPixelRGBA(i,j);
                    var n = (j*bitmap.width+i)*4;
                    for (let k=0; k<4; k++) {
                        png.data[n+k] = (rgba >>> (8*(3-k))) & 0xff;
                    }
                }
            }
            var buffer = PNG.sync.write(png,options || {});
            if (buffer) {
                res(buffer);
            }
        });
    }
    require('zlib').gunzip(settings.gzippedMap, (err, mapBuf) => {
        if (err) {
            callback(err);
            return;
        }
        const mapData = require('./RRMapParser').PARSEDATA(mapBuf); // options.mapBuf
        if (!mapData.image) {
            callback("image broken");
            return;
        }

        let image1 = PImage.make(mapData.image.dimensions.width, mapData.image.dimensions.height);
        // image background
        if (settings.useGradient) {
            let pp, cc, py = -1,
                c1 = intToRgba(colors['background']),
                c2 = intToRgba(colors['background2']);
            for (let i = 0, len = mapData.image.dimensions.height; i < len; i++) {
                for (let j = 0, len2 = mapData.image.dimensions.width; j < len2; j++) {
                    if (py !== i) {
                        py = i;
                        pp = i / mapData.image.dimensions.height;
                        cc = ((c2.r * pp + c1.r * (1 - pp)) << 24) + ((c2.g * pp + c1.g * (1 - pp)) << 16) + ((c2.b * pp + c1.b * (1 - pp)) << 8) + 255;
                    }
                    image1.setPixelRGBA(j,i,cc);
                }
            }
        } else {
            for (let i = 0, len = mapData.image.dimensions.height; i < len; i++) {
                for (let j = 0, len2 = mapData.image.dimensions.width; j < len2; j++) {
                    image1.setPixelRGBA(j,i,colors['background2']);
                }
            }
        }
        // map pixels
        Object.keys(mapData.image.pixels).forEach(key => {
            const color = colors[key];
            mapData.image.pixels[key].forEach(function drawPixel(px) {
                image1.setPixelRGBA((px % mapData.image.dimensions.width), (mapData.image.dimensions.height - 1 - Math.floor(px / mapData.image.dimensions.width)), color);
            })
        });
        if (mapData.currently_cleaned_zones) {
            let cleanedZones = mapData.currently_cleaned_zones.map(zone => {
                return [[zone[0],zone[1]],[zone[2],zone[3]]].map(point => {
                    return [
                        Math.floor(point[0]/50 - mapData.image.position.left),
                        Math.floor(point[1]/50 - mapData.image.position.top)
                    ]});
            });
            cleanedZones.forEach(zone => {
                let resultColor, overlayColor = colors['cleaned_zone'];
                for (let i = Math.min(zone[0][0],zone[1][0]), len = Math.max(zone[0][0],zone[1][0]); i < len; i++) {
                    for (let j = Math.min(zone[0][1],zone[1][1]), len2 = Math.max(zone[0][1],zone[1][1]); j < len2; j++) {
                        resultColor = calcOverlayColor(intToRgba(image1.getPixelRGBA(i,j)),intToRgba(overlayColor));
                        image1.setPixelRGBA(i,j,rgbaToInt(resultColor));
                    }
                }
            });
            cleanedZones.forEach(zone => {
                drawLineByPoints(image1,[zone[0],[zone[1][0],zone[0][1]],zone[1],[zone[0][0],zone[1][1]]].concat([zone[0]]),colors['cleaned_marker']);
            });
        }
        if (mapData.forbidden_zones) {
            let forbiddenZones = mapData.forbidden_zones.map(zone => {
                return [[zone[0],zone[1]],[zone[2],zone[3]],[zone[4],zone[5]],[zone[6],zone[7]]].map(point => {
                    return [
                        Math.floor(point[0]/50 - mapData.image.position.left),
                        Math.floor(point[1]/50 - mapData.image.position.top)
                    ]});
            });
            forbiddenZones.forEach(zone => {
                let resultColor,
                    overlayColor = colors['forbidden_zone'],
                    minx = Math.min(zone[0][0],zone[3][0]),
                    miny = Math.max(zone[0][1],zone[1][1]),
                    maxx = Math.max(zone[1][0],zone[2][0]),
                    maxy = Math.max(zone[2][1],zone[3][1]);
                for (let i = minx, len = maxx; i < len; i++) {
                    for (let j = miny, len2 = maxy; j < len2; j++) {
                        if (pointInsideQuadrilateral([i,j],zone[0],zone[1],zone[2],zone[3])) {
                            resultColor = calcOverlayColor(intToRgba(image1.getPixelRGBA(i,j)),intToRgba(overlayColor));
                            image1.setPixelRGBA(i,j,rgbaToInt(resultColor));
                        }
                    }
                }
            });
            forbiddenZones.forEach(zone => {
                drawLineByPoints(image1,zone.concat([zone[0]]),colors['forbidden_marker']);
            });
        }
        if (mapData.virtual_walls) {
            let virtualWalls = mapData.virtual_walls.map(wall => {
                return [[wall[0],wall[1]],[wall[2],wall[3]]].map(point => {
                    return [
                        Math.floor(point[0]/50 - mapData.image.position.left),
                        Math.floor(point[1]/50 - mapData.image.position.top)
                    ]});
            });
            virtualWalls.forEach(wall => {
                drawLineByPoints(image1,wall,colors['forbidden_marker']);
            });
        }
        // scaling
        let image2 = PImage.make(mapData.image.dimensions.width * settings.scale, mapData.image.dimensions.height * settings.scale);
        let ctx2 = image2.getContext('2d');
        ctx2.drawImage(image1,
            0, 0, mapData.image.dimensions.width, mapData.image.dimensions.height,
            0, 0, mapData.image.dimensions.width * settings.scale, mapData.image.dimensions.height * settings.scale
        );
        delete image1;
        // paths
        if (settings.drawPath) {
            let points = [];
            for (let i = 0, len = mapData.path.points.length; i < len; i += 2) {
                points.push([
                    Math.floor((mapData.path.points[i]/50 - mapData.image.position.left) * settings.scale),
                    Math.floor((mapData.path.points[i+1]/50 - mapData.image.position.top) * settings.scale)
                ]);
            }
            drawLineByPoints(image2, points, colors['path']);
        }
        // icons
        let chargerImage, robotImage;
        let loadChargerImage = PImage.decodePNGFromStream(fs.createReadStream(path.join(__dirname, "../client/img/charger.png"))).then(loaded => { chargerImage = loaded; });
        let loadRobotImage = PImage.decodePNGFromStream(fs.createReadStream(path.join(__dirname, "../client/img/robot.png"))).then(loaded => { robotImage = loaded; });

        Promise.all([loadChargerImage, loadRobotImage]).then(() => {
            if (mapData.charger) {
                const chargerCoords = {
                    x: Math.floor(mapData.charger[0] / 50 - mapData.image.position.left),
                    y: Math.floor(mapData.charger[1] / 50 - mapData.image.position.top)
                };
                ctx = chargerImage.getContext('2d');
                drawImageTransparent(ctx.bitmap, ctx2.bitmap, 0, 0, chargerImage.width, chargerImage.height, chargerCoords.x * settings.scale - 12 * settings.scale / 2, chargerCoords.y * settings.scale - 12 * settings.scale / 2, 12 * settings.scale, 12 * settings.scale);
            }
            if (mapData.robot) {
                const robotCoords = {
                    x: Math.floor(mapData.robot[0] / 50 - mapData.image.position.left),
                    y: Math.floor(mapData.robot[1] / 50 - mapData.image.position.top)
                };
                robotImage = rotateImageOrthogonally(robotImage,mapData.path.current_angle + 90);
                ctx = robotImage.getContext('2d');
                drawImageTransparent(ctx.bitmap, ctx2.bitmap, 0, 0, robotImage.width, robotImage.height, robotCoords.x * settings.scale - 12 * settings.scale / 2, robotCoords.y * settings.scale - 12 * settings.scale / 2, 12 * settings.scale, 12 * settings.scale);
            }
            encodePNGToBuffer(ctx2.bitmap,{ deflateLevel: 6 }).then((res) => {
                callback(null,res);
            }).catch(err => { console.log(err); callback(err); });
        }).catch(err => { console.log(err); callback(err); });
    });
    
};

module.exports = SimpleMapDrawer;
