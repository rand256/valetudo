const fs = require("fs");
const path = require("path");
const PNG = require("pngjs").PNG;

const SimpleMapDrawer = function() {};

const intToRgba = function(color) {
	color = color >>>0;
	return [(color>>24)&0xff, (color>>16)&0xff, (color>>8)&0xff, (color)&0xff];
};
const rgbaToInt = function(color) {
	return (color[0]<<24) + (color[1]<<16) + (color[2]<<8) + color[3];
};
const rgbaColorsToInt = function(r,g,b,a) {
	return (r << 24) + (g << 16) + (b << 8) + a;
};
const calcOverlayInt = function(background, overlay) {
	let bgArray = intToRgba(background),
		ovArray = intToRgba(overlay);
	return rgbaColorsToInt(
		Math.min(255,Math.max(0,Math.round(ovArray[3]*ovArray[0]/255 + (1 - ovArray[3]/255)*bgArray[0]))),
		Math.min(255,Math.max(0,Math.round(ovArray[3]*ovArray[1]/255 + (1 - ovArray[3]/255)*bgArray[1]))),
		Math.min(255,Math.max(0,Math.round(ovArray[3]*ovArray[2]/255 + (1 - ovArray[3]/255)*bgArray[2]))),
		Math.min(255,Math.max(0,Math.round((ovArray[3]/255 + (1 - ovArray[3]/255)*bgArray[3])*255)))
	);
};
class Bitmap {
	constructor(w,h) {
		this.width = Math.floor(w);
		this.height = Math.floor(h);
		this.data = Buffer.alloc(w*h*4);
		for(let i=0,len=w*h*4;i<len;i++) {
			this.data[i] = 0;
		}
	};
	calculateIndex (x,y) {
		x = Math.floor(x);
		y = Math.floor(y);
		if (x<0 || y<0 || x >= this.width || y >= this.height) return 0;
		return (this.width*y+x)*4;
	};
	setPixelRGBA(x,y,rgba) {
		let i = this.calculateIndex(x, y);
		const colors = intToRgba(rgba);
		this.data[i+0] = colors[0];
		this.data[i+1] = colors[1];
		this.data[i+2] = colors[2];
		this.data[i+3] = colors[3];
	};
	getPixelRGBA(x,y) {
		let i = this.calculateIndex(x, y);
		return rgbaColorsToInt(
			this.data[i+0],
			this.data[i+1],
			this.data[i+2],
			this.data[i+3]
		);
	};
};

