/**
 * The idea behind "locations" (for lack of a better term)
 * is that we can manage multiple goto points / zones etc.
 *
 * They include the drawing logic (draw function) which is called by the vacuum-map,
 * and can define hooks for user-interaction such as tapping or panning.
 */

/**
 * Represents a point the robot can be sent to.
 */
export class GotoPoint  {

    constructor(x ,y) {
        this.x = x;
        this.y = y;
    }

    draw(ctx, transformFromMapSpace) {
        const p1 = new DOMPoint(this.x, this.y).matrixTransform(transformFromMapSpace);

        ctx.beginPath();
        ctx.lineWidth = 2;
        ctx.arc(p1.x, p1.y, 5, 0, 2 * Math.PI, false);
        ctx.fillStyle = 'red';
        ctx.fill();
        ctx.strokeStyle = '#550000';
        ctx.stroke();
    }

    toZone(x2, y2) {
        return new Zone(this.x, this.y, x2, y2);
    }
}

/**
 * Represents a zone for zoned_cleanup.
 */
export class Zone {

    constructor(x1 ,y1, x2, y2, iterations) {
        this.buttonSize = this.buttonSizeInitial = 12;

        this.active = true;
        this.isResizing = false;

        this.x1 = Math.min(x1, x2);
        this.x2 = Math.max(x1, x2);

        this.y1 = Math.min(y1, y2);
        this.y2 = Math.max(y1, y2);

        this.iterations = parseInt(iterations) || 1;
    }

    draw(ctx, transformMapToScreenSpace, scaleFactor, idx) {
        this.buttonSize = this.buttonSizeInitial * scaleFactor;
        const p1 = new DOMPoint(this.x1, this.y1).matrixTransform(transformMapToScreenSpace);
        const p2 = new DOMPoint(this.x2, this.y2).matrixTransform(transformMapToScreenSpace);

        ctx.save();
        if(!this.active) {
            ctx.strokeStyle = "rgb(255, 255, 255)";
            ctx.fillStyle = "rgba(240, 240, 240, 0.5)"
        } else {
            ctx.setLineDash([8, 6]);
            ctx.strokeStyle = "rgb(255, 255, 255)";
            ctx.fillStyle = "rgba(255, 255, 255, 0)"
        }

        ctx.lineWidth = 2;
        ctx.fillRect(p1.x, p1.y, p2.x - p1.x, p2.y - p1.y);
        ctx.strokeRect(p1.x, p1.y, p2.x - p1.x, p2.y - p1.y);
        ctx.setLineDash([]);

        if(this.active) {
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.arc(p2.x, p1.y, this.buttonSize / 2, 0, 2 * Math.PI, false);
            ctx.fillStyle = 'black';
            ctx.fill();
            ctx.strokeStyle = 'black';
            ctx.stroke();

            ctx.beginPath();
            ctx.arc(p2.x, p2.y, this.buttonSize / 2, 0, 2 * Math.PI, false);
            ctx.fillStyle = 'white';
            ctx.fill();
            ctx.strokeStyle = 'white';
            ctx.stroke();
            
            ctx.font = 'bold ' + (0.65 * this.buttonSize) + 'px "Font Awesome 5 Free"';
            ctx.textBaseline = 'middle';
            ctx.textAlign = 'center';
            ctx.fillStyle = 'white';
            ctx.fillText('\uf00d', p2.x , p1.y);

            ctx.font = 'bold ' + (0.65 * this.buttonSize) + 'px "Font Awesome 5 Free"';
            ctx.textBaseline = 'middle';
            ctx.textAlign = 'center';
            ctx.fillStyle = 'dodgerblue';
            ctx.fillText('\uf31e', p2.x , p2.y);
        }

        ctx.font = 'bold ' + 7*scaleFactor + 'px FontAwesome';
        ctx.textBaseline = 'bottom';
        ctx.textAlign = 'left';
        ctx.fillStyle = 'rgba(100,140,180,0.5)';

        ctx.beginPath();
        let text = String(this.sequence) + ((this.iterations > 1) ? '\u00D7' + this.iterations : '');
        ctx.arc(p1.x + 2.5*scaleFactor, p1.y - 4.2*scaleFactor, 3.5*scaleFactor, Math.PI / 2, 3 * Math.PI / 2, false);
        ctx.arc(p1.x + 2.5*scaleFactor + ctx.measureText(text).width, p1.y - 4.2*scaleFactor, 3.5*scaleFactor, 3 * Math.PI / 2, 5 * Math.PI / 2, false);

        ctx.fill();
        ctx.fillStyle = 'white';
        ctx.fillText(text, p1.x + 2.5*scaleFactor , p1.y - 0.25*scaleFactor, Math.abs(p2.x - p1.x) );

        ctx.restore();
    }

