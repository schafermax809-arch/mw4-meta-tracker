import { optimize } from "./optimizer.js";
self.onmessage = ({ data }) => {
  try {
    self.postMessage({
      result: optimize(data.db, data.weaponId, data.options),
    });
  } catch (error) {
    self.postMessage({ error: error.message });
  }
};
