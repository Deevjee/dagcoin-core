'use strict';

function _toConsumableArray(arr) { if (Array.isArray(arr)) { for (var i = 0, arr2 = Array(arr.length); i < arr.length; i++) { arr2[i] = arr[i]; } return arr2; } else { return Array.from(arr); } }

function logError(exception, methodName, parameters) {
    var error = generateError(exception, methodName, parameters);
    console.error(error.stack);
}

function generateError(exception, methodName, parameters) {
    var error = null;
    var message = null;

    var paramString = 'ON METHOD ' + (methodName ? methodName : 'unknown') + ' ' + (parameters ? 'WITH PARAMETERS: ' + JSON.stringify(parameters) : '');

    if (exception == null) {
        message = 'NOT DEFINED EXCEPTION';
    } else if (typeof exception === 'string') {
        message = exception;
    } else if (exception instanceof Error) {
        error = exception;
        message = error.message;
    } else {
        try {
            message = 'JSON: ' + JSON.stringify(JSON.parse(exception));
        } catch (parseException) {
            var exceptionJson = {};

            for (var property in exception) {
                exceptionJson[property] = exception[property];
            }

            message = 'UNKNOWN TYPE: ' + JSON.stringify(exceptionJson);
        }
    }

    if (error == null) {
        error = new Error(message + ' ' + paramString);
    } else {
        error.message = message + ' ' + paramString;
    }

    return error;
};

function logOnFailure(method) {
    var methodParams = Array.from(arguments).slice(1);

    try {
        return method.apply(undefined, _toConsumableArray(methodParams));
    } catch (exception) {
        logError(exception, method.name, methodParams);
        return null;
    }
};

function rejectOnException(method) {
    var methodParams = Array.from(arguments).slice(1);

    return new Promise(function (resolve, reject) {
        try {
            resolve(method.apply(undefined, _toConsumableArray(methodParams)));
        } catch (exception) {
            reject(generateError(exception, method.name, methodParams));
        }
    });
};

module.exports.logOnFailure = logOnFailure;
module.exports.logError = logError;
module.exports.generateError = generateError;
module.exports.rejectOnException = rejectOnException;