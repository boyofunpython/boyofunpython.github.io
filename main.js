import { asyncRun, loadPackages, resetWorker, setCanvas } from "./js/py-worker.js";
import { setupPopup } from "./js/popupcontainer.js";
'use strict';
/*
 *  Define the main module and its dependencies
 */
setupPopup("#filebutton", "#fileoperator")


/**
 * @type {import("indexeddb-fs").CreateFsOutput}
 */
const fs = window["indexeddb-fs"].createFs();
const localStore = localforage.createInstance({ name: "futurecoder" });
const DEFAULT_FILE = "root/main.py";
const favDialog = document.querySelector("#favDialog");
const resultDiv = document.querySelector("#result");
const closeDialog = document.querySelector("#closeFav");
const displayMode = document.querySelector("#displayMode");
const toolbarMode = document.querySelector("#toolbarMode");
const downloadButton = document.querySelector("#downloadButton");
const fileList = document.querySelector("#fileList");
const saveNewFileButton = document.querySelector("#saveNewFileButton");
const executeButton = document.querySelector("#executeButton");
const navBar = document.querySelector("nav.navBar");
const deleteFileButton = document.querySelector("#deleteFileButton");
const mobileMenuControlButton = document.querySelector("#mobileMenuControlButton");
const stopButton = document.querySelector("#stopButton");
const stopButtonAlways = document.querySelector("#stopButtonAlways");
const goVMEditorButton = document.querySelector("#goVMEditorButton");
stopButton.style.display = "none";

async function codeExcute(script) {
    stopButton.style.display = "block";
    const canvas = document.createElement("canvas");
    if (canvas.transferControlToOffscreen) {
        canvas.width = 500;
        canvas.height = 500;
        setCanvas(canvas.transferControlToOffscreen());
        resultDiv.appendChild(canvas);
    }
    try {
        const { results, error, stdout } = await asyncRun(script, {}, 30);
        let message = stdout !== undefined ? stdout : "";
        if (results !== undefined) {
            message += results;
        } else if (error) {
            message += error;
        }
        resultDiv.innerHTML = message;
        stopButton.style.display = "none";
    } catch (e) {
        const message = `Error in pyodideWorker at ${e.filename}, Line: ${e.lineno}, ${e.message}`;
        console.log(
            message
        );
        resultDiv.innerHTML = message;
        stopButton.style.display = "none";
    }
}

const editor = new BlockMirror({
    'container': document.getElementById('blocklyDiv'),
    toolbox: "normal",
    width: "90%",
    height: "500"
});
const currentFile = {
    path: DEFAULT_FILE,
    filename: DEFAULT_FILE.split("/").pop(),
};

/*
     * Event Listeners 
     */
goVMEditorButton.addEventListener("click", async () => {
    await localStore.setItem('user', { uid: "__futurecoder_offline__", editorContent: editor.getCode() });
    //     window.location.href = "/course/#ide";
    window.open("/course/#ide", '_blank').focus();
});
stopButton.addEventListener("click", () => {
    resetWorker();
});
stopButtonAlways.addEventListener("click", () => {
    resetWorker();
});
mobileMenuControlButton.addEventListener("click", () => {
    navBar.classList.toggle("activate");
});
downloadButton.addEventListener("click", () => {
    downloadFile(currentFile.path, currentFile.filename);
});
saveNewFileButton.addEventListener("click", () => saveNewFile());
displayMode.addEventListener("change", function () {
    const targetMode = displayMode.value;
    editor.setMode(targetMode);
});
toolbarMode.addEventListener("change", function () {
    const targetMode = toolbarMode.value;
    editor.configuration.toolbox = targetMode;
    editor.blockEditor.remakeToolbox();
});
closeDialog.addEventListener("click", () => {
    resetWorker();
    favDialog.close();
});
editor.addChangeListener(async function (event) {
    fs.writeFile(currentFile.path, event.value).then(console.log("File saved"));
});
executeButton.addEventListener("click", function () {
    // scriptElement.evaluate();
    resultDiv.innerHTML = `<h1>等待執行結果中...</h1>`;
    codeExcute(editor.getCode());
    favDialog.showModal();
});
deleteFileButton.addEventListener("click", () => {
    if (currentFile.path == DEFAULT_FILE) {
        window.alert("內定的main.py檔案不可刪除!");
        return;
    }
    if (!window.confirm("確定要刪除目前的檔案?")) {
        return;
    }
    fs.remove(currentFile.path).then(() => {
        console.log("File deleted");
        currentFile.path = DEFAULT_FILE;
        currentFile.filename = DEFAULT_FILE.split("/").pop();
        refreshFileList();
        fs.readFile(currentFile.path).then(r => editor.setCode(r))
        window.alert("檔案已刪除");
    });
});

/* 
*   Utility functions
*/

function downloadFile(filePath, fileName) {
    fs.readFile(filePath).then(r => saveAs(new Blob([r]), fileName))
};
function refreshFileList() {
    fs.readDirectory("root").then(r => {
        const files = r.files.filter(f => f.name.endsWith(".py"));
        fileList.innerHTML = "";
        for (const file of files) {
            const option = document.createElement("option");
            option.value = file.fullPath;
            option.innerText = file.name;
            if (option.value === currentFile.path) {
                console.log(currentFile.path);
                option.selected = true;
            }
            fileList.appendChild(option);
        }
    });
}

export function saveNewFile(fname = undefined, prompt = true, callback = null) {
    const fileName = fname === undefined ? window.prompt("請輸入檔案名稱", "main.py") : fname;
    if (fileName && fileName.endsWith(".py")) {
        // encodde filename first
        const encodedFileName = encodeURIComponent(fileName);
        fs.writeFile("root/" + encodedFileName, editor.getCode()).then(() => {
            currentFile.path = "root/" + encodedFileName;
            currentFile.filename = fileName;
            refreshFileList();
            if (typeof callback === "function") {
                callback();
            }
            prompt ? window.alert("儲存成功") : null;
        }).catch(err => {
            window.alert("儲存失敗，目前檔案名稱只能用英文喔！");
            console.error(err);
        });
        return;
    }
    window.alert("檔案名稱不可空白，且必須以 .py 結尾");
}
window["BMeditor"] = editor;

(async function () {
    /*
    * Execute on load
    */
    let userInfo = await localStore.getItem("user");
    let storedContent = userInfo?.editorContent;

    fs.writeFile(DEFAULT_FILE, storedContent ?? "print(\"Hello World\")").then(
        () => {
            refreshFileList();
            fs.readFile(currentFile.path).then(r => editor.setCode(r))
            fileList.addEventListener("change", e => {
                const filePath = e.target.value;
                currentFile.path = filePath;
                currentFile.filename = filePath.split("/").pop();
                fs.readFile(filePath).then(r => editor.setCode(r));
            });
        }
    );
})();