    /**
     * Handler for intercepting tap events on the canvas
     * Used for activating / deleting the zone
     *
     * @param {{x: number, y: number}} tappedPoint - The tapped point in screen coordinates
     * @param {DOMMatrix} transformMapToScreenSpace - The transformation for transforming map-space coordinates into screen-space.
     * This is the transform applied by the vacuum-map canvas.
     */
    tap(tappedPoint, transformMapToScreenSpace) {
        const p1 = new DOMPoint(this.x1, this.y1).matrixTransform(transformMapToScreenSpace);
        const p2 = new DOMPoint(this.x2, this.y2).matrixTransform(transformMapToScreenSpace);

        const distanceFromDelete = Math.sqrt(
            Math.pow(tappedPoint.x - p2.x, 2) + Math.pow(tappedPoint.y - p1.y, 2)
        );

        if(this.active && distanceFromDelete <= this.buttonSize * 1.2 / 2) {
            return {
                removeLocation: true,
                stopPropagation: true
            };
        } else if (!this.active
            && tappedPoint.x >= p1.x
            && tappedPoint.x <= p2.x
            && tappedPoint.y >= p1.y
            && tappedPoint.y <= p2.y
        ) {
            return {
                stopPropagation: false,
                selectLocation: true
            };
        } else if (this.active &&
            !(tappedPoint.x >= p1.x
            && tappedPoint.x <= p2.x
            && tappedPoint.y >= p1.y
            && tappedPoint.y <= p2.y)
        ) {
            return {
                stopPropagation: false,
                deselectLocation: true
            };
        }
        return {
            stopPropagation: false
        };
    }

    /**
     * Handler for intercepting pan events on the canvas
     * Used for resizing / moving the zone
     *
     * @param {{x: number, y: number}} start - The coordinates where the panning started
     * @param {{x: number, y: number}} last - The coordinates from the last call
     * @param {{x: number, y: number}} current - The current coordinates of the pointer
     * @param {DOMMatrix} transformMapToScreenSpace - The transformation for transforming map-space coordinates into screen-space.
     * This is the transform applied by the vacuum-map canvas.
     */
    translate(start, last, current, transformMapToScreenSpace) {
        if (this.active) {
            const transformCanvasToMapSpace = transformMapToScreenSpace.inverse();
            const p1 = new DOMPoint(this.x1, this.y1).matrixTransform(transformMapToScreenSpace);
            const p2 = new DOMPoint(this.x2, this.y2).matrixTransform(transformMapToScreenSpace);

            const distanceFromResize = Math.sqrt(
                Math.pow(last.x - p2.x, 2) + Math.pow(last.y - p2.y, 2)
            );
            if (!this.isResizing && distanceFromResize <= this.buttonSize * 1.2 / 2) {
                this.isResizing = true;
            }

            const lastInMapSpace = new  DOMPoint(last.x, last.y).matrixTransform(transformCanvasToMapSpace);
            const currentInMapSpace = new  DOMPoint(current.x, current.y).matrixTransform(transformCanvasToMapSpace);

            const dx = currentInMapSpace.x - lastInMapSpace.x;
            const dy = currentInMapSpace.y - lastInMapSpace.y;

            if(this.isResizing) {
                if (currentInMapSpace.x > this.x1 + 5 && this.x2 + dx > this.x1 + 5) {
                    this.x2 += dx;
                }
                if (currentInMapSpace.y > this.y1 + 5 && this.y2 + dy > this.y1 + 5) {
                    this.y2 += dy;
                }

                return {
                    updatedLocation: this,
                    stopPropagation: true
                };
            } else if (
                last.x >= p1.x
                && last.x <= p2.x
                && last.y >= p1.y
                && last.y <= p2.y
            ) {
                this.x1 += dx;
                this.y1 += dy;
                this.x2 += dx;
                this.y2 += dy;

                return {
                    updatedLocation: this,
                    stopPropagation: true
                };
            }
        }

        return {
            stopPropagation: false
        };
    }
}

