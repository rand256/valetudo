const rocky = "data:image/png;base64,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";
const img_rocky = new Image();
img_rocky.src = rocky;

const charger = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAEAAAABACAYAAAHdbkFIAAAACXBIWXMAAAsSAAALEgHS3X78AAAWXElEQVR42rVbd3iUVbr/ve/5vimZSSIklNCliQWUGkNAQrFiAwLoouuu97m7uq6rrq6uZS3rXZf17hXbuq5elWsBEQQLiG1FkF6sIEgEJAQIKYSUybTvnPf+MSkzyYRMBE+eefI8833nvL2fAeLW8Amjsq5cNf2HLG9203fU8J+xGLrxyx5uHw6FA+DZzLEXFkMaH0phV9CiIKBqYztPyx+S0/jQzMgE0PwQAJD3YX4AiyHVEb9UR/wiki4iLCJKsBhCPbr2okP/KDEAAA3I7HTU6zB8yyIAAOtQWUkz/Nke0MJawEYiFcpSpBdqg5ZrZhOVsZenrZ758ZT3LnyBma1EPiyAAxsq/m2P243Q5WHicesKvml8qAiQwnQAQCgcRl5BfidqZJJlgOisdAAOaEmw4XgSjnGvFyqn+SHiBhCBFDKGpfeBQIji2WwK00EArDcD0GLAUIZnV177q8YXtGjQklpoiVHsmmnHEE9/3y+0hASL0fS5Y/1dL8WLO4YUk8pfO2HH+oOfDTTQqiXfWLOeffDqOa/fsWCRiCToi8ICRGCDkWQtz/cj6vTCtE27mr7r1LkTqiZXEQEAL1ZOK4gOITrbA4ssOEJwL62BkRYnG4CnrSlcF795ae5QSGE65Co/LIpJdO4ugQih8a+ZJoCVsn+IP3T6pm9AS2rBS2oBRAEA950OmEI/ojNcECcRCQJgYRFC4ERdua3faXhs1CEAwNS1Bu+VBlrxxuP1gAE4dBVZbsvT/ESAx0bVwl5aC1pSm3TzHT3vfCF0aYgSxUiE4aNH9vj8jq0lRASBUDO5LHaaTbiUKCyhVmbfzBfF5HP7pc91fe4aNGvwTQBq01b67lzw6Csrkok44YAsfxYqn680sFofTCCxvTZFL4uyNGpRTBCxNe25WX+rfKlSkm1WBIgWigQj4MXkTDh/Iidg8Lt//vGiJ7PnrkyGIjQjWOhF2lsBNMJlYrEKLY4gEjuAFrMWmFZqrEQhOtMHQgi0JJL40AF4DjNf9uH0j5NtfitvAJyZaSAIXtl3amvMLKBHdk9OMHgAUAw40/sCONrMwIVRwA61OiOnU48AM6lmf6cJoWnehM1RA9iuEAitbeFw5SEf8WIWAwM4QNWMDDBMkzpm2I2UxWuiDV4SbkKb1BLlaGntPNLgQ6AwkTVvFvdB4eYdCYy0km0GgJrp7iZr1ELwL2aEeEfCOxelT93O08tn/b4Vg4kg1Mw079IahPhYKyCrLv14KIGgsBBhqDhz1j7IbMaXR7tgxCd7IUkwdKe7Eb4oHLPGrp1yUP58aZOKl15yGvquPICw1CO5dsLBVXADME0yGZ57Lr7+w5YYQ028lbRYEWjMgR3zGnGvfbFpI/RM7RreZdRRxcppYYlAlMyMIzMfV9cpV+PmpP6gpYMRERpzXq4n7Vb/O5vdG6fU1wUAgVaWorj9AsDoiLZgAb269Nbn7Dr3xo9uevf5KCLKGKPbhJH0W4b67RN3Tny626MfMbExSWytrcWxaNEMQJMe2WPUsZ2Td2YHTT0ZnRhcqAU6atq/Zs1dlvbGrXDDQgeWTcAF3W0sH5sBeqMSUK256VYuZFzfmcqrSyEmLrISEbp1ykHps4fk+EJpzT4Ju+D87BQAQSgymPBJD6yt+h5GJDmHhJ3LM67891sXLb0YgBAzU+55Y70bfr02kCrNMWotLM/3NTFcAJC4klLfCgliyc3KO7Bh4rq+5CEPzHIjkfpI+9QGgdDVw2DxD1DcOk8Y8UFPfFVX1Cb1ibrCzvmuK56kM284674dBdsfTPAELaid0tWP98Y3qljrwwVAWDO8b1a3bb9JDweswVcNuXFXxU7W0sJSQkDdrDFwWbtgsTSAlaTaSxD0X54Fr/KgLdodqYODQEunAsuIDiXd4Qb8b29uy5VBrsqGINyACOHQFeWtgRoAlAZ7YS2UO9SaeQZg7zvee3RUU1KhJ/lYCnh4WC9ETSipwcTMqB6TPzkV3mV1sN88Arjqm9LmeO/YNbtr7Iycj3OktKpU4lOpNhVRfJCZDgBXwrOo0fjgCOHyNSFAabSrhg7k8s0zphIAeOABlpOEgsHjbxKg+sqeSLdrQAC0AAo+uJaUwiggSTWUfBk4s47+7O9v/GbBfRzTtxBClwZp/IBJRxWppMhbxLi+9zD47SoQDG7alg17SS3ozVJEqQPAw8DVG+aMW3Lz6/dCkCh7ZqZxE85zb7hpXdCBIyJxIgkDMudc0KsbwZ5Ef59SjDAcHZN97qaNk9ePbzcYKaUo3Zspk1acv25pyaI8drMYMYyOAtWs7UxbTX33stylzyzZFrOfVKJhYrrORhvTqVMn17j54+dtS9t6/eHAYY+EpNnlmtgns8sp6F87YHevz3rd/uFj7y+Pqqgyuu1QnBICAMAWW8YxTpe0rpjy2wsurJhcVuhz+ccC8MUkx0XfLdz1EbbTiwe27S+rCdYQK0bL0NthBIhZ2cbWo24ZfV3JjOLni0uLbWhA2cpp8MtNCYl2tIChfH4f8u0J6yrvK79w26Yt9UQUX46khgDFcj264YnbL/nf/k8sj9Y6hixQe36iuZ5RWkc05/bN27fvwr0DyuvLlBjRKSGglCIX2XLOqtHFGw+u7SFKVIcUj9BUUDPYGDE8p+TnM177/ctvJ1NCblkfDhs1WqzllmwqXdezY8AJcBRyO8eQiOmmYRDwWo+X37h1/T3PJK1J49nuJ58U3b9D6uoC0qE8kAiIuODMPgWsB7aGo6AeL37k+lvW3f0MWqQrFJcOovu/u8iRqjIxYlJOzBQBEDecwgwAdaA3FMB1bUVRfU3pL6559db5ixvF0UglX/b+FW8eOVrmdAS4TcBF3W04hS4AIYh4Aak7DrZQr/aYv7B3Vh/doOhgZqbcgnzPO1VLpxuY1DNhTViW78eyPLuhgmMsO5ADstrNB03PZb2/bzRNNsYIP0Db2GaToqoBIQVnVldc1A2wWTWIwsHjRSaxG5Q0EBreeHDdgLyC/CxmJu7RrRc2lK0dkoqvVwwoA8g1PcEUhEro1Dj4rLwktYTUUqbbvd0+MsYIj7hr5AOxWrl9eV/YxdvQezwGiks5BIA2PoBrU0wHNL9VvXR4l4zusD7r++ltMO1k8pqweFx/TM05HAcy7rEQ/vm9G0rFkpSUVhTIu+7cgZbjczJRe5wULAQEZo2By9oJi5PjaZHBvCKBEUqatic9W5Gzp9/eG6zAsUDSSkYxQA4QvaY/RHaBSI6bq+2rrgC50KYSSgvEiEn1P+fUC63k5ko4P9uPlecZCCoAklZ0xdflAccFy+WDRcmBGyFEUJqIkAgVhYoGERZB4iMCE/DAoPNwy+lbQW2UOYoUfJZu4XIDbQAXrD/qwfhPgq0jgQCE1yGtRHAcWSoijO00AGsmH0b7dZiFy9bV4f3SKBxpRYTM6DqrwkoK5zjy1hC8NsYFEdWmXhgBmDLheqMExmrTMkQsbOGcLjnteq/Eeo7QO/1wm8AdY1BRfybotRI43Ha6rqOagovq3+FzgsPXEyglN8xEGJHdt6mDl4w/937dB91WbATc7RikBfpiwbaXLHlX3W4mmg2pNCeMCJ442wMtDBXHAREGkQueNwMwtKtd1SAQumV1x8Hykgh/8twHG70Z3hTZD4zrVpUA3DGEsO4DWlCNKIKItp8IQ4w4Bd9NfBiAxRGKqMv3T7sbBu3m71m+TAB1cS44iqUlveBdsh1wRVIKRADg8Xmst25cej8AhyHQb/9m6Vz/KemqvTj8/Ihu0KIaSvAgxn/cD3O27gQsSV2JNfQVJdNvC1FINWVEUSvK56+4bBjCx2FbBJjWu6ahHWNgvZ6BzTW74ZjUgStSMmHwxPCiGxY8DolLybSjzbInF3x7c797noRuHZoJQLrLC+AY3i/VSFsShLGqWjUd2g3plk27Ju/0UZzLjtdX/dS4R27502l/XoloIhKKgD+d5cf5qy1MXx+AKA1B6pQTSGCA4fNGZpRXl1F8pZTMA9G052bNW+Z542byUlN7SmkFWDr1eN/c9TW22+JxT423P121ymgn0TW15QLVFb+5asiaKz/cXl11TBs2Ch1cTCwmYmRE1qhvv59RNLQuWEvJitU2fbCyFFvaNlOfvnzuir7v3BWpDQtbDANDbbGfQEJgbRxtjcgZWYu76MzPN289SCDTVoHabhAgZuWz03TudWOnWJdb87Z5t5xVUVYeS2KouW0HN5Dty3bOrc2ff3heye+2rd0WbOwtnHB/oJ0GBkHAsZkAoXuXbjjn4uGDcY4qdJ1ujyuW/SNL3MXZoWiY646llrT6T/HD5/Ibq0bVnOU6e6u9y1ob+Ty6bMeH33xz9FiVBCMBkGJFgEmlB3HSGcCK2RhDBKWHjRnmH/jzwdfuPeP723brXYMCVQFBFERMmhVDII2GRKlabkN2IE0VvhYRYywoiNvnoTP8Z+0/dUf/efte3vPC9s1f10URZWZGe9I+IQYQEYGhoMk5p2BETq+7ez+13qyZUXmsEkSsyQL9mD7ajxIAsYEDMcZwemY6TbKmrCz564Gbvv70q32OchQJGWNS04z2e3TMZIzhTDtT5/113B+2jtj0aEVphbCljJBRHfHHHSeUYIzEeoBW8iSZQGCw1lHNmV0zaeyX4/6y+YHN91XWlysmbpcRbbpXpRSJCI/Mz5f/eO9X/1p78Zp3drp2TApFQiQsJA13YU72IgAWKZiIYFzWUPxw8WCQXYFPD0RhuwjJyBEIQ4Ei4YgU+XaP1bOif77n7vsHmN3yVvG+H6AUU8e8MEGlqTR93tyCOzecte5v1VXVmmxSIj+dtBUxtDGwxY0nzh6HXw/+HEwhHItkou/yCtRoB0SpVb1EBHHESfN6rfG7Cx7ecM+6+2ucGgUh3fKElo16NsaYEZNG93U/5F694cDavmx3bGjbUWkrVnDCGud1GYr5uQqnpn8LLS4YAWx24cHtgoe+rIKdRinl2i2SP6Mjmkf3zC2Th8yErZ9s2UXMLKbZWVKC1pOtb/jHbVcu6vfisoqaCkOqORX6aaTtwdyho3DLkK/B5EBEgSk28SI4qIn0Qe/l+1GjgylLv60U3Ov3qvN3XvzLj+56f37Q1KvGBqVqYIPlgVdPf6bwxgW9X3qlNlCr25qgnoi0bY7Zdm6nIXg3PwP/GFWL0dlHoIhjV1uoubBVlI6/fsv48GA5bBd1OAdtkZCyE3H0/h77pl2RPy20Z0XRZw45qrEBYVlwOZc8O+0/P+r1znPBQFC3vBd2otIWMVA6Ew+eOQR/OGMHLBYY4Vh7uZVDIxAiOFo/FP1W7kKtqT0x6bdoC3r9XnXJD5f+4d2b3v57BBFLATCXXH/Z0C8mbn7n6NFKpljTk05U2i5m6IhgeMYZWJAneGFMPc7NLofFKha62oCgRYOpMx7Z4cbHh4thuxj6JDlfIuJoMIqqvlUX5LrzV+35vGgfd++cA5lpniipOGApS+lUh0FtSZsEcOlOuLX/EARmubHtor3Izw4DcMFmldDXTSZ9iwyO1HXHvD17AFfMHE7WEgjYYlN69DDU5fRYr669lDXlVxdc8Yn744moAozd8bKLQLCZEAkbDO10Jh4feQgTugQQMftgsxuAwEqRpVocWNQZjxWFEQjXwXIzHDEn1QELhOFAtnq3jMy9Ou/nVtWEqumHyg+CXayNpM4ARQwjBrbOwi0Du+GhoUXwqt1wxAXAhouBjliuCMEiQXFtNp7auwew0eGWQ6paoGxlysvLlGd22pWW5bHGohogEKcibYuBaFjQP30gnh1TjkldaxExAdjs6ZC0W0cqBxYy8FhREMFwAJab4Px0iReDAI4ily7+ZGr1yrIVGWzFJHqcWQVs6YwbB3TCf59zEC4WCFwd9JbS8OGkz4xYKKkuiM37OnQnghARgx4expqybFyy5QWAgmh3XiKAlca+AIAMirXEqW3EGT53HV4sPoqXihtjdiTlqKBF4GYPvrugJ7I8hxG7NiwJbzFp9MpclbrWiIDIwCI/XtlzJn65dTW0OCAbEGmbeAJBRDDEd0bYcoxTAkKOxO4a0/GCaHUkknRI1t6yCIiGGX8cno0sz1FEDcPmNm73tdOnFxC00bA4ijXlmbjji0xsO/o9LFcZTMOl4vYsh4hFjKZBnsH7rOh3vMLd0zU6HIxIe031H2ORighRRzC+26m4d8gxABFYzB2ONVoEigRR48L1W2y8tldB2eUAVQI2OhQtxBgNN6x9X+79gM12Z34nb5daGCgCnVSv06j6XuXDK6PdAAVig6VUEzchRI0GcApWHM6A+80oPIursehgJWDXQqPjkYJAIlqsHF+PYP+9A57nLS+v3z8uNOlfiF0t1ieTARYTEAbuPC0bfTMqED3OVC1BxUUARHEs1A9XrLNArxSjcMNBOBKGKCd2J/FHJscE0rCB4dUj5298ZcMOAoCeXXvxqFfHbHy7auloZmUMNJ8M6YsAWa4M7JvqRroVbMjzky9HAEYEBC+eLRqJW75ciyiFoRgnVgi1aKWZqOHcnLF7Qw84Z361enOImZkOlpWYskeOXJzXNb/YOJqZWE6K/hsfXhjRHelWDbRwkiExNQx3Ilhb4cKoDwaCXz+G332zCg6HATqpxIuJGs7rnl/JD1FBE/FxfT/JKxiXLffL1o2l6/qyizt0cSjR6xOcsODWwYMxb1QVtNRDxeVZ2gCKGY64MW19FZbvt2G56iHEP0n21zAlobzu+UfwMEZtWLWupJFmiusGwRiD/AlTkPNgl1VLDi0sUG6l2/q1R3uqn+lKw/5LMpFp10DAECEYRGBRdyw94MPsTTvgaIayzEmTchutAG2iRhVkT9wS+Ut47PrV651G4pP3BAnKb2foyXPPv+7DAe/NDwaDmqzU+4GKAB1x4elR3XDToCqENOBREVQEz8KczRX48EAxbG8szf0J6W7sC2qP16Mu/H7qzavu/ujpmmiNaunoKfngQ5HRGnmTJ8mkxyYseLTov66OOlGHLLKOxwhFBO0IxmUNxGdTylCvg3jomwF4qugAghKAUnTSavvjDlUEjpBY9w568O21t68qXP3v1ZqVgtE69eEgEBsQakfL+IICV8FTk1/4nwNz59QfCzjKpVhLYqRoTC/9qjPuGzwCLxZ/jd3VFbDdAsf8tNKOc3La602zfpZz7cov7th29eefba1uoMGc0GSIFZPRhv12ur5g7kW/PDyx9IkNOz9LV0ppsaTVREg1NDbNTyztpgmRGDXo1MHRQWtOu2PTQ+ufrKyvVEwsxrTfTaEO2hURMxut9ai88ar/tX1u+P70XQ/sqN/RJVwdElZswKC4eeBJVW0iMnBgjDHKnemmM31Dq/pvH/CXold2Pf3Vpq/CrFiJESMdGGD86PYXKyYAbLQxbvbIGaPP6jnwFwN//VXPL+eUeg73D9TViXY0NbgcQ4oMMzMAMiIQJIZYAgnHQqWIEWO0if3aT8XUO7PzKdSP+x3o/+3AhT/8355ntm/Zvj9swsSKGScwJaaTpo6KGQIyxmgmQnZ6F9hulzVy9ujTgtFg/qFBh4adNnbIIBXmU7+p/6rHrrqdPmooisQYDPGfXjc07ewyuLHvy7WfF6Xt9O3u5+u/Zu3C1d+oqBUprz0CEQFzrLH4YybBydb/AxAYT6XzVuifAAAAAElFTkSuQmCC";
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
    const canvas = document.createElement('canvas');
    canvas.width = 1024;
    canvas.height = 1024;
    // Used to draw smoother path when zoomed into the map
    let scaleFactor = 1;
    const maxScaleFactor = 8;

    /**
     * Public function for updating the path
     * @param {Array} newPath
     * @param newRobotPosition
     * @param newChargerPosition
     */
    function setPath(newPath, newRobotPosition, newChargerPosition, newPredictedPath) {
        path = newPath;
        predictedPath = newPredictedPath;
        robotPosition = newRobotPosition || robotPosition;
        chargerPosition = newChargerPosition || chargerPosition;
    }

    /**
     * Allows to set the scaling factor for the path drawing
     * The maximum scaling factor is limited in order to improve performance
     *
     * @param {number} factor - scaling factor for drawing the path in finer resolution
     */
    function scale(factor) {
        const newScaleFactor = Math.min(factor, maxScaleFactor);
        if (newScaleFactor === scaleFactor) return;

        const ctx = canvas.getContext("2d");
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        scaleFactor = newScaleFactor;
        canvas.width = canvas.height = scaleFactor * 1024;
        draw();
    }

    function mmToCanvasPx(coords) {
        return coords.map(d => Math.floor(d / 50 * scaleFactor));
    }

    function drawCharger(position) {
        const ctx = canvas.getContext("2d");

        const chargerPositionInPixels = mmToCanvasPx(position);

        let multiplier = Math.max(0.3,scaleFactor / 7.0);
        ctx.drawImage(
            img_charger,
            chargerPositionInPixels[0] - img_charger.height * multiplier / 2,
            chargerPositionInPixels[1] - img_charger.width * multiplier / 2,
            img_charger.height * multiplier,
            img_charger.width * multiplier
        );
    }

    function drawRobot(position, angle) {
        const ctx = canvas.getContext("2d");
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

        let multiplier = Math.max(0.3,scaleFactor / 7.0);
        ctx.drawImage(
            rotateRobot(img_rocky, angle),
            robotPositionInPixels[0] - img_rocky.width * multiplier / 2, // x
            robotPositionInPixels[1] - img_rocky.height * multiplier / 2, // y
            img_rocky.width * multiplier, // width
            img_rocky.height * multiplier // height
        );
    }

    function drawLines(points, ctx) {
        let first = true;
        for (const coord of points) {
            const [x, y] = mmToCanvasPx(coord);
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
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        ctx.beginPath();
        ctx.lineWidth = 1;
        ctx.strokeStyle = pathColor;
        drawLines(path.points, ctx);
        ctx.stroke();

        drawCharger(chargerPosition);
        drawRobot(robotPosition, path.current_angle);

        if(predictedPath) {
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
