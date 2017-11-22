'use strict';

function logError (exception, methodName, parameters) {
    const error = generateError(exception, methodName, parameters);
    console.error(error.stack);
}

function generateError (exception, methodName, parameters) {
    let error = null;
    let message = null;

    const paramString = `ON METHOD ${methodName ? methodName : 'unknown'} ${parameters ? 'WITH PARAMETERS: ' + JSON.stringify(parameters) : ''}`;

    if (exception == null) {
        message = 'NOT DEFINED EXCEPTION';
    } else if (typeof exception === 'string') {
        message = exception
    } else if (exception instanceof Error) {
        error = exception;
        message = error.message;
    } else {
        try {
            message = `JSON: ${JSON.stringify(JSON.parse(exception))}`;
        } catch (parseException) {
            const exceptionJson = {};

            for (let property in exception) {
                exceptionJson[property] = exception[property];
            }

            message = `UNKNOWN TYPE: ${JSON.stringify(exceptionJson)}`;
        }
    }

    if (error == null) {
        error = new Error(`${message} ${paramString}`);
    } else {
        error.message = `${message} ${paramString}`;
    }

    return error;
};

function logOnFailure (method) {
    const methodParams = Array.from(arguments).slice(1);

    try {
        return method(...methodParams)
    } catch (exception) {
        logError(exception, method.name, methodParams);
        return null;
    }
};

function rejectOnException (method) {
    const methodParams = Array.from(arguments).slice(1);

    return new Promise((resolve, reject) => {
        try {
            resolve(method(...methodParams));
        } catch (exception) {
            reject(generateError(exception, method.name, methodParams));
        }
    });
};

module.exports.logOnFailure = logOnFailure;
module.exports.logError = logError;
module.exports.generateError = generateError;
module.exports.rejectOnException = rejectOnException;