/**
 * Current goto target point
 */
export class GotoTarget  {

    constructor(x ,y) {
        this.x = x;
        this.y = y;
    }

    draw(ctx, transformFromMapSpace) {
        const p1 = new DOMPoint(this.x, this.y).matrixTransform(transformFromMapSpace);

        ctx.beginPath();
        ctx.lineWidth = 2;
        ctx.arc(p1.x, p1.y, 5, 0, 2 * Math.PI, false);
        ctx.fillStyle = 'rgb(107, 244, 66)';
        ctx.fill();
        ctx.strokeStyle = 'rgb(53, 145, 26)';
        ctx.stroke();
    }
}

/**
 * Represents the currently cleaned zone
 */
export class CurrentCleaningZone  {

    /**
     * @param {DOMPoint} p1
     * @param {DOMPoint} p2
     */
    constructor(p1, p2) {
        this.p1 = p1;
        this.p2 = p2;
    }

    draw(ctx, transformFromMapSpace) {
        const p1Screen = this.p1.matrixTransform(transformFromMapSpace);
        const p2Screen = this.p2.matrixTransform(transformFromMapSpace);

        ctx.strokeStyle = "rgb(53, 145, 26)";
        ctx.fillStyle = "rgba(107, 244, 66, 0.3)";

        ctx.lineWidth = 2;
        ctx.fillRect(p1Screen.x, p1Screen.y, p2Screen.x - p1Screen.x, p2Screen.y - p1Screen.y);
        ctx.strokeRect(p1Screen.x, p1Screen.y, p2Screen.x - p1Screen.x, p2Screen.y - p1Screen.y);
    }
}

/**
 * Represents a virtual wall the robot does not pass
 */
export class VirtualWall  {

    constructor(x1 ,y1, x2, y2, editable, orthogonal) {
        this.editable = editable || false;

        if (editable) {
            this.active = true;
            this.isResizing = false;
            this.buttonSize = this.buttonSizeInitial = 10;
        } else {
            this.active = false;
        }

        if (orthogonal) {
            this.orthogonal = true;
            this.direction = Math.abs(x2 - x1) > Math.abs(y2 - y1);
        }

        this.x1 = x1;
        this.x2 = x2;

        this.y1 = y1;
        this.y2 = y2;
    }

