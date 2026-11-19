// Older browsers do not expose the current Navigation API entry. Stamp SPA
// history writes before Next installs its router so Back and Forward retain
// their direction and distance even when a modal replaces the current URL.
if (!("navigation" in window)) {
  const { pushState, replaceState } = history;
  history.pushState = function (state, unused, url) {
    const index = (history.state?.familyTreeHistoryIndex ?? 0) + 1;
    pushState.call(
      this,
      { ...state, familyTreeHistoryIndex: index },
      unused,
      url,
    );
  };
  history.replaceState = function (state, unused, url) {
    const index = history.state?.familyTreeHistoryIndex ?? 0;
    replaceState.call(
      this,
      { ...state, familyTreeHistoryIndex: index },
      unused,
      url,
    );
  };
}
