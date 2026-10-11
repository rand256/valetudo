"use strict";

// A STATUS request can receive an error or an incomplete response.
// Do not allow such a response to crash the Valetudo process.
module.exports = function getStatusResult(message) {
    if (!message || !Array.isArray(message.result) || message.result.length === 0) {
        return null;
    }

    const status = message.result[0];
    return status && typeof status === "object" && !Array.isArray(status) ? status : null;
};