    draw(ctx, transformFromMapSpace, scaleFactor) {
        const p1 = new DOMPoint(this.x1, this.y1).matrixTransform(transformFromMapSpace);
        const p2 = new DOMPoint(this.x2, this.y2).matrixTransform(transformFromMapSpace);

        ctx.save();
        ctx.beginPath();
        ctx.lineWidth = 5;
        ctx.lineCap = "round";
        ctx.strokeStyle = "red";
        if (this.editable && this.active) {
            ctx.setLineDash([8, 6]);
        }
        ctx.moveTo(p1.x, p1.y);
        ctx.lineTo(p2.x, p2.y);
        ctx.strokeStyle = 'red';
        ctx.stroke();

        ctx.restore();

        if (this.active) {
            this.buttonSize = this.buttonSizeInitial * scaleFactor;
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.arc(p1.x, p1.y, this.buttonSize / 2, 0, 2 * Math.PI, false);
            ctx.fillStyle = 'black';
            ctx.fill();
            ctx.strokeStyle = 'black';
            ctx.stroke();

            ctx.beginPath();
            ctx.arc(p2.x, p2.y, this.buttonSize / 2, 0, 2 * Math.PI, false);
            ctx.fillStyle = 'white';
            ctx.fill();
            ctx.strokeStyle = 'white';
            ctx.stroke();

            ctx.font = 'bold ' + (0.65 * this.buttonSize) + 'px "Font Awesome 5 Free"';
            ctx.textBaseline = 'middle';
            ctx.textAlign = 'center';
            ctx.fillStyle = 'white';
            ctx.fillText(this.orthogonal ? '\uf2f1' : '\uf00d', p1.x , p1.y);

            ctx.font = 'bold ' + (0.65 * this.buttonSize) + 'px "Font Awesome 5 Free"';
            ctx.textBaseline = 'middle';
            ctx.textAlign = 'center';
            ctx.fillStyle = 'red';
            ctx.fillText('\uf31e', p2.x , p2.y);
        }
        if (this.editable) {
            this.matrix = new DOMMatrix().rotateFromVectorSelf(p2.y - p1.y,p2.x - p1.x);
            this.sp1 = p1.matrixTransform(new DOMMatrix().translate(-3*scaleFactor).rotateFromVectorSelf(p2.y - p1.y,p2.x - p1.x));
            this.sp2 = p2.matrixTransform(new DOMMatrix().translate(+3*scaleFactor).rotateFromVectorSelf(p2.y - p1.y,p2.x - p1.x));
        }
    }
    /**
     * Handler for intercepting tap events on the canvas
     * Used for activating / deleting the wall
     *
     * @param {{x: number, y: number}} tappedPoint - The tapped point in screen coordinates
     * @param {DOMMatrix} transformMapToScreenSpace - The transformation for transforming map-space coordinates into screen-space.
     * This is the transform applied by the vacuum-map canvas.
     */
    tap(tappedPoint, transformMapToScreenSpace) {
        if (!this.editable) {
            return {
                stopPropagation: false
            };
        }

        const p1 = new DOMPoint(this.x1, this.y1).matrixTransform(transformMapToScreenSpace);
        const p2 = new DOMPoint(this.x2, this.y2).matrixTransform(transformMapToScreenSpace);

        const distanceFromDelete = Math.sqrt(
            Math.pow(tappedPoint.x - p1.x, 2) + Math.pow(tappedPoint.y - p1.y, 2)
        );

        const sTappedPoint = new DOMPoint(tappedPoint.x,tappedPoint.y).matrixTransform(this.matrix);

        if (this.active && distanceFromDelete <= this.buttonSize * 1.2 / 2) {
            if (this.orthogonal) {
                if (this.direction) {
                    this.y2 = this.y1 + this.x2 - this.x1;
                    this.x2 = this.x1;
                } else {
                    this.x2 = this.x1 + this.y2 - this.y1;
                    this.y2 = this.y1;
                }
                this.direction = !this.direction;
                return {
                    updatedLocation: this,
                    stopPropagation: true
                };
            } else return {
                removeLocation: true,
                stopPropagation: true
            };
        } else if (!this.active
            && sTappedPoint.x >= this.sp1.x
            && sTappedPoint.x <= this.sp2.x
            && sTappedPoint.y >= this.sp1.y
            && sTappedPoint.y <= this.sp2.y
        ) {
            return {
                stopPropagation: false,
                selectLocation: true
            };
        } else if (this.active &&
            !(sTappedPoint.x >= this.sp1.x
            && sTappedPoint.x <= this.sp2.x
            && sTappedPoint.y >= this.sp1.y
            && sTappedPoint.y <= this.sp2.y)
        ) {
            return {
                stopPropagation: false,
                deselectLocation: true
            };
        }

        return {
            stopPropagation: false
        };
    }

