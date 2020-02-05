const rocky = "data:image/png;base64,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";
const img_rocky = new Image();
img_rocky.src = rocky;

const charger = "data:image/png;base64,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";
const img_charger = new Image();
img_charger.src = charger;

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
    let robotPosition = [25600, 25600];
    let chargerPosition = [25600, 25600];
    let robotAngle = 0;
    const canvas = document.createElement('canvas');
    canvas.width = 1024;
    canvas.height = 1024;
    const canvasObjects = document.createElement('canvas');
    canvasObjects.width = 1024;
    canvasObjects.height = 1024;
    // Used to draw smoother path when zoomed into the map
    let scaleFactor = 1;
    const maxScaleFactor = 8;

    /**
     * Public function for updating the path
     * @param {Array} newPath
     * @param newRobotPosition
     * @param newChargerPosition
     */
    function setPath(newPath, newRobotPosition, newRobotAngle, newChargerPosition, newPredictedPath) {
        path = newPath;
        predictedPath = newPredictedPath;
        robotPosition = newRobotPosition || robotPosition;
        robotAngle = newRobotAngle || robotAngle;
        chargerPosition = newChargerPosition || chargerPosition;
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

        const ctxObjects = canvasObjects.getContext("2d");
        ctxObjects.clearRect(0, 0, canvasObjects.width, canvasObjects.height);

        scaleFactor = newScaleFactor;
        canvas.width = canvas.height = scaleFactor * 1024;
        canvasObjects.width = canvasObjects.height = scaleFactor * 1024;

        if (!opts.noDraw) draw();
    }

    function mmToCanvasPx(coords) {
        return coords.map(d => Math.floor(d / 50 * scaleFactor));
    }

    function mmToCanvasPxPath(coord) {
        return Math.floor(coord / 50 * scaleFactor);
    }

    function drawCharger(position) {
        const ctx = canvasObjects.getContext("2d");

        const chargerPositionInPixels = mmToCanvasPx(position);

        let multiplier = Math.max(20/img_charger.width,84/img_charger.width * scaleFactor/maxScaleFactor);
        ctx.drawImage(
            img_charger,
            chargerPositionInPixels[0] - img_charger.height * multiplier / 2,
            chargerPositionInPixels[1] - img_charger.width * multiplier / 2,
            img_charger.height * multiplier,
            img_charger.width * multiplier
        );
    }

    function drawRobot(position, path) {
        const ctx = canvasObjects.getContext("2d");
        function rotateRobot(img, angle) {
            var canvasimg = document.createElement("canvas");
            canvasimg.width = img.width;
            canvasimg.height = img.height;
            var ctximg = canvasimg.getContext('2d');
            const offset = 90;
            ctximg.clearRect(0, 0, img.width, img.height);
            ctximg.translate(img.width / 2, img.width / 2);
            ctximg.rotate((angle + offset) * Math.PI / 180);
            ctximg.translate(-img.width / 2, -img.width / 2);
            ctximg.drawImage(img, 0, 0);
            return canvasimg;
        }

        const robotPositionInPixels = mmToCanvasPx(position);

        let multiplier = Math.max(20/img_rocky.width,84/img_rocky.width * scaleFactor/maxScaleFactor);
        ctx.drawImage(
            robotAngle ? rotateRobot(img_rocky, robotAngle) : img_rocky,
            robotPositionInPixels[0] - img_rocky.width * multiplier / 2, // x
            robotPositionInPixels[1] - img_rocky.height * multiplier / 2, // y
            img_rocky.width * multiplier, // width
            img_rocky.height * multiplier // height
        );
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

        const ctxObjects = canvasObjects.getContext("2d");
        ctxObjects.imageSmoothingQuality = 'high';
        ctxObjects.clearRect(0, 0, canvasObjects.width, canvasObjects.height);

        drawCharger(chargerPosition);
        drawRobot(robotPosition, path);
    }

    // noinspection JSDuplicatedDeclaration
    return {
        setPath: setPath,
        scale: scale,
        getScaleFactor: function () { return scaleFactor; },
        canvas: canvas,
        canvasObjects: canvasObjects,
        draw: draw
    }
}
