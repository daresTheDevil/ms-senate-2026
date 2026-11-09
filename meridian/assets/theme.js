/* Meridian theme controller. Sets [data-theme] on <html> from saved preference, else the OS setting.
   MeridianTheme.get() / .set("dark") / .toggle() / .clear(). Fires "meridianthemechange" on document. */
(function () {
  var KEY = "meridian-theme";
  var root = document.documentElement;

  function system() {
    return window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  }
  function stored() {
    try { return localStorage.getItem(KEY); } catch (e) { return null; }
  }
  function apply(theme) {
    root.setAttribute("data-theme", theme);
    root.classList.toggle("dark", theme === "dark");
    document.dispatchEvent(new CustomEvent("meridianthemechange", { detail: { theme: theme } }));
  }

  var MeridianTheme = {
    get: function () { return root.getAttribute("data-theme") || system(); },
    set: function (theme) { try { localStorage.setItem(KEY, theme); } catch (e) {} apply(theme); },
    toggle: function () { this.set(this.get() === "dark" ? "light" : "dark"); },
    clear: function () { try { localStorage.removeItem(KEY); } catch (e) {} apply(system()); },
  };

  apply(stored() || system());

  if (window.matchMedia) {
    window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", function (e) {
      if (!stored()) apply(e.matches ? "dark" : "light");
    });
  }

  window.MeridianTheme = MeridianTheme;
})();
