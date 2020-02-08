import { RRMapParser } from "./rr-map-parser.js";
import { FallbackMap } from "./fallback-map.js";
import { MapDrawer } from "./map-drawer.js";
import { PathDrawer } from "./path-drawer.js";
import { trackTransforms } from "./tracked-canvas.js";
import { GotoPoint, Zone, Segment, ForbiddenZone, VirtualWall, CurrentCleaningZone, GotoTarget } from "./locations.js";
import { TouchHandler } from "./touch-handling.js";

const rocky = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAGAAAABgCAQAAABIkb+zAAAT30lEQVR42tVceXxUVZb+qrJCSAgBkR1UUFBCEGlbIU503LrFEcWF0Va7FVFEbR1sR21/LYq2qODSdNuOC+KK+tNxa8WWUVGULXuqUql931L7vrx6S80fse67VaktGDPOff/Vq7r3fOee7Z5zbgE/1ZCgEtWoQQ2qUQUp/l8MKaagGRfgGtyG+/EInsRTeAbb8TgexCasw2qswDzU/hxJb0IbNuA5fIhv0QcjPAgjAQYpsEghiSj8sEOFdvwTb+IhXI4TUfPzIH0KVmE7vsQAnEiChwAB6YKPAAEcgjCiHbtxG05G1f8d6RVYiAdxEDZEwRUlOx8QHgy8UGM3LsGEsSdeglPxMgbL4Hm6xH6wiOIw1mH8aKpi8VGFRXgL8YJkCxAggAcHDixYsODAlQDKQ4MbUD9s7crR5nwtTsaT8BUgnJMkauONsanhWe4FlsUDSzqWHlj6fcuh5t6F+nmO6YEpsbpYZQypAlBY7MelaMoCMR6S0ZT52diAXqSGLS8gWeOf5V/qvEz9qOxjmVLuH+CCaWoIyYTJKj+gerF3Y1+b5ST/JL8kkkdvBHjxIs5A3U8h9XVowy54hy3KVvlPdF1s2dz/lTKkSZcxWI9G9YriJv0vbJM9ktiw+VI4gg2YNdqu7xjcjINgcvjFNHrPtz+k+94Qdgt8ekSDTep0r+lvtJ7gkIbBZ8EQ4MBzWDZ68i/BcXgcRvBZi7DjHZdodlp0LjaRPtrBBoL77P+pm6vK2QkBMXyGi0fLRyzC2/BnLyAJn698z2Bxc8n0jx6R4BHHA6pxmiwGpcGiDzeh4seTfyr2IZFFPtfYt0ttCfIFiBdSiYCp//vu9zte7n1e+Xf1i/I3u77o7u/xGbl4QRDhQ7bLunKsmwAr/vhjA44z0As2a9Lg1Z0qcyov8Yy/Q71FdXbvAssM35TwxGhDrD5eH2+INUSbIlODc10nK9YpXu/2OPLC5ryhV3uP1eUIqg+P/Zjg73T0Z09YrXu+JxJNc7nLpyIHjqz9boKmJlkx5LiEHFs/5NpYKVvJjg/O2rfjkM+YBwMjM7T2IpHl4AJ47Oh2QYKlOASOknv2eOXXao7JWlPg2EBop3JaJ6IjCCgEcOPsV3fItEyC59MCPaPXc6us0kf5CAFe3D9yCBIswqdIiUtWxtrUvfYcYWfMrmd7Z6uyeFb+w9e6rug8YIxEs01wJPqopsEJloJgws0YNzIAc/EyoiL5tfF/UynUWdTznuC7huY+hI46lEsjDW68YVO/fDCVovch6X+qd7pTQu9CLy5FdfnkT8aDcIs/r4xeqjS4aPJ5ttO6XlXnyjF9P4gHYpWe8dZZjsX+Fn+LryVwkrfBWOtEME8QkoaAeLNqtzXky9Kp6EuGKTZKgDn8E6eXa1RrcTXU4lJS5txerTZr+vBu/SnqPILDVvjmWlc57rA+adop36M65Oi2dVu77N9a3+reoXnAeo31jMGGwRyjnEYaQp3zdrXBkmXRIk93j7dR34zjBcwpT/pPw5cUdv5MldJATx0YfFAxwZxDhIBE7cBa43bdl1bbIBPOa+yZkEs2+K5zk26pFoPD9i56vna/QqDsWzKwXQU3tYILvy/n6DMFzyIu/myWpkdHU+Hy3qipdOXGRDO196m/sjq9XKS05435ZM5dpvMGpO5sEJLUybpPDDSEWPTOdsSodfqxslSQV4k1GBS5W2Hd2y9QhtPlu95UE872y9W6O/rb3ZFQtjksOgQ2afa9oWtWgJ5LkLILHR+YaQg+33ntWZrwFhqLA5iKbym+xLb3pKhQzeP9nbE6Qi+J6C8HvjaH4yONRYdA6Nz39zcMZkM4yf6pUXSUgjDgmE3pIyJYWxzAXVTgwJ/d7o2KfA27N8qldFAnVHjW9wz6+PzE82yA8fzweLlYXgxCivu4b5aGsk4CuPnK79VpnsBk3tPARbFMUUwPJsMsfnWc4bCDbKeQjDyjr/PRWYVGz1OdbEGZdzuXm2AZeibpdugLb4VGdZpGkqT2nT1fqxkUCOM8oevktFHBpsIANlPGM/aYKUqiR479zHyskeI+f+zgG33FJGTQ1ULM7MTENlex73rc5ygkMUqvYncofX5x7zsCx5motS2Ylp/8mbCLBDarZR7R66rcZ6nouGiq692u4iI+EgDptM95roLOc9Q6X9UxxHhEw5t1lSFKzO7ND+BecYLqwDZ9IiMeQiT+RzUiIvkT7K93l9LRkQFIp32uFTIkxTUWGmQO0TR02pboKSGTY3q+U2+3yP/TDTISuPH8fmu9uIVCXfgJGR8ZbQDptEp1Oh08MDd2x8keJMIPGqpD5F0INw0HsBZ+wv/gQ8ZkNPPjOLNaQ00cX6+OlOGuRg6A5/c6Gyk9q3MddopvD1uaHWQPWHyca4sq8CYJnoVF9gPUcWOPoiYs7s0StdJZjtUfOYB0OpZ4RCmyEfx5ap5kl+Kxm3UIES3QYkU2gBMhI9ij1+gifmJ/YguPiFyR2F/XpZhyiDkaAGle61qpEGW9Ivw1pWv/rZyWiZAFBPCnbAA3iAHEJO9LKtEXHlZA5D93g8VZZshwVADSLPe+eyIVwLV2pllyVjOvtBM3y+ET1NMAXiYWQFjmNVLR54qvRP6Pt3zqFsqMeI4OQDrt8K41ihpXFVR3isb8LlVVlAhRHy1Es/ANITN+mZoj4XDAXSPyg/1Vt81cLiFHC0CIv6CQkmBdyv9JLe74Z73HBAmdDmwQAfwr+jPSNTHyN+ro+IKignCjxvW8nk+UD2BpFNzQ0xjdNlh+lKeytpqIHvDHaxmyZtB+ihiCx/GMmHy8FY7M1swJdZHTl8C0ysWpfunoc5ZPRtC3wXducOi51PPhCABwiQcsUmJvmmIHB8R3qxQShsRE7+PYTEHjcXKA5xY7g2Qxj22GGOzG1hvi3vSYjI800x0ZiahN/Fkhvtkqr2WIFnyLU4cA1OM1ot3M2TKBbNlexSSSdB3vek6fHqNhtpzlyCiylFml4klQuadjghgx9eOiIQBz8Enmw8rkLR3iRA931WQUUVjg3K8bKwCpyLV6USaW2AKmzBtTX5OoxjbcMASgRbRBtckdlOtY0yXJAOBabVZDeszGZnl15uwhzPPLiBDFrdPFTEUQdw8BaEMniTMTn/YQtxg5S0tKGolLdXH72AF4vXuSJ0PTtNAelWhW5nUTAAy2DB3xV0GR+XJD7PABkuIzLSWSiNDNaoEdOwDfq+aRw+vE0H/1i29OEh0rh6eHEo5XQZcBMJmxEXnz2JsDxIi67+pMj+Ho755P7F9DdDsVWl6nJQB4PD+Uo7gGxgyAYxJe4gWs3sXEBk2K7rCPJQCXazk5gdUnt1J+/KZ+6mS2E8cAwPWwiACCSmLMAqckCYDIXy1jCcDjWE6sTT3zKJU3Xd9LAdiFqQBwHQ0goCoAwPozAdA3HECWCLmJu7J5FpOixYTQ47qxBOAwtPgIgMRWKoRZN0ABeBlTAOByaEjkkdATm+u1NfszSizx/kffyEhgQnpvV7Q92c50JPp9ftfIfi2XLXCJSvw0xbxV3ZQSP4cGAPg15MSMxg+2k4O0/TTRjIZv1AjxcklXmF8YvM15obs1sjK5glkZb/Ne5XjUt8fi9aRT5c3xlXIO2YGm8C4lZUa/o8zotqHS01loFx3Zh8SRCYk2DXFkzKXWqLuMExXbZ71NvWywMUgacYYerioyz3OxeZciWhYbXldPCWTCuRmhL0VHFpkjWqEENg85ssX4OvNhTfIJyt5f0yNNiMG0oWQwl2SfHTjJUxUu0P4kINnkv8qqL8Mc3KeoIKHE8T4l2YGo7lgnmduPO4dCiRn4KPNhRfJGKhZ6+FBNplIgzLZ9rixBvmdNR32p3i2hkplj33e4+EwJ1xodqVFwzaYwaSLRyJvE7LgZ12ZKSjvFcLpVJU70ZXcjcWUSx5OqouR7T5flrYHlaTar9e3tKTaXTvMLm3jyOq9dTDF8JJsgFqh6cUHmRLaFZFz4hW4vcdx+HXWgYa63RjyFswkXHs4pGglgK7kqroqt5KRczr4Ik9wd6oLpAeEd0zQSytXGtlIB/v291ST5gC9xiphUsWRUZlr4Kyp0WqWS8CTdZfvems6b0uKSW2S1dOmOr2amh8/pfUr/UefeQ7vkGzXzdfXxrP1hm802X37646HbjCQTKxwT7ie6x6da+4hZ4fA2JmcArABx0OMij1BHuF2KCrHY7X7SwOa1IQdUs6h6l5SbHthoGLDwYgKMD/pfVi4z14ggharIBkUib4qgy7TEINr6Fh0bFN3biR6yTgRbxXrZVHxBLH7iYkOCpFW8zkkOMa11gUmX51Qci1xrqCQnN2nqFN8b1ujwOiXXb1trrhMh8PM9+/MckZjkX2zjSXpRyj5JGZV3lVPEmpoFv6VLq8+SI5xwsqeX8nxrRMchjHe9YmWGJRa/0RwvFsW5WZ63LKkCjTgG7yXGShJfVUXvMCRCw5Iq3jYqsVVtshhEQV2nqYgRDehAC52ZuxJ24roDT2kEQkJ7D1Wr5c4x6Qaze1X4xL26qqDYkrBJFQsXzn0eMc4Wc8z8GfaBnERZLP6MsSYg6tJF34j+32RYbifQGLyT3Wk6C51k4uQas494XTbW1iXaj+roI/3ZvtRjv8hC8trcCTZDUTfFJzfJqkhipMn+jiG736bbMZ8uZDjkVJLtFdUkD9lpL36f2+z6nJgdnW37nPK6h/RwigZwsq/Vn0lYnRs8N7jc1UBcS0Xqhp50idz1gGIiKVRI4sd76bnOCSz20UX2Kw6LhiA0eLWRxAUClFiSW+A4H14ycfQOdcwtbuuVtI3nMwlD8pB345LvlYxZ+eSMvqwO6tzZRFOrUlH784VqplglSuHt4Q2BNTgkTnyC7oBFzArLjZPN5TTV1McH5KXjnLb2shpxmM3tojGIuW5VU00HQazJV+RbRxWSovfIYsTvJuLb5ZIyOrIaE6YyArXfaMtphjqhy0YKrYLwtW6akjrIdOZvf5pANdkIM5QHbGIpyRZcPSBhSkGoj/coSgNo7SxN/gTL5xaOpHH8vo0DFP9Z3Fio0H0rVehMbtT4AoQHzHfGhRqEEB32xMTmhHHMa7KSx53odCWlT8k8M0ZrXZtl4RBVZLdRIiygt3DDRyOoeliD630tmxIbkP6hXa9fZ8l9LtNMJf3U0tQVMq6EFTqiaCAlq4rIcvM68/A5t8jNYpFdMHsvVNJVUlxXrNnjNwiK/Fmm0dlLlZQCzstMJMDi53qK1xDY5M3aSlINnWb/QJ8uUfFMMI8ppHSPxmfFm54mYzfdbnOTIlGiJiwkt2jHZ3ynUJNcbw75C397j2m6GI5xbTZDiWyTIOwzNdEW0InzS90ROIful6sNbT1YSqo7NAvFBjK+yb9NH4vm/2an7QyTlJiCquC9mlSs+NxWXYueEp8UnsiuTeYb9biXbvOqs+/pKaGWsZv7K8XqIXus9yG1b9jRh2e+Nq0wVVHR6CJHT4n7BvHgyg66fwLfYkk5NzoWYDfdnzPT0a0uvpBSP18MswRwdeGzBz4+KEaaQsKouqdrpqOCamyqDT8gZ4sqfCp8fX/WTR0briyvd1SK88QDDtLgjjeU8LDcq7I6+kQmSNiqyDHytk92GP+uv33/ov3jbFKGvuYg5doswaLJLj54y4GqWFbb5cOYVG7jaxU2wEH9OLVIpVDwxexF4tZDUqbsHl5uplmvK6a68dCm76rpDqEU3sGCkbQeN2Jr1qWH5Gm6I/pUkbwax/y2uzpaVlaCmW3rLSL9AucL3t03zp9F/jdoHWn79xy8lNUUySwx/sMYjRW22xxzT9dMf849m2Hk14ZP16pNRUQnZXRuUE8IZpHfg8uP5lLQIrwNWgrZ4yw71B5/4WabVOJDfZu5MVQgP8RXxE70/EHrdBSxaMxBy2q1lOY+iwH8biSN3/RoxntZHOUnDt6pV+h5riD/WIvzL5aLbFPM8JMGegE84rXOZvMd1m/NiWihbhdBCPte051mymIaDw3W/5g7HIvxBnWLIA1BGjpT87o6WcTbckmL62PTE+YbVJeYL/L/OnTx4FrtfcadpnZLNFQscJCrb9VMtuVceNHi+h97y/I4/BWx7B71Juf1unadUMyL8mw86LR4tVFNzBh0u+JBoajND1h3qJaapeGcayt9WD0at45n4IGcG3yCJDbfdXuvxjQa1Zh4+A15q7HBn5Oa5LAXK0fjGhYATMR1dIQ0JNdVsRNcd8rUWv7oL8KlI67dXa36iUFJKof8BF7CSaN5HbEKrdibJZ9pCOArUuOcF/f9z+FkZKSkC4xVv7ljxkBV7IeruvS8dtw9VP0a3TET2zCY9w4qU6++pWvfoWAgwaU4jhO4vJaGFziOY7g4Z+p/vm9ZJzzDLkEI4JHAflww+veIh0Y1VuMrBPLcnEkjjZTU0NJ9l/zVviM6bcictDODCVfcHXPFBxO2pCmhcO5RPTVweV9TH4L5/QSS0ODP5V00OfoxHffhSAESMq4nAusk40LzElWLbGlvi6JZP9ss0cIDJkdYsn9lwG6cPVpqW8o7bMF38BYkZ6Q36xkosRtXjuWfA1RgKf6Aj2Asq6xUJIGCAI7gb7gME8f+nw2qcCL+HdvwDXxH9bcMCSjxJu7Cv5S6F/PT/hlJE5biCjyCz2BCsoB655IeQAdewkacg3k/j//3kKIRJ2A5Lsd92Il90CAEFjwpdfPgkIAdnfgA27AeZ+MUTP+5/DVJtmbUoQnTMRcLsAznYjWuwlqswa9wJk7GcZiJqZj4cyS80J1ACaSQQjqa/w2RO/4XgeR505EWvvMAAAAASUVORK5CYII=";
const img_rocky = new Image();
img_rocky.src = rocky;

