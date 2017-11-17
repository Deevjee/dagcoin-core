'use strict';

let instance = null;

// My module
function OperatingSystemManager () {
}

OperatingSystemManager.prototype.isCordova = function () {
    if (typeof window === 'undefined' || !window) {
        return false;
    }

    return !!window.cordova;
};

OperatingSystemManager.prototype.isNode = function () {
    return !this.isCordova();
};

OperatingSystemManager.prototype.shutDown = function () {
    if (this.isCordova()) {
        navigator.app.exitApp();
    } else {
        process.exit();
    }
};

module.exports.OperatingSystemManager = OperatingSystemManager;
module.exports.getInstance = function  () {
    if (!instance) {
        instance = new OperatingSystemManager();
    }

    return instance;
};