let pyodideWorker = new Worker("./js/webworker.js");
const callbacks = {};

setWorker();
setCallback();

const stdout = {
    value: "",
}

let currentTimeout = {};
let currentPromise = null;

const asyncRun = (() => {
    let id = 0; // identify a Promise
    return (script, context, excutionTimeLimit) => {
        // the id could be generated more carefully
        id = (id + 1) % Number.MAX_SAFE_INTEGER;
        stdout.value = "";
        return new Promise((onSuccess) => {
            callbacks["executePython"][id] = onSuccess;
            currentPromise = onSuccess;
            pyodideWorker.postMessage({
                context,
                python: script,
                id,
                type: "executePython"
            });
            currentTimeout[id] = setTimeout(() => {
                currentPromise !== null ? currentPromise({ error: "超過執行時間，請檢查程式內容！" }) : null;
                executionTimeout();
            }, excutionTimeLimit * 1000)
        });
    };
})();

const loadPaths = (() => {
    let id = 0; // identify a Promise
    return (path) => {
        // the id could be generated more carefully
        id = (id + 1) % Number.MAX_SAFE_INTEGER;
        return new Promise((onSuccess) => {
            callbacks["loadPath"][id] = onSuccess;
            pyodideWorker.postMessage({
                type: "loadPath",
                data: path,
                id
            });
        });
    };
})();

const loadPackages = (() => {
    let id = 0; // identify a Promise
    return (packages) => {
        // the id could be generated more carefully
        id = (id + 1) % Number.MAX_SAFE_INTEGER;
        return new Promise((onSuccess) => {
            callbacks["loadPackage"][id] = onSuccess;
            pyodideWorker.postMessage({
                type: "loadPackage",
                data: packages,
                id
            });
        });
    };
})();

function setWorker() {
    pyodideWorker.onmessage = (event) => {
        const { type, id } = event.data;
        let result = null;
        switch (type) {
            case "stdout":
                stdout.value += event.data.data;
                return;
            case "executePython":
                const { ...data } = event.data;
                result = {
                    ...data,
                    stdout: stdout.value,
                }
                stdout.value = "";
                break;
            case "loadPath":
            case "loadPackage":
                result = event.data.data;
                break;
        }
        const onSuccess = callbacks[type][id];
        delete callbacks[type][id];
        if (currentTimeout[id] !== undefined) {
            clearTimeout(currentTimeout[id]);
            delete currentTimeout[id];
        }
        onSuccess(result);
    };
}

function setCallback() {
    Object.assign(callbacks, {
        executePython: {},
        loadPath: {},
        loadPackage: {},
    })
}

async function executionTimeout() {
    pyodideWorker.terminate();
    pyodideWorker = new Worker("./js/webworker.js");
    setWorker();
    setCallback();
    currentPromise = null;
}

const resetWorker = () => {
    currentPromise !== null ? currentPromise({ error: "強制終止執行！系統重設！" }) : null;
    executionTimeout();
};

const setCanvas = (canvas) => {
    pyodideWorker.postMessage({
        type: "setCanvas",
        data: canvas,
    }, [canvas]);
}


export { asyncRun, loadPaths, loadPackages, resetWorker, setCanvas };