const charger = "data:image/png;base64,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";
const img_charger = new Image();
img_charger.src = charger;

/**
 * Represents the map and handles all the userinteractions
 * as panning / zooming into the map.
 * @constructor
 * @param {HTMLCanvasElement} canvasElement - the canvas used to display the map on
 */
export function VacuumMap(canvasElement) {
    const canvas = canvasElement;

    const mapDrawer = new MapDrawer();
    const pathDrawer = new PathDrawer();

    const img_charger_scaled = document.createElement('canvas');
    const img_rocky_scaled = document.createElement('canvas');

    let ws;
    let probeTimeout;

    let options = {};

    let currentScale = 1;

    canvas.width = canvas.clientWidth;
    canvas.height = canvas.clientHeight;

    let parsedMap = {}, deviceStatus = {};
    let locations = [];

    let robotPosition = [25600, 25600];
    let chargerPosition = [25600, 25600];
    let robotAngle = 0;

    let redrawCanvas = null;

    function probeWebSocket() {
        clearTimeout(probeTimeout);
        probeTimeout = setTimeout(() => {
            if (ws.isAlive === false || ws.readyState !== 1) {
                initWebSocket();
                return;
            }
            ws.isAlive = false;
            ws.send("p");
            probeWebSocket();
        }, 5e3);
    };

    function initWebSocket() {
        const protocol = location.protocol === "https:" ? "wss" : "ws";

        closeWebSocket();
        clearTimeout(probeTimeout);
        ws = new WebSocket(protocol + '://' + (localStorage['urlOverride'] ? localStorage['urlOverride'].replace(/^.+:\/\/(.*?)\/?$/,"$1") : window.location.host) + '/');
        ws.binaryType = "arraybuffer";

        ws.onerror = function() {
            setTimeout(() => { initWebSocket() },5e3);
        };

        ws.onmessage = function(event) {
            ws.isAlive = true;
            probeWebSocket();
            if (event.data.constructor === ArrayBuffer) {
                let data = parseMap(event.data);
                updateMap(data);
            } else if (event.data.slice(0,10) === '{"status":') {
                try {
                    let data = JSON.parse(event.data);
                    updateStatus(data.status);
                    deviceStatus = data.status;
                } catch(e) {
                    //TODO something reasonable
                    console.log(e);
                }
            }
        };

        ws.onopen = function(event) {
            probeWebSocket();
        }
    }

    function closeWebSocket() {
        if (ws) {
            ws.close();
        }
        clearTimeout(probeTimeout);
    }

    function parseMap(gzippedMap) {
        try {
            return gzippedMap && gzippedMap.byteLength && RRMapParser.PARSE(pako.inflate(gzippedMap)) || FallbackMap.parsedData();
        } catch (e) { console.log(e); };
        return null;
    }

    function getSegmentPoints(idx) {
        idx = idx << 1;
        let pixels = [];
        for (let i in parsedMap.image.pixels) {
            if (parsedMap.image.pixels[i] === idx) {
                pixels.push(i);
            }
        }
        return pixels;
    }

    function updateSegments() {
        let segment, newSegments = [];
        let zonesPresent = locations.some(l => l instanceof Zone);
        if (parsedMap.image && parsedMap.image.segments.count > 1)
        for (let idx in parsedMap.image.segments.center) {
            idx = +idx;
            let existing, highlighted, sequence;
            let center = {
                x: parsedMap.image.segments.center[idx].x/parsedMap.image.segments.center[idx].count,
                y: parsedMap.image.segments.center[idx].y/parsedMap.image.segments.center[idx].count
            };
            highlighted = false;
            sequence = 0;
            existing = locations.find(l => (l instanceof Segment) && l.idx === idx);
            if (existing) {
                highlighted = existing.highlighted;
                sequence = existing.sequence;
            }
            segment = new Segment(idx, getSegmentPoints(idx), center);
            segment.hidden = zonesPresent;
            if (highlighted) {
                segment.highlighted = true;
                segment.changed = true;
                segment.sequence = sequence;
            }
            if (options.segmentNames) {
                segment.name = options.segmentNames[idx] || "#" + idx;
            }
            if ((deviceStatus.in_cleaning === 3) && parsedMap.currently_cleaned_blocks && parsedMap.currently_cleaned_blocks.includes(idx)) {
                segment.current = true;
                segment.changed = true;
            }
            newSegments.push(segment);
        }
        locations = locations.filter(l => !(l instanceof Segment)).concat(newSegments);
    }

    function updateForbiddenZones(forbiddenZoneData) {
        locations = locations
            .filter(l => !(l instanceof ForbiddenZone))
            .concat(forbiddenZoneData.map(zone => {
                const p1 = convertFromRealCoords({x: zone[0], y: zone[1]});
                const p2 = convertFromRealCoords({x: zone[2], y: zone[3]});
                const p3 = convertFromRealCoords({x: zone[4], y: zone[5]});
                const p4 = convertFromRealCoords({x: zone[6], y: zone[7]});
                return new ForbiddenZone(
                    p1.x, p1.y,
                    p2.x, p2.y,
                    p3.x, p3.y,
                    p4.x, p4.y
                );
            }));
    }

    function updateGotoTarget(gotoTarget) {
        locations = locations
            .filter(l => !(l instanceof GotoTarget))
        if(gotoTarget) {
            const p1 = convertFromRealCoords({x: gotoTarget[0], y: gotoTarget[1]});
            locations.push(new GotoTarget(p1.x, p1.y));
        }
    }

    function updateCurrentZones(currentZoneData) {
        locations = locations
            .filter(l => !(l instanceof CurrentCleaningZone))
            .concat(currentZoneData.map(zone => {
                const p1 = convertFromRealCoords({x: zone[0], y: zone[1]});
                const p2 = convertFromRealCoords({x: zone[2], y: zone[3]});
                return new CurrentCleaningZone(new DOMPoint(p1.x, p1.y), new DOMPoint(p2.x, p2.y));
            }));
    }

    function updateVirtualWalls(virtualWallData) {
        locations = locations
            .filter(l => !(l instanceof VirtualWall))
            .concat(virtualWallData.map(wall => {
                const p1 = convertFromRealCoords({x: wall[0], y: wall[1]});
                const p2 = convertFromRealCoords({x: wall[2], y: wall[3]});
                return new VirtualWall(p1.x, p1.y, p2.x, p2.y);
            }));
    }

    function updateMapMetadata() {
        updateGotoTarget(parsedMap.goto_target);
        updateForbiddenZones(parsedMap.forbidden_zones || []);
        updateVirtualWalls(parsedMap.virtual_walls|| []);
        updateCurrentZones((deviceStatus.in_cleaning === 2) && parsedMap.currently_cleaned_zones || []);
    }

    /**
     * Public function to update mapdata and call internal update to redraw it.
     * Data is distributed into the subcomponents for rendering the map / path.
     * @param {object} mapData - parsed by RRMapParser data from "/api/map/latest" route
     */
    function updateMap(mapData) {
        parsedMap = mapData;
        updateMapInt();
    }

    /**
     * Private function to update the displayed mapdata periodically.
     */
function updateMapInt(mapData) {
        mapDrawer.draw(parsedMap.image);
        if (options.noPath) {
            pathDrawer.setPath({},{});
        } else {
            pathDrawer.setPath(parsedMap.path, parsedMap.goto_predicted_path);
        }
        pathDrawer.draw();

        robotPosition = parsedMap.robot || robotPosition;
        robotAngle = parsedMap.robot_angle || robotAngle;
        chargerPosition = parsedMap.charger || chargerPosition;

        if (options.showSegments) {
            updateSegments();
        }

        switch (options.metaData) {
            case false:
            case "none": break;
            case "forbidden": updateForbiddenZones(parsedMap.forbidden_zones || []); updateVirtualWalls(parsedMap.virtual_walls|| []); break;
            default: updateMapMetadata();
        }

        if (redrawCanvas) redrawCanvas();
    }

    /**
     * Private function to fire status updates onto the map page (currently got from websocket connections only)
     * @param {object} status - the json data as in dummycloud.connectedRobot.status
     */
    function updateStatus(status) {
        canvas.dispatchEvent(new CustomEvent('updateStatus', {detail: status}));
    }

    /**
     * Transforms coordinates in mapspace (1024*1024) into the millimeter format
     * accepted by the goto / zoned_cleanup api endpoints
     * @param {{x: number, y: number}} coordinatesInMapSpace
     */
    function convertToRealCoords(coordinatesInMapSpace) {
        return { x: Math.floor(coordinatesInMapSpace.x * 50), y: Math.floor(coordinatesInMapSpace.y * 50) };
    }

    /**
     * Transforms coordinates in the millimeter format into the mapspace (1024*1024)
     * @param {{x: number, y: number}} coordinatesInMillimeter
     */
    function convertFromRealCoords(coordinatesInMillimeter) {
        return { x: Math.floor(coordinatesInMillimeter.x / 50), y: Math.floor(coordinatesInMillimeter.y / 50) };
    }

    /**
     * Sets up the canvas for tracking taps / pans / zooms and redrawing the map accordingly
     * @param {object} mapData - parsed by RRMapParser data from "/api/map/latest" route
     */
    function initCanvas(gzippedMapData, opts) {
        const mapData = parseMap(gzippedMapData);
        parsedMap = mapData;
        if (opts) options = opts;
        let ctx = canvas.getContext('2d');
        ctx.imageSmoothingEnabled = false;
        trackTransforms(ctx);

        window.addEventListener('resize', () => {
            // Save the current transformation and recreate it
            // as the transformation state is lost when changing canvas size
            // https://stackoverflow.com/questions/48044951/canvas-state-lost-after-changing-size
            const {a, b, c, d, e, f} = ctx.getTransform();

            canvas.height = canvas.clientHeight;
            canvas.width = canvas.clientWidth;

            ctx.setTransform(a, b, c, d, e, f);
            ctx.imageSmoothingEnabled = false;

            redraw();
        });

        const boundingBox = {
            minX: parsedMap.image.position.left,
            minY: parsedMap.image.position.top,
            maxX: parsedMap.image.position.left + parsedMap.image.dimensions.width,
            maxY: parsedMap.image.position.top + parsedMap.image.dimensions.height
        }
        const initialScalingFactor = Math.min(
            canvas.width / (boundingBox.maxX - boundingBox.minX),
            canvas.height / (boundingBox.maxY - boundingBox.minY)
        );
        currentScale = initialScalingFactor;

        ctx.scale(initialScalingFactor, initialScalingFactor);
        ctx.translate(-boundingBox.minX, -boundingBox.minY);

        function clearContext(ctx) {
            ctx.save();
            ctx.setTransform(1, 0, 0, 1, 0, 0);
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            ctx.restore();
        }

        function scaleIcons(multiplier) {
            multiplier = Math.max(10/img_charger.width,10/img_charger.width * multiplier);
            let ctx, dim = img_charger.width*multiplier;
            [[img_charger,img_charger_scaled],[img_rocky,img_rocky_scaled]].forEach(images => {
                const [image,image_scaled] = images;
                image_scaled.width = dim;
                image_scaled.height = dim;
                ctx = image_scaled.getContext('2d');
                ctx.imageSmoothingQuality = 'high';
                ctx.clearRect(0, 0, image_scaled.width, image_scaled.height);
                ctx.drawImage(image, 0, 0, image_scaled.width, image_scaled.height);
            });
        }

        function drawCharger(ctx, transformMapToScreenSpace) {
            const chargerPositionInPixels = new DOMPoint(chargerPosition[0] / 50, chargerPosition[1] / 50).matrixTransform(transformMapToScreenSpace);
            ctx.drawImage(
                img_charger_scaled,
                chargerPositionInPixels.x - img_charger_scaled.width / 2,
                chargerPositionInPixels.y - img_charger_scaled.height / 2
            );
        }

        function drawRobot(ctx, transformMapToScreenSpace) {
            function rotateRobot(img, angle) {
                var canvasimg = document.createElement("canvas");
                canvasimg.width = img.width;
                canvasimg.height = img.height;
                var ctximg = canvasimg.getContext('2d');
                ctximg.imageSmoothingQuality = 'high';
                const offset = 90;
                ctximg.clearRect(0, 0, img.width, img.height);
                ctximg.translate(img.width / 2, img.width / 2);
                ctximg.rotate((angle + offset) * Math.PI / 180);
                ctximg.translate(-img.width / 2, -img.width / 2);
                ctximg.drawImage(img, 0, 0);
                return canvasimg;
            }
            const robotPositionInPixels = new DOMPoint(robotPosition[0] / 50, robotPosition[1] / 50).matrixTransform(transformMapToScreenSpace);
            ctx.drawImage(
                robotAngle ? rotateRobot(img_rocky_scaled, robotAngle) : img_rocky_scaled,
                robotPositionInPixels.x - img_rocky_scaled.width / 2, // x
                robotPositionInPixels.y - img_rocky_scaled.height / 2, // y
            );
        }

        /**
         * Carries out a drawing routine on the canvas with resetting the scaling / translation of the canvas
         * and restoring it afterwards.
         * This allows for drawing equally thick lines no matter what the zoomlevel of the canvas currently is.
         * @param {CanvasRenderingContext2D} ctx - the rendering context to draw on (needs to have "trackTransforms" applied)
         * @param {function} f - the drawing routine to carry out on the rendering context
         */
        function usingOwnTransform(ctx, f) {
            const transform = ctx.getTransform();
            ctx.save();
            ctx.setTransform(1, 0, 0, 1, 0, 0);
            f(ctx, transform);
            ctx.restore();
        }

        /**
         * The function for rendering everything
         * - Applies the map image from a seperate canvas inside the mapDrawer
         * - Applies the path image from a seperate canvas inside the pathDrawer
         *   - The path is redrawn in different zoom levels to enable a smoother image.
         *     Therefore the canvas is inversely scaled before drawing the path to account for this scaling.
         * - Draws the locations ( goto point or zone )
         */
        function redraw() {
            clearContext(ctx);

            // place map
            ctx.drawImage(mapDrawer.canvas, 0, 0);

            // place segments
            locations.filter(location => location instanceof Segment).forEach(segment => {
                segment.drawPixels(ctx);
            });

            // place path
            let pathScale = pathDrawer.getScaleFactor();
            ctx.scale(1 / pathScale, 1 / pathScale);
            ctx.drawImage(pathDrawer.canvas, 0, 0);

            // place locations
            ctx.scale(pathScale, pathScale);
            usingOwnTransform(ctx, (ctx, transform) => {
                let zoneNumber = 0;
                // we'll define locations drawing order (currently it's reversed) so the former location types is drawn over the latter ones
                let activeLocation = null, locationTypes = {GotoPoint: 0, Segment: 1, Zone: 2, VirtualWall: 3, ForbiddenZone: 4, CurrentCleaningZone: 5};
                locations.sort((a,b) => {return locationTypes[b.constructor.name] - locationTypes[a.constructor.name]; });
                locations.forEach(location => {
                    if (location instanceof GotoPoint) {
                        return;
                    }
                    if (location instanceof Zone) {
                        location.sequence = ++zoneNumber;
                    }
                    // also we would like to draw currently active location wherever is it over the all other locations, so we'll do it via this ugly way
                    if (activeLocation || !location.active) {
                        location.draw(ctx, transform, Math.min(5,currentScale));
                    } else {
                        activeLocation = location;
                    }
                });
                if (activeLocation) {
                    activeLocation.draw(ctx, transform, Math.min(5,currentScale));
                }
                // place objects above locations
                drawCharger(ctx, transform);
                drawRobot(ctx, transform);
                // place goto point above everything
                let location = locations.filter(location => location instanceof GotoPoint);
                if (location[0]) {
                    location[0].draw(ctx, transform, Math.min(5,currentScale));
                }
            });
        }
        redrawCanvas = redraw;

        pathDrawer.scale(initialScalingFactor, {noDraw: true});
        scaleIcons(initialScalingFactor);

        updateMapInt();

        let lastX = canvas.width / 2, lastY = canvas.height / 2,
            dragStart;

        function startTranslate(evt) {
            const { x, y } = relativeCoordinates(evt.coordinates, canvas);
            lastX = x
            lastY = y;
            dragStart = ctx.transformedPoint(lastX, lastY);
        }

        function moveTranslate(evt) {
            const { x, y } = relativeCoordinates(evt.currentCoordinates, canvas);
            const oldX = lastX;
            const oldY = lastY;
            lastX = x;
            lastY = y;

            if (dragStart) {
                // Let each location handle the panning event
                // the location can return a stopPropagation bool which
                // stops the event handling by other locations / the main canvas
                for(let i = 0; i < locations.length; ++i) {
                    const location = locations[i];
                    if(typeof location.translate === "function") {
                        const result = location.translate(
                            dragStart.matrixTransform(ctx.getTransform().inverse()),
                            {x: oldX, y: oldY},
                            {x, y},
                            ctx.getTransform()
                        );
                        if(result.updatedLocation) {
                            locations[i] = result.updatedLocation;
                        }
                        if(result.stopPropagation === true) {
                            redraw();
                            return;
                        }
                    }
                }
                // locations could be removed
                // not quite nice to handle with the for loop
                locations = locations.filter(location => location !== null);

                // If no location stopped event handling -> pan the whole map
                const pt = ctx.transformedPoint(lastX, lastY);
                ctx.translate(pt.x - dragStart.x, pt.y - dragStart.y);
                redraw();
            }
        }

        function endTranslate(evt) {
            dragStart = null;
            locations.forEach(location => location.isResizing && (location.isResizing = false));
            redraw();
        }

        function tap(evt) {
            const { x, y } = relativeCoordinates(evt.tappedCoordinates, canvas);
            const tappedX = x;
            const tappedY = y;
            const tappedPoint = ctx.transformedPoint(tappedX, tappedY);

            // Let each location handle the tapping event
            // the location can return a stopPropagation bool which
            // stops the event handling by other locations / the main canvas
            // first process active location, rest process later. TODO: try to do it less stupid way
            var currentlyActive = -1, takenAction = false;
            var processTap = function(i,locations) {
                const location = locations[i];
                if(typeof location.tap === "function") {
                    const result = location.tap({x: tappedX, y: tappedY}, ctx.getTransform()) || {};
                    if(result.updatedLocation) {
                        locations[i] = result.updatedLocation;
                        takenAction = true;
                    } else if (result.removeLocation) {
                        if (locations[i] instanceof Zone && locations.filter(l => l instanceof Zone).length < 2) {
                            locations.filter(l => l instanceof Segment).forEach(l => {
                                l.hidden = false;
                            });
                        }
                        locations.splice(i, 1);
                        emitZoneSelection(false);
                        takenAction = true;
                    } else if (result.selectLocation) {
                        locations.forEach(l => l === locations[i] && (l.active = true) || (l.active = false));
                        if (locations[i] instanceof Zone) {
                            emitZoneSelection(true, locations.filter(location => location instanceof Zone).indexOf(locations[i]) > 0);
                        }
                        takenAction = true;
                    } else if (result.deselectLocation) {
                        locations.forEach(l => l === locations[i] && (l.active = false));
                        emitZoneSelection(false);
                        takenAction = true;
                    } else if (result.highlightChanged !== undefined) {
                        emitSegmentSelection();
                        if (result.highlightChanged) {
                            location.sequence = locations.filter(l => l instanceof Segment && l.highlighted).length;
                        } else {
                            location.sequence = 0;
                            let i = 1; locations.filter(l => l instanceof Segment && l.highlighted).sort((a,b) => a.sequence - b.sequence).forEach(l => {l.sequence = i++});
                        }
                    }
                    if(result.stopPropagation === true) {
                        redraw();
                        return true;
                    }
                }
                return false;
            }
            for(let i = locations.length - 1; i >= 0; i--) {
                if (!locations[i].active) continue;
                currentlyActive = i;
                if (processTap(i,locations)) return;
            }
            for(let i = locations.length - 1; i >= 0; i--) {
                if (i === currentlyActive) continue;
                if (processTap(i,locations)) return;
            }

            // setting points if allowed
            locations = locations.filter(l => !(l instanceof GotoPoint));
            if(!takenAction && !options.noGotoPoints) {
                locations.push(new GotoPoint(tappedPoint.x, tappedPoint.y));
            }

            redraw();
        }

        const touchHandler = new TouchHandler(canvas);

        canvas.addEventListener("tap", tap);
        canvas.addEventListener('panstart', startTranslate);
        canvas.addEventListener('panmove', moveTranslate);
        canvas.addEventListener('panend', endTranslate);
        canvas.addEventListener('pinchstart', startPinch);
        canvas.addEventListener('pinchmove', scalePinch);
        canvas.addEventListener('pinchend', endPinch);


        let lastScaleFactor = 1;
        function startPinch(evt) {
            lastScaleFactor = 1;

            // translate
            const { x, y } = relativeCoordinates(evt.center, canvas);
            lastX = x
            lastY = y;
            dragStart = ctx.transformedPoint(lastX, lastY);
        }

        function endPinch(evt) {
            const [scaleX, scaleY] = ctx.getScaleFactor2d();
            pathDrawer.scale(scaleX);
            scaleIcons(scaleX);
            currentScale = scaleX;
            endTranslate(evt);
        }

        function scalePinch(evt) {
            const factor = evt.scale / lastScaleFactor;
            lastScaleFactor = evt.scale;
            const pt = ctx.transformedPoint(evt.center.x, evt.center.y);
            ctx.save();
            ctx.translate(pt.x, pt.y);
            ctx.scale(factor, factor);
            ctx.translate(-pt.x, -pt.y);

            const [scaleX, scaleY] = ctx.getScaleFactor2d();

            if (scaleX > 6.5 || scaleX < 0.7) {
                ctx.restore();
            }

            // translate
            const { x, y } = relativeCoordinates(evt.center, canvas);
            lastX = x;
            lastY = y;
            const p = ctx.transformedPoint(lastX, lastY);
            ctx.translate(p.x - dragStart.x, p.y - dragStart.y);

            currentScale = scaleX;

            redraw();
        }

        const scaleFactor = 1.1;
        /**
         * Handles zooming by using the mousewheel.
         * @param {MouseWheelEvent} evt
         */
        const handleScroll = function (evt) {
            const delta = evt.wheelDelta ? evt.wheelDelta / 40 : evt.detail ? -evt.detail : 0;
            if (delta) {
                const pt = ctx.transformedPoint(evt.offsetX, evt.offsetY);
                ctx.save();
                ctx.translate(pt.x, pt.y);
                const factor = Math.pow(scaleFactor, delta);
                ctx.scale(factor, factor);
                ctx.translate(-pt.x, -pt.y);

                const [scaleX, scaleY] = ctx.getScaleFactor2d();
                if (scaleX > 6.5 || scaleX < 0.7) {
                    ctx.restore();
                    return evt.preventDefault() && false;
                }
                pathDrawer.scale(scaleX);
                scaleIcons(scaleX);
                currentScale = scaleX;

                redraw();
            }
            return evt.preventDefault() && false;
        };

        canvas.addEventListener('DOMMouseScroll', handleScroll, false);
        canvas.addEventListener('mousewheel', handleScroll, false);
    };

    const prepareGotoCoordinatesForApi = (gotoPoint) => {
        const point = convertToRealCoords(gotoPoint);
        return {
            x: point.x,
            y: point.y
        };
    };

    const prepareZoneCoordinatesForApi = (zone) => {
        const p1Real = convertToRealCoords({x: zone.x1, y: zone.y1});
        const p2Real = convertToRealCoords({x: zone.x2, y: zone.y2});

        return [
            Math.min(p1Real.x, p2Real.x),
            Math.min(p1Real.y, p2Real.y),
            Math.max(p1Real.x, p2Real.x),
            Math.max(p1Real.y, p2Real.y),
            zone.iterations
        ];
    };

    const prepareWallCoordinatesForApi = (virtualWall) => {
        const p1Real = convertToRealCoords({x: virtualWall.x1, y: virtualWall.y1});
        const p2Real = convertToRealCoords({x: virtualWall.x2, y: virtualWall.y2});
        return [
            p1Real.x,
            p1Real.y,
            p2Real.x,
            p2Real.y
        ];
    };

    const prepareFobriddenZoneCoordinatesForApi = (Zone) => {
        const p1Real = convertToRealCoords({x: Zone.x1, y: Zone.y1});
        const p2Real = convertToRealCoords({x: Zone.x2, y: Zone.y2});
        const p3Real = convertToRealCoords({x: Zone.x3, y: Zone.y3});
        const p4Real = convertToRealCoords({x: Zone.x4, y: Zone.y4});
        return [p1Real.x,p1Real.y,p2Real.x,p2Real.y,p3Real.x,p3Real.y,p4Real.x,p4Real.y];
    };

    function getLocations() {
        const segments = locations
            .filter(location => location instanceof Segment && location.highlighted)
            .sort((a,b) => a.sequence - b.sequence).map(l => l.idx);

        const zones = locations
            .filter(location => location instanceof Zone)
            .map(prepareZoneCoordinatesForApi);

        const gotoPoints = locations
            .filter(location => location instanceof GotoPoint)
            .map(prepareGotoCoordinatesForApi);

        const virtualWalls = locations
            .filter(location => location instanceof VirtualWall)
            .map(prepareWallCoordinatesForApi);

        const forbiddenZones = locations
            .filter(location => location instanceof ForbiddenZone)
            .map(prepareFobriddenZoneCoordinatesForApi);

        return {
            segments,
            zones,
            gotoPoints,
            virtualWalls,
            forbiddenZones
        };
    }

    function getParsedMap() {
        return parsedMap;
    }

    function addZone(zoneCoordinates, addZoneInactive) {
        let newZone;
        if (zoneCoordinates) {
            const p1 = convertFromRealCoords({x: zoneCoordinates[0], y: zoneCoordinates[1]});
            const p2 = convertFromRealCoords({x: zoneCoordinates[2], y: zoneCoordinates[3]});
            newZone = new Zone(p1.x, p1.y, p2.x, p2.y, zoneCoordinates[4]);
        } else {
            newZone = new Zone(480, 480, 550, 550, 1);
        }

        // if there's a zone, hide all segments
        locations.filter(l => l instanceof Segment).forEach(l => {
            l.hidden = true;
            l.highlighted = false;
        });

        locations.forEach(location => location.active = false)
        locations.push(newZone);

        if(addZoneInactive) {
            newZone.active = false;
        } else {
            emitZoneSelection(true, locations.filter(location => location instanceof Zone).length > 1);
        }

        if (redrawCanvas) redrawCanvas();
    }

    function addSpot(spotCoordinates = [25600, 25600]) {
        const p = convertFromRealCoords({x: spotCoordinates[0], y: spotCoordinates[1]});
        const newSpot = new GotoPoint(p.x, p.y);

        locations = locations.filter(l => !(l instanceof GotoPoint));
        locations.forEach(location => location.active = false)
        locations.push(newSpot);
        if (redrawCanvas) redrawCanvas();
    }

    function clearZones() {
        locations = locations.filter(l => !(l instanceof Zone));
        if (redrawCanvas) redrawCanvas();
    }

    function addVirtualWall(wallCoordinates, addWallInactive, wallEditable, isOrthogonal) {
        let newVirtualWall;
        if (wallCoordinates) {
            const p1 = convertFromRealCoords({x: wallCoordinates[0], y: wallCoordinates[1]});
            const p2 = convertFromRealCoords({x: wallCoordinates[2], y: wallCoordinates[3]});
            newVirtualWall = new VirtualWall(p1.x, p1.y, p2.x, p2.y, wallEditable);
        } else {
            newVirtualWall = new VirtualWall(460,480,460,550, wallEditable, isOrthogonal);
        }

        if(addWallInactive) {
            newVirtualWall.active = false;
        }

        locations.forEach(location => location.active = false)
        locations.push(newVirtualWall);
        if (redrawCanvas) redrawCanvas();
    }

    function addForbiddenZone(zoneCoordinates, addZoneInactive, zoneEditable) {
        let newZone;
        if (zoneCoordinates) {
            const p1 = convertFromRealCoords({x: zoneCoordinates[0], y: zoneCoordinates[1]});
            const p2 = convertFromRealCoords({x: zoneCoordinates[2], y: zoneCoordinates[3]});
            const p3 = convertFromRealCoords({x: zoneCoordinates[4], y: zoneCoordinates[5]});
            const p4 = convertFromRealCoords({x: zoneCoordinates[6], y: zoneCoordinates[7]});
            newZone = new ForbiddenZone(p1.x, p1.y, p2.x, p2.y, p3.x, p3.y, p4.x, p4.y, zoneEditable);
        } else {
            newZone = new ForbiddenZone(480, 480, 550, 480, 550, 550, 480, 550, zoneEditable);
        }

        if(addZoneInactive) {
            newZone.active = false;
        }

        locations.forEach(location => location.active = false)
        locations.push(newZone);
        if (redrawCanvas) redrawCanvas();
    }

    // enabled = any zone is selected,
    // nf = current zone is non-first
    function emitZoneSelection(enabled, nf) {
        canvas.dispatchEvent(new CustomEvent('zoneSelection', {detail: { state: enabled, nf: nf || false }}));
    }

    function emitSegmentSelection() {
        canvas.dispatchEvent(new CustomEvent('segmentSelection', {detail: {}}));
    }

    function promoteCurrentZone() {
        let index, activeLocation = locations.filter(location => location.active)[0];
        if (!(activeLocation instanceof Zone)) {
            return;
        }
        index = locations.indexOf(activeLocation);
        for (let i = index - 1; i >= 0; i--) {
            if (locations[i] instanceof Zone) {
                locations[index] = locations[i];
                locations[i] = activeLocation;
                if (redrawCanvas) redrawCanvas();
                break;
            }
        }
        emitZoneSelection(true, locations.filter(location => location instanceof Zone).indexOf(activeLocation) > 0);
    }

    function addIterationsToZone() {
        let index, activeLocation = locations.filter(location => location.active)[0];
        if (!(activeLocation instanceof Zone)) {
            return;
        }
        if (++activeLocation.iterations > 3) {
            activeLocation.iterations = 1;
        };
        if (redrawCanvas) redrawCanvas();
    }

    function updateSegmentNames(names) {
        options.segmentNames = names;
    }

    return {
        initCanvas: initCanvas,
        initWebSocket: initWebSocket,
        closeWebSocket: closeWebSocket,
        parseMap: parseMap,
        updateMap: updateMap,
        updateStatus: updateStatus,
        getLocations: getLocations,
        getParsedMap: getParsedMap,
        addZone: addZone,
        addSpot: addSpot,
        clearZones: clearZones,
        addVirtualWall: addVirtualWall,
        addForbiddenZone: addForbiddenZone,
        promoteCurrentZone: promoteCurrentZone,
        addIterationsToZone: addIterationsToZone,
        updateSegmentNames: updateSegmentNames
    };
}

/**
 * Helper function for calculating coordinates relative to an HTML Element
 * @param {{x: number, y: number}} "{x, y}" - the absolute screen coordinates (clicked)
 * @param {*} referenceElement - the element (e.g. a canvas) to which
 * relative coordinates should be calculated
 * @returns {{x: number, y: number}} coordinates relative to the referenceElement
 */
function relativeCoordinates({ x, y }, referenceElement) {
    var rect = referenceElement.getBoundingClientRect();
    return {
        x: x - rect.left,
        y: y - rect.top
    };
}