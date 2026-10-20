/** Reserve a document before awaiting its creation so simultaneous commands share it. */
function createPanelRegistry() {
  const panels = new Map();
  let disposed = false;
  return {
    getOrCreate(key, create) {
      if (disposed) return Promise.reject(new Error('Preview registry disposed'));
      if (!panels.has(key)) {
        const pending = Promise.resolve().then(create).then(panel => {
          if (disposed) { panel.dispose(); return panel; }
          panel.onDidDispose(() => { if (panels.get(key) === pending) panels.delete(key); });
          return panel;
        }).catch(error => {
          if (panels.get(key) === pending) panels.delete(key);
          throw error;
        });
        panels.set(key, pending);
      }
      return panels.get(key);
    },
    dispose() {
      disposed = true;
      for (const pending of panels.values()) void pending.then(panel => panel.dispose(), () => {});
      panels.clear();
    },
  };
}
module.exports = { createPanelRegistry };