    /**
     * Handler for intercepting pan events on the canvas
     * Used for resizing / moving the zone
     *
     * @param {{x: number, y: number}} start - The coordinates where the panning started
     * @param {{x: number, y: number}} last - The coordinates from the last call
     * @param {{x: number, y: number}} current - The current coordinates of the pointer
     * @param {DOMMatrix} transformMapToScreenSpace - The transformation for transforming map-space coordinates into screen-space.
     * This is the transform applied by the vacuum-map canvas.
     */
    translate(start, last, current, transformMapToScreenSpace) {
        if (this.active) {
            const transformCanvasToMapSpace = transformMapToScreenSpace.inverse();
            const p1 = new DOMPoint(this.x1, this.y1).matrixTransform(transformMapToScreenSpace);
            const p2 = new DOMPoint(this.x2, this.y2).matrixTransform(transformMapToScreenSpace);

            const distanceFromResize = Math.sqrt(
                Math.pow(last.x - p2.x, 2) + Math.pow(last.y - p2.y, 2)
            );

            const lastInMapSpace = new DOMPoint(last.x, last.y).matrixTransform(transformCanvasToMapSpace);
            const currentInMapSpace = new DOMPoint(current.x, current.y).matrixTransform(transformCanvasToMapSpace);

            const dx = currentInMapSpace.x - lastInMapSpace.x;
            const dy = currentInMapSpace.y - lastInMapSpace.y;

            const sLast = new DOMPoint(last.x,last.y).matrixTransform(this.matrix);

            if (!this.isResizing && distanceFromResize <= this.buttonSize * 1.2 / 2) {
                this.isResizing = true;
            }

            if (this.isResizing) {
                if (this.orthogonal) {
                    if (this.direction) {
                        this.x2 += dx;
                    } else {
                        this.y2 += dy;
                    }
                } else {
                    this.x2 += dx;
                    this.y2 += dy;
                }

                return {
                    updatedLocation: this,
                    stopPropagation: true
                };
            } else if (
                sLast.x >= this.sp1.x
                && sLast.x <= this.sp2.x
                && sLast.y >= this.sp1.y
                && sLast.y <= this.sp2.y
            ) {
                this.x1 += dx;
                this.y1 += dy;
                this.x2 += dx;
                this.y2 += dy;

                return {
                    updatedLocation: this,
                    stopPropagation: true
                };
            }
        }

        return {
            stopPropagation: false
        };
    }
}

/**
 * Represents a forbidden zone the robot does not enter
 */
export class ForbiddenZone  {

    constructor(x1, y1, x2, y2, x3, y3, x4, y4, editable) {
        this.editable = editable || false;

        if (editable) {
            this.active = true;
            this.isResizing = false;
            this.buttonSize = this.buttonSizeInitial = 12;
        } else {
            this.active = false;
        }

        this.x1 = x1;
        this.x2 = x2;
        this.x3 = x3;
        this.x4 = x4;

        this.y1 = y1;
        this.y2 = y2;
        this.y3 = y3;
        this.y4 = y4;
    }

    draw(ctx, transformMapToScreenSpace, scaleFactor, idx) {
        this.buttonSize = this.buttonSizeInitial * scaleFactor;
        const p1 = new DOMPoint(this.x1, this.y1).matrixTransform(transformMapToScreenSpace);
        const p2 = new DOMPoint(this.x2, this.y2).matrixTransform(transformMapToScreenSpace);
        const p3 = new DOMPoint(this.x3, this.y3).matrixTransform(transformMapToScreenSpace);
        const p4 = new DOMPoint(this.x4, this.y4).matrixTransform(transformMapToScreenSpace);

        ctx.save();
        if (!this.active) {
            ctx.strokeStyle = "rgb(255, 0, 0)";
            ctx.fillStyle = "rgba(255, 0, 0, 0.4)";
        } else {
            ctx.setLineDash([8, 6]);
            ctx.strokeStyle = "rgb(255, 0, 0)";
            ctx.fillStyle = "rgba(255, 0, 0, 0)";
        }

        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(p1.x, p1.y);
        ctx.lineTo(p2.x, p2.y);
        ctx.lineTo(p3.x, p3.y);
        ctx.lineTo(p4.x, p4.y);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        ctx.restore();

        if (this.active) {
            ctx.fillStyle = 'white';
            ctx.strokeStyle = 'white';

            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.arc(p1.x, p1.y, this.buttonSize / 2, 0, 2 * Math.PI, false);
            ctx.fill();
            ctx.stroke();

            ctx.beginPath();
            ctx.arc(p2.x, p2.y, this.buttonSize / 2, 0, 2 * Math.PI, false);
            ctx.fill();
            ctx.stroke();

            ctx.beginPath();
            ctx.arc(p3.x, p3.y, this.buttonSize / 2, 0, 2 * Math.PI, false);
            ctx.fill();
            ctx.stroke();

            ctx.beginPath();
            ctx.arc(p4.x, p4.y, this.buttonSize / 2, 0, 2 * Math.PI, false);
            ctx.fill();
            ctx.stroke();

            ctx.fillStyle = 'black';
            ctx.strokeStyle = 'black';

            ctx.beginPath();
            ctx.arc((p1.x + p2.x)/2, (p1.y + p2.y)/2, this.buttonSize / 2, 0, 2 * Math.PI, false);
            ctx.fill();
            ctx.stroke();

            ctx.font = 'bold ' + (0.65 * this.buttonSize) + 'px "Font Awesome 5 Free"';
            ctx.fillStyle = 'red';

            ctx.textBaseline = 'middle';
            ctx.textAlign = 'center';
            ctx.fillText('\uf31e', p1.x , p1.y);

            ctx.textBaseline = 'middle';
            ctx.textAlign = 'center';
            ctx.fillText('\uf31e', p2.x , p2.y);

            ctx.textBaseline = 'middle';
            ctx.textAlign = 'center';
            ctx.fillText('\uf31e', p3.x , p3.y);

            ctx.textBaseline = 'middle';
            ctx.textAlign = 'center';
            ctx.fillText('\uf31e', p4.x , p4.y);

            ctx.textBaseline = 'middle';
            ctx.textAlign = 'center';
            ctx.fillStyle = 'white';
            ctx.fillText('\uf00d', (p1.x + p2.x)/2, (p1.y + p2.y)/2);
        }
    }

