/**
 * Object for drawing the map itself onto a 1024 * 1024 canvas.
 * It's not displayed directly but used to easily paint the map image onto another canvas.
 * @constructor
 */
export function MapDrawer() {
    const mapCanvas = document.createElement('canvas');
    const mapCtx = mapCanvas.getContext("2d");

    mapCanvas.width = 1024;
    mapCanvas.height = 1024;

    function hexToRgb(hex) {
        var result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex.trim());
        return result ? {
            r: parseInt(result[1], 16),
            g: parseInt(result[2], 16),
            b: parseInt(result[3], 16)
        } : null;
    }

    /**
     *
     * @param {Array<Array<number>>} mapData - the data containing the map image (array of pixel offsets and colors)
     */
    function draw(image) {
        const freeColor = hexToRgb(getComputedStyle(document.documentElement).getPropertyValue('--map-free') || '#1f97ff');
        const occupiedColor = hexToRgb(getComputedStyle(document.documentElement).getPropertyValue('--map-occupied') || '#a1dbff');
        const segmentBorderColor = hexToRgb(getComputedStyle(document.documentElement).getPropertyValue('--map-segment-border') || '#1f97ff');
        var segmentColor = hexToRgb(getComputedStyle(document.documentElement).getPropertyValue('--map-segment') || '#56affc');

        mapCtx.clearRect(0, 0, mapCanvas.width, mapCanvas.height);
        const imgData = mapCtx.createImageData(mapCanvas.width, mapCanvas.height);

        if(image && image.pixels) {
            let color;
            if (!image.segments) {
                segmentColor = freeColor;
            }
            for (let i in image.pixels) {
                i = +i;
                switch (image.pixels[i]) {
                    case 1:
                        color = freeColor;
                        break;
                    case 0:
                        color = occupiedColor;
                        break;
                    default:
                        if (image.segments.borders.includes(i)) {
                            color = segmentBorderColor;
                            break;
                        }
                        color = segmentColor;
                }
                const imgDataOffset = i * 4;
                imgData.data[imgDataOffset] = color.r;
                imgData.data[imgDataOffset + 1] = color.g;
                imgData.data[imgDataOffset + 2] = color.b;
                imgData.data[imgDataOffset + 3] = 255;
            }
        }
        mapCtx.putImageData(imgData, 0, 0);
    }

    return {
        draw: draw,
        canvas: mapCanvas
    };
}