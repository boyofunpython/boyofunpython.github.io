if ("serviceWorker" in navigator) {
    console.log("Service worker supported");
    window.addEventListener("load", function () {
        navigator.serviceWorker
            .register("/serviceWorker.js")
            .then(res => console.log("service worker registered", res))
            .catch(err => console.log("service worker not registered", err))
    });
}