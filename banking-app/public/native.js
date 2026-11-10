'use strict';
// native.js : only does something inside the Android app (Capacitor). The Android back button
// closes a sheet, goes back one screen, or returns to Home. On Home it leaves the app.
(function () {
    if (window.coddyDesktop) document.documentElement.classList.add('desktop', 'native');   // desktop app (Windows / macOS / Linux)
    const C = window.Capacitor;
    if (!C || !C.isNativePlatform || !C.isNativePlatform()) return;
    document.documentElement.classList.add('native');
    try {
        const App = C.registerPlugin('App');
        App.addListener('backButton', () => {
            const o = document.getElementById('overlay');
            if (o && !o.hidden) return closeOverlay();
            if (S.stack && S.stack.length) return back();
            if (S.user && S.view !== 'home') return tab('home');
            App.exitApp();
        });
    } catch (e) { /* plugin missing: the system default applies */ }
})();