    /**
     * Function to calculate whether the tap location was inside or outside of the quadrilateral
     * Used for selecting the forbidden zone
     *
     * @param {{x: number, y: number}} p - The coordinates of the tap
     * @param {{x: number, y: number}} p1, p2, p3, p4 - The coordinates of the quadrilateral angles
     *
     * @returns {bool} true if tapped inside, false otherwise
     */
    tapQuadrilateral(p,p1,p2,p3,p4) {
        let intersects = 0,
           a = [p4,p1,p2,p3],
           b = [p1,p2,p3,p4];
        for (let i = 0; i < 4; ++i) {
           intersects += this.intersectsRight(p.x, p.y, a[i].x, a[i].y, b[i].x, b[i].y);
        }
        return intersects % 2 !== 0;
    }
    /**
     * Auxiliary function for counting intersections
     */
    intersectsRight(px, py, x1, y1, x2, y2) {
        let tmp;
        if (y1 === y2) return 0;
        if (y1 > y2) {
            tmp = x1; x1 = x2; x2 = tmp;
            tmp = y1; y1 = y2; y2 = tmp;
        }
        if (py < y1 || py >= y2) return 0;
        if (x1 === x2) return px <= x1 ? 1 : 0;
        return px <= x1 + (py - y1) * (x2 - x1) / (y2 - y1) ? 1 : 0;
    }

    /**
     * Handler for intercepting tap events on the canvas
     * Used for activating / deleting the zone
     *
     * @param {{x: number, y: number}} tappedPoint - The tapped point in screen coordinates
     * @param {DOMMatrix} transformMapToScreenSpace - The transformation for transforming map-space coordinates into screen-space.
     * This is the transform applied by the vacuum-map canvas.
     */
    tap(tappedPoint, transformMapToScreenSpace) {
        if (!this.editable) {
            return {
                stopPropagation: false
            };
        }

        const p1 = new DOMPoint(this.x1, this.y1).matrixTransform(transformMapToScreenSpace);
        const p2 = new DOMPoint(this.x2, this.y2).matrixTransform(transformMapToScreenSpace);
        const p3 = new DOMPoint(this.x3, this.y3).matrixTransform(transformMapToScreenSpace);
        const p4 = new DOMPoint(this.x4, this.y4).matrixTransform(transformMapToScreenSpace);

        const distanceFromDelete = Math.sqrt(
            Math.pow(tappedPoint.x - (p1.x + p2.x)/2, 2) + Math.pow(tappedPoint.y - (p1.y + p2.y)/2, 2)
        );

        if(this.active && distanceFromDelete <= this.buttonSize * 1.2 / 2) {
            return {
                removeLocation: true,
                stopPropagation: true
            };
        } else {
            let tap_inside = this.tapQuadrilateral(tappedPoint,p1,p2,p3,p4);
            if (!this.active && tap_inside) {
                return {
                    stopPropagation: false,
                    selectLocation: true
                };
            } else if (this.active && !tap_inside) {
                return {
                    stopPropagation: false,
                    deselectLocation: true
                };
            }
        }
        return {
            stopPropagation: false
        };
    }

