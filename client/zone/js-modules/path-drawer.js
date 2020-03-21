/**
 * Object for drawing the robot path onto its on canvas.
 * It's not displayed directly but used to easily paint the map image onto another canvas.
 *
 * I noticed that drawing the path (lines on the canvas) on each redraw is quite slow.
 * On the other hand drawing the path on a 1024 * 1024 canvas causes blurry lines when zoomed in.
 *
 * The idea here is, that the path is only redrawn after zooming is finished (scale function).
 * The resulting image is reused for redrawing while panning for example.
 *
 * @constructor
 */
export function PathDrawer() {
	let path = { current_angle: 0, points: [] };
	let predictedPath = undefined;
	const canvas = document.createElement('canvas');
	canvas.width = 1024;
	canvas.height = 1024;
	// Used to draw smoother path when zoomed into the map
	let scaleFactor = 1;
	const maxScaleFactor = 5;

	/**
	 * Public function for updating the path
	 * @param {Array} newPath
	 * @param newRobotPosition
	 * @param newChargerPosition
	 */
	function setPath(newPath, newPredictedPath) {
		path = newPath;
		predictedPath = newPredictedPath;
	}

	/**
	 * Allows to set the scaling factor for the path drawing
	 * The maximum scaling factor is limited in order to improve performance
	 *
	 * @param {number} factor - scaling factor for drawing the path in finer resolution
	 */
	function scale(factor, opts) {
		opts = opts || {};

		const newScaleFactor = Math.min(factor, maxScaleFactor);
		if (newScaleFactor === scaleFactor) return;

		const ctx = canvas.getContext("2d");
		ctx.clearRect(0, 0, canvas.width, canvas.height);

		scaleFactor = newScaleFactor;
		canvas.width = canvas.height = scaleFactor * 1024;

		if (!opts.noDraw) draw();
	}

	function mmToCanvasPxPath(coord) {
		return Math.floor(coord / 50 * scaleFactor);
	}

	function drawLines(points, ctx) {
		if (!points || !points.length) return;
		let first = true;
		for (let i = 0, len = points.length; i < len; i += 2) {
			const x = mmToCanvasPxPath(points[i]), y = mmToCanvasPxPath(points[i+1]);
			if (first) {
				ctx.moveTo(x, y);
				first = false;
			}
			else {
				ctx.lineTo(x, y);
			}
		}
	}

	/**
	 * Externally called function to (re)draw the path to the canvas
	 */
	function draw() {
		const pathColor = (getComputedStyle(document.documentElement).getPropertyValue('--path') || '#ffffff').trim();

		const ctx = canvas.getContext("2d");
		ctx.imageSmoothingQuality = 'high';
		ctx.clearRect(0, 0, canvas.width, canvas.height);

		if (path) {
			ctx.beginPath();
			ctx.lineWidth = 1;
			ctx.strokeStyle = pathColor;
			drawLines(path.points, ctx);
			ctx.stroke();
		}

		if (predictedPath) {
			ctx.beginPath();
			ctx.lineWidth = 1;
			ctx.strokeStyle = pathColor;
			ctx.setLineDash([5, 5]);
			drawLines(predictedPath.points, ctx);
			ctx.stroke();
			ctx.setLineDash([]);
		}
	}

	// noinspection JSDuplicatedDeclaration
	return {
		setPath: setPath,
		scale: scale,
		getScaleFactor: function () { return scaleFactor; },
		canvas: canvas,
		draw: draw
	}
}