SimpleMapDrawer.drawMap = function(options,callback) {
	const settings = Object.assign({
		drawPath: true,
		useGradient: true,
		scale: 2,
		status: {}
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
		cleaned_zone: 0x6bf4424c,
		cleaned_block: 0x6bf42457
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
	const drawLineByPoints = function(image,points,color,dashed) {
		let first = true;
		let x, y, dx, dy, di, ds, i, step, oldPathX, oldPathY;
		if (dashed) {
			dc = 1;
			ds = true;
		}
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
					if (!dashed || ds) {
						image.setPixelRGBA(x, y, color);
					}
					if (dashed && dc++ && (ds && dc > 3 || !ds && dc > 2)) {
						dc = 1;
						ds = !ds;
					}
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
	// alpha-aware version of drawImage by Josh Marinacci
	const drawImageTransparent = function(image1, image2, sx, sy, sw, sh, dx, dy, dw, dh) {
		let tx, ssx, ty, ssy, rgba;
		for(let i=0; i<dw; i++) {
			tx = i/dw;
			ssx = Math.floor(tx*sw)+sx;
			for(var j=0; j<dh; j++) {
				ty = j/dh;
				ssy = sy+Math.floor(ty * sh);
				rgba = image2.getPixelRGBA(ssx,ssy);
				if ((rgba & 0xff) < 255) {
					image1.setPixelRGBA(dx+i, dy+j, calcOverlayInt(image1.getPixelRGBA(dx+i, dy+j),rgba));
				} else {
					image1.setPixelRGBA(dx+i, dy+j, rgba);
				}
			}
		}
	};
	// simplified version of rotate by Guyon Roche
	const rotateImage = function(image,angle,options) {
		options = options || {};
		if (angle < 0) {
			angle = 360 - (Math.abs(angle) % 360);
		}
		const radians = Math.PI * angle / 180;
		if (radians < 0.000000001) {
			return image;
		}
		const image2 = new Bitmap(image.width, image.height);
		const srcBuf = image.data,
			dstBuf = image2.data;
		let tl, tr, bl, br, tx, ty, t, b, d, srcCoord = {},
			widthHalf = image.width / 2,
			heightHalf = image.height / 2,
			width4 = image.width * 4,
			height4 = image.width * 4;
		const rotators = {
			forward:  {cos: Math.cos(radians),sin: Math.sin(radians)},
			backward: {cos: Math.cos(-radians),sin: Math.sin(-radians)}
		};
		const rotate = function(point, rotator) {
			let x = rotator.cos * point.x - rotator.sin * point.y,
				y = rotator.sin * point.x + rotator.cos * point.y;
			point.x = x;
			point.y = y;
			return point;
		};
		for (let i = 0; i < image.height; i++) {
			for (let j = 0; j < image.width; j++) {
				srcCoord.x = j - widthHalf;
				srcCoord.y = heightHalf - i;
				rotate(srcCoord, rotators.backward);
				let srcX = srcCoord.x + widthHalf,
					srcY = heightHalf - srcCoord.y;
					dstPos = (i * image.width + j) * 4;
				if ((srcX > -1) && (srcX < image.width) && (srcY > -1) && (srcY < image.height)) {
					let srcPosX = Math.floor(srcX),
						srcPosY = Math.floor(srcY),
						srcPos = (srcPosY * image.width + srcPosX) * 4;
					for (let k = 0; k < 4; k++) {
						let kSrcPos = srcPos + k;
						tl = ((srcX >= 0) && (srcY >= 0)) ? srcBuf[kSrcPos] : 0;
						tr = ((srcX < image.width-1) && (srcY >= 0)) ? srcBuf[kSrcPos+4] : 0;
						bl = ((srcX >= 0) && (srcY < image.height-1)) ? srcBuf[kSrcPos + width4] : 0;
						br = ((srcX < image.width-1) && (srcY < image.height-1)) ? srcBuf[kSrcPos + width4 + 4] : 0;
						tx = srcX - srcPosX;
						ty = srcY - srcPosY;
						t = (1-tx) * tl + tx * tr;
						b = (1-tx) * bl + tx * br;
						dstBuf[dstPos++] = (1-ty) * t + ty * b;
					}
				} else {
					dstBuf[dstPos++] = dstBuf[dstPos++] = dstBuf[dstPos++] = dstBuf[dstPos++] = 0;
				}
			}
		}
		image.data = dstBuf;
	};
	const encodePNGToBuffer = function(image,options) {
		return new Promise((res,rej)=>{
			if (!image.hasOwnProperty("data") || !image.hasOwnProperty("width") || !image.hasOwnProperty("height")) {
				rej(new TypeError("Invalid bitmap image provided."));
			}
			var png = new PNG({
				width:image.width,
				height:image.height
			});
			for (let i=0,len=image.data.length;i<len;i++) {
				png.data[i] = image.data[i];
			}
			var buffer = PNG.sync.write(png,options || {});
			if (buffer) {
				res(buffer);
			} else {
				rej("Failed to write PNG.");
			}
		});
	};
	const decodePNGFromStream = function(instream) {
		return new Promise((res,rej)=>{
			instream.pipe(new PNG())
			.on("parsed", function() {
				var bitmap = new Bitmap(this.width,this.height);
				for(let i=0; i<bitmap.data.length; i++) {
					bitmap.data[i] = this.data[i];
				};
				res(bitmap);
			}).on("error", function(err) {
				rej(err);
			});
		});
	};
	// processing
	require('zlib').gunzip(settings.gzippedMap, (err, mapBuf) => {
		if (err) {
			callback(err);
			return;
		}
		const mapData = require('./RRMapParser').PARSEDATA(mapBuf);
		if (!mapData.image) {
			callback("image broken");
			return;
		}

		let image = new Bitmap(mapData.image.dimensions.width, mapData.image.dimensions.height);
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
						cc = rgbaColorsToInt(c2[0] * pp + c1[0] * (1 - pp), c2[1] * pp + c1[1] * (1 - pp), c2[2] * pp + c1[2] * (1 - pp), 255);
					}
					image.setPixelRGBA(j,i,cc);
				}
			}
		} else {
			for (let i = 0, len = mapData.image.dimensions.height; i < len; i++) {
				for (let j = 0, len2 = mapData.image.dimensions.width; j < len2; j++) {
					image.setPixelRGBA(j,i,colors['background2']);
				}
			}
		}
		// map pixels
		["floor", "obstacle"].forEach(key => {
			const color = colors[key];
			mapData.image.pixels[key].forEach(function drawPixel(px) {
				image.setPixelRGBA((px % mapData.image.dimensions.width), (mapData.image.dimensions.height - 1 - Math.floor(px / mapData.image.dimensions.width)), color);
			})
		});
		// special zones
		const formatPoints = function(point) {
			return [Math.floor(point[0]/50 - mapData.image.position.left), Math.floor(point[1]/50 - mapData.image.position.top)];
		};
		if (mapData.currently_cleaned_zones && settings.status.in_cleaning === 2) {
			let cleanedZones = mapData.currently_cleaned_zones.map(zone => {
				return [[zone[0],zone[1]],[zone[2],zone[3]]].map(formatPoints);
			});
			cleanedZones.forEach(zone => {
				for (let i = Math.min(zone[0][0],zone[1][0]), len = Math.max(zone[0][0],zone[1][0]); i < len; i++) {
					for (let j = Math.min(zone[0][1],zone[1][1]), len2 = Math.max(zone[0][1],zone[1][1]); j < len2; j++) {
						image.setPixelRGBA(i,j,calcOverlayInt(image.getPixelRGBA(i,j),colors['cleaned_zone']));
					}
				}
			});
			cleanedZones.forEach(zone => {
				drawLineByPoints(image,[zone[0],[zone[1][0],zone[0][1]],zone[1],[zone[0][0],zone[1][1]]].concat([zone[0]]),colors['cleaned_marker']);
			});
		}
		if (mapData.currently_cleaned_blocks && settings.status.in_cleaning === 3) {
			let i, j, segnum;
			mapData.image.pixels.segments.forEach(px => {
				segnum = px >> 21;
				if (mapData.currently_cleaned_blocks.includes(segnum)) {
					px = px & 0xfffff;
					i = px % mapData.image.dimensions.width;
					j = mapData.image.dimensions.height - 1 - Math.floor(px / mapData.image.dimensions.width);
					image.setPixelRGBA(i,j,calcOverlayInt(image.getPixelRGBA(i,j),colors['cleaned_block']));
				}
			});
		}
		if (mapData.forbidden_zones) {
			let forbiddenZones = mapData.forbidden_zones.map(zone => {
				return [[zone[0],zone[1]],[zone[2],zone[3]],[zone[4],zone[5]],[zone[6],zone[7]]].map(formatPoints);
			});
			forbiddenZones.forEach(zone => {
				let minx = Math.min(zone[0][0],zone[3][0]),
					miny = Math.max(zone[0][1],zone[1][1]),
					maxx = Math.max(zone[1][0],zone[2][0]),
					maxy = Math.max(zone[2][1],zone[3][1]);
				for (let i = minx, len = maxx; i < len; i++) {
					for (let j = miny, len2 = maxy; j < len2; j++) {
						if (pointInsideQuadrilateral([i,j],zone[0],zone[1],zone[2],zone[3])) {
							image.setPixelRGBA(i,j,calcOverlayInt(image.getPixelRGBA(i,j),colors['forbidden_zone']));
						}
					}
				}
			});
			forbiddenZones.forEach(zone => {
				drawLineByPoints(image,zone.concat([zone[0]]),colors['forbidden_marker']);
			});
		}
		if (mapData.virtual_walls) {
			let virtualWalls = mapData.virtual_walls.map(wall => {
				return [[wall[0],wall[1]],[wall[2],wall[3]]].map(formatPoints);
			});
			virtualWalls.forEach(wall => {
				drawLineByPoints(image,wall,colors['forbidden_marker']);
			});
		}
		// scaling
		let tmpImage = new Bitmap(mapData.image.dimensions.width * settings.scale, mapData.image.dimensions.height * settings.scale);
		drawImageTransparent(tmpImage, image,
			0, 0, mapData.image.dimensions.width, mapData.image.dimensions.height,
			0, 0, mapData.image.dimensions.width * settings.scale, mapData.image.dimensions.height * settings.scale
		);
		image = tmpImage;
		// paths
		if (settings.drawPath) {
			const scalePoints = function(point) {
				return [point[0]*settings.scale, point[1]*settings.scale];
			};
			if (mapData.path) {
				drawLineByPoints(image, mapData.path.points.map(formatPoints).map(scalePoints), colors['path']);
			}
			if (mapData.goto_predicted_path) {
				drawLineByPoints(image, mapData.goto_predicted_path.points.map(formatPoints).map(scalePoints), colors['path'], true);
			}
			if (mapData.goto_target) {
				const gotoPointCoords = scalePoints(formatPoints(mapData.goto_target));
				let r = 2 * settings.scale;
				for(let y=-r; y<=r; y++) {
					for(let x=-r; x<=r; x++) {
						if(x*x+y*y < r*r)
							image.setPixelRGBA(gotoPointCoords[0] + x, gotoPointCoords[1] + y, colors['cleaned_zone'] | 0xff);
						else if(x*x+y*y > r*r - r && x*x+y*y < r*r + r)
							image.setPixelRGBA(gotoPointCoords[0] + x, gotoPointCoords[1] + y, colors['cleaned_marker']);
					}
				}
			}
		}
		// icons
		let chargerImage, robotImage;
		let loadChargerImage = decodePNGFromStream(fs.createReadStream(path.join(__dirname, "../client/img/charger.png"))).then(loaded => { chargerImage = loaded; });
		let loadRobotImage = decodePNGFromStream(fs.createReadStream(path.join(__dirname, "../client/img/robot_v1.png"))).then(loaded => { robotImage = loaded; });

		Promise.all([loadChargerImage, loadRobotImage]).then(() => {
			if (mapData.charger) {
				const chargerCoords = formatPoints(mapData.charger);
				drawImageTransparent(image, chargerImage, 0, 0, chargerImage.width, chargerImage.height, chargerCoords[0] * settings.scale - 12 * settings.scale / 2, chargerCoords[1] * settings.scale - 12 * settings.scale / 2, 12 * settings.scale, 12 * settings.scale);
			}
			if (mapData.robot) {
				if (mapData.robot_angle) {
					rotateImage(robotImage,-1 * mapData.robot_angle - 90);
				}
				const robotCoords = formatPoints(mapData.robot);
				drawImageTransparent(image, robotImage, 0, 0, robotImage.width, robotImage.height, robotCoords[0] * settings.scale - 12 * settings.scale / 2, robotCoords[1] * settings.scale - 12 * settings.scale / 2, 12 * settings.scale, 12 * settings.scale);
			}
			encodePNGToBuffer(image,{ deflateLevel: 6 }).then((res) => {
				callback(null,res);
			}).catch(err => { console.log(err); callback(err); });
		}).catch(err => { console.log(err); callback(err); });
	});
	
};

module.exports = SimpleMapDrawer;