    /**
     * Handler for intercepting pan events on the canvas
     * Used for resizing / moving the zone
     *
     * @param {{x: number, y: number}} start - The coordinates where the panning started
     * @param {{x: number, y: number}} last - The coordinates from the last call
     * @param {{x: number, y: number}} current - The current coordinates of the pointer
     * @param {DOMMatrix} transformMapToScreenSpace - The transformation for transforming map-space coordinates into screen-space.
     * This is the transform applied by the vacuum-map canvas.
     */
    translate(start, last, current, transformMapToScreenSpace) {
        if (this.active) {
            const transformCanvasToMapSpace = transformMapToScreenSpace.inverse();
            const p1 = new DOMPoint(this.x1, this.y1).matrixTransform(transformMapToScreenSpace);
            const p2 = new DOMPoint(this.x2, this.y2).matrixTransform(transformMapToScreenSpace);
            const p3 = new DOMPoint(this.x3, this.y3).matrixTransform(transformMapToScreenSpace);
            const p4 = new DOMPoint(this.x4, this.y4).matrixTransform(transformMapToScreenSpace);

            const distanceFromResize = (p) => Math.sqrt(
                Math.pow(last.x - p.x, 2) + Math.pow(last.y - p.y, 2)
            );
            const distanceFromResizes = () => Math.min(distanceFromResize(p1),distanceFromResize(p2),distanceFromResize(p3),distanceFromResize(p4));
            if (!this.isResizing && distanceFromResizes() <= this.buttonSize * 1.2 / 2) {
                for (let i = 1, p = [p1,p2,p3,p4]; i <= 4; i++) {
                    if (distanceFromResize(p[i-1]) <= this.buttonSize * 1.2 / 2) {
                        this.isResizing = true;
                        this.resizePoint = i
                        break;
                    }
                }
            }

            const lastInMapSpace = new  DOMPoint(last.x, last.y).matrixTransform(transformCanvasToMapSpace);
            const currentInMapSpace = new  DOMPoint(current.x, current.y).matrixTransform(transformCanvasToMapSpace);

            const dx = currentInMapSpace.x - lastInMapSpace.x;
            const dy = currentInMapSpace.y - lastInMapSpace.y;

            if (this.isResizing) {
                switch (this.resizePoint) {
                case 1:
                    if (currentInMapSpace.x < this.x2 - 5 && currentInMapSpace.x < this.x3 - 5)
                        this.x1 += dx;
                    if (currentInMapSpace.y < this.y3 - 5 && currentInMapSpace.y < this.y4 - 5)
                        this.y1 += dy;
                    break;
                case 2:
                    if (currentInMapSpace.x > this.x1 + 5 && currentInMapSpace.x > this.x4 + 5)
                        this.x2 += dx;
                    if (currentInMapSpace.y < this.y3 - 5 && currentInMapSpace.y < this.y4 - 5)
                        this.y2 += dy;
                    break;
                case 3:
                    if (currentInMapSpace.x > this.x1 + 5 && currentInMapSpace.x > this.x4 + 5)
                        this.x3 += dx;
                    if (currentInMapSpace.y > this.y1 + 5 && currentInMapSpace.y > this.y2 + 5)
                        this.y3 += dy;
                    break;
                case 4:
                    if (currentInMapSpace.x < this.x2 - 5 && currentInMapSpace.x < this.x3 - 5)
                        this.x4 += dx;
                    if (currentInMapSpace.y > this.y1 + 5 && currentInMapSpace.y > this.y2 + 5)
                        this.y4 += dy;
                    break;
                }

                return {
                    updatedLocation: this,
                    stopPropagation: true
                };
            } else if (this.tapQuadrilateral(last,p1,p2,p3,p4)) {
                this.x1 += dx;
                this.y1 += dy;
                this.x2 += dx;
                this.y2 += dy;
                this.x3 += dx;
                this.y3 += dy;
                this.x4 += dx;
                this.y4 += dy;

                return {
                    updatedLocation: this,
                    stopPropagation: true
                };
            }
        }

        return {
            stopPropagation: false
        };
    }

}

/**
 * Represents a segment for room_cleanup.
 */
