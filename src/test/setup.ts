import "@testing-library/jest-dom";

// jsdom doesn't implement media playback — stub it so components/hooks that own
// an HTMLAudioElement (PlayerContext) can be rendered and exercised in tests.
window.HTMLMediaElement.prototype.play = function () { return Promise.resolve(); };
window.HTMLMediaElement.prototype.pause = function () { /* noop */ };
window.HTMLMediaElement.prototype.load = function () { /* noop */ };

Object.defineProperty(window, "matchMedia", {
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => {},
  }),
});