export class Segment {
    constructor(idx, points, center) {
        this.idx = idx;
        this.center = center;
        this.points = points;
        this.segmentCanvas = document.createElement('canvas');
        this.segmentCanvas.width = 1024;
        this.segmentCanvas.height = 1024;
        this.segmentCtx = this.segmentCanvas.getContext("2d");

        this.changed = false;
        this.highlighted = false;
        this.hidden = false;
    }

    drawPixels(ctx) {
        if (this.changed) {
            console.log('redrawing ' + this.idx)
            const imgData = this.segmentCtx.createImageData(1024,1024);
            var color = this.current ? {r:107,g:244,b:66,a:87} : {r:255,g:255,b:255,a:50};
            this.points.forEach(point => {
                const imgDataOffset = point * 4;
                imgData.data[imgDataOffset] = color.r;
                imgData.data[imgDataOffset + 1] = color.g;
                imgData.data[imgDataOffset + 2] = color.b;
                imgData.data[imgDataOffset + 3] = color.a;
            });
            this.segmentCtx.putImageData(imgData, 0, 0);
            this.changed = false;
        }
        if (this.highlighted || this.current) {
            ctx.drawImage(this.segmentCanvas, 0, 0);
        }
    }

    draw(ctx, transformMapToScreenSpace, scaleFactor, idx) {
        if (this.hidden) return;
        let measure, center = new DOMPoint(this.center.x, this.center.y).matrixTransform(transformMapToScreenSpace);

        ctx.save();

        ctx.font = 'bold ' + (12 * scaleFactor) + 'px "Font Awesome 5 Free"';
        ctx.textBaseline = 'middle';
        ctx.textAlign = 'center';

        ctx.fillStyle = this.highlighted ? '#369de0' : '#046cd4';

        measure = ctx.measureText('\uf041');
        this.icon = {x: center.x, y: center.y, width: measure.width, height: 12 * scaleFactor};
        ctx.fillText('\uf041', center.x, center.y, this.icon.width);
        ctx.strokeText('\uf041', center.x, center.y, this.icon.width);

        if (this.sequence && this.highlighted) {
            ctx.font = 'bold ' + 6*scaleFactor + 'px Arial';
            ctx.fillStyle = 'white';
            ctx.fillText(String(this.sequence), center.x, center.y - scaleFactor, this.icon.width);
        }

        if (this.name !== undefined) {
            ctx.beginPath();
            ctx.font = 'bold ' + 5*scaleFactor + 'px Arial';
            ctx.fillStyle = 'rgba(100,140,180,0.5)';
            ctx.arc(center.x - ctx.measureText(this.name).width / 2, center.y + 10.5*scaleFactor, 3.5*scaleFactor, Math.PI / 2, 3 * Math.PI / 2, false);
            ctx.arc(center.x + ctx.measureText(this.name).width / 2, center.y + 10.5*scaleFactor, 3.5*scaleFactor, 3 * Math.PI / 2, 5 * Math.PI / 2, false);
            ctx.fill();
            ctx.fillStyle = 'white';
            ctx.fillText(this.name, center.x, center.y + 10.5*scaleFactor);
        }

        ctx.restore();
    }

    /**
     * Handler for intercepting tap events on the canvas
     * Used for activating / deleting the zone
     *
     * @param {{x: number, y: number}} tappedPoint - The tapped point in screen coordinates
     * @param {DOMMatrix} transformMapToScreenSpace - The transformation for transforming map-space coordinates into screen-space.
     * This is the transform applied by the vacuum-map canvas.
     */
    tap(tappedPoint, transformMapToScreenSpace) {
        if (!this.icon) return;
        if (tappedPoint.x >= this.icon.x - this.icon.width / 2
            && tappedPoint.x <= this.icon.x + this.icon.width / 2
            && tappedPoint.y >= this.icon.y - this.icon.height / 2
            && tappedPoint.y <= this.icon.y + this.icon.height / 2
        ) {
            console.log('clicked on ' + this.idx)
            this.highlighted = !this.highlighted;
            this.changed = true;
            return {
                highlightChanged: this.highlighted,
                stopPropagation: true
            };
        }
        return {
            stopPropagation: false
        };
    }

}
